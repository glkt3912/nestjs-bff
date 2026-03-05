# Node.js / TypeScript プロジェクトの Linter 構成

このドキュメントでは、ESLint を中心としたこのプロジェクトの Lint 設定の全体像を説明します。
なぜこの構成になっているのか、ルールの役割、よくある落とし穴を理解することを目的とします。

---

## 1. ESLint の基本概念

ESLint は JavaScript / TypeScript の静的解析ツール。コードを実行せずに問題を検出する。

| 用語 | 説明 |
|------|------|
| **Rule** | 個別の検査項目（例: `no-unused-vars`） |
| **Plugin** | ルールをまとめたパッケージ（例: `eslint-plugin-jest`） |
| **Config** | 複数のルール・プラグイン設定をまとめたもの |
| **Parser** | ESLint がコードを構文解析するツール（TypeScript では `@typescript-eslint/parser`） |

---

## 2. Flat Config（`eslint.config.mjs`）

ESLint v9 から **Flat Config** 形式が標準になった。旧来の `.eslintrc.js`（Eslintrc 形式）は非推奨。

### 旧形式 vs 新形式の比較

```js
// 旧: .eslintrc.js（Eslintrc 形式）
module.exports = {
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint'],
  rules: { '@typescript-eslint/no-explicit-any': 'off' },
};

// 新: eslint.config.mjs（Flat Config 形式）
import tseslint from 'typescript-eslint';
export default tseslint.config(
  ...tseslint.configs.recommendedTypeChecked,
  { rules: { '@typescript-eslint/no-explicit-any': 'off' } },
);
```

### Flat Config の特徴

- **単一の配列**：設定オブジェクトを配列で並べるだけ。後の要素が前の要素を上書きする
- **`files` フィールド**：特定ファイルにのみ適用できる（例: `*.spec.ts` のみ）
- **ESM 形式**：`import` / `export default` を使う（`.mjs` 拡張子）

---

## 3. このプロジェクトの ESLint 構成

`eslint.config.mjs` の全体構成：

```js
export default tseslint.config(
  { ignores: ['eslint.config.mjs'] },           // 自身を除外
  eslint.configs.recommended,                    // ESLint 基本ルール
  ...tseslint.configs.recommendedTypeChecked,    // TypeScript 型チェックルール
  eslintPluginPrettierRecommended,               // Prettier フォーマット統合
  {
    languageOptions: { /* TypeScript パーサー設定 */ },
  },
  {
    rules: { /* プロジェクト固有のオーバーライド */ },
  },
  {
    files: ['**/*.spec.ts'],
    plugins: { jest: jestPlugin },
    rules: {
      '@typescript-eslint/unbound-method': 'off',
      'jest/unbound-method': 'error',
    },
  },
);
```

### 各レイヤーの役割

| レイヤー | パッケージ | 役割 |
|----------|-----------|------|
| 基本 | `eslint` | `no-unused-vars` などの汎用ルール |
| TypeScript | `typescript-eslint` | TypeScript 型情報を使った高度な検査 |
| Prettier | `eslint-plugin-prettier` | フォーマット違反を ESLint エラーとして報告 |
| Jest | `eslint-plugin-jest` | テストファイル専用ルール |

---

## 4. TypeScript ESLint（`typescript-eslint`）

`@typescript-eslint` プラグインは TypeScript の型情報を ESLint に提供する。

### `recommendedTypeChecked` を使う理由

```js
...tseslint.configs.recommendedTypeChecked,
// ↑ 型情報が必要なルール（型チェックあり）を一括で有効化
// 例: @typescript-eslint/unbound-method（型ありで初めて動く）
```

型チェックあり設定を使うには `parserOptions.projectService: true` が必要：

```js
parserOptions: {
  projectService: true,         // tsconfig.json を自動探索
  tsconfigRootDir: import.meta.dirname,
}
```

### 主要なルール

| ルール | 説明 | このプロジェクトの設定 |
|--------|------|----------------------|
| `no-explicit-any` | `any` 型の使用を禁止 | `off`（型推論を許容） |
| `no-floating-promises` | `await` なしの Promise を警告 | `warn` |
| `no-unsafe-argument` | `any` 型の引数を警告 | `warn` |
| `unbound-method` | 非バインドメソッド参照を禁止 | テストファイルは `off`（後述） |

---

## 5. `unbound-method` 問題と `eslint-plugin-jest`

### 問題の本質

TypeScript の `@typescript-eslint/unbound-method` ルールは、クラスメソッドを **`this` からデタッチして参照** することを禁止する。

```typescript
class Logger { info(msg: string) {} }
const logger = new Logger();

const fn = logger.info; // 危険: this が失われる
fn('test');             // → TypeError（実行時）
```

しかし Jest のモックメソッドを `expect()` に渡すとき、見た目は同じパターンになる：

```typescript
const mockLogger = { info: jest.fn() } as jest.Mocked<PinoLogger>;

// これが @typescript-eslint/unbound-method に誤検知される
expect(mockLogger.info).toHaveBeenCalled();
//     ^^^^^^^^^^^^^ "this" からデタッチされている → ルール違反と判定
```

`jest.fn()` は `this` に依存しないため実際には安全だが、ESLint は型レベルで判別できない。

### 解決策：`eslint-plugin-jest` の `jest/unbound-method`

`eslint-plugin-jest` は Jest のモック型（`jest.Mock` / `jest.Mocked<T>`）を認識する専用ルールを提供する：

```js
// テストファイルでのみ適用
{
  files: ['**/*.spec.ts'],
  plugins: { jest: jestPlugin },
  rules: {
    '@typescript-eslint/unbound-method': 'off',   // 元のルールを無効化
    'jest/unbound-method': 'error',                // jest 対応版で置き換え
  },
}
```

`jest/unbound-method` は `jest.Mocked<T>` のメソッドは「安全なデタッチ」として許容し、
通常のクラスメソッドのデタッチは引き続き検出する。

### 移行前後の比較

```typescript
// 移行前: spec ファイルに eslint-disable コメントが散在
// eslint-disable-next-line @typescript-eslint/unbound-method
expect(mockLogger.info).toHaveBeenCalled();

// 移行後: コメント不要
expect(mockLogger.info).toHaveBeenCalled();
```

---

## 6. `eslint-plugin-jest` の設定パターン

プラグインには複数の設定プリセットが用意されている：

| プリセット | 内容 |
|-----------|------|
| `flat/recommended` | 推奨ルール一式（`no-done-callback` なども含む） |
| `flat/all` | 全ルール |
| `flat/style` | スタイルルールのみ |

このプロジェクトでは **プリセットを使わず個別ルールのみ** を有効化している。
`flat/recommended` を使うと既存の `done` コールバックパターン（`jest/no-done-callback`）などが
一括で有効化され、既存コードに影響を与えるため。

---

## 7. Prettier との統合

`eslint-plugin-prettier` は Prettier のフォーマットを ESLint ルールとして扱う。

```js
// フォーマット違反が ESLint エラーになる
"prettier/prettier": ["error", { endOfLine: "auto" }]
// endOfLine: "auto" → OS 改行コード（CRLF/LF）の違いを無視
```

`npm run lint` に `--fix` が含まれているため、自動修正が走る：

```json
// package.json
"lint": "eslint \"{src,apps,libs,test}/**/*.ts\" --fix"
```

---

## 8. よくある落とし穴

### `recommendedTypeChecked` は型情報が必要

型チェックなしの環境（IDE の一部設定）で `recommendedTypeChecked` を使うとエラーになる。
`parserOptions.projectService: true` が正しく設定されているか確認すること。

### `eslint-disable` はルールの誤検知を示すサイン

`// eslint-disable-next-line` が増えてきたら、それは：
1. ルールの誤検知 → プラグイン or 設定の見直し
2. 本当に問題のあるコード → 修正が必要

コメントで抑制するより根本的に解決する方が保守しやすい。

### `files` スコープを活用する

テストファイルと本番コードで異なるルールを適用できる：

```js
// 本番コードでは厳しいルール
{ rules: { '@typescript-eslint/unbound-method': 'error' } }

// テストファイルでは jest 専用ルールに差し替え
{ files: ['**/*.spec.ts'], rules: { 'jest/unbound-method': 'error' } }
```

---

## 9. Lint の実行方法

```bash
# 全ファイルを検査（--fix で自動修正）
npm run lint

# 特定ファイルのみ
npx eslint src/shared/interceptors/logging.interceptor.ts

# 修正せず問題のみ表示
npx eslint src/ --no-fix-dry-run
```

---

## 関連ドキュメント

- [テスト戦略](./testing-strategy.md) — Jest モックパターン
- [開発ガイド](./development.md) — モジュール追加手順
