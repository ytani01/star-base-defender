// @ts-check
const fs = require('node:fs');
const path = require('node:path');
const { test, expect } = require('@playwright/test');
const { openGame, playScriptedTurns } = require('./helpers/game');

/**
 * 変更前後の突き合わせ。
 *
 * リファクタリングのように「挙動を変えないはずの変更」をしたときに、
 * 本当に変わっていないかを確かめるためのもの。同じ盤面・同じ操作列で
 * 両方を走らせ、毎ターンの全状態を並べて比べる。
 *
 * 使い方:
 *   1. 比較のもとを取り出す
 *        node make-baseline.js HEAD~5
 *   2. 突き合わせる
 *        npx playwright test regression
 *
 * _baseline.html が無いときは、突き合わせのテストは飛ばされる。
 * 自己テスト（同じファイル同士の比較）は常に走り、この比較そのものが
 * 信用できるかを確かめる。
 *
 * この比較の限界:
 * 決まった1本の操作列を辿るだけなので、そこで通らない経路の変化は
 * 見つけられない。また、観測できる値が変わらない差（たとえばダメージが
 * 切り捨てで同じ整数に落ち着く程度の威力の違い）も検出できない。
 * 実測では、自機の攻撃力を 10% 変えると検出できたが、1 だけ変えた
 * ときは検出できなかった。「一致した＝完全に同じ」ではなく
 * 「この操作列の範囲では違いが出なかった」と読むこと。
 */

/**
 * 比べるターン数。長いほど厳しいが、その分時間がかかる。
 * 1テストで2回分の操作列を走らせるので、制限時間もこれに合わせる。
 */
const TURNS = 8;

/** ターン数に見合った制限時間。既定の30秒では足りなくなる */
const TIMEOUT_MS = 20000 + TURNS * 6000;

/** 盤面の種。変えると別の状況で比べられる */
const SEED = 20260728;

const BASELINE_FILE = process.env.BASELINE || '_baseline.html';
const baselinePath = path.join(__dirname, '..', BASELINE_FILE);

/** 2つの状態の列を、ずれた場所が分かる形で比べる */
function expectSameTrace(actual, expected, label) {
  expect(actual.length, `${label}: ステップ数`).toBe(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i], `${label}: ステップ ${i} で状態がずれた`).toEqual(expected[i]);
  }
}

test.describe('変更前後の突き合わせ', () => {
  test('同じファイル同士なら必ず一致する（比較が信用できることの確認）',
       async ({ page }) => {
    test.setTimeout(TIMEOUT_MS);
    await openGame(page, { seed: SEED });
    const first = await playScriptedTurns(page, TURNS);

    await openGame(page, { seed: SEED });
    const second = await playScriptedTurns(page, TURNS);

    expectSameTrace(second, first, '同一ファイル');
  });

  test('変更前と挙動が変わっていない', async ({ page }) => {
    test.setTimeout(TIMEOUT_MS);
    test.skip(!fs.existsSync(baselinePath),
              `${BASELINE_FILE} が無いため飛ばした。`
              + '比べるには node make-baseline.js <リビジョン> を先に実行する');

    await openGame(page, { seed: SEED, file: BASELINE_FILE });
    const before = await playScriptedTurns(page, TURNS);

    await openGame(page, { seed: SEED });
    const after = await playScriptedTurns(page, TURNS);

    expectSameTrace(after, before, '変更前後');
  });
});
