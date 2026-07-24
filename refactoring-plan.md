# Starbase Defender — リファクタリング計画（更新版）

対象: `index.html` 内 `<script>` のゲームロジック（JS）
方針: **ファイル分割なし。単一 `index.html` 構成を維持**。HTML構造・全ての `id`/`class`・CSS設計トークンは変更しない。数値バランスや判定ロジックの挙動は変えず、構造・可読性・保守性の改善のみを対象とする。

> **本版の更新について**: `develop` ブランチの最新 `index.html`（`StarBase Defender v0.3.11`、約2580行）を読み直し、前回の計画（初回作成時点、`main`相当・約1300行）からの進捗を反映した。単なる行数増加ではなく、ステータスパネルの再設計（連邦艦カウンタ追加、バージョン表示、ログの複数行スクロール化）や `GameState` クラスの導入など、質的な変化が多い。

---

## 1. 前回計画からの進捗サマリー

| ID | 項目 | 状態 | 備考 |
|---|---|---|---|
| H-5 | `canDock` 変数名の衝突解消 | 対応済み | `canDockNow` にリネーム済みを確認。 |
| M-3 | グローバル状態の集約 | 対応済み | `class GameState` を新設し、`gameState.turn` / `gameState.score` / `gameState.isPlayerTurn` 等に統一。旧 `g_turn` 等のフラット変数は解消。 |
| H-1 | プレイヤー移動とNPC移動の重複統合 | ほぼ対応済み | `attemptPlayerMove()` が `SpaceShip.clampDest()` / `resolveMovement()` を直接呼び出す形に変更されており、独自の再実装は解消。残る差分（プレイヤーは回避ベクトルを使わない）はコメントで明記された意図的な設計判断であり、重複ではない。 |
| H-3 | スポーン処理の共通化 | 一部対応 | 連邦艦は `newFederationShip(scene, dist_min, dist_max)` に共通化され、初期配置・増援出現の2箇所から呼ばれている。敵艦のスポーンは未対応（後述）。 |
| L-1 | デバッグ用UIボタンの扱い | 一部対応 | `#misc1` の `onclick` ハンドラはコメントアウトされ無効化済み。ただしボタン要素自体（ラベル"----"）はHTML/DOM上に残っている。 |
| H-4 | `spaceContext` 更新APIの統一 | 未対応 | `FederationShip.onAfterAttack()` が引き続き `spaceContext.enemies = spaceContext.enemies.filter(...)` と直接書き換えている。 |
| H-2 | ゲージ更新のヘルパー化 | 未対応 | `updateStatus()` の反復パターンはそのまま（連邦艦カウンタ表示が増えて反復箇所がむしろ増加）。 |
| M-1 | デバッグ用 `console.log` の整理 | 未対応（一部悪化） | 多くはコメントアウトされたが、新規に `console.log(obj)`（`getTargetVector()` 内、連邦艦の移動計算のたびに発火）などが追加されている。 |
| M-2 | メッセージ色の定数化 | 未対応 | `setMsg()` 呼び出しのHEXリテラル直書きは変わらず。 |
| M-4 | JSDocの充実 | 未対応 | 空スタブは残存。`npcMove()` の直前に同一の空スタブが2つ重複している箇所を新たに確認。 |
| L-2 | 定数の階層整理 | 未対応 | 変わらず。 |
| L-3 | IIFEでのグローバルスコープ隔離 | 未対応 | 変わらず。 |
| L-4 | メッセージ色とCSS設計トークンの連携 | 未対応 | 変わらず（任意タスク）。 |

新たに見つかった項目は次のセクションで詳細を記載する（N-1〜N-3）。

---

## 2. 新たに見つかった項目

### N-1（優先度：高）暗黙のグローバル変数が発生している

`finalizeEnemyTurn()` 内で以下のように `let`/`const` なしで代入されている箇所がある。

```javascript
if ( gameState.turn % NEW_FEDERATION_INTERVAL === 0 ) {
  // XXX TBD 連邦の援軍が出現する条件
  qty_enemies = spaceContext.enemies.filter(e => e.active).length;   // ← 宣言なし
  ...
}
```

`"use strict"` が指定されていないスクリプトのため、これは構文エラーにならず意図せず `window.qty_enemies` というグローバル変数を作ってしまう。実害は今のところ小さいが、事故の元になりやすいので優先度は高めとした。`const qty_enemies = ...` に修正するだけで解消する。

### N-2（優先度：低）JSDocスタブの重複

```javascript
/**
 * NPC 移動処理とシールド回復
 */
/**
 * NPC 移動処理とシールド回復
 */
function npcMove(scene, npc, context) {
```

同一内容のコメントブロックが2つ連続している。コピー&ペーストの際の消し忘れとみられる。実害はないが、次にこの関数を編集する際に一つにまとめておくとよい。

### N-3（優先度：低）コメントアウトされた旧コードの蓄積

`gameOver()`, `attemptPlayerMove()`, `npcMove()`, `finalizeEnemyTurn()`, `create()` の周辺に、旧仕様の `setMsg(...)` 呼び出しや `console.log(...)` がコメントアウトされたまま残っている箇所が複数ある（例: 旧ドッキング解除メッセージ、旧スピリット回復ログ、旧基地回復ログなど）。動作に影響はないが、量が増えてきているため、他のリファクタと合わせて棚卸しすると読みやすくなる。

---

## 3. リファクタリング項目（優先度別・更新版）

### 優先度：高

| # | 項目 | 内容 |
|---|---|---|
| N-1 | 暗黙グローバル変数の修正 | `finalizeEnemyTurn()` 内の `qty_enemies = ...` を `const qty_enemies = ...` に修正。 |
| H-4 | `spaceContext` 更新APIの統一 | `FederationShip.onAfterAttack()` の直接配列書き換えを `spaceContext.removeEnemy(target)` 呼び出しに置き換える。 |
| H-2 | ゲージ更新のヘルパー化 | `updateStatus()` 内の Ship Shield / Ship Energy / Base Shield（+ 今回増えた Federation/Enemy カウント表示）の反復パターンを `updateGaugeDisplay(valueId, gaugeId, value, max)` 等の共通関数に集約。反復箇所が増えた分、効果も大きくなっている。 |
| H-3 | 敵艦スポーン処理の共通化 | 連邦艦と同様に `spawnEnemy(scene, distMin, distMax)` を新設し、`create()` の初期配置ループ・`EnemyShip.onInteract()` の撃破時再生成・`finalizeEnemyTurn()` の増援出現の3箇所を置き換える。 |

### 優先度：中

| # | 項目 | 内容 |
|---|---|---|
| M-1 | ログ出力の統一 | `DEBUG` フラグ + `debugLog(...)` ラッパーを導入し、`Weapon` コンストラクタ・`NPCShip` コンストラクタ・`getTargetVector()`（連邦艦の移動計算で毎ターン発火する `console.log(obj)`）・`execNPCAction()`・`npcMove()`・`finalizeEnemyTurn()` 等に残る `console.log` を置き換える。特に `getTargetVector()` 内のログは負荷の観点からも早めに対応する価値がある。 |
| M-2 | メッセージ色の定数化 | `setMsg()` 呼び出し側に散らばる "#0f0", "#f00", "#ff0", "#8ff", "#88f", "#0f8" 等のHEXリテラルを `MSG_COLOR = { OK, WARN, DANGER, INFO, ... }` のような定数オブジェクトに置き換える。 |
| M-4 | JSDocの充実・重複整理 | `calcAvoidanceForce`, `getTargetVector`, `resolveMovement`, `evaluateTactics` 等の複雑なロジックにコメントを追記。あわせて `npcMove()` 直前の重複スタブ（N-2）を1つに統合。`getActiveFederationShipCount()` の `+ 1`（自機を含む意図と思われる）など、意図が読み取りにくい箇所に一言添える。 |
| N-3 | コメントアウト済みコードの棚卸し | 上記「新たに見つかった項目」参照。他の項目に着手するタイミングで、周辺の不要なコメントアウトも一緒に削除する。 |

### 優先度：低（任意・影響範囲が広いため慎重に判断）

| # | 項目 | 内容 |
|---|---|---|
| L-1 | `#misc1` ボタンの最終処理 | `onclick` は無効化済みだが、ボタン要素（ラベル"----"）自体は残っている。今後デバッグ用途で使うか、完全に撤去するかを決める。HTML変更を伴うため、対応するとしても他のCSS/HTML作業と合わせて実施するのが望ましい。 |
| L-2 | 定数の階層整理 | `NEW_ENEMY_INTERVAL`, `NEW_FEDERATION_INTERVAL`, `SCALE`, `AREA_R` を既存の `TIMING`/`QTY` のような構造にまとめる。 |
| L-3 | グローバルスコープの隔離 | script全体をIIFEで包む。`window.audioCtx` や DOM の `onclick` 直書き箇所への影響確認が必要なため任意。 |
| L-4 | メッセージ色とCSS設計トークンの連携 | M-2 で定義する `MSG_COLOR` と、既存CSSの `--color-primary` 等の設計トークンの意味づけを揃える。CSS変更を伴うため別タスク扱いが無難。 |

---

## 4. 実施ステップ案（更新版）

前回計画のうち H-5・M-3・H-1（大部分）・H-3（連邦艦分）はすでに対応済みのため、着手対象を絞り込んだ。

1. **N-1**（暗黙グローバル変数の修正）— 1行修正、最優先で対応可能。
2. **H-4**（`spaceContext` API統一）— 影響範囲が限定的。
3. **H-3**（敵艦スポーン処理の共通化）— 動作確認：初期配置・撃破後の再出現・増援出現の3パターンをそれぞれプレイして確認。
4. **H-2**（ゲージ更新ヘルパー化）— 見た目に直結するため、リファクタ後に全ゲージ・カウンタ表示（自機シールド/エネルギー、基地シールド、連邦艦数、敵艦数）の色・幅・数値表示を目視確認。
5. **M-1 / M-2**（ログ・色定数）— 挙動に影響しない置換なので、まとめて実施可能。特に `getTargetVector()` 内のログは早めに対応。
6. **M-4 / N-2 / N-3**（JSDoc・コメント整理）— 随時、他の修正と合わせて実施。
7. **L-1〜L-4** — 別途、必要に応じて着手を判断。

---

## 5. 注意点・リスク

- **DOM `id`/`class` は一切変更しない**（HTML/CSSは別レイヤーとして既に確定済みのため）。ステータスパネルは `statusEnemyCount` → `statusEnemyShipCount` や `statusFederationShipCount` の追加など、develop ブランチですでに拡張されているが、これは機能追加であり今回のリファクタ対象ではない。
- **数値バランス（ダメージ計算、士気、シールド回復率など）は一切変更しない**。今回はあくまで構造上の重複解消・可読性向上が目的。
- H-1（移動ロジック）はすでに大部分が統合済みだが、プレイヤー移動が意図的に回避ベクトルを使わない設計になっている点は今後も維持すること（誤って「重複だから統一しよう」と回避ベクトルを追加しないよう注意）。
- 各ステップ後の確認シナリオ（最低限）：
  - 通常移動・障害物回避
  - 敵への攻撃（命中/射程外/障害物あり）
  - 基地へのドッキング/解除
  - 自機シールド回復操作
  - 敵撃破 → 新規敵出現
  - 増援出現（`NEW_ENEMY_INTERVAL` / `NEW_FEDERATION_INTERVAL`、連邦艦のドッキング判定含む）
  - ミッションクリア → ハイスコア登録 → ハイスコア一覧からの続行
  - ゲームオーバー（基地陥落/自機撃破/エネルギー切れ）
