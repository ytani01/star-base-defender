# Implementation Plan: 画面の見方を説明する図

対象: `docs/screen-guide.svg`（新規）、`README.md`、`conductor/product-guidelines.md`。
**`index.html` には手を加えない。**

**進め方:** [Workflow](../workflow.md) に従う。着手時に `[ ]` → `[~]`、完了時に `[x]` + コミットハッシュ7桁。
`plan.md` の更新は別コミット（`conductor(plan): ...`）にする。
フェーズ完了時はユーザーの承認を得てからチェックポイントを作る。

**フェーズは「図を作る → 参照させる → 突き合わせる」の順。** Phase 1 だけでも
図として成立し、Phase 2 で初めて読者の導線に乗る。

---

## Phase 1: 図の作成

コミット種別: `docs:` / `index.html` には触れない。

- [x] Task: 図に載せる記号と色を `index.html` から洗い出し、対応表にまとめる。`preload()` の描画命令、`DRAW_COLOR` / `MSG_COLOR` / `:root`、`DISPLAY_THRESHOLD` が出どころ 〔spec: 艦の形は preload() の描画命令をそのまま転記する〕 [70a7092]
- [x] Task: 区画1「ステータス欄」を描く。各行の意味、ゲージが赤に変わるしきい値（30%）、`Federation N (Dock M)` が自機を含むこと 〔spec: 機能要件 1.〕 [70a7092]
- [x] Task: 区画2「盤面の記号」を描く。自機・連邦艦・敵艦・基地・恒星・宇宙域の境界。艦の形は `preload()` から転記する 〔spec: 機能要件 2.〕 [70a7092]
- [x] Task: 区画3「艦のまわりの表示」を描く。シールド円（白 / 50%未満で黄 / 25%未満で赤、太さも残量に比例）、シールドバー、自機だけのエネルギーバー、射程円、ドッキングの輪、ビームの色 〔spec: 機能要件 3.〕 [70a7092]
- [x] Task: GitHub で表示できる形に整える。外部参照・`<script>`・`<style>` を使わず色は属性に直接書く。`viewBox` を付ける。フォントは `monospace` のみ 〔spec: GitHub 上で表示できること〕 [70a7092]
- [x] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md) [61ba45c]

---

## Phase 2: 文書からの参照

コミット種別: `docs:`

- [x] Task: `README.md` に「画面の見方」の節を新設し、「操作方法」の前に置いて図を貼る。図だけで伝わらないしきい値は図中に書く。※ 射程による威力の変化は README 本文にも書いた 〔spec: 参照〕 [1334614]
- [x] Task: `conductor/product-guidelines.md` の「レトロ SF スタイル」の色の対応表のあとに、図への参照を1行足す。**規約の内容自体は変えない** 〔spec: 参照〕 [1334614]
- [x] Task: 古い `docs/screenshot1.png` を削除し、README からの参照も外す。v0.3 期のもので現在の画面と食い違うため 〔spec: 古いスクリーンショットの削除〕 [1334614]
- [x] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md) [1334614]

---

## Phase 3: 突き合わせと完了処理

コミット種別: `docs:` / `conductor:`

- [x] Task: 図の色としきい値を `index.html` の定義と突き合わせる。16進の値を並べて目視で照合する。※ 出どころは DRAW_COLOR / MSG_COLOR のほか、クラスの SHIELD_COLOR・ENERGY_COLOR、drawGauge()、CSS にまたがっていた。盤面の背景色のずれを1件修正 〔spec: 完了の定義〕 [527b710]
- [x] Task: 実際のゲーム画面と図を並べて見比べる。説明もれの記号がないこと、図にしかない記号がないことを確かめる。※ 画面要素22件を実装から列挙して照合。未説明だったズームボタンを追加した 〔spec: 完了の定義〕 [527b710]
- [x] Task: `npx playwright test` を通す。`index.html` は変更していないが、意図しない差分が混ざっていないことの確認として実行する。※ 全73件通過 [527b710]
- [x] Task: Track を `conductor/archive/` へ移し、`conductor/index.md` の「進行中」を「なし」に戻して「完了・保管済み」へ加える
- [x] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md) [b04b7f4]

---

## 補足: この Track で判断が要る点

- **図の粒度。** 記号を全部載せると読みにくく、削ると説明もれになる。
  「画面を見て意味が分からないもの」を基準に取捨する。
  演出（ビームのアニメーション）は静止画で示せる範囲にとどめる。
- **`docs/screenshot1.png` は削除する**（2026-07-29 に範囲へ追加）。
  代わりの画像を撮るかどうかは引き続き範囲外。README の冒頭から画像がなくなるので、
  必要なら別途、現在の画面で撮り直す。
