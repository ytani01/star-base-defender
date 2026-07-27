# Google HTML/CSS Style Guide Summary

This document summarizes key rules and best practices from the Google HTML/CSS Style Guide.

> **本プロジェクトでの適用については、末尾の[「プロジェクト固有の適用ルール」](#プロジェクト固有の適用ルール)を必ず参照してください。**
> 一部の項目（外部ファイルへの分離など）は、単一ファイル構成のため適用対象外です。

## 1. General Rules
- **Protocol:** Use HTTPS for all embedded resources.
- **Indentation:** Indent by 2 spaces. Do not use tabs.
- **Capitalization:** Use only lowercase for all code (element names, attributes, selectors, properties).
- **Trailing Whitespace:** Remove all trailing whitespace.
- **Encoding:** Use UTF-8 (without a BOM). Specify `<meta charset="utf-8">` in HTML.

## 2. HTML Style Rules
- **Document Type:** Use `<!doctype html>`.
- **HTML Validity:** Use valid HTML.
- **Semantics:** Use HTML elements according to their intended purpose (e.g., use `<p>` for paragraphs, not for spacing).
- **Multimedia Fallback:** Provide `alt` text for images and transcripts/captions for audio/video.
- **Separation of Concerns:** Strictly separate structure (HTML), presentation (CSS), and behavior (JavaScript). Link to CSS and JS from external files.
- **`type` Attributes:** Omit `type` attributes for stylesheets (`<link>`) and scripts (`<script>`).

## 3. HTML Formatting Rules
- **General:** Use a new line for every block, list, or table element, and indent its children.
- **Quotation Marks:** Use double quotation marks (`""`) for attribute values.

## 4. CSS Style Rules
- **CSS Validity:** Use valid CSS.
- **Class Naming:** Use meaningful, generic names. Separate words with a hyphen (`-`).
  - **Good:** `.video-player`, `.site-navigation`
  - **Bad:** `.vid`, `.red-text`
- **ID Selectors:** Avoid using ID selectors for styling. Prefer class selectors.
- **Shorthand Properties:** Use shorthand properties where possible (e.g., `padding`, `font`).
- **`0` and Units:** Omit units for `0` values (e.g., `margin: 0;`).
- **Leading `0`s:** Always include leading `0`s for decimal values (e.g., `font-size: 0.8em;`).
- **Hexadecimal Notation:** Use 3-character hex notation where possible (e.g., `#fff`).
- **`!important`:** Avoid using `!important`.

## 5. CSS Formatting Rules
- **Declaration Order:** Alphabetize declarations within a rule.
- **Indentation:** Indent all block content.
- **Semicolons:** Use a semicolon after every declaration.
- **Spacing:**
  - Use a space after a property name's colon (`font-weight: bold;`).
  - Use a space between the last selector and the opening brace (`.foo {`).
  - Start a new line for each selector and declaration.
- **Rule Separation:** Separate rules with a new line.
- **Quotation Marks:** Use single quotes (`''`) for attribute selectors and property values (e.g., `[type='text']`).

**BE CONSISTENT.** When editing code, match the existing style.

*Source: [Google HTML/CSS Style Guide](https://google.github.io/styleguide/htmlcssguide.html)*

---

# プロジェクト固有の適用ルール

Starbase Defender は `index.html` に CSS と JavaScript をインラインで書く単一ファイル構成です
（理由と制約は [Tech Stack](../tech-stack.md) を参照）。

## 適用対象外の項目

| 項目 | 理由 |
|---|---|
| §2「関心の分離」の外部ファイル化 | CSS・JS を外部ファイルにせず、`<style>` / `<script>` に置く。ただし**構造・見た目・振る舞いを混ぜない**という原則自体は守る（HTML に `style` 属性やインラインの `onclick` を書かない） |
| §4「宣言のアルファベット順」 | 関連する宣言をまとめたほうが読みやすいため、意味的なまとまりを優先する |

## 読み替える項目

- **ID セレクタでのスタイリング（§4）:** Google は非推奨としており、この方針に**新規のスタイルは従います**
  （見た目の指定には class を使う）。既存の `#statusPanel` などの ID ベースのスタイルは
  一括変更のリスクが大きいため現状維持とし、触るときに順次 class へ寄せます。
- **`!important` の禁止（§4）:** 新規に追加しないこと。既存の使用箇所は、詳細度で解決できるものから解消します。

## 追加ルール

### 色は変数を通す

- 色は `:root` のカスタムプロパティ（`--color-primary` など）として定義し、そこから参照します。
- 新しい色を追加する前に、既存の色の意味で表現できないか検討してください。
  色は装飾ではなく**意味**を持ちます（[Product Guidelines](../product-guidelines.md) 参照）。
- 16進数は可能なら3桁で書きます（`#0ff`）。

### モバイル対応

- **高さは `dvh` を使い、直前に `vh` のフォールバックを併記します。**
  ブラウザのツールバーの表示／非表示で可視領域の高さが変わるためです。
  ```css
  height: 100vh;  /* dvh未対応ブラウザ向けのフォールバック */
  height: 100dvh; /* 実際の可視高さ */
  ```
- サイズは固定値ではなく `clamp()` で指定し、画面幅に追従させます。
  **タップ対象は下限を 48px 以上にしてください。**
- 縦画面と横画面の切り替えは `@media (orientation: ...)` で行います。
  **どちらか一方を劣化版にしないこと。**
- 宇宙域（キャンバス）は `aspect-ratio: 1 / 1` で常に正方形を保ちます。

### HTML

- 意味に合った要素を使います。ボタンは `<button>`、見出しは見出し要素を使い、`<div>` で代替しません。
- **JavaScript から参照するためだけの `id`** と、**スタイルのための `class`** を区別します。
  どちらからも参照されない `id` を残さないこと。
- 属性値は二重引用符で囲みます。

### 不要なものを残さない

- 対応する要素が存在しない CSS ルールを残さないこと。
- 参照されていない `id` / `class` を残さないこと。
- 変更時は、対になる HTML と CSS の両方を確認してください。

### コメント

なぜその指定が必要なのかが自明でない場合（レイアウト崩れの回避、特定端末への対応など）は、
理由を日本語のコメントで残してください。値を見ただけでは意図が読み取れないためです。
