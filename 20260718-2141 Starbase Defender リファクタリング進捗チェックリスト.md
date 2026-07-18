
## Starbase Defender リファクタリング進捗チェックリスト

[[20260718-2017 Starbase Defender リファクタリング設計書]]

### Step 1: コンテキスト作成とグローバル変数の整理

オブジェクト管理を中央集権化し、グローバル変数の依存を減らします。

- [x] **1.1 `SpaceContext` クラスの機能拡充**
    
    - [x] 座標からオブジェクトを検索する `findObjectAt(x, y)` メソッドを実装する。
        
    - [x] 判定対象を返す `getObstacles(ignoreObj)` を整理・統合する。
        
- [x] **1.2 グローバル管理からの脱却**
    
    - [x] 散在しているグローバル参照（配列など）を、すべて `spaceContext` 経由の呼び出しに置換する。
        
- [x] **Step 1 完了条件（ファクトチェック）**
    
    - [x] ゲームを起動し、初期配置のオブジェクトが正常に描画されること。
        
    - [x] 従来通り、射線判定（LOS）や衝突判定が正しく機能していること。
        

### Step 2: 艦船クラスの階層構造の刷新

全艦船の基盤となる共通クラスを導入し、重複コードを削除します。

- [x] **2.1 基底クラスの追加**
    
    - [x] `ObjWithShield` を継承した `SpaceShip` クラスを実装する。
        
    - [x] `SpaceShip` を継承した NPC 用基底クラス `NPCShip` を実装する。
        
- [x] **2.2 既存クラスの継承元変更**
    
    - [x] `EnemyShip` と `FederationShip` の継承元を `NPCShip` に変更する。
        
    - [x] `PlayerShip` の継承チェーンが `SpaceShip` につながるように整理する。
        
- [x] **Step 2 完了条件（ファクトチェック）**
    
    - [x] 自機、敵艦、連邦艦のステータス（シールド、エネルギー、武器射程）が以前と変わらず初期化されていること。
        

### Step 3: 移動・物理ロジックのカプセル化

外部から強引に座標を操作するグローバル関数を廃止し、オブジェクト自身のメソッドにします。

- [x] **3.1 移動算出関数の `SpaceShip` への移動**
    
    - [x] グローバル関数 `clampDest` を `SpaceShip.prototype.clampDest` に変更し、`obj` 引数を `this` に置き換える。
        
    - [x] グローバル関数 `resolveMovement` を `SpaceShip.prototype.resolveMovement` に変更し、同様に `this` 化する。
        
- [x] **3.2 ステアリング計算の統合**
    
    - [x] `getTargetVector` と `getAvoidanceVector` を `SpaceShip` のメソッドに取り込む。
        
    - [x] `calculateDestination(targetPos, spaceContext)` を実装し、移動先算出ロジックを統合する。
        
- [x] **3.3 移動実行のメソッド化**
    
    - [x] Tween を実行して移動を行う `moveTo(targetPos, spaceContext)` を `SpaceShip` に実装する。
        
- [x] **Step 3 完了条件（ファクトチェック）**
    
    - [x] プレイヤーがクリックした座標へ自機が正常に移動すること。
        
    - [x] 障害物（星や基地）や他艦船を避けながら、めり込まずに停止・回り込みを行うこと。
        

### Step 4: ポリモーフィズムによる条件分岐（`instanceof` / `if`）の排除

クラスごとの振る舞いの違いをメソッドのオーバーライドで表現し、条件分岐を削除します。

- [x] **4.1 攻撃・ビーム描画の委譲**
    
    - [x] `NPCShip` に `attack(target)` と `getBeamColor()` を定義する。
        
    - [x] `FederationShip` と `EnemyShip` で `getBeamColor()` をオーバーライドし、それぞれのビーム色を返す。
        
    - [x] `npcAttack` 内のビーム色や攻撃の条件分岐を `attack(target)` 呼び出しへ置換する。
        
- [x] **4.2 NPC 戦術評価の委譲**
    
    - [x] `evalNPCTacticalSituation` の中の `instanceof` 分岐を、各クラスのメソッド（例: `evaluateTactics(spaceContext)`）に切り出す。
        
- [x] **4.3 クリック操作（インターアクト）の委譲**
    
    - [x] `StarBase`, `EnemyShip`, `PlayerShip` にそれぞれ `onInteract(player, spaceContext)` メソッドを実装する。
        
    - [x] `handlePointerDown` 内の巨大な `if (clickedObj === ...)` 分岐を削除し、`clickedObj.onInteract(...)` のポリモーフィックな呼び出しに置換する。
        
- [x] **Step 4 完了条件（ファクトチェック）**
    
    - [x] 基地クリックでドッキング / 移動が正しく行われること。
        
    - [x] 敵クリックで射程・障害物判定を伴う攻撃が正しく行われること。
        
    - [x] NPC ターン時に、連邦艦と敵艦がそれぞれの戦術に従って攻撃・追跡・撤退を行うこと。
        

### Step 5: クリーンアップと最終検証

リファクタリング後のコードの健全性を確認します。

- [ ] **5.1 不要コードの削除**
    
    - [ ] グローバルスコープに残った旧関数（`clampDest`, `resolveMovement`, `npcAttack` など）を完全に削除する。
        
- [ ] **5.2 最終テスト**
    
    - [ ] コンソールログにエラーや警告が出ていないか確認する。
        
    - [ ] ミッションクリアまでプレイし、増援の出現、スコア加算、ハイスコア保存など、ゲームループ全体が破綻なく動作することを検証する。
        

