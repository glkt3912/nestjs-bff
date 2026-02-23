# 開発用モック・スタブモード

## 概要

`MOCK_MODE=true` を設定するだけで、バックエンドなしに BFF を起動・動作確認できます。
`fixtures/` ディレクトリに置いた JSON ファイルをレスポンスとして返します。

## 使い方

### 1. 環境変数を設定

```env
MOCK_MODE=true
```

### 2. フィクスチャファイルを作成

`fixtures/` ディレクトリに `{HTTPメソッド}_{URLパス}.json` の形式でファイルを置きます。

```text
fixtures/
├── GET_users.json         # GET /users
├── GET_users_1.json       # GET /users/1
├── POST_users.json        # POST /users
└── DELETE_users_1.json    # DELETE /users/1
```

### 3. 開発サーバーを起動

```bash
MOCK_MODE=true npm run start:dev
```

### 4. 動作確認

```bash
curl http://localhost:3000/api/users
# → fixtures/GET_users.json の内容が返る（バックエンド不要）
```

## フィクスチャ命名規則

| リクエスト | フィクスチャファイル |
|---|---|
| `GET /users` | `fixtures/GET_users.json` |
| `GET /users/1` | `fixtures/GET_users_1.json` |
| `POST /users` | `fixtures/POST_users.json` |
| `PUT /users/1` | `fixtures/PUT_users_1.json` |
| `DELETE /users/1` | `fixtures/DELETE_users_1.json` |

URL の先頭 `/` は除去され、`/` は `_` に置換されます。

## 仕組み

```text
Axios リクエスト発生
    │
    ▼
MockInterceptor（request インターセプタ）
    │  URL を正規化してフィクスチャパスを解決
    │  ファイルあり → isMock エラーとしてリクエストをキャンセル
    │  ファイルなし → 実リクエストをそのまま通過
    ▼
MockInterceptor（response インターセプタ）
    │  isMock エラーを検知 → 正常レスポンスとして返却
    │  それ以外のエラー → そのまま伝播
    ▼
Service / Controller
```

`MOCK_MODE=true` のときのみインターセプタが登録されます。
フィクスチャが存在しないパスは実際のバックエンドへリクエストが飛ぶため、
**一部のエンドポイントだけモックにする**こともできます。

## 注意事項

- `fixtures/` ディレクトリはリポジトリに含めてよいですが、本番環境には不要です
- フィクスチャの JSON は実際のバックエンドレスポンスと同じ構造にしてください
- `MOCK_MODE` が `true` 以外（`false` や未設定）の場合はインターセプタは無効です

## 実装箇所

| ファイル | 変更内容 |
|---|---|
| `src/shared/interceptors/mock.interceptor.ts` | モックインターセプタ本体（新規） |
| `src/shared/shared.module.ts` | `MockInterceptor` を `providers` に追加 |
| `fixtures/GET_users.json` | サンプルフィクスチャ（新規） |
| `fixtures/GET_users_1.json` | サンプルフィクスチャ（新規） |
| `.env.example` | `MOCK_MODE=false` 追記 |
