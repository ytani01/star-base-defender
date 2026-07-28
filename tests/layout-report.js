#!/usr/bin/env node
// @ts-check
/**
 * 表示レイアウトの実測レポート。
 *
 *   node layout-report.js [オプション]
 *
 * 主要な画面サイズでゲームを開き、ステータス欄と宇宙域の大きさを測って
 * 表にする。スクリーンショットも撮る。
 *
 * layout.spec.js のテストが「壊れていないか」を判定するのに対し、
 * こちらは「どう変わったか」を数字で見るためのもの。CSS をいじるたびに
 * 使い捨ての計測スクリプトを書き直さずに済ませる。
 *
 * オプション:
 *   --out <dir>       出力先（既定 layout-report/）
 *   --compare <json>  以前の report.json と比べて増減を出す
 *   --only <文字列>   ラベルまたはサイズで絞り込む（例: --only 横）
 *   --no-shots        スクリーンショットを撮らない（速い）
 *
 * 使い方の例:
 *   node layout-report.js --out before          変更前を控える
 *   （index.html を編集する）
 *   node layout-report.js --compare before/report.json
 */

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { spawn } = require('node:child_process');
const { chromium } = require('@playwright/test');
const { openGame, fillLog, measureLayout } = require('./helpers/game');
const { SIZES } = require('./helpers/viewports');

const PORT = 8765;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const REPO_ROOT = path.join(__dirname, '..');

/** 引数を読む。値を取るものだけ明示し、残りはフラグとして扱う */
function parseArgs(argv) {
  const opts = { out: 'layout-report', compare: null, only: null, shots: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') opts.out = argv[++i];
    else if (a === '--compare') opts.compare = argv[++i];
    else if (a === '--only') opts.only = argv[++i];
    else if (a === '--no-shots') opts.shots = false;
    else {
      console.error(`不明なオプション: ${a}`);
      process.exit(1);
    }
  }
  return opts;
}

/** 配信サーバが既に動いているか確かめる */
function isServerUp() {
  return new Promise((resolve) => {
    const req = http.get(`${BASE_URL}/index.html`, (res) => {
      res.resume();
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.setTimeout(1000, () => { req.destroy(); resolve(false); });
  });
}

/**
 * 配信サーバを用意する。既に動いていればそれを使う
 * （playwright.config.js の reuseExistingServer と同じ考え方）。
 * @return {Promise<() => void>} 後片付けの関数
 */
async function ensureServer() {
  if (await isServerUp()) {
    return () => {};
  }
  const proc = spawn('python3',
    ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1', '--directory', REPO_ROOT],
    { stdio: 'ignore' });

  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 250));
    if (await isServerUp()) return () => proc.kill();
  }
  proc.kill();
  throw new Error(`${BASE_URL} を用意できませんでした`);
}

/**
 * 宇宙域の大きさを決めているのがどちらかを判定する。
 *
 * キャンバスは正方形で min(残り幅, 画面高) に収まる。パネルを細くして
 * 効くのは前者のときだけなので、CSS をいじる前にここを見る。
 */
function limitedBy(m) {
  if (!m.isLandscape) return '—';
  const remaining = m.vw - m.panel.width;
  return Math.abs(m.canvas.width - remaining) < 2 ? 'パネル幅' : '画面高';
}

/** 数値の増減を「180 → 232 (+52)」の形にする。比較対象がなければ現在値だけ */
function delta(before, after) {
  if (typeof before !== 'number') return `${after}`;
  const d = Math.round(after - before);
  if (d === 0) return `${after}`;
  return `${Math.round(before)} → ${Math.round(after)} (${d > 0 ? '+' : ''}${d})`;
}

/** 幅をそろえて表を出す。全角を2桁として数える */
function printTable(rows) {
  const width = (s) => [...s].reduce(
    (n, ch) => n + (/[　-鿿！-｠—]/.test(ch) ? 2 : 1), 0);
  const cols = Object.keys(rows[0]);
  const w = cols.map((c) => Math.max(width(c), ...rows.map((r) => width(String(r[c])))));
  const line = (cells) => cells
    .map((c, i) => String(c) + ' '.repeat(w[i] - width(String(c)))).join('  ');
  console.log(line(cols));
  console.log(cols.map((_, i) => '─'.repeat(w[i])).join('  '));
  for (const r of rows) console.log(line(cols.map((c) => r[c])));
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(opts.out);
  const targets = opts.only
    ? SIZES.filter((s) => s.label.includes(opts.only) || `${s.w}x${s.h}`.includes(opts.only))
    : SIZES;

  if (targets.length === 0) {
    console.error(`--only ${opts.only} に当てはまる画面がありません`);
    process.exit(1);
  }

  let before = null;
  if (opts.compare) {
    try {
      before = JSON.parse(fs.readFileSync(opts.compare, 'utf8'));
    } catch (e) {
      console.error(`${opts.compare} を読めませんでした: ${e.message}`);
      process.exit(1);
    }
  }

  const stopServer = await ensureServer();
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const results = {};
  const rows = [];

  try {
    for (const size of targets) {
      const key = `${size.w}x${size.h}`;
      const context = await browser.newContext({
        viewport: { width: size.w, height: size.h },
        baseURL: BASE_URL,
      });
      const page = await context.newPage();
      // シナリオテストと同じ手順で開く。乱数を固定しないと盤面が変わり、
      // スクリーンショットを並べても比べられない
      await openGame(page);
      await fillLog(page);
      const m = await measureLayout(page);

      if (opts.shots) {
        await page.screenshot({ path: path.join(outDir, `${key}.png`) });
      }
      await context.close();

      const rec = {
        label: size.label,
        panelWidth: Math.round(m.panel.width),
        panelHeight: Math.round(m.panel.height),
        canvasWidth: Math.round(m.canvas.width),
        panelRatio: m.isLandscape
          ? m.panel.width / m.vw : m.panel.height / m.vh,
        limitedBy: limitedBy(m),
        wrappedRows: m.wrappedRows,
        hasHScroll: m.scrollWidth > m.vw + 1,
      };
      results[key] = rec;

      const prev = before && before.sizes && before.sizes[key];
      rows.push({
        '画面': `${size.label} (${key})`,
        'パネル': delta(prev && prev.panelWidth, rec.panelWidth),
        '占有': `${(rec.panelRatio * 100).toFixed(0)}%`,
        '宇宙域': delta(prev && prev.canvasWidth, rec.canvasWidth),
        '制約': rec.limitedBy,
        '折返し': rec.wrappedRows.length === 0 ? '—' : `${rec.wrappedRows.length}行`,
        '横スクロール': rec.hasHScroll ? 'あり' : '—',
      });
    }
  } finally {
    await browser.close();
    stopServer();
  }

  printTable(rows);

  const problems = Object.entries(results).filter(
    ([, r]) => r.wrappedRows.length > 0 || r.hasHScroll);
  if (problems.length > 0) {
    console.log('\n要確認:');
    for (const [key, r] of problems) {
      if (r.hasHScroll) console.log(`  ${key} 横スクロールが出ている`);
      for (const text of r.wrappedRows) console.log(`  ${key} 折り返し: ${text}`);
    }
  }

  const jsonPath = path.join(outDir, 'report.json');
  fs.writeFileSync(jsonPath,
    JSON.stringify({ measuredAt: new Date().toISOString(), sizes: results }, null, 2));
  console.log(`\n${jsonPath} に書き出しました。`);
  if (opts.shots) {
    console.log(`スクリーンショット: ${outDir}/<幅>x<高>.png`);
  }
  if (!opts.compare) {
    const rel = path.relative(process.cwd(), jsonPath);
    console.log('変更後と比べる: node layout-report.js --compare '
                + (rel.startsWith('..') ? jsonPath : rel));
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
