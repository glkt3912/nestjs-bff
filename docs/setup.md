# セットアップ

## 必要な環境

- Node.js 18 以上
- npm
- Java（openapi-generator-cli の実行に必要）

## 初回セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集します。

```env
# バックエンド API の接続先
BACKEND_API_BASE_URL=http://localhost:8080

# swagger.json の取得先（gen:all スクリプト用）
BACKEND_SWAGGER_URL=http://localhost:8080/swagger.json

# バックエンド API キー（認証が必要な場合）
BACKEND_API_KEY=

# HTTP タイムアウト（ミリ秒）
HTTP_TIMEOUT=5000

# BFF サーバーのポート
PORT=3000
```

### 3. クライアントコードの生成

バックエンドが起動している状態で実行します。

```bash
npm run gen:all
```

`src/generated/` に TypeScript クライアントが生成されます。

### 4. 開発サーバーの起動

```bash
npm run start:dev
```

起動ログに以下が表示されることを確認します。

```
[HttpClient] → GET http://...   # LoggingInterceptor が機能している
[HttpClient] ← 200 http://...
```

## スクリプト一覧

| コマンド | 説明 |
| ------- | ---- |
| `npm run start:dev` | 開発サーバー起動（ウォッチモード） |
| `npm run build` | プロダクションビルド |
| `npm run start:prod` | プロダクション起動 |
| `npm run gen:all` | swagger 取得 → 生成 → 型チェック |
| `npm run test` | ユニットテスト |
| `npm run lint` | ESLint 実行 |

## トラブルシューティング

### `gen:all` が失敗する

- バックエンドが起動しているか確認
- `BACKEND_SWAGGER_URL` が正しいか確認
- Java がインスールされトているか確認（`java -version`）

### 型エラーが出る

`gen:all` 実行後に `tsc --noEmit` が失敗する場合、バックエンドの API が変更されています。
`src/users/users.service.ts` などの呼び出し箇所を更新してください。
