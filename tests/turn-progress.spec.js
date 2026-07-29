// @ts-check
const { test, expect } = require('@playwright/test');
const {
  openGame, waitForPlayerTurn, waitForIdle, snapshot, clickWorld, readLog,
  readStatusPanel, collectConsoleIssues,
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
    gameObjs.player.isDocked = false;
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
      return { shield: f.shield, docked: f.isDocked };
    });
    expect(before.docked, 'まだドッキングしていない').toBe(false);

    await runNpcTurn(page);

    const after = await page.evaluate(() => {
      const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
      return {
        docked: f.isDocked,
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

    // ステータス欄の Dock は、ゲーム本体とは別に数え直した値と一致する
    const dockedShips = await page.evaluate(() =>
      gameObjs.federationShips.filter((f) => f.active && f.isDocked).length
        + (gameObjs.player.isDocked ? 1 : 0));
    expect(dockedShips, '少なくとも1隻は入っている').toBeGreaterThanOrEqual(1);
    expect((await readStatusPanel(page)).docked,
           'ドッキング中の連邦艦が数に出る').toBe(`${dockedShips}`);
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


/**
 * NPC が撃つかどうかは、射線だけでなく交戦距離でも決まる
 * （最大射程 × (1 - 士気)。連邦艦は 104、敵艦は 70）。
 * 距離が足りずに撃たなかったのを「射線を避けた」と読み違えないよう、
 * 配置が交戦距離の内側であることをテスト自身で確かめる。
 */
async function assertWithinEngagementRange(page, shooterKind, targetKind) {
  const d = await page.evaluate(({ shooterKind, targetKind }) => {
    const pick = (kind) => kind === 'player' ? gameObjs.player
      : kind === 'federation'
        ? gameObjs.federationShips[gameObjs.federationShips.length - 1]
        : gameObjs.enemies.filter((e) => e.active)[kind === 'enemyFar' ? 1 : 0];
    const s = pick(shooterKind);
    const t = pick(targetKind);
    return {
      dist: Phaser.Math.Distance.Between(s.x, s.y, t.x, t.y),
      limit: s.weapon.maxRange() * (1.0 - s.spirit),
    };
  }, { shooterKind, targetKind });
  expect(d.dist, `${shooterKind} が ${targetKind} を撃てる距離にいる（上限 ${Math.round(d.limit)}）`)
    .toBeLessThanOrEqual(d.limit);
}

test.describe('NPC は味方を巻き込まない', () => {
  test('射線上に味方がいる相手を敵は撃たない', async ({ page }) => {
    // 敵(奥)・敵(手前)・自機 を一直線に並べる。
    // 奥の敵から見ると手前の敵が射線上にいるので撃てない
    await openGame(page);
    await setupField(page, 2);
    const before = await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      gameObjs.starBase.x = cx;
      gameObjs.starBase.y = cy - 250;
      const p = gameObjs.player;
      p.isDocked = false;
      p.shield = PlayerShip.SHIELD_MAX;
      p.x = cx - 20;
      p.y = cy;
      const [near, far] = gameObjs.enemies.filter((e) => e.active);
      // 逃走に転じないよう、シールドは満タンにしておく
      [near, far].forEach((e) => { e.shield = EnemyShip.SHIELD_MAX; e.y = cy; });
      near.x = cx + 10;   // 自機から 30
      far.x = cx + 40;    // 自機から 60（交戦距離 70 の内側）、手前の敵から 30
      return { near: near.shield };
    });
    // 奥の敵は距離としては自機を撃てる位置にいる
    await assertWithinEngagementRange(page, 'enemyFar', 'player');

    const farBefore = await page.evaluate(() => {
      const far = gameObjs.enemies.filter((e) => e.active)[1];
      return { x: far.x, y: far.y };
    });

    await runNpcTurn(page);

    const after = await page.evaluate((prev) => {
      const [near, far] = gameObjs.enemies.filter((e) => e.active);
      return {
        near: near.shield,
        farMoved: Phaser.Math.Distance.Between(far.x, far.y, prev.x, prev.y),
      };
    }, farBefore);

    expect(after.near, '手前の味方が撃たれていない').toBe(before.near);
    // 撃てないと判断した NPC は接近に転じる（execNPCAction）。
    // 撃っていれば、その場に留まったままになる
    expect(after.farMoved, '奥の敵は撃たずに動いている').toBeGreaterThan(1);
  });

  test('連邦艦は自機を巻き込む射線では撃たない', async ({ page }) => {
    // 連邦艦・自機・敵 の順に並べる。連邦艦から見ると自機が射線上にいる
    await openGame(page);
    await setupField(page, 1);
    await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      gameObjs.starBase.x = cx;
      gameObjs.starBase.y = cy - 250;
      newFederationShip(gameState.curScene, 0.1, 0.2);
      const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
      f.active = true;
      f.sprite.setVisible(true);
      f.isDocked = false;
      f.shield = FederationShip.SHIELD_MAX;
      f.x = cx - 60;
      f.y = cy;
      const p = gameObjs.player;
      p.isDocked = false;
      p.shield = PlayerShip.SHIELD_MAX;
      p.x = cx - 20;     // 連邦艦と敵のあいだ
      p.y = cy;
      const e = gameObjs.enemies.find((en) => en.active);
      e.shield = EnemyShip.SHIELD_MAX;
      e.x = cx + 20;     // 連邦艦から 80。交戦距離 104 の内側
      e.y = cy;
    });
    await assertWithinEngagementRange(page, 'federation', 'enemyNear');
    const before = await page.evaluate(() => {
      const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
      return { x: f.x, y: f.y, enemy: gameObjs.enemies.find((e) => e.active).shield };
    });

    await runNpcTurn(page);

    const after = await page.evaluate((prev) => {
      const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
      return {
        moved: Phaser.Math.Distance.Between(f.x, f.y, prev.x, prev.y),
        enemy: gameObjs.enemies.find((e) => e.active).shield,
      };
    }, before);

    const log = (await readLog(page, 8)).join('\n');
    expect(log, '連邦艦の誤射が起きていない').not.toContain('誤射');
    expect(after.enemy, '敵も撃たれていない').toBe(before.enemy);
    // 撃てないと判断した NPC は接近に転じる（execNPCAction）
    expect(after.moved, '連邦艦は撃たずに動いている').toBeGreaterThan(1);
  });

  test('射線が通れば連邦艦は撃つ', async ({ page }) => {
    // 上の裏返し。自機だけを射線から外すと攻撃が成立する。
    // これが通ることで、上のテストが「距離不足で撃たなかった」のでは
    // ないことが裏づけられる
    await openGame(page);
    await setupField(page, 1);
    const before = await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      gameObjs.starBase.x = cx;
      gameObjs.starBase.y = cy - 250;
      newFederationShip(gameState.curScene, 0.1, 0.2);
      const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
      f.active = true;
      f.sprite.setVisible(true);
      f.isDocked = false;
      f.shield = FederationShip.SHIELD_MAX;
      f.x = cx - 60;
      f.y = cy;
      const p = gameObjs.player;
      p.isDocked = false;
      p.x = cx - 20;
      p.y = cy + 150;    // 射線から外す。それ以外は上のテストと同じ
      const e = gameObjs.enemies.find((en) => en.active);
      e.shield = EnemyShip.SHIELD_MAX;
      e.x = cx + 20;
      e.y = cy;
      return { enemy: e.shield };
    });
    await assertWithinEngagementRange(page, 'federation', 'enemyNear');

    await runNpcTurn(page);

    const after = await page.evaluate(() => ({
      enemy: gameObjs.enemies.find((e) => e.active).shield,
    }));
    expect(after.enemy, '敵が攻撃を受けている').toBeLessThan(before.enemy);
  });
});


/**
 * 撃破に伴う増援は「破壊は割に合わない」という中核ルールの担保であり、
 * **誰が撃ったかで変わってはならない**（conductor/product.md）。
 *
 * 撃破はプレイヤーの攻撃だけでなく、連邦艦の攻撃・射線上の巻き添え・
 * 敵の誤射でも起きる。プレイヤーの経路だけが増援を出していると、
 * 味方に敵を削らせるのが最も有利という、設計と正反対の攻略法が成立する。
 */
test.describe('撃破に伴う増援は撃った相手によらない', () => {
  /**
   * 盤面から邪魔物を退け、指定した数の敵だけを一直線上に並べる下ごしらえ。
   *
   * 基地と自機を射線から遠ざけるのは、射線上の何に当たったかを
   * 一意にするため。恒星も同じ理由で退ける。
   */
  async function clearFieldFor(page, enemyCount) {
    await setupField(page, enemyCount);
    await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      // 射線（y = cy の横一線）から外す
      gameObjs.starBase.x = cx;
      gameObjs.starBase.y = cy - 250;
      gameObjs.player.x = cx;
      gameObjs.player.y = cy + 250;
      gameObjs.player.isDocked = false;
    });
  }

  /** 連邦艦を1隻出し、宇宙域の中心からの相対位置に置く */
  async function placeFederation(page, dx, dy) {
    await page.evaluate(({ dx, dy }) => {
      newFederationShip(gameState.curScene, 0.1, 0.2);
      const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
      f.active = true;
      f.sprite.setVisible(true);
      f.isDocked = false;
      f.shield = FederationShip.SHIELD_MAX;
      f.x = AREA_CENTER.X + dx;
      f.y = AREA_CENTER.Y + dy;
    }, { dx, dy });
  }

  test('連邦艦が敵を撃破すると、新たな敵が現れて数が減らない', async ({ page }) => {
    await openGame(page);
    await clearFieldFor(page, 2);
    await placeFederation(page, -10, 0);

    const before = await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
      const [target, bystander] = gameObjs.enemies.filter((e) => e.active);

      target.x = cx;
      target.y = cy;
      // 連邦艦は逃走中の敵を撃たない。撃破が起きるのは「逃走していない敵を
      // 一撃で落とす」ときだけなので、士気を上限にして粘る状態を作り、
      // シールドはその一撃ぶんちょうどにする（バランス値を直接書かない）
      target.spirit = EnemyShip.SPIRIT.MAX;
      target.shield = f.weapon.calcDamage(
        Phaser.Math.Distance.Between(f.x, f.y, target.x, target.y));

      // もう1隻は射線からも交戦距離からも離す。全滅によるミッション
      // 進行を起こさず、撃破の前後だけを見るため
      bystander.x = cx - 200;
      bystander.y = cy + 150;
      bystander.shield = EnemyShip.SHIELD_MAX;

      return {
        count: getActiveEnemyCount(),
        mission: gameState.curMission,
        fleeing: target.isFleeing(),
        shield: target.shield,
      };
    });
    expect(before.fleeing, '狙われる敵は逃走していない（＝連邦艦の標的になる）')
      .toBe(false);
    expect(before.shield, '一撃で落ちる残量である').toBeGreaterThan(0);
    await assertWithinEngagementRange(page, 'federation', 'enemyNear');

    await runNpcTurn(page);

    const after = await page.evaluate(() => ({
      count: getActiveEnemyCount(),
      mission: gameState.curMission,
    }));
    const log = (await readLog(page, 8)).join('\n');
    expect(log, '連邦艦が撃破している').toContain('連邦艦が敵艦を撃破');
    expect(after.mission, 'ミッションは進んでいない').toBe(before.mission);
    expect(after.count, '撃破された分は補充され、数は減らない').toBe(before.count);
  });

  test('連邦艦のビームが射線上の別の敵を落としても、新たな敵が現れる', async ({ page }) => {
    // 評価の時点では射線が通っていた相手が、撃つ時点では塞がれている、
    // という食い違いを再現する。attack() が撃つ直前に射線を取り直すのは
    // このためで、ここはその取り直しの先にある撃破を見ている
    await openGame(page);
    await clearFieldFor(page, 2);
    await placeFederation(page, -100, 0);

    const before = await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      const [blocker, target] = gameObjs.enemies.filter((e) => e.active);
      blocker.x = cx - 50;   // 連邦艦と狙う敵のちょうど中間
      blocker.y = cy;
      blocker.shield = 1;
      target.x = cx;
      target.y = cy;
      target.shield = EnemyShip.SHIELD_MAX;
      return { count: getActiveEnemyCount(), targetShield: target.shield };
    });

    await page.evaluate(() => {
      const f = gameObjs.federationShips[gameObjs.federationShips.length - 1];
      f.attack(gameObjs.enemies.filter((e) => e.active)[1]);
    });
    await waitForIdle(page);

    const after = await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      // 撃破された艦は配列から取り除かれるので、添字では追えない。
      // 置いた位置で見る（増援は宇宙域の外縁部に出るため紛れない）
      const at = (x, y) => gameObjs.enemies.find(
        (e) => e.active && Phaser.Math.Distance.Between(e.x, e.y, x, y) < 1);
      const target = at(cx, cy);
      return {
        count: getActiveEnemyCount(),
        blockerGone: !at(cx - 50, cy),
        targetShield: target ? target.shield : null,
      };
    });
    expect(after.blockerGone, '手前の敵が落ちている').toBe(true);
    expect(after.targetShield, '狙った敵には届いていない').toBe(before.targetShield);
    expect(after.count, '撃破された分は補充され、数は減らない').toBe(before.count);
  });

  test('敵が誤射で別の敵を落としても、新たな敵が現れる', async ({ page }) => {
    await openGame(page);
    await clearFieldFor(page, 2);

    const before = await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      const [shooter, victim] = gameObjs.enemies.filter((e) => e.active);
      // 敵 → 敵 → 自機 の順に並べる。自機を狙った弾が味方に当たる
      shooter.x = cx - 100;
      shooter.y = cy;
      shooter.shield = EnemyShip.SHIELD_MAX;
      victim.x = cx - 50;
      victim.y = cy;
      victim.shield = 1;
      gameObjs.player.x = cx;
      gameObjs.player.y = cy;
      return { count: getActiveEnemyCount(), playerShield: gameObjs.player.shield };
    });

    await page.evaluate(() => {
      gameObjs.enemies.filter((e) => e.active)[0].attack(gameObjs.player);
    });
    await waitForIdle(page);

    const after = await page.evaluate(() => {
      const cx = AREA_CENTER.X, cy = AREA_CENTER.Y;
      const at = (x, y) => gameObjs.enemies.find(
        (e) => e.active && Phaser.Math.Distance.Between(e.x, e.y, x, y) < 1);
      return {
        count: getActiveEnemyCount(),
        victimGone: !at(cx - 50, cy),
        playerShield: gameObjs.player.shield,
      };
    });
    const log = (await readLog(page, 8)).join('\n');
    expect(after.victimGone, '射線上の敵が落ちている').toBe(true);
    expect(after.playerShield, '自機には届いていない').toBe(before.playerShield);
    expect(log, '敵の同士討ちとして報告される').toContain('同士討ち');
    expect(after.count, '撃破された分は補充され、数は減らない').toBe(before.count);
  });

  test('敵が撤退したときは増援が出ない', async ({ page }) => {
    // 追い返すことが勝利条件であり、撃破との差がゲームの根幹。
    // 撃破の後処理を撤退にも通してしまう修正を弾く
    await openGame(page);
    await clearFieldFor(page, 3);

    const before = await page.evaluate(() => {
      const fleeing = gameObjs.enemies.find((e) => e.active);
      // 宇宙域の縁に置き、逃走に転じる残量にする
      fleeing.x = AREA_CENTER.X + AREA_R - 5;
      fleeing.y = AREA_CENTER.Y;
      fleeing.shield = EnemyShip.SHIELD_MAX * 0.05;
      return { count: getActiveEnemyCount() };
    });

    await runNpcTurn(page);

    const after = await page.evaluate(() => getActiveEnemyCount());
    const log = (await readLog(page, 8)).join('\n');
    expect(log, '撤退として報告される').toContain('離脱');
    expect(after, '撤退した分は補充されない').toBe(before.count - 1);
  });
});
