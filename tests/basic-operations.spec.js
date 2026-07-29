// @ts-check
const { test, expect } = require('@playwright/test');
const {
  openGame, waitForPlayerTurn, snapshot, clickWorld, dragScreen, readLog,
  readStatusPanel, waitForIdle,
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

  test('ステータス欄の数値は整数で表示される', async ({ page }) => {
    // 内部の値は割り切れない計算で端数を持ちうる。それをそのまま出すと
    // 112.00000000000001 のような表示になり、横画面では行が折り返して
    // 表示まで崩れる。バランス数値を変えたときに初めて出るため、
    // 端数を作って確かめる。
    await openGame(page);
    await page.evaluate(() => {
      gameObjs.player.shield = 400 * 0.28;      // 112.00000000000001
      gameObjs.player.energy = 5000 / 3;        // 1666.666...
      gameObjs.starBase.shield = 4000 * 0.115;  // 460.00000000000006
      updateStatus();
    });

    const shown = await page.evaluate(() => ({
      shield: document.getElementById('statusShipShield').textContent,
      energy: document.getElementById('statusShipEnergy').textContent,
      base: document.getElementById('statusBaseShield').textContent,
    }));
    for (const [name, text] of Object.entries(shown)) {
      expect(text, `${name} が整数で表示される`).toMatch(/^-?\d+$/);
    }
    expect(shown.shield, 'シールドは四捨五入される').toBe('112');
    expect(shown.energy, 'エネルギーは四捨五入される').toBe('1667');
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

/**
 * ズームを指定の倍率まで上げ、カメラが落ち着くまで待つ。
 * changeZoom() は tween で寄せるため、直後に測ると途中の値が取れる。
 */
async function zoomTo(page, zoom) {
  await page.evaluate((z) => {
    while (gameState.zoom < z) {
      changeZoom(gameState.curScene, CAMERA.STEP);
    }
  }, zoom);
  await waitForIdle(page);
}

/** カメラが今どこを見ているか */
async function cameraCenter(page) {
  return page.evaluate(() => {
    const cam = gameState.curScene.cameras.main;
    return { x: cam.midPoint.x, y: cam.midPoint.y, following: !!cam._follow };
  });
}

/**
 * NPC のターンを空振りさせ、プレイヤーの行動の結果だけを見えるようにする。
 *
 * これを入れないと、クリックのあとに敵と味方が撃ち合った分まで数えてしまい、
 * 「自機の一撃が誰に当たったか」を測れない。
 * 差し替えるのは npcTurn だけで、攻撃の処理そのものには手を触れない。
 */
async function suppressNpcTurn(page) {
  await page.evaluate(() => {
    npcTurn = (scene) => {
      gameState.isPlayerTurn = true;
    };
  });
}

/**
 * 自機・味方・敵を一直線に並べる。
 * 射線上に味方がいる状況は、座標を作らないと安定して再現できない。
 * @return {Promise<{enemy:{x:number,y:number}, friend:{x:number,y:number}}>}
 */
async function lineUpPlayerFriendEnemy(page, { friendOffset = 60 } = {}) {
  return page.evaluate((offset) => {
    const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
    // 基地は射線から外す。基地も誤射の対象なので、残すと結果が混ざる
    gameObjs.starBase.x = cx;
    gameObjs.starBase.y = cy - 250;

    const p = gameObjs.player;
    p.isDocked = false;
    p.x = cx - 100;
    p.y = cy;

    newFederationShip(gameState.curScene, 0.1, 0.2);
    const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
    f.active = true;
    f.sprite.setVisible(true);
    f.isDocked = false;
    f.shield = FederationShip.SHIELD_MAX;
    f.x = cx - 100 + offset;   // 自機と敵のあいだ
    f.y = cy;

    const e = gameObjs.enemies[0];
    e.active = true;
    e.sprite.setVisible(true);
    e.shield = EnemyShip.SHIELD_MAX;
    e.x = cx - 100 + 130;
    e.y = cy;

    return { enemy: { x: e.x, y: e.y }, friend: { x: f.x, y: f.y } };
  }, friendOffset);
}

/** 味方（最後に足した連邦艦）と敵の状態 */
async function readLineUp(page) {
  return page.evaluate(() => {
    const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
    const e = gameObjs.enemies[0];
    return {
      friendShield: f.shield, friendActive: f.active,
      enemyShield: e.shield,
      energy: gameObjs.player.energy,
      baseShield: gameObjs.starBase.shield,
    };
  });
}

test.describe('射線上の味方への誤射', () => {
  test('味方越しに敵を撃つと、味方に当たって敵には届かない', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    await suppressNpcTurn(page);
    const pos = await lineUpPlayerFriendEnemy(page);
    const before = await readLineUp(page);

    await clickWorld(page, pos.enemy);
    const after = await readLineUp(page);

    expect(after.friendShield, '味方のシールドが減る')
      .toBeLessThan(before.friendShield);
    expect(after.enemyShield, '敵は無傷').toBe(before.enemyShield);
    expect(after.energy, 'エネルギーは消費する').toBeLessThan(before.energy);
    expect((await readLog(page, 3)).join('\n')).toContain('誤射');
  });

  test('味方が射線から外れていれば、今までどおり敵に当たる', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    await suppressNpcTurn(page);
    const pos = await lineUpPlayerFriendEnemy(page);
    // 味方だけを射線の外へ動かす
    await page.evaluate(() => {
      const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
      f.y = AREA_CENTER.Y - 120;
    });
    const before = await readLineUp(page);

    await clickWorld(page, pos.enemy);
    const after = await readLineUp(page);

    expect(after.enemyShield, '敵のシールドが減る').toBeLessThan(before.enemyShield);
    expect(after.friendShield, '味方は無傷').toBe(before.friendShield);
  });

  test('恒星が味方より手前にあれば、誤射ではなく無駄撃ちになる', async ({ page }) => {
    // 手前にあるほうが優先される。恒星が先なら誰にもダメージは入らない
    await openGame(page);
    await clearField(page);
    await suppressNpcTurn(page);
    const pos = await lineUpPlayerFriendEnemy(page);
    await page.evaluate(() => {
      const s = gameObjs.stars[0];
      s.active = true;
      s.sprite.setVisible(true);
      s.x = gameObjs.player.x + 30;   // 味方より手前
      s.y = gameObjs.player.y;
    });
    const before = await readLineUp(page);

    await clickWorld(page, pos.enemy);
    const after = await readLineUp(page);

    expect(after.friendShield, '味方は無傷').toBe(before.friendShield);
    expect(after.enemyShield, '敵も無傷').toBe(before.enemyShield);
    expect((await readLog(page, 3)).join('\n')).toContain('障害物に遮られました');
  });

  test('ドック内の味方は射線上にいても当たらない', async ({ page }) => {
    // 基地の中にいるため。敵の標的から外れるのと同じ扱い
    await openGame(page);
    await clearField(page);
    await suppressNpcTurn(page);
    const pos = await lineUpPlayerFriendEnemy(page);
    await page.evaluate(() => {
      gameObjs.federationShips[gameObjs.federationShips.length - 1].isDocked = true;
    });
    const before = await readLineUp(page);

    await clickWorld(page, pos.enemy);
    const after = await readLineUp(page);

    expect(after.enemyShield, '敵に当たる').toBeLessThan(before.enemyShield);
    expect(after.friendShield, 'ドック内の味方は無傷').toBe(before.friendShield);
  });

  test('基地が射線上にあると基地を誤射する', async ({ page }) => {
    // 以前はプレイヤーだけが基地越しに撃てていた。その非対称を解消した
    await openGame(page);
    await clearField(page);
    await suppressNpcTurn(page);
    const pos = await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      const p = gameObjs.player;
      p.isDocked = false;
      p.x = cx - 120;
      p.y = cy;
      gameObjs.starBase.x = cx - 40;   // 自機と敵のあいだ
      gameObjs.starBase.y = cy;
      const e = gameObjs.enemies[0];
      e.active = true;
      e.sprite.setVisible(true);
      e.shield = EnemyShip.SHIELD_MAX;
      // 最大射程（160）の内側に置く。外に置くと射程外の判定が先に立ち、
      // 射線の判定まで到達しない
      e.x = cx + 20;
      e.y = cy;
      return { x: e.x, y: e.y };
    });
    const before = await page.evaluate(() => ({
      base: gameObjs.starBase.shield, enemy: gameObjs.enemies[0].shield,
    }));

    await clickWorld(page, pos);
    const after = await page.evaluate(() => ({
      base: gameObjs.starBase.shield, enemy: gameObjs.enemies[0].shield,
    }));

    expect(after.base, '基地のシールドが減る').toBeLessThan(before.base);
    expect(after.enemy, '敵は無傷').toBe(before.enemy);
    expect((await readLog(page, 3)).join('\n')).toContain('誤射');
  });

  test('狙った敵が射程外でも、手前の味方には当たる', async ({ page }) => {
    // ビームは最大射程まで飛んでいる。狙いが届かないことと、
    // 途中にいる味方に当たらないことは別の話。
    await openGame(page);
    await clearField(page);
    await suppressNpcTurn(page);
    const pos = await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      const p = gameObjs.player;
      p.isDocked = false;
      p.x = cx - 200;
      p.y = cy;
      gameObjs.starBase.x = cx - 140;   // 自機のすぐ先。射程の内側
      gameObjs.starBase.y = cy;
      const e = gameObjs.enemies[0];
      e.active = true;
      e.sprite.setVisible(true);
      e.shield = EnemyShip.SHIELD_MAX;
      // 最大射程より遠くに置く。狙い自体は届かない
      e.x = p.x + p.weapon.maxRange() + 80;
      e.y = cy;
      return { x: e.x, y: e.y };
    });
    const before = await page.evaluate(() => ({
      base: gameObjs.starBase.shield, enemy: gameObjs.enemies[0].shield,
    }));

    await clickWorld(page, pos);
    const after = await page.evaluate(() => ({
      base: gameObjs.starBase.shield, enemy: gameObjs.enemies[0].shield,
    }));

    expect(after.base, '射程内にある基地には当たる').toBeLessThan(before.base);
    expect(after.enemy, '射程外の敵には届かない').toBe(before.enemy);
    expect((await readLog(page, 3)).join('\n')).toContain('誤射');
  });

  test('味方も敵も射程の外なら、射程外として報告する', async ({ page }) => {
    // 射線上にいても、ビームが届いていなければ当たらない
    await openGame(page);
    await clearField(page);
    await suppressNpcTurn(page);
    const pos = await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      const p = gameObjs.player;
      p.isDocked = false;
      p.x = cx - 260;
      p.y = cy;
      // 基地も敵も最大射程の外に置く
      gameObjs.starBase.x = p.x + p.weapon.maxRange() + 40;
      gameObjs.starBase.y = cy;
      const e = gameObjs.enemies[0];
      e.active = true;
      e.sprite.setVisible(true);
      e.shield = EnemyShip.SHIELD_MAX;
      e.x = p.x + p.weapon.maxRange() + 140;
      e.y = cy;
      return { x: e.x, y: e.y };
    });
    const before = await page.evaluate(() => ({
      base: gameObjs.starBase.shield, enemy: gameObjs.enemies[0].shield,
    }));

    await clickWorld(page, pos);
    const after = await page.evaluate(() => ({
      base: gameObjs.starBase.shield, enemy: gameObjs.enemies[0].shield,
    }));

    expect(after.base, '射程外の基地には当たらない').toBe(before.base);
    expect(after.enemy, '敵にも当たらない').toBe(before.enemy);
    expect((await readLog(page, 3)).join('\n')).toContain('射程範囲外');
  });
});

test.describe('ズーム中のスクロール', () => {
  test('ズーム中にドラッグすると宇宙域がスクロールする', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    await zoomTo(page, 2);

    const before = await cameraCenter(page);
    expect(before.following, 'ドラッグ前は自機を追っている').toBe(true);

    // 画面中央から左へ引く。カメラは引いた向きと逆（右）へ動く
    const box = await page.evaluate(() => {
      const r = document.querySelector('#gameCanvas canvas').getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    await dragScreen(page, { x: box.cx, y: box.cy }, { x: box.cx - 120, y: box.cy });

    const after = await cameraCenter(page);
    expect(after.x, '引いた向きと逆へ動く').toBeGreaterThan(before.x + 1);
    expect(after.following, 'スクロール中は追従が外れる').toBe(false);
  });

  test('ドラッグしても自機は動かない', async ({ page }) => {
    // この機能で最も壊してはいけない点。スクロールのつもりの操作で
    // 自機が動くと、ターンを1つ無駄にすることになる
    await openGame(page);
    await clearField(page);
    await zoomTo(page, 2);

    const before = await snapshot(page);
    const box = await page.evaluate(() => {
      const r = document.querySelector('#gameCanvas canvas').getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    await dragScreen(page, { x: box.cx, y: box.cy }, { x: box.cx - 120, y: box.cy });

    const after = await snapshot(page);
    expect(after.player.x, '自機の位置が変わらない').toBe(before.player.x);
    expect(after.player.y, '自機の位置が変わらない').toBe(before.player.y);
    expect(after.turn, 'ターンが進まない').toBe(before.turn);
    expect(await page.evaluate(() => gameState.isPlayerTurn),
           'プレイヤーのターンのまま').toBe(true);
  });

  test('ズーム1倍ではドラッグしてもスクロールしない', async ({ page }) => {
    // 全体が見えているので動かす必要がない
    await openGame(page);
    await clearField(page);

    const before = await cameraCenter(page);
    const box = await page.evaluate(() => {
      const r = document.querySelector('#gameCanvas canvas').getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    await dragScreen(page, { x: box.cx, y: box.cy }, { x: box.cx - 120, y: box.cy });

    const after = await cameraCenter(page);
    expect(after.x, 'カメラは動かない').toBeCloseTo(before.x, 1);
    expect(after.y, 'カメラは動かない').toBeCloseTo(before.y, 1);
  });

  test('スクロールしたあと、ズーム操作で自機の追従に戻る', async ({ page }) => {
    await openGame(page);
    await clearField(page);
    await zoomTo(page, 2);

    const box = await page.evaluate(() => {
      const r = document.querySelector('#gameCanvas canvas').getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
    });
    await dragScreen(page, { x: box.cx, y: box.cy }, { x: box.cx - 120, y: box.cy });
    expect((await cameraCenter(page)).following, '追従が外れている').toBe(false);

    await zoomTo(page, 4);
    expect((await cameraCenter(page)).following, 'ズーム操作で追従に戻る').toBe(true);
  });

  test('宇宙域の外までスクロールできない', async ({ page }) => {
    // 際限なくスクロールできると盤面を見失う。中心が宇宙域から出ないよう
    // 制限しておけば、端まで送っても盤面の半分は残る
    await openGame(page);
    await clearField(page);
    await zoomTo(page, 2);

    const box = await page.evaluate(() => {
      const r = document.querySelector('#gameCanvas canvas').getBoundingClientRect();
      return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, left: r.left };
    });
    // 何度も大きく引いて、行けるところまで送る
    for (let i = 0; i < 6; i++) {
      await dragScreen(page, { x: box.cx + 150, y: box.cy },
                       { x: box.left + 5, y: box.cy });
    }

    const dist = await page.evaluate(() => {
      const cam = gameState.curScene.cameras.main;
      return Phaser.Math.Distance.Between(
        cam.midPoint.x, cam.midPoint.y, AREA_CENTER.X, AREA_CENTER.Y);
    });
    const areaR = await page.evaluate(() => AREA_R);
    expect(dist, '宇宙域の外へは出ない').toBeLessThanOrEqual(areaR + 1);
    expect(dist, '端まで送れてはいる').toBeGreaterThan(areaR * 0.5);
  });
});
