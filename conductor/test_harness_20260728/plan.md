# Implementation Plan: 自動テストの導入

対象: `tests.html`（新規）、`tests/`（新規）、`conductor/workflow.md`。
`index.html` には手を加えない。

**進め方:** [Workflow](../workflow.md) に従う。着手時に `[ ]` → `[~]`、完了時に `[x]` + コミットハッシュ7桁。
フェーズ完了時はユーザーの承認を得てからチェックポイントを作る。

**フェーズは依存の少ない順に並べている。** Phase 1 は依存ゼロで完結するため、
Playwright が使えない環境でも Phase 1 だけで価値が出る。

---

## Phase 1: 計算のテスト（依存なし）

コミット種別: `test:` / `index.html` には触れない。

- [x] Task: `tests.html` の骨格を作る。`index.html` を iframe で読み込み、その realm の関数を呼べるようにする。結果は成功／失敗の一覧として画面に出し、失敗時は期待値と実際の値を並べる 〔Tech Stack: tests.html は依存ゼロを保つ〕 [973fd06]
- [x] Task: 幾何計算のテストを書く。`intersectSegmentCircle()` の交差あり／なし／接する場合、`hasObstacleOnPath()` の始点・終点の近傍を遮蔽とみなさない境界、`isPathBlockedBy()` の空リスト・複数障害物 〔spec: 計算のテスト〕 [973fd06]
- [x] Task: スコア計算のテストを書く。`calcTurnPenalty()` / `calcShipLossPenalty()` / `calcMissionClearBonus()` の値と符号。Product Guide の「時間経過・撃破・味方の喪失は減点」「クリアは深いほど加点」と対応づける 〔Product Guide: スコアの考え方〕 [973fd06]
- [x] Task: 威力減衰のテストを書く。`Effectiveness()` が有効射程で 1/2、最大射程で `MAX_DAMAGE_RATIO` になること、`MaxRange()` がその定義と整合すること、`CalcDamage()` が距離とともに単調に減ること 〔Product Guide: 距離のジレンマ〕 [973fd06]
- [~] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md)

---

## Phase 2: シナリオテストの基盤 [checkpoint: 615c92c]

コミット種別: `test:` / **ここで決定性を確保する。** ここが甘いと以降が信用できない。

- [x] Task: `tests/package.json` と Playwright の設定を置く。`tests/node_modules` を `.gitignore` に追加する 〔Tech Stack: 公開されるものは増やさない〕 [191a503]
- [x] Task: テスト用のヘルパーを作る。`index.html` をキャッシュを避けて読み込み、起動前に `Math.random` を固定し、盤面が再現することを確かめる自己テストを含める 〔Tech Stack: シナリオテストを書くときの注意〕 [191a503]
- [x] Task: ターンの進行を待つ仕組みを、実時間の待ちに頼らない形にする。ヘッドレスで描画が間引かれてもタイマーが進むこと。※ 演出と予約された処理が片付くまで待つ形にした 〔Tech Stack: 同上〕 [191a503]
- [x] Task: 盤面と全オブジェクトの状態を取り出す関数を作る（座標・シールド・士気・ドッキング状態・スコア・ターン・ログ）〔spec: 変更前後の突き合わせ〕 [191a503]
- [x] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md) [615c92c]

---

## Phase 3: 基本操作とターン進行のテスト [checkpoint: d7a62b2]

コミット種別: `test:` / 確認シナリオの項目と1対1で対応させる。

- [x] Task: 基本操作（6項目）。移動と障害物の手前での停止、迂回、攻撃の命中／射程外／障害物あり、シールド回復、ドッキング、ドッキング中の攻撃不可と解除時の押し出し（9件） [84ef62d]
- [x] Task: ターン進行と戦況（7項目）。行動の順番、撃破時の減点と新たな敵の出現、撤退と士気の低下、敵の増援、連邦艦の増援、連邦艦のドッキング、逃走した敵の復帰（8件） [84ef62d]
- [x] Task: コンソールにエラー・警告が出ないことを、上記のテスト全体で確かめる [84ef62d]
- [x] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md) [d7a62b2]

---

## Phase 4: 決着と記録のテスト [checkpoint: 4dceb94]

コミット種別: `test:`

- [x] Task: 決着（7項目）。ミッションクリアとボーナス、NEXT MISSION での敵の増加、敗北3種、敗北時に記録されないこと、ハイスコアからの再開と敵の初期数 [14c8bf0]
- [x] Task: `localStorage` が使えない状況でもミッションクリアの処理が進むこと 〔Tech Stack: 読み込みは必ず失敗を想定します〕 [14c8bf0]
- [x] Task: 敗北直後にシーンを再起動しても、古いハイスコア画面が後から開かないこと（Phase 2 で直した不具合の再発防止）。※ 不具合のある版で実際に検出できることを確認済み [14c8bf0]
- [x] Task: Conductor - User Manual Verification 'Phase 4' (Protocol in workflow.md) [4dceb94]

---

## Phase 5: 表示のテスト [checkpoint: 7852884]

コミット種別: `test:`

- [x] Task: 複数の画面サイズを走査し、宇宙域が見切れないこと・正方形を保つこと・横スクロールが出ないことを確かめる。**画面の高さがステータス欄を除いた幅より大きい比率**を必ず含める（見切れの不具合を検出できる条件）。※ その条件が一覧に含まれていること自体もテストにした [6ddcbbc]
- [x] Task: 縦画面でステータス欄の占有が 40% を超えないこと、横画面でステータス欄が画面外へはみ出さないことを確かめる [6ddcbbc]
- [x] Task: タップ対象の大きさが下限を満たすことを確かめる。※ `#viewScoresBtn` は現状 48px 未満のため、テストは事実を記録する形にとどめ、修正は別途判断する。※ test.fail() で「既知の未達」として記録し、直したときに気づける形にした 〔Product Guidelines: タップ対象は最低 48px〕 [6ddcbbc]
- [x] Task: Conductor - User Manual Verification 'Phase 5' (Protocol in workflow.md) [7852884]

---

## Phase 6: 変更前後の突き合わせ [checkpoint: 223fc6c]

コミット種別: `test:` / リファクタリング時にリグレッションを検出するための仕組み。

- [x] Task: 2つの `index.html`（変更前・変更後）を同じ盤面・同じ操作列で走らせ、全状態の列を突き合わせるテストを作る。使い方をコメントに書く。※ 比較のもとは `make-baseline.js` で任意のリビジョンから取り出す [04e329c]
- [x] Task: 同一ファイル同士で必ず一致することを確かめる自己テストを入れる。これが通らない限り比較結果を信用しない [04e329c]
- [x] Task: Conductor - User Manual Verification 'Phase 6' (Protocol in workflow.md) [223fc6c]

---

## Phase 7: 文書の更新

コミット種別: `docs:`

- [x] Task: `conductor/workflow.md` の確認シナリオの各項目に、自動化済みかどうかの印を付ける。人が確かめるべき項目（実機スマホ・効果音・ブラウザ差異）を明示する。※ ズームの追従と `DEBUG` の出力も自動化していないため〈人〉とした [75ea25a]
- [x] Task: テストの動かし方を書く（`tests.html` は開くだけ、シナリオテストはコマンド）。置き場所は `conductor/workflow.md` と `CLAUDE.md` [75ea25a]
- [x] Task: `完了の定義` に、変更内容に対応する自動テストが通っていることを加える [75ea25a]
- [~] Task: Conductor - User Manual Verification 'Phase 7' (Protocol in workflow.md)

---

## 完了後

- [ ] Task: `metadata.json` の `status` を `done` に更新する
- [ ] Task: この Track を `conductor/archive/` へ移動し、`conductor/index.md` の Tracks 一覧を更新する
