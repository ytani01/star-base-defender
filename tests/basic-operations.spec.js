// @ts-check
const { test, expect } = require('@playwright/test');
const {
  openGame, waitForPlayerTurn, snapshot, clickWorld, readLog, readStatusPanel,
} = require('./helpers/game');

/**
 * 確認シナリオ「基本操作」に対応するテスト。
 *
 * 盤面は乱数の固定だけでは狙った形にならないため、各テストの冒頭で
 * 必要な配置を作ってから操作する。作るのは前提だけで、判定は実際の
 * クリック操作と、ゲーム本体の処理の結果に対して行う。
 */

/**
 * 邪魔になるものを片付けて、素の宇宙域にする。
 *
 * 敵を1隻だけ遠くに残すのは、全滅させるとミッションクリアになって
 * プレイヤーのターンが戻ってこないため。敵の攻撃可能距離
 * （最大射程 140 に士気の分を掛けた値）より十分遠くへ置くので、
 * 検証したい操作には干渉しない。残すのは常に enemies[0] で、
 * 敵を使うテストはこれを目的の位置へ動かして使う。
 */
async function clearField(page) {
  await page.evaluate(() => {
    gameObjs.stars.forEach((s) => { s.active = false; s.sprite.setVisible(false); });
    gameObjs.federationShips.forEach((f) => { f.active = false; f.sprite.setVisible(false); });
    gameObjs.enemies.forEach((e, i) => {
      if (i === 0) {
        e.active = true;
        e.sprite.setVisible(true);
        e.x = AREA_CENTER.X;
        e.y = AREA_CENTER.Y + 250;
        e.shield = EnemyShip.SHIELD_MAX;
      } else {
        e.active = false;
        e.sprite.setVisible(false);
      }
    });
  });
}

/** 自機を指定の位置へ瞬時に置く（移動の消費なし） */
async function placePlayer(page, x, y) {
  await page.evaluate(({ x, y }) => {
    gameObjs.player.x = x;
    gameObjs.player.y = y;
    gameObjs.player.isDocked = false;
  }, { x, y });
}

test.describe('基本操作', () => {
  test('空間をクリックして移動できる', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    const center = await page.evaluate(() => ({ x: AREA_CENTER.X, y: AREA_CENTER.Y }));
    await placePlayer(page, center.x - 150, center.y);

    const before = await snapshot(page);
    await clickWorld(page, { x: center.x - 50, y: center.y });
    const after = await snapshot(page);

    expect(after.player.x, '目的地へ近づいている').toBeGreaterThan(before.player.x);
    expect(after.player.shield, 'シールドは減らない').toBe(before.player.shield);
    const energy = await page.evaluate(() => gameObjs.player.energy);
    expect(energy, '移動でエネルギーを消費する').toBeLessThan(5000);
  });

  test('進路上の障害物の手前で停止する', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    // 自機の正面に星を1つだけ置き、その向こう側をクリックする
    const setup = await page.evaluate(() => {
      const star = gameObjs.stars[0];
      star.active = true;
      star.sprite.setVisible(true);
      star.x = AREA_CENTER.X;
      star.y = AREA_CENTER.Y;
      gameObjs.player.x = AREA_CENTER.X - 120;
      gameObjs.player.y = AREA_CENTER.Y;
      gameObjs.player.isDocked = false;
      gameObjs.starBase.x = AREA_CENTER.X;
      gameObjs.starBase.y = AREA_CENTER.Y - 250;  // 進路から外す
      return { star: { x: star.x, y: star.y, r: star.r }, playerR: gameObjs.player.r };
    });

    await clickWorld(page, { x: setup.star.x + 100, y: setup.star.y });

    const dist = await page.evaluate(() => Phaser.Math.Distance.Between(
      gameObjs.player.x, gameObjs.player.y, gameObjs.stars[0].x, gameObjs.stars[0].y));
    const contact = setup.star.r + setup.playerR;
    expect(dist, '星に重なっていない').toBeGreaterThanOrEqual(contact);
    const px = await page.evaluate(() => gameObjs.player.x);
    expect(px, '星を通り抜けていない').toBeLessThan(setup.star.x);
  });

  test('障害物に囲まれると迂回コースが選ばれ、操舵手が報告する', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    // 正面を星の壁で塞ぐ。直進では「ほぼ動けない」状態にしないと
    // 迂回の探索が始まらないため、壁は自機のすぐ前に置く。
    // 壁の上下は開けてあるので、横へ振れば進める。
    await page.evaluate(() => {
      gameObjs.starBase.x = AREA_CENTER.X;
      gameObjs.starBase.y = AREA_CENTER.Y - 250;
      const p = gameObjs.player;
      p.isDocked = false;
      p.y = AREA_CENTER.Y;
      // 接触距離（自機と星の半径の和）のすぐ外側に立たせる
      p.x = AREA_CENTER.X - ((p.w + gameObjs.stars[0].w) / 2 + 5);
      [-44, -22, 0, 22, 44].forEach((dy, i) => {
        const s = gameObjs.stars[i];
        s.active = true;
        s.sprite.setVisible(true);
        s.x = AREA_CENTER.X;
        s.y = AREA_CENTER.Y + dy;
      });
    });

    await clickWorld(page, await page.evaluate(
      () => ({ x: AREA_CENTER.X + 100, y: AREA_CENTER.Y })));

    const log = await readLog(page, 3);
    expect(log.join('\n'), 'コース調整の報告が出る').toContain('コース調整');
  });

  test('敵をクリックして攻撃できる（命中）', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    const enemy = await page.evaluate(() => {
      const e = gameObjs.enemies[0];
      e.active = true;
      e.sprite.setVisible(true);
      e.x = AREA_CENTER.X + 40;
      e.y = AREA_CENTER.Y;
      e.shield = EnemyShip.SHIELD_MAX;
      gameObjs.player.x = AREA_CENTER.X;
      gameObjs.player.y = AREA_CENTER.Y;
      gameObjs.player.isDocked = false;
      gameObjs.starBase.x = AREA_CENTER.X;
      gameObjs.starBase.y = AREA_CENTER.Y - 250;
      return { x: e.x, y: e.y, shield: e.shield };
    });

    await clickWorld(page, enemy);

    const after = await page.evaluate(() => gameObjs.enemies[0].shield);
    expect(after, '敵のシールドが減っている').toBeLessThan(enemy.shield);
  });

  test('射程外の敵を撃つと無駄撃ちになる', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    const enemy = await page.evaluate(() => {
      const e = gameObjs.enemies[0];
      e.active = true;
      e.sprite.setVisible(true);
      gameObjs.player.x = AREA_CENTER.X - 250;
      gameObjs.player.y = AREA_CENTER.Y;
      gameObjs.player.isDocked = false;
      gameObjs.starBase.x = AREA_CENTER.X;
      gameObjs.starBase.y = AREA_CENTER.Y - 250;
      // 最大射程より遠くへ置く
      e.x = gameObjs.player.x + gameObjs.player.weapon.maxRange() + 60;
      e.y = AREA_CENTER.Y;
      e.shield = EnemyShip.SHIELD_MAX;
      return { x: e.x, y: e.y, shield: e.shield };
    });

    await clickWorld(page, enemy);

    const after = await page.evaluate(() => gameObjs.enemies[0].shield);
    expect(after, 'ダメージは入らない').toBe(enemy.shield);
    expect((await readLog(page, 2)).join('\n')).toContain('射程範囲外');
  });

  test('障害物越しに撃つと遮られる', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    const enemy = await page.evaluate(() => {
      gameObjs.player.x = AREA_CENTER.X - 80;
      gameObjs.player.y = AREA_CENTER.Y;
      gameObjs.player.isDocked = false;
      gameObjs.starBase.x = AREA_CENTER.X;
      gameObjs.starBase.y = AREA_CENTER.Y - 250;
      const star = gameObjs.stars[0];
      star.active = true;
      star.sprite.setVisible(true);
      star.x = AREA_CENTER.X;
      star.y = AREA_CENTER.Y;
      const e = gameObjs.enemies[0];
      e.active = true;
      e.sprite.setVisible(true);
      e.x = AREA_CENTER.X + 80;
      e.y = AREA_CENTER.Y;
      e.shield = EnemyShip.SHIELD_MAX;
      return { x: e.x, y: e.y, shield: e.shield };
    });

    await clickWorld(page, enemy);

    const after = await page.evaluate(() => gameObjs.enemies[0].shield);
    expect(after, 'ダメージは入らない').toBe(enemy.shield);
    expect((await readLog(page, 2)).join('\n')).toContain('障害物に遮られました');
  });

  test('自機をクリックしてシールドを回復できる（エネルギーが減る）', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    const before = await page.evaluate(() => {
      gameObjs.player.x = AREA_CENTER.X;
      gameObjs.player.y = AREA_CENTER.Y;
      gameObjs.player.isDocked = false;
      gameObjs.starBase.x = AREA_CENTER.X;
      gameObjs.starBase.y = AREA_CENTER.Y - 250;
      gameObjs.player.shield = PlayerShip.SHIELD_MAX * 0.5;
      return {
        x: gameObjs.player.x, y: gameObjs.player.y,
        shield: gameObjs.player.shield, energy: gameObjs.player.energy,
      };
    });

    await clickWorld(page, before);

    const after = await page.evaluate(() => ({
      shield: gameObjs.player.shield, energy: gameObjs.player.energy,
    }));
    expect(after.shield, 'シールドが増える').toBeGreaterThan(before.shield);
    expect(after.energy, 'エネルギーが減る').toBeLessThan(before.energy);
  });

  test('基地に隣接して基地をクリックするとドッキングし、全回復する', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    const base = await page.evaluate(() => {
      const b = gameObjs.starBase;
      b.x = AREA_CENTER.X;
      b.y = AREA_CENTER.Y;
      const p = gameObjs.player;
      p.isDocked = false;
      p.shield = PlayerShip.SHIELD_MAX * 0.3;
      p.energy = PlayerShip.ENERGY_MAX * 0.3;
      // 接触する距離に置く
      p.x = b.x + b.r + p.r;
      p.y = b.y;
      return { x: b.x, y: b.y };
    });

    expect(await page.evaluate(() => canDock()), '隣接している').toBe(true);
    await clickWorld(page, base);

    const after = await page.evaluate(() => ({
      docked: gameObjs.player.isDocked,
      shield: gameObjs.player.shield,
      energy: gameObjs.player.energy,
      max: [PlayerShip.SHIELD_MAX, PlayerShip.ENERGY_MAX],
      dist: Phaser.Math.Distance.Between(
        gameObjs.player.x, gameObjs.player.y,
        gameObjs.starBase.x, gameObjs.starBase.y),
    }));
    expect(after.docked, 'ドッキング状態になる').toBe(true);
    expect(after.shield, 'シールドが最大まで回復する').toBe(after.max[0]);
    expect(after.energy, 'エネルギーが最大まで回復する').toBe(after.max[1]);
    expect(after.dist, '基地の中心へ移動する').toBeLessThan(1);
    expect((await readLog(page, 2)).join('\n')).toContain('ドッキング完了');
  });

  test('ドッキング中は攻撃できず、解除すると基地から押し出される', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    const setup = await page.evaluate(() => {
      const b = gameObjs.starBase;
      b.x = AREA_CENTER.X;
      b.y = AREA_CENTER.Y;
      const p = gameObjs.player;
      p.x = b.x;
      p.y = b.y;
      p.isDocked = true;
      const e = gameObjs.enemies[0];
      e.active = true;
      e.sprite.setVisible(true);
      e.x = b.x + 70;
      e.y = b.y;
      e.shield = EnemyShip.SHIELD_MAX;
      return {
        enemy: { x: e.x, y: e.y }, shield: e.shield,
        minPush: StarBase.R + p.r,
      };
    });

    // 1) ドッキング中に敵を撃とうとしても撃てない
    await clickWorld(page, setup.enemy);
    expect(await page.evaluate(() => gameObjs.enemies[0].shield),
           'ダメージは入らない').toBe(setup.shield);
    expect((await readLog(page, 2)).join('\n')).toContain('ドッキング中のため兵器は使用できません');
    expect(await page.evaluate(() => gameObjs.player.isDocked),
           'ドッキングは続いている').toBe(true);

    // 2) 空間をクリックして離れると、基地の外へ押し出される
    await clickWorld(page, await page.evaluate(
      () => ({ x: AREA_CENTER.X + 150, y: AREA_CENTER.Y })));
    const after = await page.evaluate(() => ({
      docked: gameObjs.player.isDocked,
      dist: Phaser.Math.Distance.Between(
        gameObjs.player.x, gameObjs.player.y,
        gameObjs.starBase.x, gameObjs.starBase.y),
    }));
    expect(after.docked, 'ドッキングが解除される').toBe(false);
    expect(after.dist, '基地の外へ押し出される').toBeGreaterThanOrEqual(setup.minPush - 0.01);
  });

  test('ドッキング中の艦の数がステータス欄に出る', async ({ page }) => {
    await openGame(page);
    // 連邦艦は clearField() で片付く。ここで数えたいのは自機の分だけにして、
    // NPC が勝手に発進して数が動くことのないようにする
    await clearField(page);
    const base = await page.evaluate(() => {
      const b = gameObjs.starBase;
      b.x = AREA_CENTER.X;
      b.y = AREA_CENTER.Y;
      const p = gameObjs.player;
      p.isDocked = false;
      // 接触する距離に置く
      p.x = b.x + b.r + p.r;
      p.y = b.y;
      updateStatus();
      return { x: b.x, y: b.y };
    });

    expect((await readStatusPanel(page)).docked,
           'まだ誰も入っていない').toBe('0');

    // 自機がドッキングすると増える
    await clickWorld(page, base);
    expect(await page.evaluate(() => gameObjs.player.isDocked),
           'ドッキングした').toBe(true);
    expect((await readStatusPanel(page)).docked,
           '自機の分が数えられる').toBe('1');

    // 自機が発進すると減る
    await clickWorld(page, { x: base.x + 150, y: base.y });
    expect(await page.evaluate(() => gameObjs.player.isDocked),
           'ドッキングが解除された').toBe(false);
    expect((await readStatusPanel(page)).docked,
           '0隻に戻る').toBe('0');
  });
});
