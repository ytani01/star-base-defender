# Track: 画面の見方を説明する図

画面に出ているものの意味を1枚の SVG で示し、README と Product Guidelines の
両方から参照する。

- [Spec](./spec.md) — 何を実現するか、何をやらないか
- [Plan](./plan.md) — フェーズ分けしたタスクリスト（進捗の唯一の正）

## なぜ作るか

| 読み手 | いま困っていること |
|---|---|
| プレイヤー | README に操作方法はあるが、画面の各部が何を表すかの説明がない |
| 開発者 | [Product Guidelines](../product-guidelines.md) の「色の意味」が文章の中にしかなく、実際の描画と突き合わせられない |

## 形式

手書きの SVG。**艦の形は `index.html` の `preload()` の描画命令をそのまま
転記する**（想像で描かない）。色は `DRAW_COLOR` / `MSG_COLOR` / `:root` と
同じ値を使い、規約・実装・図が同じ数値を指すようにする。

テキストなので `git diff` で変更が読める。PNG では読めない。
追加のライブラリもビルド工程も要らないため、[Tech Stack](../tech-stack.md) の
制約に触れない。

## 経緯

`docs/screenshot1.png`（README 冒頭、2026-07-07）が v0.3 期のもので、
ステータス欄の構成が現在と全く違うことが分かった。
差し替えは本 Track の範囲外とし、図で補う。
