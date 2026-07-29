# Implementation Plan: シナリオテストの実行を速くする

対象: `tests/playwright.config.js`、`tests/helpers/`、`conductor/tech-stack.md`、`CLAUDE.md`。
**`index.html` は変更しない。**

**進め方:** [Workflow](../workflow.md) に従う。着手時に `[ ]` → `[~]`、完了時に `[x]` + コミットハッシュ7桁。
`plan.md` の更新は別コミット（`conductor(plan): ...`）にする。
フェーズ完了時はユーザーの承認を得たうえで `conductor(checkpoint): ...` コミットを作り、
フェーズ見出しに `[checkpoint: <sha7桁>]` を追記する。

**フェーズは「基準を取る → 並列にする → 時計を速める → 番人であることを確かめる → 仕上げ」の順。**
先に基準（Phase 0）を取るのは、**速くなったかどうかも、嘘をつき始めたかどうかも、
比べる相手がないと言えない**ため。

---

## Phase 0: 基準を取る

コミット種別: `conductor:`（測るだけ。コードは変えない）

- [ ] Task: 通し実行の時間を3回測り、ばらつきを含めて plan に記録する。`--reporter=json` でファイル別・テスト別も取る
- [ ] Task: **わざと壊したときに落ちるテストの集合**を控える。`index.html` を一時的に壊し、落ちた件数とテスト名を記録して元に戻す。壊し方は次の4つ（別々に行う）
  - 撃破時に `spawnEnemy()` を呼ばない（増援）
  - `EnemyShip.onDestroyed()` の士気の上昇を消す（バランス）
  - `resolveBeamPath()` が常に `{kind:'hit', obj:targetObj}` を返す（射線）
  - ズームボタンの `min-height` を 20px にする（表示）
- [ ] Task: Conductor - User Manual Verification 'Phase 0' (Protocol in workflow.md)

---

## Phase 1: ファイル単位で並列に走らせる

コミット種別: `chore:`（設定の変更。テストの中身は変えない）

- [ ] Task: `playwright.config.js` の `workers` を上げる。`fullyParallel: false` は保ち、**ファイル内は直列のまま**にする。台数は実行環境の CPU に合わせて決め、決め方を書き残す
- [ ] Task: 現在の設定コメント「ゲームの状態を共有するため、1ファイル内は直列に実行する」を実態に合わせて書き直す。**共有しているのはゲームの状態ではなく、同じページ**であることを明確にする 〔spec: 時間がどこへ消えているか〕
- [ ] Task: 並列化しても安全であることを確かめ、根拠を記録する。テストごとに Playwright のコンテキストが分かれること（`localStorage` の独立）、`webServer` は静的配信で共有してよいこと
- [ ] Task: **不安定さを確かめる。** 通し実行を5回まわし、1回でも落ちたらワーカー数を下げる。`helpers/game.js` が警告しているとおり、**負荷が上がるとヘッドレスの描画が間引かれ、実時間とゲーム内時間がずれる**
- [ ] Task: Phase 0 で控えた「わざと壊したときに落ちる集合」が変わらないことを確かめる
- [ ] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

---

## Phase 2: 演出の時計を速める

コミット種別: `test:`（テスト側の待ち方の変更）

- [ ] Task: `openGame()` で、起動後に Phaser の時計とトゥイーンを速める。`scene.time.timeScale` と `scene.tweens.timeScale` を上げる。**ゲーム本体には触れない**（`TIMING` の値は変えない）〔spec: 決定事項 3〕
- [ ] Task: 倍率を決める。上げすぎると `waitForIdle()` が「まだ始まっていない」状態を「片付いた」と誤判定しうる。**倍率を変えながら determinism が通り続ける上限**を探し、そこから余裕をみた値にする。決め方を書き残す
- [ ] Task: 速める処理を切れるようにするか判断する。`--headed` で動きを見たいときに邪魔になるため。要否と理由を記録する
- [ ] Task: `determinism` と `regression` が通ることを確かめる。**盤面の推移が演出の速さに依存していない**ことの証明になる 〔spec: 機能要件〕
- [ ] Task: Phase 0 で控えた「わざと壊したときに落ちる集合」が変わらないことを確かめる
- [ ] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

---

## Phase 3: 番人であることを通しで確かめる

コミット種別: なし（確認のみ。必要なら追加の修正）

- [ ] Task: Phase 0 の4つの壊し方をもう一度すべて通し、**落ちるテストの集合が Phase 0 と一致する**ことを確かめる。1件でも減っていたら、速くしたことで見逃すようになったということなので直す 〔spec: 何より優先すること〕
- [ ] Task: 通し実行を5回まわし、すべて通ることを確かめる。ばらつき（最速・最遅）を記録する
- [ ] Task: 部分実行が今までどおり効くことを確かめる（`npx playwright test layout` / `regression` / `-g` での絞り込み）
- [ ] Task: 失敗時の trace とスクリーンショットが残ることを確かめる。わざと1件落として実際に開く
- [ ] Task: 短縮の結果を数字でまとめる（Phase 0 との対比）
- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)

---

## Phase 4: 文書と仕上げ

コミット種別: `docs:` / `conductor:`

- [ ] Task: `conductor/tech-stack.md` のテストの節に、並列実行と演出の時計について書く。**「なぜ安全と言えるか」**を残す。速さのために待ち方を変えるときの落とし穴（甘い待ちは静かにテストを無力化する）も添える
- [ ] Task: `CLAUDE.md` のテストを書くときの注意に、**演出の時計を速めていること**を1行足すか判断する。新しくテストを書く人が固定の待ち時間を入れないための情報として要るか
- [ ] Task: `conductor/workflow.md` のコミット種別の表に `test` を足す。**実際には使われているのに表にない**（`4323b15` / `74ca4eb` などの実績があり、この Track でも使う）
- [ ] Task: バージョンは更新しない。**`index.html` を変えないため**（`v0.<機能追加>.<修正>` のどちらにも当たらない）。判断として記録する
- [ ] Task: Track を `conductor/archive/` へ移し、`conductor/index.md` を更新する。移動で壊れる相対リンクも直す
- [ ] Task: Conductor - User Manual Verification 'Phase 4' (Protocol in workflow.md)

---

## 補足: この Track で気をつける点

- **速いテストは、遅いテストより危険になりうる。** 待ちが甘くなると
  常に通るようになり、しかもそれは静かに起きる。
  Phase 0 で「壊したときに落ちる集合」を控えるのは、この一点のため。
- **`fullyParallel: true` にはしない。** ファイル内の直列は保つ。
  同じファイルのテストは同じ盤面の作り方を共有しており、
  並べ替えの影響を読み切れない。
- **`waitForIdle()` の作りは変えない。** 「動いているものが無くなるまで待つ」
  という考え方は正しく、速くするのは時計のほうである。
  固定の待ち時間を入れる方向へは絶対に戻さない。
- **`determinism` と `regression` は落としてはならない。** この2つが
  「演出の速さは盤面に影響しない」ことの証明になっている。
  速くした結果この2つが不安定になるなら、その速度は行きすぎ。
- 実行時間はマシンによって変わる。**記録する数字は絶対値ではなく
  同じ環境での前後比**として読む。
