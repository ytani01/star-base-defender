# Starbase Defender — リファクタリング計画 (2026-07-28)

対象: `index.html`（v0.3.17 / 全2636行、うち `<script>` は 379〜2633行）

## 0. 前提: 前回計画 (`20260727a-refactoring-plan.md`) の実施状況

前回計画はほぼ完了している。現在の `develop` (v0.3.17) を読み直して確認した結果:

| 前回項目 | 状況 |
|---|---|
| 1. `console.log` → `DEBUG` + `debugLog()` | **完了**（432〜441行に定義、全箇所置換済み） |
| 2-1. `attemptPlayerMove()` の二段階迂回 | **完了**（`computeDesiredMove` / `resolvePlayerDestination` / `resolveStuckAvoidance` に分割、`precomputedDirectDest` で二重計算も解消） |
| 2-2. `resolveMovement()` の可読性 | **完了**（意図コメント追加済み。探索アルゴリズム自体は不変） |
| 2-3. `getTargetVector()` の `FederationShip` 分岐 | **完了**（`getAttractionTargets()` のオーバーライドに分離） |
| 3-1. 敵スポーン処理の重複 | **完了**（`spawnEnemy()` に集約、3箇所とも置換） |
| 3-2. `gameObjs.enemies` の直接書き換え | **一部残**（`finalizeEnemyTurn()` 2340行は直接 `filter` のまま） |
| 3-3. `updateStatus()` のゲージ更新反復 | **完了**（`updateGaugeDisplay()`） |
| 3-4. 円と線分の交差判定の重複 | **完了**（`intersectSegmentCircle()`） |
| 4. 死んだコード・残骸の整理 | **ほぼ完了**（`#misc1` ボタンのみ未対応） |

よって本計画は、**前回の残件 + 今回あらためて洗い出した項目**で構成する。

---

## 1. 方針・制約（前回から継続）

- **ファイル分割なし。単一 `index.html` 構成を維持。**
- **ゲームバランスに関わる数値（ダメージ計算・士気・シールド回復率・移動探索の刻み幅など）は一切変えない。**
- **画面上の見た目・DOM構造・CSS設計トークンは、明示的に「削除対象」と判断したものを除き変更しない。**
- プレイヤー移動が**意図的に**回避ベクトル（`getAvoidanceVector`）を使わない設計である点を維持する。
- 観点は「死んだコード」「命名の不統一」「責務の混在」「状態管理の分散」による可読性・保守性の低下の解消。

---

## 2. フェーズ1: 死んだコード・未使用要素の削除（最低リスク）

いずれも**参照ゼロ**を `grep` で確認済み。挙動に影響しない。

### 2-1. 未使用の static プロパティ

| 場所 | 内容 | 参照数 |
|---|---|---|
| 1276行 | `Star.R` | 0 |
| 1342行 | `EnemyShip.R` | 0 |
| 1465行 | `FederationShip.R` | 0 |

`GameObj` に `get r()`（740行）があるため、これらの static は実際には使われていない。
※ `StarBase.R`（1291行）と `PlayerShip.R`（1544行）は 2076・2144・1864行で使用中のため**残す**。

### 2-2. 未使用のメソッド・ゲッター

| 場所 | 内容 | 備考 |
|---|---|---|
| 736行 | `GameObj.get src_r()` | 参照ゼロ |
| 665行 | `GameObjs.removeFederation()` | 参照ゼロ。ただし `addFederation()` と対になる API なので、2-3 の判断と合わせて「残す/消す」を決める |
| 670行 | `GameObjs.getObstacles()` | 参照ゼロ。`clampDest()` が同等のリストを自前で組み立てている（→ 3-1 で統合を検討） |

### 2-3. 未使用の HTML 要素・CSS ルール

| 場所 | 内容 |
|---|---|
| 338行 | `<button class="panel-btn" id="misc1">----</button>` — JS からの参照が一切なく、押しても何も起きないボタンが常時表示されている。**削除する。** |
| 154〜163行 | `#creditUI { ... }` — 対応する DOM 要素が HTML 内に存在しない（クレジット表示は `.game-credits`）。**削除する。** |
| 315/320/330/334行 | `#statusShip1` `#statusShip2` `#shipCount1` `#shipCount2` `#turn` — CSS からも JS からも参照されていない id。`#statusPanel div` の一括スタイルだけが効いている。**id 属性のみ削除**（要素・レイアウトは維持）。 |

### 2-4. 使われていない引数

- `setMsg(from, msg, fg, bg)` の **`bg` 引数**（521行）: 4引数で呼んでいる箇所はゼロ。
  さらに 543行の `(bg !== "#444") ? bg : "transparent"` は、渡されない値に対する特殊分岐で意味を失っている。
  → `bg` 引数と当該分岐を削除し、`line.style.backgroundColor` の設定自体を廃止する。

### 2-5. 重複・空の JSDoc

- 2016〜2018行: `dockShip()` の直前に**空の JSDoc ブロックが二重**に付いている。片方を削除。
- ファイル全体で**中身が空の JSDoc が19箇所**ある（例: 477、717、754、814、1232、1286、1539、1890、1945、2182行など）。
  → 「1行で説明を書く」か「削除する」かのどちらかに統一する。スタイルガイド（全 public 関数に JSDoc）に従い、**説明を書いて埋める**方針を推奨。

---

## 3. フェーズ2: 重複ロジックと責務の整理

### 3-1. 障害物リスト生成の二重実装

`SpaceShip.clampDest()`（882〜893行）は障害物リストを自前で組み立てているが、`GameObjs.getObstacles()`（670行）がほぼ同じことをしている（そして未使用）。

- 相違点は 2つだけ:
  - `clampDest()` は `gameObjs.player` を「NPCのときだけ」対象に含める（891行の `instanceof` 判定）。
  - `getObstacles()` は `player` を一切含めない。
- 対応案: `getObstacles({ ignore = [], includePlayer = false })` のようにオプション引数を持たせて一本化する。
  リストの**順序は結果に影響しない**（最小 `t` を求めるだけ）ため、置換前後で結果は一致する。
- 併せて 891行の `instanceof FederationShip || instanceof EnemyShip` は、`NPCShip` かどうかの判定に置き換えられる（両クラスとも `NPCShip` を継承しているため等価）。

### 3-2. 「生存数カウント」のヘルパー未使用

`getActiveEnemyCount()`（480行）が定義済みなのに、`finalizeEnemyTurn()` では生の `filter().length` が使われている。

| 場所 | 現状 |
|---|---|
| 2340行 | `gameObjs.enemies = gameObjs.enemies.filter(e => e.active);` |
| 2353行 | `gameState.score -= gameObjs.enemies.filter(e => e.active).length;` |
| 2371行 | `const qty_enemies = gameObjs.enemies.filter(e => e.active).length;` |

- 2340行は「非アクティブな敵を配列から掃除する」処理。`GameObjs` 側に `purgeInactive()` のようなメソッドを設けて、配列の書き換えを `GameObjs` の中に閉じる。
- 2353・2371行は `getActiveEnemyCount()` に置き換える（2340行の掃除直後なので結果は同一）。

### 3-3. エネルギー枯渇チェックの重複

`handlePointerDown()` 内で、ほぼ同じ判定＋`gameOver()` 呼び出しが**2回**書かれている（1960〜1967行 と 1988〜1993行）。差はメッセージ文言のみ。

```js
if (gameObjs.player.energy < PlayerShip.ENERGY_MIN && !gameObjs.player.is_docked) { ... }
```

→ `checkEnergyDepleted(msg)` のようなヘルパーに集約し、真偽値を返して呼び出し側で `return` する形にする。文言は引数で渡し、現状の2種類のメッセージをそのまま維持する。

### 3-4. `npcMove()` の肥大化と艦種分岐

`npcMove()`（2244〜2334行、約90行）が「移動先の決定」と「移動完了後の後処理」を一つの関数に抱えており、さらに `instanceof` による艦種分岐が4箇所に散っている。

| 行 | 分岐内容 |
|---|---|
| 2251 | `npc instanceof FederationShip` — 基地ドッキング可否 |
| 2265 | `npc instanceof FederationShip` — 逃走時の脅威対象（連邦艦は敵から、敵艦はプレイヤー・基地から逃げる） |
| 2296 | `npc instanceof FederationShip` — 宇宙域離脱時のメッセージ・減点 |
| 2300 | `npc instanceof EnemyShip` — 宇宙域離脱時の士気低下・メッセージ |

対応案（数値・メッセージは不変）:
1. **関数分割**: `resolveNpcDestination(npc, context)`（移動先決定）と `onNpcMoveComplete(npc, context, isDocking)`（境界判定・シールド/士気回復）に分ける。
2. **ポリモーフィズム化**: 2265行の脅威リストを `NPCShip.getFleeThreats()` として各クラスにオーバーライドさせる。2296/2300行の離脱時処理は `NPCShip.onLeaveArea()` にする。2251行のドッキング可否は `NPCShip.canDockAtBase()`（既定 `false`、`FederationShip` で `true`）にする。
3. 前回 `getAttractionTargets()` で行った分離と同じパターンなので、設計の一貫性も上がる。

### 3-5. `fireBeam()` / `update()` の「味方判定」重複

- 2191行: `srcObj === gameObjs.player || srcObj instanceof FederationShip`
- 1835〜1837行: `obj === gameObjs.player || obj instanceof FederationShip`

同じ「連邦側かどうか」の判定が2箇所にある。`isFriendly()` のようなメソッド（`GameObj` 既定 `false`、`PlayerShip`/`FederationShip` で `true`）に切り出す。

### 3-6. ゲーム再開処理の重複と不整合

「ハイスコア表の行クリックで続きから再開」（2544〜2567行）と「RESTART ボタン」（2617〜2628行）が、どちらも `gameState` を個別にリセットしている。

- 行クリック側は `isGameOver` / `flagClear` / `pendingScene` まで戻すが、RESTART ボタン側は `turn` と `isPlayerTurn` しか戻さない（`pendingScene` の有無で分岐し、無ければ `location.reload()` に頼っている）。
- 状態リセットの責務が UI イベントハンドラに散っており、項目の追加漏れが起きやすい構造。
- → `GameState` にメソッドを追加して集約する:
  - `resetForNewMission()`（ミッション開始時の共通リセット）
  - `resumeFrom(record)`（ハイスコア記録からの再開）
- **注意**: 現状の挙動（RESTART が `pendingScene` 無しのとき `location.reload()` する等）は維持したうえで、状態代入だけを集約する。挙動変更を伴う統一は別タスクとする。

---

## 4. フェーズ3: 命名規約の統一（機械的・広範囲）

`conductor/code_styleguides/javascript.md`（Google JS Style Guide）に対する、現コードの最大の乖離。**snake_case と lowerCamelCase が混在**している。

### 4-1. メソッド名（UpperCamelCase → lowerCamelCase）

`Weapon` クラスのメソッドがクラス名と同じ記法になっている。

| 現在 | 変更後 | 呼び出し箇所 |
|---|---|---|
| `EffectiveRange()` | `effectiveRange()` | 1840行 |
| `MaxRange()` | `maxRange()` | 1206, 1429, 1844行 |
| `Effectiveness()` | `effectiveness()` | 713行 |
| `CalcDamage()` | `calcDamage()` | 1156, 1444行 |

### 4-2. フィールド名（snake_case → lowerCamelCase）

| 現在 | 変更後 |
|---|---|
| `max_power` / `area_r` | `maxPower` / `areaR` |
| `is_docked` | `isDocked` |
| `shield_gauge` / `shield_circle` / `shield_gauge_color` | `shieldGauge` / `shieldCircle` / `shieldGaugeColor` |
| `energy_gauge` / `energy_gauge_color` | `energyGauge` / `energyGaugeColor` |
| `gauge_h` / `gauge_w` / `gauge_y` | `gaugeH` / `gaugeW` / `gaugeY` |
| `energy_p()` | `energyPercent()`（`shieldPercent()` と対にする） |

### 4-3. ローカル変数

`dist_target_to_base`、`target_is_base`、`speed_p`、`qty_enemies`、`qty_federation`、`t_shield_p`、`d_shield`、`energy_supply`、`distToCenter` 周辺など、関数内のローカル変数にも snake_case が残っている。同時に lowerCamelCase へ統一する。

**進め方**: このフェーズは差分が大きくなるため、**他のフェーズと混ぜず単独のコミットにする**。1項目ずつ全置換 → 動作確認、を繰り返す。

---

## 5. フェーズ4: 状態管理・設定の整理

### 5-1. 「定数」が実行時に書き換えられている

`QTY` は `const` で宣言された設定オブジェクトだが、実際にはゲーム進行に応じて**書き換えられている**。

- 2454行: `QTY.ENEMY++;`（ミッションクリア時）
- 2553行: `QTY.ENEMY = 3 + (gameState.curMission - 1);`（ハイスコアからの再開時）

CONSTANT_CASE は不変値を表す規約であり、進行状態がここに混ざっているのは誤読の原因になる。

→ `QTY.ENEMY` を「初期値」として残し、現在値は `gameState.enemyQty` として `GameState` に移す。
   2553行の `3 + (curMission - 1)` という再計算式も、`QTY.ENEMY + (curMission - 1)` としてマジックナンバー `3` を消せる。

### 5-2. トップレベルの可変グローバル

| 場所 | 変数 |
|---|---|
| 420行 | `let CurZoom` — 命名も UpperCamelCase で規約違反（定数でも クラスでもない） |
| 464行 | `let rangeGraphics, boundaryGraphics` |

- `CurZoom` → `gameState.zoom` へ移動（または `curZoom` に改名）。
- `rangeGraphics` / `boundaryGraphics` は Phaser シーンに紐づく描画リソースなので、`gameObjs` 側にまとめるのが自然。

### 5-3. バージョン番号の二重管理

`v0.3.17` が HTML の 305行にハードコードされており、リリースのたびに手で書き換えている（`chore: バージョンを v0.3.xx に更新` のコミットが定常的に発生している）。

→ JS 側に `const VERSION = '0.3.17';` を置き、起動時に `.game-title` へ流し込む。書き換え箇所が1つになり、更新漏れがなくなる。

### 5-4. DOM 参照のキャッシュ

`updateStatus()`（2414行）は 1回の呼び出しで `document.getElementById()` を**10回以上**実行し、しかも1ターンに複数回呼ばれる。`setMsg()` も毎回 `logStatus` を引き直している。

→ 起動時に一度だけ引いて `const dom = { statusTurn: ..., ... }` に保持する。
   ※ 効果は「無駄な処理の削減」であり体感差は小さいので、優先度は低め。可読性の改善が主目的。

---

## 6. フェーズ5: スタイルガイド適合（低優先・機械的）

- **`==` の使用**: 2527行 `s.gameid == GAME_ID` → `===` に修正（両辺とも文字列のため結果は不変）。
- **セミコロン漏れ**: 572行、2365行、2425行、2428行 など。
- **80桁超え**: 75行が該当（2431〜2433、2105、2155行など）。折り返す。
- **`let` → `const`**: 再代入されない `let` が多数（`playBeamSound()`、`getTargetVector()`、`resolveMovement()` 内など）。※ `resolveMovement()` 内は差分が移動ロジックに集中するため、フェーズ2の作業と同時に行わないこと。
- **`if ( cond )` / `if (cond)` の空白の揺れ**: ファイル全体で不統一。どちらかに寄せる（Google 準拠なら `if (cond)`）。
- **CSS の `!important`**: 61行・103行の2箇所。セレクタの詳細度で解決できるか検討（`#statusPanel div` の一括 margin が原因なので、5-2 の id 整理と併せて見直せる）。

---

## 7. 実施順序

リスクの低い順に、**フェーズごとに独立したコミット**とする。

1. **フェーズ1（死んだコード削除）** — 参照ゼロを確認済み。挙動不変。
2. **フェーズ5の一部（`==`→`===`、セミコロン漏れ）** — 単独では意味が薄いので 1 に相乗り可。
3. **フェーズ4（状態管理・設定の整理）** — 影響範囲が限定的で、置換前後の等価性を確認しやすい。
4. **フェーズ2（重複ロジック・責務の整理）** — 3-4 の `npcMove()` 分割が最もデリケート。項目ごとに区切って確認する。
5. **フェーズ3（命名統一）** — 差分は最大だが機械的。最後にまとめて実施し、他の変更と混ぜない。
6. **フェーズ5の残り（整形）** — 最後。

---

## 8. 各ステップ後の確認シナリオ（最低限）

前回計画から継続。各フェーズ完了ごとに一通り実施する。

- 通常移動・障害物回避（コース調整メッセージの表示を含む）
- 敵への攻撃（命中 / 射程外 / 障害物あり）
- 基地へのドッキング / ドッキング解除（解除時の押し出し処理を含む）
- 自機シールド回復操作
- 敵撃破 → 新規敵出現（スコア減点の確認）
- 増援出現（`NEW_ENEMY_INTERVAL` = 25 / `NEW_FEDERATION_INTERVAL` = 40、連邦艦のドッキング判定含む）
- 敵・連邦艦の宇宙域離脱（メッセージ・士気変動）
- ミッションクリア → ハイスコア登録 → NEXT MISSION
- ハイスコア一覧の行クリックからの続行（敵の初期数が正しいか）
- ゲームオーバー3種（基地陥落 / 自機撃破 / エネルギー切れ）
- ズーム操作（1倍＝基地中心、2倍以上＝自機追従）
- 縦画面 / 横画面の両レイアウト

**フェーズ3（命名統一）実施時の追加確認**: `DEBUG = true` に切り替え、`debugLog()` 出力が全て正常に出ることを確認する（改名漏れの検出に有効）。
