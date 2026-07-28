// @ts-check
const { test, expect } = require('@playwright/test');
const { openGame, fillLog, measureLayout: measure } = require('./helpers/game');
const { SIZES } = require('./helpers/viewports');

/**
 * 確認シナリオ「表示・操作環境」に対応するテスト。
 *
 * 宇宙域の見切れは、画面の縦横比によって出たり出なかったりする。
 * スマートフォンの横持ちだけを見ていると取りこぼすため、
 * 「画面の高さがステータス欄を除いた幅より大きい」比率を必ず含める。
 *
 * 画面サイズの一覧・ログの詰め方・計測は helpers 側に置いてある。
 * 同じものを layout-report.js（実測レポート）も使う。
 */

test.describe('表示・操作環境', () => {
  for (const size of SIZES) {
    test(`${size.label} (${size.w}x${size.h}) で宇宙域が見切れない`,
         async ({ page }) => {
      await page.setViewportSize({ width: size.w, height: size.h });
      await openGame(page);
      await fillLog(page);
      const m = await measure(page);

      // 画面の外へはみ出していないこと。1px の余裕は丸めのぶん
      expect(m.canvas.left, '左が切れていない').toBeGreaterThanOrEqual(-1);
      expect(m.canvas.top, '上が切れていない').toBeGreaterThanOrEqual(-1);
      expect(m.canvas.right, '右が切れていない').toBeLessThanOrEqual(m.vw + 1);
      expect(m.canvas.bottom, '下が切れていない').toBeLessThanOrEqual(m.vh + 1);
      expect(Math.abs(m.canvas.width - m.canvas.height), '正方形を保っている')
        .toBeLessThanOrEqual(1);
      expect(m.canvas.width, '宇宙域が潰れていない').toBeGreaterThan(100);
      expect(m.scrollWidth, '横スクロールが出ていない')
        .toBeLessThanOrEqual(m.vw + 1);
    });
  }

  test('見切れが出る比率を確かめる対象に含んでいる', async ({ page }) => {
    // ステータス欄の幅を測り、「画面の高さ > 残り幅」になるサイズが
    // 一覧に入っていることを確かめる。この比率が抜けると、
    // 横画面の見切れを取りこぼす。
    await page.setViewportSize({ width: 1024, height: 768 });
    await openGame(page);
    const panelWidth = await page.evaluate(
      () => document.getElementById('statusPanel').getBoundingClientRect().width);

    const risky = SIZES.filter((s) => s.w >= s.h && s.h > s.w - panelWidth);
    expect(risky.length, `高さが残り幅を超える横長比率が含まれている（幅 ${panelWidth}）`)
      .toBeGreaterThan(0);
  });

  test('縦画面でステータス欄が宇宙域を圧迫しない', async ({ page }) => {
    for (const size of SIZES.filter((s) => s.w < s.h)) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await openGame(page);
      await fillLog(page);
      const m = await measure(page);

      const ratio = m.panel.height / m.vh;
      expect(ratio, `${size.label}: 画面の 40% を超えない`)
        .toBeLessThanOrEqual(0.4 + 0.005);
    }
  });

  test('横画面でステータス欄が画面外へはみ出さない', async ({ page }) => {
    for (const size of SIZES.filter((s) => s.w >= s.h)) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await openGame(page);
      await fillLog(page);
      const m = await measure(page);

      expect(m.panel.bottom, `${size.label}: 下端が画面内に収まる`)
        .toBeLessThanOrEqual(m.vh + 1);
    }
  });

  test('横画面でステータス欄の幅が画面幅に追従する', async ({ page }) => {
    // 横画面のパネルは宇宙域の幅をそのまま削る。固定幅にすると
    // 狭い画面ほど宇宙域が痩せるため、画面に応じて詰まること自体を確かめる。
    const widthAt = async (w, h) => {
      await page.setViewportSize({ width: w, height: h });
      await openGame(page);
      await fillLog(page);
      return (await measure(page)).panel.width;
    };

    const narrow = await widthAt(640, 360);
    const wide = await widthAt(1920, 1080);

    expect(narrow, `狭い横画面(640x360)のほうがパネルが細い（広い方は ${wide}）`)
      .toBeLessThan(wide);
  });

  test('横画面でステータス欄の行が折り返さない', async ({ page }) => {
    // 幅を詰めた結果、ラベルと数値が泣き別れては読めない。
    // 「宇宙域を広げる」より「読めること」が優先だという線引きを固定する。
    // ヘッダはタイトルと著作権表示が折り返す設計（flex-wrap）なので除く。
    //
    // 起動直後の値（シールド 400 など）だけで測ると、桁が増えたときの
    // 崩れを見逃す。実際に遊べば必ず通る「削られた状態」で測る。
    for (const size of SIZES.filter((s) => s.w >= s.h)) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await openGame(page);
      await fillLog(page);
      await page.evaluate(() => {
        gameObjs.player.shield = PlayerShip.SHIELD_MAX * 0.28;
        gameObjs.player.energy = PlayerShip.ENERGY_MAX * 0.55;
        gameObjs.starBase.shield = StarBase.SHIELD_MAX * 0.42;
        updateStatus();
      });
      const m = await measure(page);

      expect(m.wrappedRows, `${size.label}: 折り返した行がない`).toEqual([]);
    }
  });

  test('ズームボタンが盤面の外に出るのは、宇宙域を狭めずに済むときだけ', async ({ page }) => {
    // 盤面に重ねれば宇宙域は狭まらないが一部が隠れる。外に出せば全部見える
    // かわりに、高さに余裕のない画面では宇宙域がそのまま縮む。
    // どちらを選ぶかは CSS のしきい値（max-aspect-ratio）が決めており、
    // そのしきい値が実際の寸法と合っているかをここで確かめる。
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await openGame(page);
      await fillLog(page);
      const m = await measure(page);

      if (m.zoomOverlapsCanvas) {
        continue; // 重ねている場合は宇宙域を狭めていないので問題ない
      }
      // 外に出しているなら、宇宙域は画面の幅いっぱいまで使えているはず。
      // 使えていないなら、隠さないために狭めたことになり割に合わない
      expect(m.canvas.width, `${size.label}: 盤面の外に出したのに宇宙域が狭い`)
        .toBeGreaterThanOrEqual(Math.min(size.w, size.h) - 1);
    }
  });

  test('ズームボタンがタップできる大きさを保っている', async ({ page }) => {
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await openGame(page);
      const m = await measure(page);

      for (const t of m.tapTargets) {
        expect(t.w, `${size.label}: ${t.id} の幅`).toBeGreaterThanOrEqual(48);
        expect(t.h, `${size.label}: ${t.id} の高さ`).toBeGreaterThanOrEqual(48);
      }
    }
  });

  test('【既知の未達】ハイスコアのボタンも 48px を満たす', async ({ page }) => {
    // Product Guidelines は「タップ対象は最低 48px 四方」と定めているが、
    // ハイスコアを開くボタンは現状それを満たしていない。既知の未達として
    // 記録しておく。満たすように直すと、このテストは「失敗するはずなのに
    // 成功した」と報告されるので、そのときにこの行を外すこと。
    test.fail();

    await page.setViewportSize({ width: 390, height: 844 });
    await openGame(page);
    const box = await page.evaluate(
      () => document.getElementById('viewScoresBtn').getBoundingClientRect().height);
    expect(box, 'viewScoresBtn の高さ').toBeGreaterThanOrEqual(48);
  });

  test('ログが蓄積され、さかのぼって読める', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openGame(page);
    await fillLog(page);

    const log = await page.evaluate(() => {
      const el = document.getElementById('logStatus');
      return {
        lines: el.children.length,
        max: LOG_MAX_LINES,
        scrollable: el.scrollHeight > el.clientHeight,
      };
    });
    expect(log.lines, '上限まで保持する').toBe(log.max);
    expect(log.scrollable, 'スクロールしてさかのぼれる').toBe(true);
  });
});

/**
 * 記録を仕込んでハイスコア画面を開く。
 * 5件は上限（HIGHSCORE.MAX_ENTRIES）いっぱいで、最も縦に長くなる状態。
 */
async function openHighScores(page) {
  await page.evaluate(() => {
    localStorage.setItem('starbaseDefenderScores', JSON.stringify([
      { score: 1250, turn: 32, mission: 5, date: '2026-07-29' },
      { score: 980, turn: 28, mission: 4, date: '2026-07-29' },
      { score: 760, turn: 21, mission: 3, date: '2026-07-28' },
      { score: 540, turn: 18, mission: 2, date: '2026-07-28' },
      { score: 320, turn: 12, mission: 1, date: '2026-07-27' },
    ]));
    gameState.score = 1250;
    gameState.turn = 32;
    gameState.curMission = 5;
    showHighScoreOverlay('gameover', { msgstr: '✗ BASE DESTROYED' });
  });
}

test.describe('ハイスコア画面', () => {
  test('どの画面でも左右が切れない', async ({ page }) => {
    // 幅の指定に画面幅より大きい下限を置くと、狭い端末で両端が切れて
    // 順位も日付も読めなくなる。表そのものは横スクロールできるが、
    // パネルの外枠がはみ出してしまうと、そこへ手が届かない
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await openGame(page);
      await openHighScores(page);

      const m = await page.evaluate(() => {
        const b = document.getElementById('hsPanel').getBoundingClientRect();
        return { left: b.left, right: b.right, vw: window.innerWidth,
                 scrollWidth: document.documentElement.scrollWidth };
      });
      expect(m.left, `${size.label}: 左が切れていない`).toBeGreaterThanOrEqual(-1);
      expect(m.right, `${size.label}: 右が切れていない`).toBeLessThanOrEqual(m.vw + 1);
      expect(m.scrollWidth, `${size.label}: 横スクロールが出ていない`)
        .toBeLessThanOrEqual(m.vw + 1);
    }
  });

  test('画面に収まらないときは縦にスクロールして最後まで読める', async ({ page }) => {
    // 収まらないこと自体は許すが、はみ出した先にある RESTART ボタンへ
    // 到達できないと、そこで詰んでしまう
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await openGame(page);
      await openHighScores(page);

      const m = await page.evaluate(() => {
        const ov = document.getElementById('highScoreOverlay');
        const panel = document.getElementById('hsPanel').getBoundingClientRect();
        return {
          overflows: ov.scrollHeight > ov.clientHeight + 1,
          overflowY: getComputedStyle(ov).overflowY,
          // 上端が画面の外へ出ていると、スクロールしても戻れない
          panelTop: panel.top,
          scrollTop: ov.scrollTop,
        };
      });
      if (m.overflows) {
        expect(['auto', 'scroll'], `${size.label}: 縦にスクロールできる`)
          .toContain(m.overflowY);
      }
      expect(m.panelTop - m.scrollTop, `${size.label}: 上端が画面の外へ出ていない`)
        .toBeGreaterThanOrEqual(-1);
    }
  });

  test('ボタンがタップできる大きさを保っている', async ({ page }) => {
    for (const size of SIZES) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await openGame(page);
      await openHighScores(page);

      const h = await page.evaluate(
        () => document.getElementById('hsRestartBtn').getBoundingClientRect().height);
      expect(h, `${size.label}: RESTART ボタンの高さ`).toBeGreaterThanOrEqual(48);
    }
  });
});
