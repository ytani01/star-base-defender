// @ts-check
const { test, expect } = require('@playwright/test');
const {
  openGame, waitForPlayerTurn, waitForIdle, snapshot, clickWorld, readLog,
  collectConsoleIssues,
} = require('./helpers/game');

/**
 * 確認シナリオ「ターン進行と戦況」に対応するテスト。
 *
 * 敵や味方の行動は状況に応じて決まるため、各テストで必要な状況を
 * 作ってから1ターン進める。判定はゲーム本体の処理の結果に対して行う。
 */

/**
 * NPC のターンを1回だけ回し、終わるまで待つ。
 *
 * 実際の流れと同じく、プレイヤーのターンを閉じてから回す。こうすると
 * 「プレイヤーのターンに戻った」ことをもって完了と判断でき、演出の
 * 有無に左右されずに待てる。
 */
async function runNpcTurn(page) {
  await page.evaluate(() => {
    gameState.isPlayerTurn = false;
    npcTurn(gameState.curScene);
  });
  await waitForPlayerTurn(page);
}

/** 星と味方を退け、敵の数を指定する */
async function setupField(page, enemyCount) {
  await page.evaluate((n) => {
    gameObjs.stars.forEach((s) => { s.active = false; s.sprite.setVisible(false); });
    gameObjs.federationShips.forEach((f) => { f.active = false; f.sprite.setVisible(false); });
    gameObjs.enemies.forEach((e, i) => {
      const use = i < n;
      e.active = use;
      e.sprite.setVisible(use);
      if (use) {
        e.shield = EnemyShip.SHIELD_MAX;
        e.spirit = EnemyShip.SPIRIT.INIT;
        // 基地から離れた位置に、重ならないよう並べる
        const angle = (i / n) * Math.PI * 2;
        e.x = AREA_CENTER.X + Math.cos(angle) * 200;
        e.y = AREA_CENTER.Y + Math.sin(angle) * 200;
      }
    });
    gameObjs.starBase.x = AREA_CENTER.X;
    gameObjs.starBase.y = AREA_CENTER.Y;
    gameObjs.starBase.shield = StarBase.SHIELD_MAX;
    gameObjs.player.x = AREA_CENTER.X - 120;
    gameObjs.player.y = AREA_CENTER.Y;
    gameObjs.player.is_docked = false;
    gameObjs.player.shield = PlayerShip.SHIELD_MAX;
    gameObjs.player.energy = PlayerShip.ENERGY_MAX;
  }, enemyCount);
}

test.describe('ターン進行と戦況', () => {
  test('プレイヤーの行動後、NPC が行動してプレイヤーのターンに戻る', async ({ page }) => {
    await openGame(page);
    await setupField(page, 3);

    const before = await snapshot(page);
    const positionsBefore = before.enemies.filter((e) => e.active).map((e) => [e.x, e.y]);

    await clickWorld(page, { x: before.player.x - 40, y: before.player.y });

    const after = await snapshot(page);
    expect(after.turn, 'ターンが進む').toBe(before.turn + 1);
    expect(after.isPlayerTurn, 'プレイヤーのターンに戻る').toBe(true);
    const positionsAfter = after.enemies.filter((e) => e.active).map((e) => [e.x, e.y]);
    expect(positionsAfter, '敵も行動している').not.toEqual(positionsBefore);
  });

  test('敵を撃破するとスコアが減り、新たな敵が出現する', async ({ page }) => {
    await openGame(page);
    await setupField(page, 3);
    const target = await page.evaluate(() => {
      const e = gameObjs.enemies.find((x) => x.active);
      // 至近距離に置き、一撃で落ちる残量にする
      e.x = gameObjs.player.x + 30;
      e.y = gameObjs.player.y;
      e.shield = 1;
      return { x: e.x, y: e.y };
    });
    const before = await snapshot(page);

    await clickWorld(page, target);

    const after = await snapshot(page);
    expect(after.score, 'スコアが減る').toBeLessThan(before.score);
    expect(after.enemies.filter((e) => e.active).length,
           '撃破された分は補充され、数は減らない')
      .toBeGreaterThanOrEqual(before.enemies.filter((e) => e.active).length);
    expect((await readLog(page, 4)).join('\n')).toContain('敵艦を撃破');
  });

  test('敵が宇宙域の外へ出ると撤退し、残った敵の士気が下がる', async ({ page }) => {
    await openGame(page);
    await setupField(page, 3);
    const before = await page.evaluate(() => {
      // 1隻を境界の外へ送り出す。逃走中なら外向きに動く
      const fleeing = gameObjs.enemies.find((e) => e.active);
      fleeing.x = AREA_CENTER.X + AREA_R - 5;
      fleeing.y = AREA_CENTER.Y;
      fleeing.shield = EnemyShip.SHIELD_MAX * 0.05;
      return {
        others: gameObjs.enemies.filter((e) => e.active && e !== fleeing)
          .map((e) => e.spirit),
        count: getActiveEnemyCount(),
      };
    });

    await runNpcTurn(page);

    const after = await page.evaluate(() => ({
      count: getActiveEnemyCount(),
      spirits: gameObjs.enemies.filter((e) => e.active).map((e) => e.spirit),
    }));
    expect(after.count, '1隻減っている').toBeLessThan(before.count);
    expect(Math.max(...after.spirits), '残った敵の士気が下がる')
      .toBeLessThan(Math.max(...before.others));
    expect((await readLog(page, 4)).join('\n')).toContain('離脱');
  });

  test('一定ターンごとに敵の増援が出現する', async ({ page }) => {
    await openGame(page);
    await setupField(page, 2);
    const before = await page.evaluate(() => {
      // 次の finalizeEnemyTurn で増援の条件を満たすターンにする
      gameState.turn = NEW_ENEMY_INTERVAL - 1;
      return { count: getActiveEnemyCount(), interval: NEW_ENEMY_INTERVAL };
    });

    await runNpcTurn(page);

    const after = await page.evaluate(() => ({
      turn: gameState.turn, count: getActiveEnemyCount(),
    }));
    expect(after.turn % before.interval, '増援の判定が走るターン').toBe(0);
    expect(after.count, '敵が増えている').toBeGreaterThan(before.count);
    expect((await readLog(page, 4)).join('\n')).toContain('新たな敵を検知');
  });

  test('味方が劣勢のとき、一定ターンごとに連邦艦の増援が出現する', async ({ page }) => {
    await openGame(page);
    await setupField(page, 4);
    const before = await page.evaluate(() => {
      // 味方ゼロ・敵4隻。連邦艦が敵の半数未満という劣勢の条件を満たす
      gameState.turn = NEW_FEDERATION_INTERVAL - 1;
      return {
        federation: getActiveFederationShipCount(),
        enemies: getActiveEnemyCount(),
        interval: NEW_FEDERATION_INTERVAL,
      };
    });
    expect(before.federation, '味方は劣勢である')
      .toBeLessThan(before.enemies / 2);

    await runNpcTurn(page);

    const after = await page.evaluate(() => ({
      turn: gameState.turn, federation: getActiveFederationShipCount(),
    }));
    expect(after.turn % before.interval, '増援の判定が走るターン').toBe(0);
    expect(after.federation, '味方が増えている').toBeGreaterThan(before.federation);
    expect((await readLog(page, 4)).join('\n')).toContain('味方が到着');
  });

  test('連邦艦が基地に接するとドッキングし、シールドが全回復する', async ({ page }) => {
    await openGame(page);
    await setupField(page, 2);
    const before = await page.evaluate(() => {
      newFederationShip(gameState.curScene, 0.3, 0.6);
      const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
      const b = gameObjs.starBase;
      // 接触する位置に置き、傷ついた状態にする（＝基地へ退避する状況）
      f.x = b.x + b.r + f.r;
      f.y = b.y;
      f.shield = FederationShip.SHIELD_MAX * 0.2;
      // 敵は遠ざけ、交戦を挟まないようにする
      gameObjs.enemies.forEach((e) => {
        if (e.active) {
          e.x = AREA_CENTER.X;
          e.y = AREA_CENTER.Y + 260;
        }
      });
      return { shield: f.shield, docked: f.is_docked };
    });
    expect(before.docked, 'まだドッキングしていない').toBe(false);

    await runNpcTurn(page);

    const after = await page.evaluate(() => {
      const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
      return {
        docked: f.is_docked,
        shield: f.shield,
        max: FederationShip.SHIELD_MAX,
        dist: Phaser.Math.Distance.Between(
          f.x, f.y, gameObjs.starBase.x, gameObjs.starBase.y),
        targeted: gameObjs.enemies.find((e) => e.active)
          .getPotentialTargets().includes(f),
      };
    });
    expect(after.docked, 'ドッキング状態になる').toBe(true);
    expect(after.shield, 'シールドが全回復する').toBe(after.max);
    expect(after.dist, '基地の中心へ移動する').toBeLessThan(1);
    expect(after.targeted, '敵の標的から外れる').toBe(false);
    expect((await readLog(page, 4)).join('\n')).toContain('味方が基地にドッキング');
  });

  test('シールドを削られた敵は逃走し、移動しながら回復する', async ({ page }) => {
    await openGame(page);
    await setupField(page, 2);
    const before = await page.evaluate(() => {
      const e = gameObjs.enemies.find((x) => x.active);
      e.x = AREA_CENTER.X + 60;
      e.y = AREA_CENTER.Y;
      e.shield = EnemyShip.SHIELD_MAX * 0.05;  // 士気を下回る残量
      return {
        fleeing: e.isFleeing(),
        shield: e.shield,
        distToBase: Phaser.Math.Distance.Between(
          e.x, e.y, gameObjs.starBase.x, gameObjs.starBase.y),
      };
    });
    expect(before.fleeing, '逃走の条件を満たしている').toBe(true);

    await runNpcTurn(page);

    const after = await page.evaluate(() => {
      const e = gameObjs.enemies[0];
      return {
        active: e.active,
        shield: e.shield,
        distToBase: Phaser.Math.Distance.Between(
          e.x, e.y, gameObjs.starBase.x, gameObjs.starBase.y),
      };
    });
    expect(after.active, 'まだ宇宙域にいる').toBe(true);
    expect(after.distToBase, '基地から遠ざかる').toBeGreaterThan(before.distToBase);
    expect(after.shield, '移動しながらシールドが回復する')
      .toBeGreaterThan(before.shield);
  });

  test('一連のターン進行でコンソールにエラー・警告が出ない', async ({ page }) => {
    const issues = collectConsoleIssues(page);
    await openGame(page);
    await setupField(page, 3);

    for (let i = 0; i < 5; i++) {
      const p = await page.evaluate(() => ({
        x: gameObjs.player.x, y: gameObjs.player.y,
      }));
      await clickWorld(page, { x: p.x + (i % 2 === 0 ? 30 : -30), y: p.y });
    }
    await waitForPlayerTurn(page);

    expect(issues.errors).toEqual([]);
    expect(issues.warnings).toEqual([]);
  });
});
