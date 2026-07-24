# Starbase Defender — リファクタリング計画

対象: `index.html` 内 `<script>` のゲームロジック（JS）
方針: **ファイル分割なし。単一 `index.html` 構成を維持**。HTML構造・全ての `id`/`class`・CSS設計トークンは変更しない。数値バランスや判定ロジックの挙動は変えず、構造・可読性・保守性の改善のみを対象とする。

---

## 1. 現状の良い点

- `// ------` 区切りコメントによるセクション分け（設定/グローバルメソッド/クラス定義/ゲーム初期化/敵ターン処理）は既に整理されており、これは維持する。
- `GameObj → ObjWithShield → SpaceShip → NPCShip → EnemyShip/FederationShip` の継承構造は妥当で、責務も概ね分離されている。
- `SpaceContext` によるオブジェクト管理の一元化は良い設計。

## 2. 気になった点（現状分析）

1. **プレイヤー移動とNPC移動のロジックが二重実装されている**
   `attemptPlayerMove()` は `SpaceShip.calculateDestination()` とほぼ同じ「目標ベクトル＋回避ベクトル合成→`resolveMovement()`」の処理を、独自にインラインで再実装している。ドッキング判定や速度上限（`Math.min(rawDist, SPEED)`）など、プレイヤー固有の差分はあるが、大部分は重複。

2. **ステータス表示更新 (`updateStatus()`) に同型処理が3回繰り返されている**
   Ship Shield / Ship Energy / Base Shield それぞれで「比率計算 → 色判定 → `textContent` → ゲージ幅 → ゲージ色」という同じ5行パターンが手書きで3回展開されている。

3. **敵艦・連邦艦のスポーン処理が3箇所に分散**
   - `create()` 内の初期配置ループ
   - `EnemyShip.onInteract()` 内、撃破時の新規敵生成
   - `finalizeEnemyTurn()` 内、増援出現時の生成
   いずれも `getSafeRandPos()` → `new EnemyShip(...)` → `spaceContext.addEnemy(...)` という同型の3行。`FederationShip` も `newShip()` と `finalizeEnemyTurn()` の増援処理で同様に重複。

4. **`spaceContext` の更新APIが統一されていない**
   `removeEnemy()` というメソッドがあるにもかかわらず、`FederationShip.onAfterAttack()` では `spaceContext.enemies = spaceContext.enemies.filter(e => e !== target)` と直接配列を書き換えている。同じ操作が2通りの書き方で存在する。

5. **ローカル変数 `canDock` がグローバル関数 `canDock()` を隠蔽している**
   `attemptPlayerMove()` 内の `moveTo()` コールバックで `const canDock = (...)` と宣言しており、同名のグローバル関数とシャドーイングしている。現状は動作に支障ないが、将来この関数を触る際に事故りやすい命名。

6. **メッセージ色のカラーコードがハードコードされ散在**
   `setMsg()` の呼び出し箇所で `"#0f0"`, `"#f00"`, `"#ff0"`, `"#f80"`, `"#a00"`, `"#88f"` などのHEX文字列が十数箇所に直書きされている。意味（成功/警告/危険/情報）が名前から読み取れず、CSS側の設計トークン（`--color-primary` 等）とも紐付いていない。

7. **デバッグ用 `console.log` が本番コードに多数残存**
   `Weapon` コンストラクタ、`handlePointerDown()`、`execNPCAction()`、`npcMove()`、`attemptPlayerMove()` など、常時発火するログが多い。特に `Weapon` のログは敵艦生成のたびに毎回出力される。

8. **グローバルなミュータブル変数が多数、フラットに存在**
   `g_turn`, `g_curMission`, `g_score`, `g_isPlayerTurn`, `g_isGameOver`, `g_flagClear`, `g_pendingScene`, `g_curScene` の8つが個別のトップレベル変数。関連する状態がひとまとまりになっていないため、見通しが悪い。

9. **空のJSDocスタブが多い**
   `/**\n *\n */` のようにタイトルのみで説明がないコメントが多くのメソッド（`calcAvoidanceForce`, `getTargetVector`, `resolveMovement` など、複雑な操舵ロジック）に付いている。

10. **デバッグ用UIボタンが本番UIに残っている**
    `#misc1`（`▶ ??` → `newShip()` 呼び出し）が本番想定のステータスパネルに常時表示されている。`#misc2` はコメントアウト済み。

11. **定数の置き場所が一部不統一**
    `TIMING` / `QTY` / `CAMERA` / `SCORE` / `HIGHSCORE` はオブジェクトにまとまっているが、`NEW_ENEMY_INTERVAL`, `NEW_FEDERATION_INTERVAL`, `SCALE`, `AREA_R` は単独の `const` として並んでいる。

---

## 3. リファクタリング項目（優先度別）

### 優先度：高（挙動を変えずに重複・リスクを解消）

| # | 項目 | 内容 |
|---|---|---|
| H-1 | プレイヤー移動ロジックの共通化 | `attemptPlayerMove()` の目標ベクトル＋回避ベクトル合成部分を、`SpaceShip` 側の `getTargetVector`/`getAvoidanceVector`/`resolveMovement` を呼び出す形に寄せる。ドッキング判定・速度上限などプレイヤー固有ロジックのみ `attemptPlayerMove()` に残す。 |
| H-2 | ゲージ更新のヘルパー化 | `updateStatus()` 内の3箇所（Ship Shield / Ship Energy / Base Shield）を `updateGaugeDisplay(valueId, gaugeId, value, max)` のような共通関数に集約。 |
| H-3 | スポーン処理の共通化 | `spawnEnemy(scene, minDist, maxDist)` / `spawnFederation(scene, minDist, maxDist)` を新設し、初期配置・撃破時再生成・増援出現の3箇所から呼び出す形に統一。 |
| H-4 | `spaceContext` 更新APIの統一 | `FederationShip.onAfterAttack()` の直接配列書き換えを `spaceContext.removeEnemy(target)` 呼び出しに置き換える。 |
| H-5 | `canDock` 変数名の衝突解消 | `attemptPlayerMove()` 内のローカル変数を `canDockNow` 等にリネームし、グローバル関数とのシャドーイングを解消。 |

### 優先度：中（可読性・保守性の向上）

| # | 項目 | 内容 |
|---|---|---|
| M-1 | ログ出力の統一 | `const DEBUG = false;` 相当のフラグと `function debugLog(...args){ if (DEBUG) console.log(...args); }` を用意し、既存の `console.log` 呼び出しを置き換える。本番ビルドで一括OFFにできるようにする。 |
| M-2 | メッセージ色の定数化 | `const MSG_COLOR = { OK: "#0f0", WARN: "#ff0", DANGER: "#f00", INFO: "#0ff", ALERT: "#f80", CRITICAL: "#a00", NOTICE: "#88f" };` のようなオブジェクトを定義し、`setMsg()` 呼び出し側のHEXリテラルを置き換える。 |
| M-3 | グローバル状態の集約 | `g_turn`, `g_score`, `g_curMission`, `g_isPlayerTurn`, `g_isGameOver`, `g_flagClear`, `g_pendingScene` を `const GameState = { turn: 1, mission: 1, score: SCORE.INIT, isPlayerTurn: true, ... };` のような単一オブジェクトにまとめる（`g_curScene` は用途が異なるため要検討）。参照側は `GameState.turn` のように統一。 |
| M-4 | JSDocの充実 | 特に `calcAvoidanceForce`, `getTargetVector`, `resolveMovement`, `evaluateTactics` など、AI/操舵まわりの複雑なメソッドに引数・戻り値・アルゴリズムの簡単な説明を追記。 |

### 優先度：低（任意・影響範囲が広いため慎重に判断）

| # | 項目 | 内容 |
|---|---|---|
| L-1 | デバッグ用ボタンの扱い | `#misc1`（`▶ ??`）を本番では非表示にする、または明示的に「デバッグ機能」と分かるラベルに変更するか撤去するかを検討。 |
| L-2 | 定数の階層整理 | `NEW_ENEMY_INTERVAL`, `NEW_FEDERATION_INTERVAL`, `SCALE`, `AREA_R` を既存の `TIMING`/`QTY` のような構造にまとめ、定数定義の見た目を統一。 |
| L-3 | グローバルスコープの隔離 | script全体を即時実行関数（IIFE）で包み、意図しないグローバル汚染を防ぐ。影響範囲の確認（`window.audioCtx` や DOM の `onclick` 直書き箇所など）が必要なため任意。 |
| L-4 | メッセージ色とCSS設計トークンの連携 | 既存のCSS側デザインシステム（`--color-primary` 等）と、JS側の `MSG_COLOR`（M-2）の意味づけを揃える。ただしCSS変更を伴うため、今回の「CSSは触らない」方針とは別タスクとして扱うのが無難。 |

---

## 4. 実施ステップ案（推奨順序）

1. **H-5**（`canDock` リネーム）— 影響範囲が最小、まず安全に着手できる。
2. **H-4**（`spaceContext` API統一）— 影響範囲が限定的。
3. **H-3**（スポーン処理共通化）— 動作確認：初期配置・撃破後の再出現・増援出現の3パターンをそれぞれプレイして確認。
4. **H-2**（ゲージ更新ヘルパー化）— 見た目に直結するため、リファクタ後に全ゲージ（自機シールド/エネルギー、基地シールド）の色変化・幅変化を目視確認。
5. **H-1**（移動ロジック統合）— 最も影響範囲が広く、操舵アルゴリズムの核心部分。差分を小さく保ちながら、以下を必ず確認：
   - 障害物（星・基地・敵・連邦艦）への衝突/回避
   - ドッキング成功/解除
   - エネルギー不足時の停止
   - 迂回ルート探索（斜め移動）
6. **M-1 / M-2**（ログ・色定数）— 挙動に影響しない置換なので、まとめて実施可能。
7. **M-3**（グローバル状態集約）— 参照箇所が多いため、置換漏れがないかの確認（`grep` 等で `g_turn` 等の全参照箇所を洗い出してから着手）。
8. **M-4**（JSDoc）— 随時追記でよい。
9. **L-1〜L-4** — 別途、必要に応じて着手を判断。

---

## 5. 注意点・リスク

- **DOM `id`/`class` は一切変更しない**（HTML/CSSは別レイヤーとして既に確定済みのため）。
- **数値バランス（ダメージ計算、士気、シールド回復率など）は一切変更しない**。今回はあくまで構造上の重複解消・可読性向上が目的。
- 特に **H-1（移動ロジック統合）** は敵AI・連邦艦AI・プレイヤー操作の全てに関わる中枢ロジックのため、他の項目より慎重に、小さい差分ごとにブラウザで実際にプレイして確認しながら進めることを推奨。
- 各ステップ後の確認シナリオ（最低限）：
  - 通常移動・障害物回避
  - 敵への攻撃（命中/射程外/障害物あり）
  - 基地へのドッキング/解除
  - 自機シールド回復操作
  - 敵撃破 → 新規敵出現
  - 増援出現（`NEW_ENEMY_INTERVAL` / `NEW_FEDERATION_INTERVAL`）
  - ミッションクリア → ハイスコア登録 → ハイスコア一覧からの続行
  - ゲームオーバー（基地陥落/自機撃破/エネルギー切れ）
