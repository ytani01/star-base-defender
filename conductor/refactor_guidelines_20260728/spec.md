# Specification: conductor 規約への適合リファクタリング

## 概要 (Overview)

`conductor/` の各文書（[Code Style Guides](../code_styleguides/) / [Tech Stack](../tech-stack.md) /
[Product Guidelines](../product-guidelines.md) / [Product Guide](../product.md)）を規範として
`index.html` (v0.3.17, 約2,600行) を点検し、**規約に違反している箇所を規約側に合わせる**ことを目的とする。

「読みにくいから直す」という主観ではなく、**どの文書のどの条項に反しているか**を根拠として作業を進める。
根拠を示せない変更は、この Track では扱わない。

## 背景 (Background)

- 2026-07-27 の計画（`archives/20260727a-refactoring-plan.md`）で挙げた項目の大半は v0.3.17 で実施済み。
- 2026-07-28 に `conductor/` 配下の文書を実態に合わせて全面改訂した。その結果、
  これまで「なんとなく気になる」だった箇所が、**明文化された規約への違反**として特定できるようになった。
- 点検の過程で、規約違反に起因する**潜在的な不具合が2件**見つかった（後述）。これらも本 Track の範囲に含める。

## 機能要件 (Functional Requirements)

### A. 不要なものを残さない

> HTML/CSS 規約「不要なものを残さない」／ Product Guidelines「画面上の常時表示は…に限る」

- 参照されていない HTML 要素・CSS ルール・`id` 属性を削除する。
- 参照されていない static プロパティ・メソッド・関数引数を削除する。
- 中身のない JSDoc・重複した JSDoc を解消する。

### B. 潜在的な不具合の修正

> Code Style Guide (JS)「Phaser の作法」／ Tech Stack「読み込みは必ず失敗を想定します」

- シーン再起動で停止できない遅延処理（`setTimeout`）を Phaser のタイマーへ置き換える。
- `localStorage` への書き込み失敗でゲーム進行が止まらないようにする。

### C. 定数と実行時状態の分離

> Code Style Guide (JS)「定数と実行時状態を混ぜない」「グローバル変数を増やさない」

- 実行中に変化する値を `CONSTANT_CASE` の設定オブジェクトから `gameState` へ移す。
- トップレベルの可変グローバル変数を `gameState` / `gameObjs` のいずれかに属させる。
- 分散しているゲーム状態のリセット処理を `GameState` のメソッドに集約する。

### D. 意味のある名前を与える

> Code Style Guide (JS)「マジックナンバーを置かない」／ Product Guidelines「色は意味を持たせる」「発信者を必ず名乗らせる」

- ログの色・発信者名・ビーム色を、意味を表す定数として定義する。
- 判断の閾値（危険域の割合、スタック判定の距離など）に名前を与える。

### E. 責務の分離

> Code Style Guide (JS)「艦種による分岐」

- 複数箇所に散った `instanceof` による分岐を、基底クラスのメソッドとサブクラスのオーバーライドへ寄せる。
- 1つの関数が抱えている複数の責務を分割する。
- 特定のサブクラスしか使わないプロパティを、基底クラスから適切な階層へ移す。

### F. 純粋関数の切り出し

> Tech Stack「テストと静的解析 — 導入する条件」

- 副作用のない計算ロジック（ダメージ減衰・幾何計算・スコア計算）を、
  グローバル状態に依存しない関数として切り出す。
- **この Track ではテストの導入自体は行わない。** 将来テストを導入できる状態を作ることが目的。

### G. 命名規約の統一

> Code Style Guide (JS) §6 Naming

- メソッドは `lowerCamelCase`、クラスは `UpperCamelCase`、不変の定数のみ `CONSTANT_CASE`。
- フィールド・ローカル変数の `snake_case` を `lowerCamelCase` に統一する。

### H. 整形

> Code Style Guide (JS) §3 Formatting / §4 Language Features

- 恒等演算子（`===`）の使用、セミコロンの補完、80桁への折り返し、再代入しない変数の `const` 化。

## 非機能要件 (Non-Functional Requirements)

- **各フェーズ完了時点で、[Workflow の確認シナリオ](../workflow.md#確認シナリオ)を全項目満たすこと。**
- 単一ファイル構成（`index.html`）を維持すること。
- 外部依存を追加しないこと。

## 範囲外 (Out of Scope)

以下は本 Track では**行わない**。

- **ゲームバランスの変更。** ダメージ計算式、士気（spirit）の増減、シールド回復率、
  移動の扇形探索の刻み幅・範囲、スコアの増減値、増援の出現間隔を変更しない。
- **ゲームメカニクスの追加・変更。** `docs/TBD.md` の未実装アイデアは扱わない。
- **画面の見た目の変更。** レイアウト・配色・フォントサイズを変更しない
  （参照されていない要素の削除に伴い、`#misc1` ボタンが消えることのみ例外）。
- **自動テスト・リンタ・ビルド工程の導入。** F は切り出しまでで止める。
- **ファイル分割。** 単一 `index.html` を維持する（Tech Stack の方針変更を伴うため）。
- **既存の `id` ベースの CSS を class ベースへ全面移行すること。**
  HTML/CSS 規約の読み替え条項どおり、現状維持とする。
- **プレイヤー移動への回避ベクトル（`getAvoidanceVector()`）の適用。**
  意図的に使っていない設計であり、共通化のついでに追加しない。

## 完了条件 (Definition of Done)

- 上記 A〜H のタスクがすべて完了している。
- [Workflow の確認シナリオ](../workflow.md#確認シナリオ)を全項目実行し、v0.3.17 と同じ挙動であることを確認済み。
- `DEBUG = true` でコンソールにエラーが出ない。
- 変更後のコードが [Code Style Guides](../code_styleguides/) に照らして違反を残していない。
