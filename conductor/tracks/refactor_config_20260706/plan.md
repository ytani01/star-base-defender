# Implementation Plan: オブジェクト設定変数のリファクタリング

## Phase 1: クラス変数の定義と移行
- [ ] Task: `PlayerShip` 関連の設定値（`OBJ_CONF.PLAYER`）を `PlayerShip` クラスの静的（static）プロパティとして定義し直す。
- [ ] Task: 敵艦（`EnemyShip` など）関連の設定値（`OBJ_CONF.ENEMY`）を各クラスの静的プロパティとして定義し直す。
- [ ] Task: `index.html` 内の `OBJ_CONF.PLAYER` を参照している全箇所を `PlayerShip` に置き換える。
- [ ] Task: `index.html` 内の `OBJ_CONF.ENEMY` を参照している全箇所を `EnemyShip` (等) に置き換える。
- [ ] Task: 不要になった旧設定オブジェクト（`OBJ_CONF`内の該当箇所）を削除する。
- [ ] Task: Conductor - User Manual Verification 'クラス変数の定義と移行' (Protocol in workflow.md)
