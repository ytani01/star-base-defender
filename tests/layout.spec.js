// @ts-check
const { test, expect } = require('@playwright/test');
const { openGame } = require('./helpers/game');

/**
 * 確認シナリオ「表示・操作環境」に対応するテスト。
 *
 * 宇宙域の見切れは、画面の縦横比によって出たり出なかったりする。
 * スマートフォンの横持ちだけを見ていると取りこぼすため、
 * 「画面の高さがステータス欄を除いた幅より大きい」比率を必ず含める。
 */

/** 確かめる画面サイズ。実機に多い比率と、不具合が出た比率を並べる */
const SIZES = [
  { w: 390, h: 844, label: 'スマートフォン縦' },
  { w: 414, h: 896, label: 'スマートフォン縦（大）' },
  { w: 360, h: 640, label: 'スマートフォン縦（小）' },
  { w: 320, h: 568, label: 'スマートフォン縦（最小）' },
  { w: 844, h: 390, label: 'スマートフォン横' },
  { w: 896, h: 414, label: 'スマートフォン横（大）' },
  { w: 640, h: 360, label: 'スマートフォン横（小）' },
  { w: 768, h: 1024, label: 'タブレット縦' },
  { w: 1024, h: 768, label: 'タブレット横' },
  { w: 1280, h: 900, label: 'PC' },
  { w: 1920, h: 1080, label: 'PC（広い）' },
  { w: 500, h: 390, label: 'ウィンドウを狭めた状態' },
];

/** ステータス欄をログで満たす。実際に遊んだあとの状態に近づける */
async function fillLog(page) {
  await page.evaluate(() => {
    for (let i = 0; i < LOG_MAX_LINES + 10; i++) {
      setMsg(SPEAKER.TACTICAL, `表示確認のためのログ ${i}`, MSG_COLOR.INFO);
    }
  });
}

/** 画面上の配置を測る */
async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const rect = (sel) => {
      const el = document.querySelector(sel);
      const b = el.getBoundingClientRect();
      return { left: b.left, top: b.top, right: b.right, bottom: b.bottom,
               width: b.width, height: b.height };
    };
    return {
      vw, vh,
      canvas: rect('#gameCanvas canvas'),
      panel: rect('#statusPanel'),
      isLandscape: vw >= vh,
      scrollWidth: document.documentElement.scrollWidth,
      tapTargets: ['zoomIn', 'zoomOut'].map((id) => {
        const b = document.getElementById(id).getBoundingClientRect();
        return { id, w: b.width, h: b.height };
      }),
    };
  });
}

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
    for (const size of SIZES.filter((s) => s.w >= s.h)) {
      await page.setViewportSize({ width: size.w, height: size.h });
      await openGame(page);
      await fillLog(page);

      const wrapped = await page.evaluate(() => {
        const panel = document.getElementById('statusPanel');
        const rows = [...panel.children].filter(
          (c) => c.id !== 'logStatus' && !c.classList.contains('status-header'));
        // 折り返しようのない幅を与えたときの高さを1行分の基準にする
        const keep = panel.style.width;
        panel.style.width = '900px';
        const oneLine = rows.map((c) => c.getBoundingClientRect().height);
        panel.style.width = keep;
        return rows
          .map((c, i) => [c.textContent.trim().replace(/\s+/g, ' '),
                          c.getBoundingClientRect().height > oneLine[i] + 2])
          .filter(([, isWrapped]) => isWrapped)
          .map(([text]) => text);
      });

      expect(wrapped, `${size.label}: 折り返した行がない`).toEqual([]);
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
