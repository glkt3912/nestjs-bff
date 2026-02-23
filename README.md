# nestjs-bff

NestJS で構築した BFF (Backend for Frontend)。外部サービスの Swagger 定義から TypeScript クライアントを自動生成し、バリデーション・ロギング・例外処理を共通化したテンプレートです。

## アーキテクチャ概要

```text
フロントエンド
    │
    ▼
NestJS BFF (port 3000)
    │  ・ValidationPipe    — 入力バリデーション（class-validator）
    │  ・AxiosExceptionFilter — バックエンドエラーを透過マッピング
    │  ・LoggingInterceptor   — リクエスト/レスポンスログ
    │  ・AuthHeaderInterceptor — 認証ヘッダー一元付与
    │
    ▼
バックエンド API（外部サービス）
```

### Axios インスタンス統合

```text
HttpModule.registerAsync()
    └─ HttpService.axiosRef (AxiosInstance)
            ├─ interceptors.request: LoggingInterceptor, AuthHeaderInterceptor
            └─ DefaultApiProvider (useFactory)
                    └─ new DefaultApi(config, basePath, axiosRef)
                            └─ 全 API リクエストに Interceptor が自動適用
```

## プロジェクト構造

```text
src/
├── main.ts                             # GlobalPipe / GlobalFilter 登録
├── app.module.ts
├── shared/
│   ├── shared.module.ts                # @Global() — HttpModule, Provider 公開
│   ├── filters/
│   │   └── axios-exception.filter.ts   # AxiosError → HttpException 変換
│   ├── interceptors/
│   │   ├── logging.interceptor.ts      # リクエスト/レスポンスログ
│   │   └── auth-header.interceptor.ts  # 認証ヘッダー一元付与
│   └── config/
│       └── axios-client.provider.ts    # DefaultApi の DI プロバイダー
├── generated/                          # 自動生成（.gitignore 対象）
│   ├── api/
│   └── models/
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   └── dto/
│       └── create-user.request.ts      # 手書き（class-validator 付き）
└── health/
    ├── health.module.ts
    └── health.controller.ts
```

## セットアップ

### 1. 依存パッケージのインストール

```bash
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env
```

`.env` を編集して接続先を設定します。

```env
BACKEND_API_BASE_URL=http://localhost:8080
BACKEND_SWAGGER_URL=http://localhost:8080/swagger.json
BACKEND_API_KEY=         # 任意
HTTP_TIMEOUT=5000
PORT=3000
```

### 3. クライアントコードの生成

バックエンドが起動している状態で実行します。

```bash
npm run gen:all
```

内部では以下を実行します。

1. `swagger.json` をバックエンドから取得
2. `openapi-generator-cli` で TypeScript クライアントを生成 (`src/generated/`)
3. `prettier` で生成コードを整形
4. `tsc --noEmit` で型チェック

個別実行も可能です。

```bash
npm run gen:fetch   # swagger.json 取得のみ
npm run gen:client  # 生成 + 整形のみ
```

### 4. 開発サーバー起動

```bash
npm run start:dev
```

## DTO の使い分け

| ケース | 方針 |
| ------ | ---- |
| フロントエンドからの入力（POST/PUT ボディ） | **手書きリクエスト DTO**（class-validator デコレータ必須） |
| バックエンドへのリクエストパラメータ | 生成型をそのまま使用 |
| Controller の戻り値型（レスポンス型） | **生成型を直接使用**（`UserDto` など） |
| 複数 API の集約レスポンス | 手書き DTO（extends or pick/omit で派生可） |

手書き DTO の例 (`src/users/dto/create-user.request.ts`):

```typescript
export class CreateUserRequest {
  @IsString() @IsNotEmpty() name: string;
  @IsEmail() email: string;
  @IsInt() @Min(0) @IsOptional() age?: number;
}
```

## 検証手順

### バリデーション確認（400 が返ること）

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "not-valid"}'
```

### AxiosExceptionFilter 確認（バックエンドの 404 が透過的にマッピングされること）

```bash
curl http://localhost:3000/api/users/99999
# → {"statusCode": 404, "path": "/api/users/99999", ...}
```

### ヘルスチェック

```bash
curl http://localhost:3000/api/health
# → {"status": "ok", "timestamp": "..."}
```

## スクリプト一覧

| コマンド | 説明 |
| ------- | ---- |
| `npm run start:dev` | 開発サーバー起動（ウォッチモード） |
| `npm run build` | プロダクションビルド |
| `npm run start:prod` | プロダクション起動 |
| `npm run gen:all` | swagger 取得 → クライアント生成 → 型チェック |
| `npm run gen:fetch` | swagger.json のみ取得 |
| `npm run gen:client` | クライアント生成 + prettier 整形 |
| `npm run test` | ユニットテスト |
| `npm run test:e2e` | E2E テスト |
| `npm run lint` | ESLint 実行 |

## 新しいエンドポイントの追加方法

1. バックエンドの Swagger が更新されたら `npm run gen:all` を再実行
2. 新しいモジュールを作成

   ```bash
   nest g module <name>
   nest g controller <name>
   nest g service <name>
   ```

3. Service で `@Inject(DEFAULT_API)` を使って生成クライアントを受け取る
4. フロントエンドからの入力がある場合は `dto/<name>.request.ts` を手書きで作成

```typescript
// service の例（try-catch 不要）
@Injectable()
export class ExampleService {
  constructor(@Inject(DEFAULT_API) private readonly api: DefaultApi) {}

  async findAll(): Promise<ExampleDto[]> {
    const { data } = await this.api.getExamples();
    return data;
  }
}
```
