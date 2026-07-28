// @ts-check
const { test, expect } = require('@playwright/test');
const {
  openGame, waitForIdle, waitForPlayerTurn, snapshot, clickWorld, readLog,
} = require('./helpers/game');

/**
 * 確認シナリオ「決着」に対応するテスト。
 *
 * ハイスコアはブラウザに残るため、各テストの冒頭で必ず消してから始める。
 * 消し忘れると前のテストの記録が混ざり、原因の分かりにくい失敗になる。
 */

/** 記録を消し、盤面を整える */
async function prepare(page, enemyCount = 2) {
  await page.evaluate((n) => {
    localStorage.removeItem(HIGHSCORE.STORAGE_KEY);
    gameObjs.stars.forEach((s) => { s.active = false; s.sprite.setVisible(false); });
    gameObjs.federationShips.forEach((f) => { f.active = false; f.sprite.setVisible(false); });
    gameObjs.enemies.forEach((e, i) => {
      const use = i < n;
      e.active = use;
      e.sprite.setVisible(use);
      if (use) {
        e.shield = EnemyShip.SHIELD_MAX;
        e.x = AREA_CENTER.X + 200;
        e.y = AREA_CENTER.Y + i * 40;
      }
    });
    gameObjs.player.isDocked = false;
    gameObjs.player.shield = PlayerShip.SHIELD_MAX;
    gameObjs.player.energy = PlayerShip.ENERGY_MAX;
  }, enemyCount);
}

/** 全ての敵を退かせてミッションクリアに持ち込む */
async function clearAllEnemies(page) {
  await page.evaluate(() => {
    gameObjs.enemies.forEach((e) => { e.active = false; e.sprite.setVisible(false); });
    gameState.isPlayerTurn = false;
    npcTurn(gameState.curScene);
  });
  // クリア演出の待ち時間を含めて、片付くまで待つ
  await waitForIdle(page, 30000);
}

/** ハイスコア画面が開いているか */
function overlayShown(page) {
  return page.evaluate(() =>
    getComputedStyle(document.getElementById('highScoreOverlay')).display !== 'none');
}

/** 保存されている記録 */
function savedScores(page) {
  return page.evaluate(() => {
    const raw = localStorage.getItem(HIGHSCORE.STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  });
}

test.describe('決着', () => {
  test('すべての敵を撤退させるとクリアになり、ボーナスが加算されて記録される',
       async ({ page }) => {
    await openGame(page);
    await prepare(page);
    const before = await page.evaluate(() => {
      gameState.curMission = 3;
      gameState.score = 500;
      gameState.turn = 12;
      return {
        score: gameState.score,
        mission: gameState.curMission,
        bonus: calcMissionClearBonus(gameState.curMission),
      };
    });

    await clearAllEnemies(page);

    const after = await snapshot(page);
    expect(after.score, 'ボーナスが加算される').toBe(before.score + before.bonus);
    expect(await overlayShown(page), 'クリア画面が開く').toBe(true);
    expect(await page.evaluate(
      () => document.getElementById('hsResultMsg').textContent))
      .toContain(`MISSION #${before.mission} CLEARED`);

    const saved = await savedScores(page);
    expect(saved.length, '記録される').toBe(1);
    expect(saved[0].score).toBe(before.score + before.bonus);
    expect(saved[0].mission).toBe(before.mission);
  });

  test('NEXT MISSION で次のミッションが始まり、敵の初期数が1隻増える',
       async ({ page }) => {
    await openGame(page);
    await prepare(page);
    const before = await page.evaluate(() => ({
      mission: gameState.curMission, enemyQty: gameState.enemyQty,
    }));

    await clearAllEnemies(page);
    await page.click('#hsRestartBtn');
    await waitForPlayerTurn(page, 30000);

    const after = await snapshot(page);
    expect(after.mission, 'ミッションが進む').toBe(before.mission + 1);
    expect(after.enemyQty, '敵の初期数が1隻増える').toBe(before.enemyQty + 1);
    expect(after.enemies.filter((e) => e.active).length, 'その数だけ出現する')
      .toBe(before.enemyQty + 1);
    expect(after.turn, 'ターンが1に戻る').toBe(1);
    expect(await overlayShown(page), 'クリア画面が閉じる').toBe(false);
  });

  test('基地のシールド消失で敗北する', async ({ page }) => {
    await openGame(page);
    await prepare(page);

    await page.evaluate(() => {
      // 実際の攻撃処理をそのまま通す（被弾 → 撃破判定 の順序を守るため）
      gameObjs.starBase.shield = 1;
      const enemy = gameObjs.enemies.find((e) => e.active);
      enemy.attack(gameObjs.starBase, 0);
    });
    await waitForIdle(page, 30000);

    expect((await snapshot(page)).isGameOver, '敗北になる').toBe(true);
    expect((await readLog(page, 5)).join('\n')).toContain('基地が崩壊');
    expect(await overlayShown(page), '結果画面が開く').toBe(true);
  });

  test('自機のシールド消失で敗北する', async ({ page }) => {
    await openGame(page);
    await prepare(page);

    await page.evaluate(() => {
      gameObjs.player.shield = 1;
      const enemy = gameObjs.enemies.find((e) => e.active);
      enemy.attack(gameObjs.player, 0);
    });
    await waitForIdle(page, 30000);

    expect((await snapshot(page)).isGameOver, '敗北になる').toBe(true);
    expect((await readLog(page, 5)).join('\n')).toContain('船体が崩壊');
  });

  test('エネルギー枯渇で敗北する', async ({ page }) => {
    await openGame(page);
    await prepare(page);
    await page.evaluate(() => {
      gameObjs.player.energy = PlayerShip.ENERGY_MIN - 1;
      gameObjs.player.isDocked = false;
    });

    // 何か操作しようとした時点で航行不能と判定される
    const p = await page.evaluate(() => ({
      x: gameObjs.player.x + 30, y: gameObjs.player.y,
    }));
    const pos = await page.evaluate((w) => {
      const rect = document.querySelector('#gameCanvas canvas').getBoundingClientRect();
      const cam = gameState.curScene.cameras.main;
      return {
        x: rect.left + (w.x - cam.worldView.x) * cam.zoom * (rect.width / cam.width),
        y: rect.top + (w.y - cam.worldView.y) * cam.zoom * (rect.height / cam.height),
      };
    }, p);
    await page.mouse.click(pos.x, pos.y);
    await waitForIdle(page, 30000);

    expect((await snapshot(page)).isGameOver, '敗北になる').toBe(true);
    expect((await readLog(page, 5)).join('\n')).toContain('エネルギー枯渇');
  });

  test('敗北時はハイスコアに記録されない', async ({ page }) => {
    await openGame(page);
    await prepare(page);
    await page.evaluate(() => {
      gameState.score = 9999;  // 記録されるなら必ず上位に入る点数
      gameObjs.player.shield = 1;
      const enemy = gameObjs.enemies.find((e) => e.active);
      enemy.attack(gameObjs.player, 0);
    });
    await waitForIdle(page, 30000);

    expect((await snapshot(page)).isGameOver).toBe(true);
    expect(await overlayShown(page), '結果画面は開く').toBe(true);
    expect(await savedScores(page), '記録は残らない').toEqual([]);
    expect(await page.evaluate(
      () => document.getElementById('hsFinalMsg').textContent))
      .toContain('MISSION FAILED');
  });

  test('ハイスコアの行をクリックすると、その次のミッションから再開する',
       async ({ page }) => {
    await openGame(page);
    await page.evaluate(() => {
      localStorage.setItem(HIGHSCORE.STORAGE_KEY, JSON.stringify([{
        score: 777, turns: 9, mission: 4, result: 'MISSION #4 CLEARED',
        gameid: 'previous-game', date: '2026/07/01',
      }]));
    });
    await page.click('#viewScoresBtn');
    await page.click('#hsTableBody tr');
    await waitForPlayerTurn(page, 30000);

    const after = await snapshot(page);
    const expected = await page.evaluate(
      () => QTY.ENEMY_INIT + (gameState.curMission - 1));
    expect(after.mission, '記録の次のミッションから始まる').toBe(5);
    expect(after.score, 'スコアを引き継ぐ').toBe(777);
    expect(after.turn, 'ターンは1から').toBe(1);
    expect(after.enemyQty, '敵の初期数が再計算される').toBe(expected);
    expect(after.enemies.filter((e) => e.active).length, 'その数だけ出現する')
      .toBe(expected);
    expect(after.isGameOver, '敗北状態が解除される').toBe(false);
    expect(await overlayShown(page), '画面が閉じる').toBe(false);
  });

  test('記録の保存に失敗しても、クリアの処理は最後まで進む', async ({ page }) => {
    await openGame(page);
    await prepare(page);
    await page.evaluate(() => {
      // プライベートブラウジングや容量超過を模す
      Storage.prototype.setItem = function () {
        throw new DOMException('QuotaExceededError');
      };
      gameState.curMission = 2;
      gameState.score = 300;
    });

    await clearAllEnemies(page);

    expect((await snapshot(page)).mission, 'ミッションは進む').toBe(3);
    expect(await overlayShown(page), 'クリア画面は開く').toBe(true);
    expect(await page.evaluate(
      () => document.getElementById('hsResultMsg').textContent))
      .toContain('CLEARED');
  });

  test('敗北直後にやり直しても、古い結果画面が後から開かない', async ({ page }) => {
    await openGame(page);
    await prepare(page);

    const start = await page.evaluate(() => {
      gameOver(SPEAKER.ENGINE, 'シールド消失！ 船体が崩壊...');
      // 結果画面が開く前にシーンを作り直す（RESTART を押した状況）
      gameState.curScene.scene.restart();
      return gameState.curScene.game.loop.frame;
    });

    // 結果画面が開くまでの待ち時間を、確実に超えるまで進める。
    // 実時間ではなくゲームの進行フレーム数で測る（描画が間引かれても
    // 「十分に進んだ」と言えるようにするため）。
    await page.waitForFunction(
      (f0) => gameState.curScene.game.loop.frame - f0 > 250,
      start, { timeout: 60000, polling: 100 });

    expect(await overlayShown(page), '古い結果画面は開かない').toBe(false);
  });
});
