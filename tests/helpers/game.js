// @ts-check
/**
 * シナリオテストの土台。
 *
 * ここが担うのは次の3つ。
 *  1. 盤面を再現できる形でゲームを開く（乱数の固定・キャッシュの回避）
 *  2. ターンの進行を、実時間の待ちではなく状態で待つ
 *  3. 盤面の全状態を取り出す
 *
 * ゲーム本体は単一ファイルのままで export を持たない。トップレベルの
 * const やクラスは window のプロパティにならないが、page.evaluate() は
 * ページと同じ realm で動くため、そのまま名前で参照できる。
 */

/** 既定の乱数の種。テストごとに変えたい場合は openGame の引数で渡す */
const DEFAULT_SEED = 20260728;

/**
 * ゲームを開く。
 *
 * 乱数はページのスクリプトより先に差し替える。起動後に差し替えて
 * scene.restart() する方法では、前の世界のオブジェクトが残っていて
 * 出現位置の抽選結果が変わり、盤面を再現できない。
 *
 * @param {import('@playwright/test').Page} page
 * @param {{seed?: number, file?: string}} [options]
 */
async function openGame(page, options = {}) {
  const seed = options.seed === undefined ? DEFAULT_SEED : options.seed;
  const file = options.file || 'index.html';

  await page.addInitScript((s) => {
    let seedValue = s;
    // 線形合同法。実装が短く、環境によらず同じ列が出ればよい
    Math.random = () => {
      seedValue = (seedValue * 1103515245 + 12345) % 2147483648;
      return seedValue / 2147483648;
    };
  }, seed);

  // ブラウザが勝手に要求する favicon を黙らせる。ゲームは画像を持たない
  // ため必ず 404 になり、画面つきで実行したときだけコンソールにエラーが
  // 出て結果が変わってしまう（ヘッドレスでは要求されない）。
  await page.route('**/favicon.ico', (route) =>
    route.fulfill({ status: 200, contentType: 'image/x-icon', body: '' }));

  // 描画が間引かれるとゲームの時計が進まなくなるため、前面に出しておく
  await page.bringToFront();
  // クエリを付けてキャッシュを避ける
  await page.goto(`/${file}?t=${Date.now()}`);
  await waitForBoot(page);
}

/**
 * ゲームの起動を待つ。シーンが作られ、自機と基地が並んだ時点で完了。
 * @param {import('@playwright/test').Page} page
 */
async function waitForBoot(page) {
  await page.waitForFunction(() => {
    return typeof gameState !== 'undefined'
      && gameState.curScene
      && gameObjs.player
      && gameObjs.starBase
      && gameObjs.stars.length > 0;
  }, null, { timeout: 15000, polling: 50 });
  await waitForIdle(page);
}

/**
 * 進行中の演出と予約された処理が片付くまで待つ。
 *
 * 「何ミリ秒待つ」ではなく「動いているものが無くなるまで待つ」形にして
 * ある。ヘッドレスでは描画が間引かれて実時間とゲーム内時間がずれるため、
 * 固定の待ち時間では早すぎたり遅すぎたりする。
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout] ミリ秒
 */
async function waitForIdle(page, timeout = 20000) {
  await page.waitForFunction(() => {
    const scene = gameState.curScene;
    if (!scene) {
      return false;
    }
    const movingCount = scene.tweens.getTweens().length;
    // 予約された直後の処理は _pendingInsertion に入り、次の更新まで
    // _active へ移らない。ここを見落とすと「まだ何も始まっていない」
    // 状態を「片付いた」と誤って判断してしまう。
    const clock = scene.time;
    const pendingCount = (clock._active || []).length
      + (clock._pendingInsertion || []).length;
    return movingCount === 0 && pendingCount === 0;
  }, null, { timeout, polling: 50 });
}

/**
 * プレイヤーのターンが戻ってくるまで待つ。
 * @param {import('@playwright/test').Page} page
 * @param {number} [timeout] ミリ秒
 */
async function waitForPlayerTurn(page, timeout = 20000) {
  await page.waitForFunction(
    () => gameState.isPlayerTurn === true || gameState.isGameOver === true,
    null, { timeout, polling: 50 });
  await waitForIdle(page, timeout);
}

/**
 * ゲーム内の座標を、画面上の座標へ変換する。
 * クリック操作を実際のマウス入力で行うために使う。
 * @param {import('@playwright/test').Page} page
 * @param {{x: number, y: number}} worldPos
 * @return {Promise<{x: number, y: number}>}
 */
async function toScreen(page, worldPos) {
  return page.evaluate((p) => {
    const rect = document.querySelector('#gameCanvas canvas').getBoundingClientRect();
    const cam = gameState.curScene.cameras.main;
    return {
      x: rect.left + (p.x - cam.worldView.x) * cam.zoom * (rect.width / cam.width),
      y: rect.top + (p.y - cam.worldView.y) * cam.zoom * (rect.height / cam.height),
    };
  }, worldPos);
}

/**
 * ゲーム内の座標をクリックする。実際のマウス入力を送る。
 * @param {import('@playwright/test').Page} page
 * @param {{x: number, y: number}} worldPos
 */
async function clickWorld(page, worldPos) {
  const pos = await toScreen(page, worldPos);
  await page.mouse.click(pos.x, pos.y);
  await waitForPlayerTurn(page);
}

/**
 * 盤面の全状態を取り出す。変更前後の突き合わせにも使うため、
 * 見た目に出るものは一通り含める。
 * @param {import('@playwright/test').Page} page
 */
async function snapshot(page) {
  return page.evaluate(() => {
    const round = (v) => Math.round(v * 100) / 100;
    // ドッキング状態のフィールドは is_docked から isDocked へ改名された。
    // 改名前の版とも突き合わせられるよう、古い名前も見る。改名前と
    // 比べる必要がなくなったら、この場合分けは消してよい。
    const dockedOf = (o) => {
      const v = o.isDocked === undefined ? o['is_docked'] : o.isDocked;
      return v === undefined ? null : v;
    };
    const ship = (o) => o && {
      cls: o.constructor.name,
      active: o.active,
      x: round(o.x),
      y: round(o.y),
      shield: round(o.shield),
      spirit: o.spirit === undefined ? null : round(o.spirit),
      docked: dockedOf(o),
    };
    return {
      turn: gameState.turn,
      mission: gameState.curMission,
      score: gameState.score,
      isPlayerTurn: gameState.isPlayerTurn,
      isGameOver: gameState.isGameOver,
      enemyQty: gameState.enemyQty,
      player: ship(gameObjs.player),
      base: ship(gameObjs.starBase),
      federation: gameObjs.federationShips.map(ship),
      enemies: gameObjs.enemies.map(ship),
      stars: gameObjs.stars.map((s) => [round(s.x), round(s.y), s.active]),
      log: [...document.getElementById('logStatus').children]
        .map((c) => c.textContent + '|' + c.style.color),
    };
  });
}

/**
 * 決まった手順でターンを進め、毎ターンの状態を並べて返す。
 *
 * 接近 → 攻撃 → シールド回復 → 基地へ移動 を繰り返す。どれも実際の
 * クリック操作として送るため、入力から決着までの一通りの経路を通る。
 * 同じ種・同じ手順なら結果は完全に一致するはずで、一致しなければ
 * 挙動が変わったということになる。
 *
 * 「接近」を挟むのは、いきなり敵を撃っても射程外で当たらず、
 * ダメージの計算をまったく通らないため。当たる状況を作らないと、
 * 威力や減衰の変化を取りこぼす。
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} turns 進めるターン数
 * @return {Promise<Array<Object>>} 開始時を含む各ターンの状態
 */
async function playScriptedTurns(page, turns) {
  const steps = [await snapshot(page)];
  for (let i = 0; i < turns; i++) {
    const targets = await page.evaluate(() => {
      const enemy = gameObjs.enemies.find((e) => e.active);
      const player = gameObjs.player;
      let approach = null;
      if (enemy) {
        // 敵と自機を結ぶ線上の、敵の手前あたりを目指す
        const dx = enemy.x - player.x;
        const dy = enemy.y - player.y;
        const dist = Math.hypot(dx, dy) || 1;
        const stopAt = Math.max(0, dist - 40);
        approach = {
          x: player.x + (dx / dist) * stopAt,
          y: player.y + (dy / dist) * stopAt,
        };
      }
      return {
        enemy: enemy ? { x: enemy.x, y: enemy.y } : null,
        approach,
        base: { x: gameObjs.starBase.x, y: gameObjs.starBase.y },
        player: { x: player.x, y: player.y },
      };
    });

    const step = i % 4;
    if (step === 0 && targets.approach) {
      await clickWorld(page, targets.approach);
    } else if (step === 1 && targets.enemy) {
      await clickWorld(page, targets.enemy);
    } else if (step === 2) {
      await clickWorld(page, targets.player);
    } else {
      await clickWorld(page, targets.base);
    }
    steps.push(await snapshot(page));
  }
  return steps;
}

/**
 * ステータス欄の表示内容。画面に出ている文字をそのまま読む。
 * @param {import('@playwright/test').Page} page
 */
async function readStatusPanel(page) {
  return page.evaluate(() => {
    const text = (id) => document.getElementById(id).textContent.trim();
    return {
      turn: text('statusTurn'),
      mission: text('statusMission'),
      score: text('statusScore'),
      shipShield: text('statusShipShield'),
      shipEnergy: text('statusShipEnergy'),
      baseShield: text('statusBaseShield'),
      federation: text('statusFederationShipCount'),
      docked: text('statusFederationShipDocked'),
      enemy: text('statusEnemyShipCount'),
    };
  });
}

/**
 * ステータス欄をログで満たす。実際に遊んだあとの状態に近づける。
 *
 * 起動直後のログが空の状態では、ステータス欄が本来より小さく出る。
 * 表示を測るときは必ずこれを通してから測る。
 *
 * @param {import('@playwright/test').Page} page
 */
async function fillLog(page) {
  await page.evaluate(() => {
    for (let i = 0; i < LOG_MAX_LINES + 10; i++) {
      setMsg(SPEAKER.TACTICAL, `表示確認のためのログ ${i}`, MSG_COLOR.INFO);
    }
  });
}

/**
 * 画面上の配置を測る。
 *
 * 折り返しの判定は、行の高さを「折り返しようのない幅を与えたときの高さ」と
 * 比べて行う。行の高さにはゲージ（1em の inline-block）が効くため、
 * 文字サイズから計算した見込みの行高と比べると誤判定する。
 *
 * @param {import('@playwright/test').Page} page
 */
async function measureLayout(page) {
  return page.evaluate(() => {
    const rect = (sel) => {
      const b = document.querySelector(sel).getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom,
               width: b.width, height: b.height };
    };
    const panel = document.getElementById('statusPanel');
    const rows = [...panel.children].filter(
      (c) => c.id !== 'logStatus' && !c.classList.contains('status-header'));
    const keep = panel.style.width;
    panel.style.width = '900px';
    const oneLine = rows.map((c) => c.getBoundingClientRect().height);
    panel.style.width = keep;

    return {
      vw: window.innerWidth,
      vh: window.innerHeight,
      canvas: rect('#gameCanvas canvas'),
      panel: rect('#statusPanel'),
      zoomUI: rect('#zoomUI'),
      // ズームUIが盤面に重なっているか。重ねれば宇宙域を狭めずに済むが、
      // 盤面の一部が隠れる。どちらを選んでいるかは画面の形で変わる
      zoomOverlapsCanvas: (() => {
        const z = document.getElementById('zoomUI').getBoundingClientRect();
        const c = document.querySelector('#gameCanvas canvas').getBoundingClientRect();
        return z.left < c.right && z.right > c.left
               && z.top < c.bottom && z.bottom > c.top;
      })(),
      isLandscape: window.innerWidth >= window.innerHeight,
      scrollWidth: document.documentElement.scrollWidth,
      // ヘッダはタイトルと著作権表示が折り返す設計（flex-wrap）なので除く
      wrappedRows: rows
        .map((c, i) => [c.textContent.trim().replace(/\s+/g, ' '),
                        c.getBoundingClientRect().height > oneLine[i] + 2])
        .filter(([, isWrapped]) => isWrapped)
        .map(([text]) => text),
      tapTargets: ['zoomIn', 'zoomOut'].map((id) => {
        const b = document.getElementById(id).getBoundingClientRect();
        return { id, w: b.width, h: b.height };
      }),
    };
  });
}

/**
 * ログの最新行から順に取り出す。発信者と本文だけを見たい場合に使う。
 * @param {import('@playwright/test').Page} page
 * @param {number} [count]
 */
async function readLog(page, count = 5) {
  return page.evaluate((n) => {
    return [...document.getElementById('logStatus').children]
      .slice(-n)
      .map((c) => c.textContent.replace(/^\d+\.\d+\s/, ''));
  }, count);
}

/**
 * コンソールのエラーと警告を集める。テストの冒頭で仕掛けておき、
 * 最後に中身が空であることを確かめる使い方をする。
 *
 * ゲームに由来しないものは除外する。残しておくと、実行した環境の
 * 違いでテストの結果が変わってしまう。
 *
 * @param {import('@playwright/test').Page} page
 * @return {{errors: string[], warnings: string[]}}
 */
function collectConsoleIssues(page) {
  /** ゲームの問題ではない、環境由来のメッセージ */
  const isEnvironmental = (text) =>
    // ユーザー操作なしでページを開くと Phaser が必ず出す
    text.includes('AudioContext was not allowed to start')
    // GPU ドライバが出す性能に関する通知。搭載 GPU によって出たり出なかったりする
    || text.includes('GL Driver Message')
    || text.includes('GPU stall');

  const issues = { errors: [], warnings: [] };
  page.on('console', (msg) => {
    const text = msg.text();
    if (isEnvironmental(text)) {
      return;
    }
    if (msg.type() === 'error') {
      issues.errors.push(text);
    } else if (msg.type() === 'warning') {
      issues.warnings.push(text);
    }
  });
  page.on('pageerror', (err) => {
    issues.errors.push(String(err));
  });
  return issues;
}

module.exports = {
  DEFAULT_SEED,
  openGame,
  waitForBoot,
  waitForIdle,
  waitForPlayerTurn,
  toScreen,
  clickWorld,
  snapshot,
  playScriptedTurns,
  readStatusPanel,
  fillLog,
  measureLayout,
  readLog,
  collectConsoleIssues,
};
