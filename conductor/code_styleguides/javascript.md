# Google JavaScript Style Guide Summary

This document summarizes key rules and best practices from the Google JavaScript Style Guide.

> **本プロジェクトでの適用については、末尾の[「プロジェクト固有の適用ルール」](#プロジェクト固有の適用ルール)を必ず参照してください。**
> 一部の項目（モジュール構成など）は、単一ファイル構成のため適用対象外です。

## 1. Source File Basics
- **File Naming:** All lowercase, with underscores (`_`) or dashes (`-`). Extension must be `.js`.
- **File Encoding:** UTF-8.
- **Whitespace:** Use only ASCII horizontal spaces (0x20). Tabs are forbidden for indentation.

## 2. Source File Structure
- New files should be ES modules (`import`/`export`).
- **Exports:** Use named exports (`export {MyClass};`). **Do not use default exports.**
- **Imports:** Do not use line-wrapped imports. The `.js` extension in import paths is mandatory.

## 3. Formatting
- **Braces:** Required for all control structures (`if`, `for`, `while`, etc.), even single-line blocks. Use K&R style ("Egyptian brackets").
- **Indentation:** +2 spaces for each new block.
- **Semicolons:** Every statement must be terminated with a semicolon.
- **Column Limit:** 80 characters.
- **Line-wrapping:** Indent continuation lines at least +4 spaces.
- **Whitespace:** Use single blank lines between methods. No trailing whitespace.

## 4. Language Features
- **Variable Declarations:** Use `const` by default, `let` if reassignment is needed. **`var` is forbidden.**
- **Array Literals:** Use trailing commas. Do not use the `Array` constructor.
- **Object Literals:** Use trailing commas and shorthand properties. Do not use the `Object` constructor.
- **Classes:** Do not use JavaScript getter/setter properties (`get name()`). Provide ordinary methods instead.
- **Functions:** Prefer arrow functions for nested functions to preserve `this` context.
- **String Literals:** Use single quotes (`'`). Use template literals (`` ` ``) for multi-line strings or complex interpolation.
- **Control Structures:** Prefer `for-of` loops. `for-in` loops should only be used on dict-style objects.
- **`this`:** Only use `this` in class constructors, methods, or in arrow functions defined within them.
- **Equality Checks:** Always use identity operators (`===` / `!==`).

## 5. Disallowed Features
- `with` keyword.
- `eval()` or `Function(...string)`.
- Automatic Semicolon Insertion.
- Modifying builtin objects (`Array.prototype.foo = ...`).

## 6. Naming
- **Classes:** `UpperCamelCase`.
- **Methods & Functions:** `lowerCamelCase`.
- **Constants:** `CONSTANT_CASE` (all uppercase with underscores).
- **Non-constant Fields & Variables:** `lowerCamelCase`.

## 7. JSDoc
- JSDoc is used on all classes, fields, and methods.
- Use `@param`, `@return`, `@override`, `@deprecated`.
- Type annotations are enclosed in braces (e.g., `/** @param {string} userName */`).

*Source: [Google JavaScript Style Guide](https://google.github.io/styleguide/jsguide.html)*

---

# プロジェクト固有の適用ルール

Starbase Defender は `index.html` にインラインで JavaScript を書く単一ファイル構成です
（理由と制約は [Tech Stack](../tech-stack.md) を参照）。上記の Google スタイルガイドを基本としつつ、
以下のとおり読み替えます。

## 適用対象外の項目

| 項目 | 理由 |
|---|---|
| §1 ファイル命名・拡張子 `.js` | 独立した `.js` ファイルを持たないため |
| §2 ES モジュール（`import` / `export`） | インラインスクリプトのため使用できない |

インラインスクリプトの先頭には `"use strict";` を必ず書きます。

## 読み替える項目

- **getter / setter（§4）:** Google は禁止していますが、本プロジェクトでは `GameObj` の
  座標委譲（`get x()` が内部の Phaser スプライトへ委譲する）など、既存設計の中核で使用しており**許容します**。
  ただし新規に増やす場合は、単なる値の読み書き以上の処理を隠さないこと（計算コストのある処理を
  プロパティアクセスの裏に置かない）。
- **80桁制限（§3）:** 目標として守ります。ただしこれのみを理由とした既存コードの一括修正は行わず、
  その行を触るときに合わせて直します。

## 追加ルール

### ログ出力

**`console.log()` を直接書かないこと。** 必ず `debugLog()` を使います。
`debugLog()` は `DEBUG` フラグ（既定 `false`）が `true` のときだけ出力します。
通常プレイ時にコンソールが埋まると、必要なときに必要なログを読めなくなるためです。

### 定数と実行時状態を混ぜない

- `CONSTANT_CASE` は**実行中に変化しない値**にのみ使います。
- ゲーム進行に応じて変わる値は `gameState`（進行状態）に、
  空間内のオブジェクトは `gameObjs`（オブジェクト管理）に置きます。
- `const` で宣言したオブジェクトのプロパティを実行時に書き換えないこと。
  `const` は再代入を防ぐだけで中身の変更は防げないため、読み手を誤解させます。

### グローバル変数を増やさない

トップレベルの `let` を新設しないこと。状態は `gameState` / `gameObjs` のいずれかに属させます。

### マジックナンバーを置かない

ゲームバランスに関わる数値は、対応するクラスの `static` プロパティか、
トップレベルの設定オブジェクトに名前を付けて定義します。
式の中に直接数値を書くのは、その場限りの計算（`/ 2`、`* 100` など意味が自明なもの）に限ります。

### Phaser の作法

- 遅延実行には `scene.time.delayedCall()` を使い、**`setTimeout` / `setInterval` を使わない**こと
  （シーン再起動時に停止できず、前のミッションの処理が残るため）。
- 移動アニメーションは `scene.tweens` を使います。

### 艦種による分岐

`instanceof` による分岐が複数箇所に散る場合は、基底クラスにメソッドを定義して
サブクラスでオーバーライドする形へ寄せます（例: `getAttractionTargets()`）。
振る舞いの差はクラス側に持たせ、呼び出し側を単純に保ちます。

### JSDoc

- **中身のない `/** */` を残さないこと。** 説明を書くか、削除するかのどちらかにします。
- 引数・戻り値がある関数には `@param` / `@return` を書きます。
- 「何をするか」はコードを読めばわかるので、**「なぜそうするのか」**を書きます。

### リファクタリング時の禁止事項

- ゲームバランスに関わる数値（ダメージ計算、士気の増減、シールド回復率、移動探索の刻み幅など）を
  リファクタリングのついでに変更しないこと。
- プレイヤーの移動は**意図的に**回避ベクトル（`getAvoidanceVector()`）を使いません。
  NPC の処理と共通化する際に、誤って追加しないこと。
