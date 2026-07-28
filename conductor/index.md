# Starbase Defender

**Project Goal:** 迫りくる敵艦隊から中央の宇宙基地を守り抜く、ブラウザで動くターン制の戦術シミュレーションゲーム。

**プレイ:** https://ytani01.github.io/star-base-defender/

## このディレクトリについて

`conductor/` は、Starbase Defender の「何を・なぜ・どう作るか」を定義する文書群です。
コードそのものの説明（クラス構成や関数の一覧）は置きません。コードを読めばわかることは書かず、
**コードを読んでもわからないこと**（意図・判断基準・守るべき制約）だけを記録します。

## Documents

| 文書 | 役割 | 更新するタイミング |
|---|---|---|
| [Product Guide](./product.md) | ゲームの体験とルールの定義。「何を作るか」 | ゲームメカニクスを追加・変更するとき |
| [Product Guidelines](./product-guidelines.md) | 見た目・操作感・言葉遣いの規範。「どう見せるか」 | UI/UX の方針を変えるとき |
| [Tech Stack](./tech-stack.md) | 技術構成と、その選択が課す制約 | 技術選択を変えるとき（**実装前に**更新） |
| [Workflow](./workflow.md) | 作業の進め方・確認手順・コミット規約 | 進め方を変えるとき |
| [Code Style Guides](./code_styleguides/) | JavaScript / HTML・CSS のコーディング規約 | 規約を変えるとき |

## 現在の構成

```
star-base-defender/
├── index.html          # ゲーム本体。HTML・CSS・JS の全てがこの1ファイルに入る
├── README.md           # プレイヤー向けの遊び方説明
├── tests.html          # 計算のテスト。ブラウザで開くだけ（依存なし）
├── tests/              # シナリオテスト（Playwright、開発時のみ）
├── conductor/          # 開発のための文書群（このディレクトリ）
├── docs/               # スクリーンショット・デモ動画・未実装アイデア (TBD.md)
└── archives/           # 完了・棄却した計画文書の保管場所
```

`index.html` 単一ファイル構成である理由と、その制約については [Tech Stack](./tech-stack.md) を参照。

## Tracks

まとまった作業単位を「Track」と呼び、`conductor/<track_id>/` に以下の3点セットを置きます。
完了したら `conductor/archive/` へ移動します。進め方の詳細は [Workflow](./workflow.md) を参照。

- `spec.md` — 何を実現するか（要件・範囲外）
- `plan.md` — どう実現するか（フェーズ分けしたタスクリスト。進捗の唯一の正）
- `metadata.json` — track_id / type / status / 日時 / 概要

### 進行中

- [docs_screen_guide_20260729](./docs_screen_guide_20260729/index.md) — 画面の見方を1枚の SVG で示し、README と Product Guidelines から参照する

### 完了・保管済み

- [refactor_guidelines_20260728](./archive/refactor_guidelines_20260728/index.md) — `conductor/` の規約に対する `index.html` の乖離を解消（全8フェーズ）
- [test_harness_20260728](./archive/test_harness_20260728/index.md) — 確認シナリオを2層（`tests.html` と Playwright）で自動化
- [refactor_config_20260706](./archive/refactor_config_20260706/index.md) — 設定値を `OBJ_CONF.*` から各クラスの static プロパティへ移行

### Track 化していない計画文書

単発のリファクタリング計画などは `archives/` に日付プレフィックス付きで保管しています。

- `archives/20260728a-refactoring-plan.md` — コード側から洗い出したリファクタリング計画。
  規約を根拠として整理し直した [refactor_guidelines_20260728](./archive/refactor_guidelines_20260728/index.md) が後継となる
- `archives/20260727a-refactoring-plan.md` — 前回計画（大部分は v0.3.17 で実施済み）
