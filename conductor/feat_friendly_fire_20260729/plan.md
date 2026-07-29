# Implementation Plan: 射線上の味方への誤射

対象: `index.html`、`tests.html`、`tests/`、`conductor/product.md`、`README.md`。

**進め方:** [Workflow](../workflow.md) に従う。着手時に `[ ]` → `[~]`、完了時に `[x]` + コミットハッシュ7桁。
`plan.md` の更新は別コミット（`conductor(plan): ...`）にする。
フェーズ完了時はユーザーの承認を得てからチェックポイントを作る。

**フェーズは「判定を作る → プレイヤーに効かせる → NPC に効かせる → 文書」の順。**
Phase 1 の判定を Phase 2・3 の両方が使う。ここが曖昧なままだと後段が信用できない。

**この Track はゲームバランスに影響する。** 挙動が変わるので、
リグレッションの突き合わせは「一致すること」ではなく
「変わったのが意図した部分だけであること」を見る。

---

## Phase 1: 射線上の最初の障害物を求める

コミット種別: `feat:` / まず純粋な計算だけを作り、テストで固める。

- [x] Task: 「純粋な計算」ブロックに `findFirstBlockerOnPath(src, dst, objs)` を作る。射線と交わる対象のうち、`src` に最も近いものを返す（無ければ `null`）。既存の `intersectSegmentCircle()` が返す `t1` を距離の順序として使い、`hasObstacleOnPath()` と同じ近傍の除外（`t < 0.05` / `t > 0.95`）を守る 〔spec: 恒星と味方の両方が射線上にある場合、手前が優先される〕 [965705e]
- [x] Task: `tests.html` に検査を足す。手前・奥の順序、射線から外れた対象を選ばないこと、始点と終点の近傍を拾わないこと、空リスト。**わざと順序を逆にして落ちることを確かめる**。※ 順序を逆にすると4件、近傍の除外を外すと1件が落ちることを確認 [965705e]
- [x] Task: Conductor - User Manual Verification 'Phase 1' (Protocol in workflow.md) [965705e]

---

## Phase 2: プレイヤーの誤射

コミット種別: `feat:`

- [x] Task: 艦種ごとに「巻き込んではいけない相手」を返す `getFriendlyFireTargets()` を追加する。`GameObj` に既定（空）、`PlayerShip` / `FederationShip` / `EnemyShip` でオーバーライドする。`instanceof` による分岐を呼び出し側に作らない 〔spec: 誰が「味方」か〕 [5c526c1]
- [x] Task: プレイヤーの攻撃（`EnemyShip.onInteract()`）で誤射を解決する。恒星・味方を合わせた中から最も手前のものを求め、恒星なら今までどおり無駄撃ち、味方ならその味方にダメージ。標的の敵には届かない 〔spec: プレイヤーの攻撃〕 [5c526c1]
- [x] Task: 基地を誤射の対象に含める。プレイヤーが基地越しに撃てる現状の非対称を解消する（`isLOSBlocked(player, this, false)` の `false`）〔spec: 決定事項 2〕 [5c526c1]
- [x] Task: 誤射のログを追加する。「遮られた」ではなく「味方に当てた」と分かる文面にする。発信者は戦術士官（攻撃の報告）〔product-guidelines: 発信者を必ず名乗らせる〕 [5c526c1]
- [x] Task: シナリオテストを追加する。味方越しに撃つと味方が減り敵は無傷、恒星が手前なら無駄撃ち、ドック内の味方は当たらない、エネルギーは消費する。**修正前のコードで失敗することを確かめる** [5c526c1]
- [~] Task: Conductor - User Manual Verification 'Phase 2' (Protocol in workflow.md)

---

## Phase 3: NPC が味方を撃たないようにする

コミット種別: `feat:`

- [ ] Task: `evaluateTactics()` で、射線上に味方がいる相手を「攻撃可能」から外す。判定は1箇所にまとめ、艦種ごとに分散させない 〔spec: NPC の行動〕
- [ ] Task: `SpaceShip.attack()` 側でも誤射を解決する。評価と実行がずれた場合（評価後に味方が動くなど）に、撃った結果が判定と食い違わないようにする
- [ ] Task: シナリオテストを追加する。味方が射線上にいる敵は攻撃されない、遮るものが無くなれば攻撃する、連邦艦が自機を巻き込む位置では撃たない。**修正前のコードで失敗することを確かめる**
- [ ] Task: 挙動の変化を確かめる。`node make-baseline.js 0.5.1` → `npx playwright test regression`。**一致しないのが正しい。** 差が出た箇所が誤射と回避だけであることを読む
- [ ] Task: Conductor - User Manual Verification 'Phase 3' (Protocol in workflow.md)

---

## Phase 4: 文書の更新

コミット種別: `docs:` / `conductor:`

- [ ] Task: `conductor/product.md` にメカニクスとして記述する。「味方は守る対象であり頼る対象でもある」との関係、位置取りの重みが増すこと 〔spec: 背景〕
- [ ] Task: `README.md` の「操作方法」と「コツ」に、誤射と、それを踏まえた立ち回りを書く
- [ ] Task: Track を `conductor/archive/` へ移し、`conductor/index.md` を更新する
- [ ] Task: Conductor - User Manual Verification 'Phase 4' (Protocol in workflow.md)

---

## 補足: この Track で気をつける点

- **プレイヤーの攻撃と NPC の攻撃は経路が別。** プレイヤーは
  `EnemyShip.onInteract()` の中で直接ダメージを与えており、
  NPC は `SpaceShip.attack()` を通る。誤射の解決を両方に効かせる必要があり、
  片方だけ直すと挙動が食い違う。共通の関数に寄せる。
- **`isLOSBlocked()` は消さない。** 恒星による遮蔽は今までどおり必要で、
  呼び出し元も2箇所ある。誤射の判定を足す形にする。
- **ドック内の味方**は当たらない。敵の標的から外れるのと同じ考え方
  （`getPotentialTargets()` が `isDocked` を見ている箇所と揃える）。
