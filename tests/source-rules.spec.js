// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');

/**
 * CLAUDE.md の「最重要ルール」のうち、機械的に判定できるものを検査する。
 *
 * これらはレビューで見落とされやすく、見落とすと後から高くつく
 * （setTimeout はシーン再起動で止まらず前ミッションの処理が残る、
 * トップレベルの let は状態の置き場所を壊す、など）。
 * ブラウザを使わない、index.html を読むだけの検査。
 *
 * ここに入れているのは「今ゼロ件で、かつ判定に迷いのないもの」だけ。
 * 「色は :root のカスタムプロパティ経由で参照する」のように、現状すでに
 * 例外が積み上がっているものは入れていない。初日から誤報を出す検査は、
 * すぐに無視されるようになって意味を失う。判断が要るルールの確認は
 * .claude/skills/rule-check/ が担う。
 */

const INDEX = path.join(__dirname, '..', 'index.html');

/** `<script>` の中身を、行番号つきで返す */
function scriptLines() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const lines = html.split('\n');
  const start = lines.findIndex((l) => l.includes('<script>'));
  const end = lines.findIndex((l, i) => i > start && l.includes('</script>'));
  return lines.slice(start + 1, end)
    .map((text, i) => ({ no: start + 2 + i, text }));
}

/** `<style>` の中身を、行番号つきで返す */
function styleLines() {
  const html = fs.readFileSync(INDEX, 'utf8');
  const lines = html.split('\n');
  const start = lines.findIndex((l) => l.includes('<style>'));
  const end = lines.findIndex((l, i) => i > start && l.includes('</style>'));
  return lines.slice(start + 1, end)
    .map((text, i) => ({ no: start + 2 + i, text }));
}

/**
 * コメント行を除く。
 * 行頭が `*` `//` `/*` のものを落とすだけで足りる（このファイルの書き方に合わせる）。
 * 行末コメントは、規約の対象が「コードとして書かれているか」なので取り除く。
 */
function codeOnly(lines) {
  return lines
    .filter(({ text }) => !/^\s*(\*|\/\/|\/\*)/.test(text))
    .map(({ no, text }) => ({ no, text: text.replace(/\/\/.*$/, '') }));
}

/** 見つかった箇所を「123: 中身」の形にして、失敗時に場所が分かるようにする */
function at(hits) {
  return hits.map(({ no, text }) => `${no}: ${text.trim()}`);
}

/**
 * 関数の範囲を行番号で返す。
 *
 * 範囲はコメントを消す前の行で決める。このファイルは関数の終わりを
 * `} // 関数名()` で示しており、行末コメントを落としてしまうと見失うため。
 *
 * @return {{first: number, last: number}}
 */
function functionRange(lines, startPattern, endMarker) {
  const from = lines.findIndex(({ text }) => startPattern.test(text));
  if (from < 0) return { first: -1, last: -1 };
  const to = lines.findIndex((l, i) => i > from && l.text.includes(endMarker));
  return { first: lines[from].no, last: to < 0 ? -1 : lines[to].no };
}

/** 指定の行番号の範囲を除く */
function outsideOf(lines, range) {
  return lines.filter(({ no }) => no < range.first || no > range.last);
}

test.describe('CLAUDE.md の最重要ルール（機械的に判定できるもの）', () => {
  test('console.log() を直接書かず、debugLog() を使っている', () => {
    const raw = scriptLines();
    // debugLog() の本体だけは console.log を持ってよい。その範囲を外す
    const range = functionRange(raw, /function debugLog\s*\(/, '} // debugLog()');
    expect(range.first, 'debugLog() が見つかる').toBeGreaterThan(0);
    expect(range.last, 'debugLog() の終わりが見つかる').toBeGreaterThan(range.first);

    const hits = outsideOf(codeOnly(raw), range)
      .filter(({ text }) => /\bconsole\s*\./.test(text));
    expect(at(hits), 'debugLog() の外で console を使っている').toEqual([]);
  });

  test('setTimeout / setInterval を使っていない', () => {
    // シーン再起動で止められず、前ミッションの処理が残るため。
    // 遅延は scene.time.delayedCall()、アニメーションは scene.tweens を使う
    const hits = codeOnly(scriptLines())
      .filter(({ text }) => /\b(setTimeout|setInterval)\s*\(/.test(text));
    expect(at(hits), 'delayedCall / tweens に置き換えること').toEqual([]);
  });

  test('トップレベルの let を新設していない', () => {
    // 状態は gameState（進行状態）か gameObjs（オブジェクト管理）に属させる。
    // このファイルではトップレベルの宣言が5スペース字下げで並ぶ
    const hits = scriptLines().filter(({ text }) => /^ {5}let\s/.test(text));
    expect(at(hits), 'gameState か gameObjs に持たせること').toEqual([]);
  });

  test('中身のない JSDoc が残っていない', () => {
    const html = fs.readFileSync(INDEX, 'utf8');
    const empty = [...html.matchAll(/\/\*\*[\s*]*\*\//g)]
      .map((m) => `${html.slice(0, m.index).split('\n').length}: ${m[0].replace(/\s+/g, ' ')}`);
    expect(empty, '「なぜそうするのか」を書くか、消すこと').toEqual([]);
  });

  test('vh の高さ指定には dvh が併記されている', () => {
    // vh はツールバーの表示/非表示に追従しない。dvh を後に置いて上書きし、
    // dvh 未対応のブラウザだけが vh に落ちるようにする
    const lines = codeOnly(styleLines());
    const missing = [];
    lines.forEach(({ no, text }, i) => {
      const m = text.match(/(max-height|height)\s*:\s*[\d.]+vh\s*;/);
      if (!m) return;
      const next = lines[i + 1];
      if (!next || !new RegExp(`${m[1]}\\s*:\\s*[\\d.]+dvh`).test(next.text)) {
        missing.push({ no, text });
      }
    });
    expect(at(missing), '直後に同じプロパティの dvh を併記すること').toEqual([]);
  });

  test('プレイヤーの移動が getAvoidanceVector() を使っていない', () => {
    // 星を避ける動きは NPC のもの。プレイヤーは指した場所へまっすぐ向かう。
    // 呼び出しが calculateDestination() の中だけに収まっていることを見張る。
    // ここから漏れたら、プレイヤーの経路に入り込んでいないか確かめること
    const raw = scriptLines();
    const range = functionRange(
      raw, /^ {7}calculateDestination\s*\(/, '} // calculateDestination()');
    expect(range.first, 'calculateDestination() が見つかる').toBeGreaterThan(0);
    expect(range.last, 'calculateDestination() の終わりが見つかる')
      .toBeGreaterThan(range.first);

    // 定義そのもの（メソッド宣言）は呼び出しではないので除く
    const hits = outsideOf(codeOnly(raw), range)
      .filter(({ text }) => /\.getAvoidanceVector\s*\(/.test(text));
    expect(at(hits), 'calculateDestination() の外から呼んでいる').toEqual([]);
  });
});
