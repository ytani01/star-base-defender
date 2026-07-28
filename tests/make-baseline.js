#!/usr/bin/env node
// @ts-check
/**
 * 比較のもとになる index.html（ベースライン）を取り出す。
 *
 *   node make-baseline.js <git のリビジョン>
 *
 * 例:
 *   node make-baseline.js HEAD~5      5コミット前と比べる
 *   node make-baseline.js master      公開中のものと比べる
 *   node make-baseline.js v0.3.17     タグと比べる
 *
 * 取り出した内容は リポジトリ直下の _baseline.html に書き出す。
 * そのあと `npx playwright test regression` を実行すると、いまの
 * index.html と突き合わせる。
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ref = process.argv[2];
if (!ref) {
  console.error('リビジョンを指定してください。例: node make-baseline.js HEAD~5');
  process.exit(1);
}

const repoRoot = path.join(__dirname, '..');
const outPath = path.join(repoRoot, '_baseline.html');

try {
  const content = execFileSync('git', ['show', `${ref}:index.html`], {
    cwd: repoRoot,
    maxBuffer: 32 * 1024 * 1024,
  });
  fs.writeFileSync(outPath, content);
} catch (e) {
  console.error(`${ref} から index.html を取り出せませんでした。`);
  console.error(e.message);
  process.exit(1);
}

console.log(`${ref} の index.html を _baseline.html に書き出しました。`);
console.log('突き合わせる: npx playwright test regression');
