# Implementation Plan: conductor 規約への適合リファクタリング

対象: `index.html` (v0.3.17 / 2,636行)。行番号はすべて v0.3.17 時点のもの。
各タスクの末尾に、根拠となる規約を `〔…〕` で示す。

**進め方:** [Workflow](../workflow.md) に従う。着手時に `[ ]` → `[~]`、完了時に `[x]` + コミットハッシュ7桁。
フェーズ完了時は[確認シナリオ](../workflow.md#確認シナリオ)を全項目実行し、ユーザーの承認を得てからチェックポイントを作る。

**フェーズは risk の低い順に並べている。順番を入れ替えないこと。**

---

## Phase 1: 不要なものの削除 [checkpoint: c95a8c5]

コミット種別: `refactor:` / 参照ゼロを `grep` で確認済みのため、挙動は変化しない。

- [x] Task: 未参照の static プロパティ `Star.R` (1276行) / `EnemyShip.R` (1342行) / `FederationShip.R` (1465行) を削除する。`GameObj.get r()` (740行) があるため実際には使われていない。※ `StarBase.R` `PlayerShip.R` は使用中のため残す 〔JS: 不要なものを残さない〕 [f21256a]
- [x] Task: 未参照のゲッター `GameObj.get src_r()` (736行) を削除する 〔JS: 同上〕 [f21256a]
- [x] Task: 未参照のメソッド `GameObjs.removeFederation()` (665行) を削除する。※ `getObstacles()` (670行) も未参照だが Phase 5 で `clampDest()` と統合するため、ここでは削除しない 〔JS: 同上〕 [f21256a]
- [x] Task: `setMsg()` の未使用引数 `bg` (521行) と、それに依存する 543行の分岐（`(bg !== "#444") ? bg : "transparent"`）を削除する。4引数で呼んでいる箇所は存在しない 〔JS: 不要なものを残さない〕 [f21256a]
- [x] Task: `setMsg()` の JSDoc (515〜520行) を実際の引数（`from` / `msg` / `fg`）に合わせて書き直す 〔JS: JSDoc〕 [f21256a]
- [x] Task: `dockShip()` 直前 (2016〜2018行) の重複した空 JSDoc を1つにする 〔JS: 中身のない JSDoc を残さない〕 [3c88e56]
- [x] Task: ファイル全体の空 JSDoc（19箇所。477 / 717 / 754 / 814 / 1232 / 1286 / 1539 / 1890 / 1945 / 2182行 ほか）に説明を書く。「何をするか」ではなく「なぜそうするか」を書く 〔JS: JSDoc〕 [3c88e56]
- [x] Task: 動作しないボタン `#misc1` (338行) を HTML から削除する。JS からの参照が一切なく、押しても何も起きない 〔HTML/CSS: 不要なものを残さない / Product Guidelines: 常時表示は必要最小限に〕 [ee1ace4]
- [x] Task: 対応する DOM 要素が存在しない CSS ルール `#creditUI` (154〜163行) を削除する 〔HTML/CSS: 対応する要素が存在しない CSS ルールを残さない〕 [ee1ace4]
- [x] Task: CSS からも JS からも参照されていない `id` 属性（`#turn` 308行 / `#statusShip1` 315行 / `#statusShip2` 320行 / `#shipCount1` 330行 / `#shipCount2` 334行、および実施時に追加で発見した `#statusBase` / `#statusFederationShip` / `#statusEnemyShip`）を削除する。要素とレイアウトは維持する 〔HTML/CSS: どちらからも参照されない id を残さない〕 [ee1ace4]
- [x] Task: 対応する要素が存在しない CSS セレクタ `#statusPanel .game-version` (73行) を削除する。※計画外。確認作業で HTML の id / class と CSS セレクタを機械的に突き合わせて発見した 〔HTML/CSS: 対応する要素が存在しない CSS ルールを残さない〕 [08adb5b]
- [x] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md) [c95a8c5]

---

## Phase 2: 潜在的な不具合の修正 [checkpoint: 6dcaf47]

コミット種別: `fix:` / **Phase 1 とは別コミットにする**（種別が異なるため）。

- [x] Task: `gameOver()` (2478行) の `setTimeout()` を `scene.time.delayedCall()` に置き換える。現状はシーン再起動時に停止できず、前のミッションのハイスコア画面が後から開く可能性がある。`nextMission()` (2460行) は既に `delayedCall` を使っており、そちらに合わせる。※ `gameOver()` は scene を受け取っていないため、`gameState.curScene` を経由するか引数を追加する 〔JS: Phaser の作法 — setTimeout / setInterval を使わない〕 [233d094]
- [x] Task: `saveHighScore()` (2508行) の `localStorage.setItem()` を `try` / `catch` で保護する。プライベートブラウジングや容量超過で例外が飛ぶと、ミッションクリア処理が中断する。読み込み側 `loadHighScores()` (2482行) は既に保護されている 〔Tech Stack: 読み込みは必ず失敗を想定します〕 [39703da]
- [x] Task: `renderHSTable()` (2527行) の `s.gameid == GAME_ID` を `===` にする。両辺とも文字列のため結果は変わらない 〔JS §4: Always use identity operators〕 [4f39a4f]
- [x] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md) [6dcaf47]

---

## Phase 3: 定数と実行時状態の分離 [checkpoint: c1fa9b0]

コミット種別: `refactor:`

- [x] Task: `QTY.ENEMY` を「初期値の定数」と「現在値の状態」に分ける。`gameState.enemyQty` を新設し、`nextMission()` の `QTY.ENEMY++` (2454行) とハイスコア再開時の `QTY.ENEMY = 3 + (...)` (2553行) を状態側の更新に変更する。`create()` (1785行) の参照も合わせる 〔JS: 定数と実行時状態を混ぜない / const オブジェクトを実行時に書き換えない〕 [a471350]
- [x] Task: 上記に伴い、2553行のマジックナンバー `3` を初期値の定数参照に置き換える 〔JS: マジックナンバーを置かない〕 [a471350]
- [x] Task: トップレベルの `let CurZoom` (420行) を `gameState` へ移す。命名も `CONSTANT_CASE` から `lowerCamelCase` にする 〔JS: グローバル変数を増やさない / §6 Naming〕 [a471350]
- [x] Task: トップレベルの `let rangeGraphics, boundaryGraphics` (464行) を `gameObjs` の管理下に移す 〔JS: グローバル変数を増やさない〕 [a471350]
- [x] Task: バージョン番号を `VERSION` 定数として JS 側に定義し、起動時に `.game-title` (305行) へ流し込む。現状は HTML にハードコードされており、リリースのたびに手で書き換えている 〔Workflow: バージョン更新〕 [f6e9471]
- [x] Task: ゲーム状態のリセット処理を `GameState` のメソッドに集約する。現在はハイスコア行クリック (2544〜2567行) と RESTART ボタン (2617〜2628行) がそれぞれ個別に `gameState` を書き換えており、リセットする項目が食い違っている。`resetForNewMission()` / `resumeFrom(record)` を新設して呼び出し側から状態代入を無くす。**現状の挙動（`pendingScene` が無いときは `location.reload()` する等）は変えない** 〔JS: グローバル変数を増やさない（状態の所有者を明確にする）〕 [c25df00]
- [x] Task: `create()` 内のイベント登録 (1810〜1811行) を `.onclick =` から `addEventListener` に統一する。※ `create()` は `scene.restart()` で再実行されるため、その場で置き換えるとハンドラが多重登録される。他のボタンと同じくトップレベルへ移した 〔HTML/CSS: 構造・見た目・振る舞いを混ぜない（一貫性）〕 [f6e9471]
- [x] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md) [c1fa9b0]

---

## Phase 4: 意味のある名前を与える [checkpoint: 76dc70c]

コミット種別: `refactor:` / **表示される色・文言・閾値の数値は一切変えない。**

- [x] Task: ログの色を意味で定義する。`setMsg()` の呼び出しに散在する `"#0ff"` `"#ff0"` `"#f00"` `"#0f0"` `"#8ff"` `"#88f"` `"#f40"` `"#fff"` を、`MSG_COLOR.INFO` / `.WARN` / `.DANGER` / `.GOOD` などの定数に置き換える 〔Product Guidelines: 色は意味を持たせる／色名を直接書かない〕 [f5af387]
- [x] Task: ログの発信者名を定数化する。`"操舵手"` `"戦術士官"` `"機関部"` `"通信士"` `"副長"` `"基地"` `"司令部"` `"コンピュータ"` を `SPEAKER` 定数にまとめる。Product Guidelines の担当表と1対1で対応させる 〔Product Guidelines: 発信者を必ず名乗らせる〕 [f5af387]
- [x] Task: ビームの色 (1370 / 1496 / 1431 / 1446行) を各クラスの `static` プロパティまたは色定数へ移す。外した弾の `0x444444` も含める。※ シールド円・射程円・境界・ドッキング表示の色も同種のため `DRAW_COLOR` にまとめた 〔JS: マジックナンバーを置かない / Product Guidelines: 色は意味を持たせる〕 [2caf342]
- [x] Task: シールド表示の閾値に名前を与える。`ObjWithShield.update()` (795 / 798行) の `0.5` / `0.25`、`updateGaugeDisplay()` (2404行) の `0.3` を定数化する 〔JS: マジックナンバーを置かない〕 [2caf342]
- [x] Task: 報告の閾値に名前を与える。`EnemyShip.onAfterAttack()` (1376〜1390行) の `60` / `30`、`finalizeEnemyTurn()` (2391行) のエネルギー警告 `30` を定数化する 〔JS: 同上〕 [2caf342]
- [x] Task: 移動判定の閾値に名前を与える。`resolveMovement()` (973行) と `resolveStuckAvoidance()` (2108行) の「ほぼ動けていない」判定 `10`、直進で足りるとみなす比率 `0.95` (946 / 990行) を定数化する。**値そのものは変えない**。※ `clampDest()` の停止マージン `1.5` は `SpaceShip.STOP_MARGIN` として実施済み [1d57cea] 〔JS: 同上〕 [2caf342]
- [x] Task: `setMsg()` のログ保持行数 `50` (550行) を定数化する 〔JS: 同上〕 [2caf342]
- [x] Task: Conductor - User Manual Verification 'Phase 4' (Protocol in workflow.md) [76dc70c]

---

## Phase 5: 責務の分離 [checkpoint: 10c5b72]

コミット種別: `refactor:` / **本 Track で最もデリケートなフェーズ。1タスクごとに動作確認する。**

- [x] Task: `NPCShip.getFleeThreats()` を新設し、`npcMove()` (2264〜2267行) の逃走時の脅威判定から `instanceof` 分岐を除く。敵艦は「自機と基地」から、連邦艦は「敵艦」から逃げる 〔JS: 艦種による分岐〕 [44f3c1a]
- [x] Task: `NPCShip.canDockAtBase()` を新設し（既定 `false`、`FederationShip` で `true`）、`npcMove()` の分岐を置き換える。※ ドッキング修正 [b142ad0 / b5e0272] で `instanceof` は `canUseDock` 変数に集約済み。この変数をメソッド化する作業になる 〔JS: 同上〕 [44f3c1a]
- [x] Task: `NPCShip.onLeaveArea()` を新設し、`npcMove()` (2296〜2311行) の宇宙域離脱時処理（連邦艦＝メッセージと減点、敵艦＝残存艦の士気低下とメッセージ）を各クラスへ移す。**減点値・士気の増減値は変えない** 〔JS: 同上〕 [44f3c1a]
- [x] Task: `npcMove()` (2244〜2334行、約90行) を「移動先の決定」と「移動完了後の後処理」に分割する（例: `resolveNpcDestination()` / `onNpcMoveComplete()`）〔JS: 呼び出し側を単純に保つ〕 [bfba497]
- [x] Task: 「連邦側かどうか」の判定を `isFriendly()` メソッドに切り出す（`GameObj` 既定 `false`、`PlayerShip` / `FederationShip` で `true`）。`fireBeam()` (2191行) と `update()` (1835〜1837行) の重複した判定式を置き換える 〔JS: 艦種による分岐〕 [44f3c1a]
- [x] Task: `SpaceShip.clampDest()` (882〜893行) が自前で組み立てている障害物リストを、`GameObjs.getObstacles()` (670行) に統合する。`getObstacles({ ignore, includePlayer })` のようにオプション化する。リストの順序は結果に影響しない（最小 `t` を求めるだけ）。※ 実装では `includePlayer` を設けず、`ignore` に自分自身を渡す形にした（動く側から見た障害物は常に「自分以外のすべて」のため）〔JS: 不要なものを残さない（未参照メソッドの解消）〕 [f3f33e9]
- [x] Task: 上記に伴い `clampDest()` (891行) の `instanceof FederationShip || instanceof EnemyShip` を置き換える。※ `ignore` に自分自身を渡す設計にしたことで、`instanceof` 自体が不要になった 〔JS: 艦種による分岐〕 [f3f33e9]
- [x] Task: `GameObjs.purgeInactive()` を新設し、`finalizeEnemyTurn()` (2340行) の配列直接書き換え `gameObjs.enemies = gameObjs.enemies.filter(...)` を置き換える。配列の書き換えを `GameObjs` の中に閉じる 〔JS: 状態の所有者を明確にする〕 [9ba658f]
- [x] Task: `finalizeEnemyTurn()` (2353 / 2371行) の生の `filter(e => e.active).length` を、既存の `getActiveEnemyCount()` (480行) に置き換える 〔JS: 重複の排除〕 [9ba658f]
- [x] Task: `handlePointerDown()` のエネルギー枯渇チェック (1960〜1967行 / 1988〜1993行) を共通のヘルパーに集約する。差はメッセージ文言のみ。**2種類の文言はそのまま維持する** 〔JS: 重複の排除〕 [9ba658f]
- [x] Task: `spirit` / `fear()` / `isFleeing()` を `ObjWithShield` (778 / 824 / 831行) から `NPCShip` へ移す。現状は `StarBase` と `PlayerShip` も継承しているが、これらが士気を使うことはない 〔JS: 振る舞いの差はクラス側に持たせる〕 [9ba658f]
- [x] Task: Conductor - User Manual Verification 'Phase 5' (Protocol in workflow.md) [10c5b72]

---

## Phase 6: 純粋関数の切り出し

コミット種別: `refactor:` / **テストの導入は行わない。** 将来導入できる状態を作る。

- [x] Task: 武器の威力減衰 (`Weapon.Effectiveness()` / `CalcDamage()` / `MaxRange()`) が、グローバル状態を参照しない純粋な計算になっていることを確認し、そうでない箇所があれば引数経由に改める。※ 確認の結果、元から純粋だったため変更なし 〔Tech Stack: テスト導入の条件〕 [f16e5b9]
- [x] Task: 幾何計算（`intersectSegmentCircle()` 1897行 / `hasObstacleOnPath()` 1914行）が `gameObjs` に依存しないことを確認する。`isLOSBlocked()` (1931行) はグローバル参照を含むため、純粋部分と分ける（`isPathBlockedBy()` として切り出し）〔Tech Stack: 同上〕 [f16e5b9]
- [x] Task: スコア増減のロジックを、`gameState` を直接書き換える形から「増減値を返す関数 + 適用箇所」に整理する。`takeDamage()` (838行) / `npcMove()` (2298行) / `finalizeEnemyTurn()` (2353〜2354行) / `nextMission()` (2441行) に散在している。※ 適用側は `GameState.addScore()` に集約 〔Tech Stack: 同上 / Product Guide: スコアの考え方〕 [f16e5b9]
- [x] Task: 切り出した純粋関数群を `<script>` 内の1箇所にまとめ、「ここはグローバル状態に依存しない」とコメントで明示する 〔Tech Stack: 同上〕 [f16e5b9]
- [~] Task: Conductor - User Manual Verification 'Phase 6' (Protocol in workflow.md)

---

## Phase 7: 命名規約の統一 [checkpoint: 82a55c3]

コミット種別: `style:` / **差分が大きいため、他の変更と絶対に混ぜないこと。** 1項目ずつ全置換して確認する。

- [x] Task: `Weapon` クラスのメソッド名を `lowerCamelCase` にする。`EffectiveRange()` → `effectiveRange()` (696行、呼び出し 1840行) / `MaxRange()` → `maxRange()` (700行、呼び出し 1206 / 1429 / 1844行) / `Effectiveness()` → `effectiveness()` (707行、呼び出し 713行) / `CalcDamage()` → `calcDamage()` (712行、呼び出し 1156 / 1444行) 〔JS §6: Methods are lowerCamelCase〕
- [x] Task: `Weapon` のフィールド `max_power` / `area_r` を `maxPower` / `areaR` にする 〔JS §6: Fields are lowerCamelCase〕
- [x] Task: `PlayerShip.is_docked` を `isDocked` にする（参照箇所が多いため単独で実施）〔JS §6〕
- [x] Task: ゲージ関連フィールド `shield_gauge` / `shield_circle` / `shield_gauge_color` / `energy_gauge` / `energy_gauge_color` / `gauge_h` / `gauge_w` / `gauge_y` を `lowerCamelCase` にする 〔JS §6〕
- [x] Task: `energy_p()` (1255行) を `energyPercent()` にする（既存の `shieldPercent()` と対にする）〔JS §6〕
- [x] Task: ローカル変数の `snake_case` を `lowerCamelCase` にする（`dist_target_to_base` / `target_is_base` / `speed_p` / `qty_enemies` / `qty_federation` / `t_shield_p` / `d_shield` / `energy_supply` ほか）〔JS §6〕
- [x] Task: `DEBUG = true` に切り替えて全ログが出力されることを確認する（改名漏れの検出）〔Workflow: デバッグ確認〕
- [x] Task: Conductor - User Manual Verification 'Phase 7' (Protocol in workflow.md) [82a55c3]

---

## Phase 8: 整形 [checkpoint: 4dd54c7]

コミット種別: `style:` / 最後に実施する。

- [x] Task: セミコロンの欠落を補う（572 / 2365 / 2425 / 2428行 ほか）〔JS §3: Every statement must be terminated with a semicolon〕 [30f3390]
- [x] Task: 再代入されない `let` を `const` にする。ただし `resolveMovement()` (932〜996行) 内は移動ロジックに差分が集中するため、Phase 5 の作業とは別に単独で行う 〔JS §4: Use const by default〕 [30f3390]
- [-] Task: ~~80桁を超える行を折り返す~~ **実施しない。** JS スタイルガイドのプロジェクト固有ルールが「80桁制限は目標として守るが、これのみを理由とした既存コードの一括修正は行わず、その行を触るときに合わせて直す」と定めており、この一括修正はそれに反するため。規約が計画より上位と判断した 〔JS §3: Column Limit 80〕
- [x] Task: `if ( cond )` と `if (cond)` の表記揺れを `if (cond)` に統一する 〔JS §3: Whitespace〕 [30f3390]
- [x] Task: CSS の `!important` (61 / 103行) を、詳細度で解決できるか検討し、可能なものを解消する。※ 2箇所とも解消し、ファイルから !important が消えた 〔HTML/CSS: !important を新規に追加しない／既存は順次解消〕 [30f3390]
- [x] Task: Conductor - User Manual Verification 'Phase 8' (Protocol in workflow.md) [4dd54c7]

---

## 完了後

- [x] Task: `metadata.json` の `status` を `done` に更新する
- [x] Task: この Track を `conductor/archive/` へ移動し、`conductor/index.md` の Tracks 一覧を更新する
- [x] Task: バージョンを更新し、`chore:` コミットを作る。※ 挙動は変わらないが、自動テストの導入という進め方の変化があったため v0.4.0 とした [bdd4251]
