# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

Starbase Defender — ブラウザで動くターン制の戦術シミュレーションゲーム。
**ゲームの全て（HTML・CSS・JavaScript）が `index.html` 1ファイルに収まっている**（約 2,600 行）。
これは暫定措置ではなく意図的な選択（理由と制約は `conductor/tech-stack.md`）。

- ビルド工程・パッケージマネージャ・`node_modules` は存在しない
- 依存は Phaser 3.60.0（CDN、バージョン固定）のみ。**新しいライブラリを追加しない**
- 自動テスト・リンタ・型チェックは**存在しない**。品質の担保は `conductor/workflow.md` の手動確認シナリオが唯一のゲート
- 画像・音声アセットを持たない（スプライトは Graphics API で実行時生成、効果音は Web Audio API で合成）

## 実行と確認

```bash
# 動作確認：ブラウザで index.html を直接開く、またはローカルサーバで配信する
python3 -m http.server 8000   # → http://localhost:8000/

# 構文チェック（インラインスクリプトを抽出して node で検査。唯一の静的チェック手段）
awk '/<script>/{flag=1; next} /<\/script>/{flag=0} flag' index.html > /tmp/extracted.js && node --check /tmp/extracted.js
```

デバッグ時は `index.html` の `DEBUG` フラグ（既定 `false`）を `true` にすると `debugLog()` の出力が有効になる。

## 最重要ルール

必ず `conductor/` 配下の規約に従うこと。特に違反しやすいもの:

- **`console.log()` を直接書かない。** 必ず `debugLog()` を使う
- **`setTimeout` / `setInterval` を使わない。** 遅延実行は `scene.time.delayedCall()`、アニメーションは `scene.tweens`
  （シーン再起動時に停止できず、前ミッションの処理が残るため）
- **トップレベルの `let` を新設しない。** 状態は `gameState`（進行状態）か `gameObjs`（オブジェクト管理）に属させる
- **`CONSTANT_CASE` は実行中に変化しない値のみ。** `const` オブジェクトのプロパティを実行時に書き換えない
- **リファクタリングでゲームバランスの数値を変えない。** バランス調整は別コミット（`balance:`）にする
- **プレイヤーの移動は意図的に `getAvoidanceVector()` を使わない。** NPC 処理と共通化する際に誤って追加しないこと
- 中身のない `/** */` を残さない。JSDoc には「何をするか」でなく**「なぜそうするのか」**を書く
- 色は `:root` のカスタムプロパティ経由で参照する。色は装飾でなく**意味**を持つ（シアン=自軍 / 黄=警告 / 赤=危険 / 緑=良好 / オレンジ・マゼンタ=敵）
- 高さ指定は `vh` フォールバックの直後に `dvh` を併記する。タップ対象は 48px 以上
- ログの発信者名（操舵手・戦術士官・機関部・通信士・副長・基地・司令部・コンピュータ）は担当が決まっている（`conductor/product-guidelines.md`）

## `index.html` の構造

`<style>`（〜288行）→ `<body>`（DOM の UI: ステータスパネル / キャンバス / ハイスコアオーバーレイ）→ `<script>`（367行〜）。
スクリプト内はコメント区切りで5ブロックに分かれる。

| ブロック | 内容 |
|---|---|
| 設定・定数の定義 | `TIMING` / `QTY` / `SCORE` / `PLAY_AREA` / `CAMERA` / `DEBUG`、`GameState` クラス |
| グローバルメソッド | `debugLog()` / `setMsg()`（ログ出力）/ `drawGauge()` / `playBeamSound()` |
| クラス定義 | `GameObjs`・`Weapon` と `GameObj` を頂点とするゲームオブジェクト階層 |
| ゲーム(Phaser)初期化・ループ | `preload()` / `create()` / `update()`、移動判定、`handlePointerDown()` |
| 敵ターンの処理 | NPC ターン、ステータス更新、ミッション進行、ハイスコア |

### 状態の持ち方

グローバルなシングルトンが2つあり、状態はどちらかに属する。

- `gameState`（`GameState` インスタンス）— ターン数・スコア・ミッション番号・`isPlayerTurn` / `isGameOver` などの進行状態
- `gameObjs`（`GameObjs` インスタンス）— `player` / `starBase` / `enemies` / `federationShips` / `stars` の保持と、
  クリック対象の検索（`findObjectAt()`）、障害物リスト生成（`getObstacles()`）

`gameObjs.enemies` には撃破・撤退済みの艦が残る場合があるため、**数を数えるときは必ず
`getActiveEnemyCount()` / `getActiveFederationShipCount()` を通す**（配列長を直接使わない）。

### クラス階層

```
GameObj (座標・サイズを Phaser スプライトへ委譲。get x/y/r)
├── Star
└── ObjWithShield (シールド残量の可視化・被弾処理)
    ├── StarBase
    └── SpaceShip (移動計算: clampDest / resolveMovement / calculateDestination)
        ├── NPCShip (戦術判断: evaluateTactics / attack / getPotentialTargets)
        │   ├── EnemyShip
        │   └── FederationShip
        └── ObjWithEnergy → PlayerShip
```

**艦種による振る舞いの差は、基底クラスのメソッドをオーバーライドして表現する**
（`getBeamColor()` / `getAttractionTargets()` / `getPotentialTargets()` / `shouldIgnoreTarget()` / `onAfterAttack()`）。
`instanceof` による分岐を呼び出し側に散らさないこと。

クリック時の反応も同様に `GameObj.onInteract(player, scene, endTurn)` のオーバーライドで実現している
（敵=攻撃 / 基地=ドッキング / 自機=シールド回復）。`handlePointerDown()` は対象を探して `onInteract()` を呼ぶだけ。

### ターンの流れ

`handlePointerDown()` → プレイヤーの行動（移動 / 攻撃 / シールド回復 / ドッキング）→ `npcTurn(scene)` →
各 NPC を `delayedCall` でばらけさせて `execNPCAction()` → 一定遅延後に `finalizeEnemyTurn(scene)`
（ターン加算・スコア減点・増援判定・基地シールド回復・`gameState.isPlayerTurn = true`）。
全敵が撤退していれば `nextMission()`、敗北条件成立時は `gameOver()`。

シーンは1つだけで、ミッション切り替え・再開は `scene.restart()` で行う。

### 永続化

ハイスコアのみ `localStorage`（キー `starbaseDefenderScores`、上位5件）。サーバ通信は一切ない。
**読み書きは必ず失敗を想定する**（`localStorage` が無効・破損していてもゲームは起動しなければならない）。

## ワークフロー

`develop` で作業し、`master` にマージすると GitHub Pages で即公開される（ビルドを挟まないため、
コミットした `index.html` がそのままプレイヤーに届く）。`master` は常に公開可能な状態を保つ。

- **まとまった作業は Track で管理する。** `conductor/<track_id>/` に `spec.md` / `plan.md` / `metadata.json` を置き、
  進捗は `plan.md`（`[ ]` → `[~]` → `[x]` + コミットハッシュ7桁）が唯一の正。完了後 `conductor/archive/` へ移動。
  数行の修正やバグ修正に Track は不要
- **コミットは `<type>(<scope>): <日本語の要約>`。** type は Conventional Commits の英語
  （`feat` / `fix` / `refactor` / `style` / `balance` / `docs` / `chore` / `conductor`）、要約と本文は日本語で書く
- リファクタリングとバランス調整、命名の一括変更と実質的な変更を同じコミットに混ぜない
- コミット後に `git notes add -m "<サマリー>" $(git log -1 --format=%H)` で作業サマリーを添付する
- **フェーズ完了時はユーザーに手動確認を依頼し、明示的な承認を得るまで次へ進まない**
- リリース時は `index.html` のバージョン番号を更新し、バージョン更新だけの `chore:` コミットを1つ作る
  （`v0.<機能追加>.<修正>`。挙動不変のリファクタリングのみなら上げなくてよい）

変更に対応する確認シナリオ（`conductor/workflow.md`）を必ず実行する。**モバイルの縦画面・横画面の確認を省略しない。**

## 参照すべき文書

| 文書 | 内容 |
|---|---|
| `conductor/index.md` | Track 一覧と進行状況の入口 |
| `conductor/product.md` | ゲームメカニクスの定義と設計意図 |
| `conductor/product-guidelines.md` | 見た目・操作感・ログの文体 |
| `conductor/tech-stack.md` | 技術構成と、その選択が課す制約 |
| `conductor/workflow.md` | 作業手順・確認シナリオ・完了の定義 |
| `conductor/code_styleguides/` | JavaScript / HTML・CSS の規約（Google スタイルガイド＋プロジェクト固有の読み替え） |
| `docs/TBD.md` | 未実装アイデア |

技術選択を変える場合は、**実装に着手する前に** `conductor/tech-stack.md` を更新する。
