// @ts-check
const { test, expect } = require('@playwright/test');
const {
  openGame, waitForPlayerTurn, snapshot, clickWorld, collectConsoleIssues,
} = require('./helpers/game');

/**
 * 土台そのもののテスト。
 *
 * 「同じ条件なら必ず同じ結果になる」ことを、ここで確かめておく。
 * これが通らない限り、他のシナリオテストの結果は信用できない。
 * 失敗したときは、まずこのファイルから原因を追うこと。
 */

/** 決まった手順で数ターン進め、毎ターンの状態を並べて返す */
async function playScript(page, turns) {
  const steps = [await snapshot(page)];
  for (let i = 0; i < turns; i++) {
    const targets = await page.evaluate(() => {
      const enemy = gameObjs.enemies.find((e) => e.active);
      return {
        enemy: enemy ? { x: enemy.x, y: enemy.y } : null,
        base: { x: gameObjs.starBase.x, y: gameObjs.starBase.y },
        player: { x: gameObjs.player.x, y: gameObjs.player.y },
      };
    });
    // 攻撃 → 基地へ移動 → シールド回復 を順に繰り返す
    if (i % 3 === 0 && targets.enemy) {
      await clickWorld(page, targets.enemy);
    } else if (i % 3 === 1) {
      await clickWorld(page, targets.base);
    } else {
      await clickWorld(page, targets.player);
    }
    steps.push(await snapshot(page));
  }
  return steps;
}

test.describe('テストの土台', () => {
  test('ゲームが起動し、盤面が揃っている', async ({ page }) => {
    await openGame(page);
    const s = await snapshot(page);

    expect(s.turn).toBe(1);
    expect(s.mission).toBe(1);
    expect(s.player.active).toBe(true);
    expect(s.base.active).toBe(true);
    expect(s.enemies.filter((e) => e.active).length).toBe(s.enemyQty);
    expect(s.stars.length).toBeGreaterThan(0);
    expect(s.isPlayerTurn).toBe(true);
  });

  test('同じ種を渡せば、起動時の盤面が完全に一致する', async ({ page }) => {
    await openGame(page, { seed: 12345 });
    const first = await snapshot(page);

    await openGame(page, { seed: 12345 });
    const second = await snapshot(page);

    // 星・敵・自機の配置まで含めて一致すること
    expect(second).toEqual(first);
  });

  test('種が違えば盤面も変わる（固定が効いていることの裏取り）', async ({ page }) => {
    await openGame(page, { seed: 1 });
    const a = await snapshot(page);

    await openGame(page, { seed: 999 });
    const b = await snapshot(page);

    expect(b.stars).not.toEqual(a.stars);
  });

  test('同じ操作を繰り返せば、数ターン後の状態まで一致する', async ({ page }) => {
    await openGame(page, { seed: 777 });
    const first = await playScript(page, 6);

    await openGame(page, { seed: 777 });
    const second = await playScript(page, 6);

    // ステップごとに比べる。ずれた場合にどのターンからかが分かる
    expect(second.length).toBe(first.length);
    for (let i = 0; i < first.length; i++) {
      expect(second[i], `ステップ ${i} で状態がずれた`).toEqual(first[i]);
    }
  });

  test('ターンの完了を待てている（演出や予約が残っていない）', async ({ page }) => {
    await openGame(page);
    const enemy = await page.evaluate(() => {
      const e = gameObjs.enemies.find((x) => x.active);
      return { x: e.x, y: e.y };
    });
    await clickWorld(page, enemy);

    const pending = await page.evaluate(() => ({
      moving: gameState.curScene.tweens.getTweens().length,
      timers: (gameState.curScene.time._active || []).length,
      isPlayerTurn: gameState.isPlayerTurn,
    }));
    expect(pending.moving).toBe(0);
    expect(pending.timers).toBe(0);
    expect(pending.isPlayerTurn || (await snapshot(page)).isGameOver).toBe(true);
  });

  test('起動から数ターン進めてもコンソールにエラー・警告が出ない', async ({ page }) => {
    const issues = collectConsoleIssues(page);
    await openGame(page);
    await playScript(page, 4);
    await waitForPlayerTurn(page);

    expect(issues.errors).toEqual([]);
    expect(issues.warnings).toEqual([]);
  });
});
