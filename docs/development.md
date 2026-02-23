# 開発ガイド

## 新しいエンドポイントの追加手順

### 1. バックエンドの変更を取り込む

```bash
npm run gen:all
```

内部で実行されること：

1. `swagger.json` をバックエンドから取得
2. `openapi-generator-cli` で `src/generated/` を再生成
3. `prettier` で整形
4. `tsc --noEmit` で型チェック → バックエンド変更がコンパイルエラーとして即座に検出される

### 2. モジュールを作成

```bash
nest g module <name>
nest g controller <name>
nest g service <name>
```

### 3. Service を実装

```typescript
@Injectable()
export class ExampleService {
  constructor(@Inject(DEFAULT_API) private readonly api: DefaultApi) {}

  // try-catch 不要 — AxiosError は AxiosExceptionFilter が処理する
  async findAll(): Promise<ExampleDto[]> {
    const { data } = await this.api.getExamples();
    return data;
  }
}
```

### 4. フロントエンドからの入力がある場合は手書きリクエスト DTO を作成

```typescript
// src/example/dto/create-example.request.ts
export class CreateExampleRequest {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsEmail()
  email: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  count?: number;
}
```

### 5. レスポンス DTO を作成（Over-fetching 防止）

```typescript
// src/example/dto/example.response.ts
import { Expose } from 'class-transformer';

export class ExampleResponse {
  @Expose() id?: number;
  @Expose() title: string;
  @Expose() email: string;
  // @Expose() がないフィールドはフロントエンドに届かない
}
```

### 6. Service で plainToInstance を使用

```typescript
import { plainToInstance } from 'class-transformer';
import { ExampleResponse } from './dto/example.response';

async findAll(): Promise<ExampleResponse[]> {
  const { data } = await this.api.getExamples();
  return plainToInstance(ExampleResponse, data, { excludeExtraneousValues: true });
}
```

### 7. Controller を実装

```typescript
@Controller('examples')
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Get()
  findAll(): Promise<ExampleResponse[]> {
    return this.exampleService.findAll();
  }

  @Post()
  create(@Body() dto: CreateExampleRequest): Promise<ExampleResponse> {
    return this.exampleService.create(dto);
  }
}
```

## コード生成スクリプト

| コマンド | 説明 |
| ------- | ---- |
| `npm run gen:all` | swagger 取得 → 生成 → 整形 → 型チェック（通常はこれだけ） |
| `npm run gen:fetch` | swagger.json の取得のみ |
| `npm run gen:client` | 生成 + prettier 整形（取得済みの swagger.json から再生成） |

## 検証手順

### ValidationPipe（400 が返ること）

```bash
curl -X POST http://localhost:3000/api/users \
  -H "Content-Type: application/json" \
  -d '{"name": "Alice", "email": "not-valid"}'
```

### AxiosExceptionFilter（バックエンドの 404 が透過マッピングされること）

```bash
curl http://localhost:3000/api/users/99999
# → {"statusCode": 404, "path": "/api/users/99999", "message": "...", "timestamp": "..."}
```

### ヘルスチェック

```bash
# バックエンド起動中
curl http://localhost:3000/health
# → {"status": "ok", "info": {"backend": {"status": "up"}}, ...}

# バックエンド停止中
curl http://localhost:3000/health
# → 503 + {"status": "error", "error": {"backend": {"status": "down", ...}}}
```

詳細は [docs/health-check.md](./health-check.md) を参照してください。

## ファイル構造の規約

```text
src/
└── <feature>/
    ├── <feature>.module.ts
    ├── <feature>.controller.ts
    ├── <feature>.service.ts             ← try-catch なし、plainToInstance でフィルタリング
    └── dto/
        ├── create-<feature>.request.ts  ← 手書き、class-validator 必須
        └── <feature>.response.ts        ← 手書き、@Expose() で公開フィールドを明示
```

生成コードは `src/generated/` に置かれ `.gitignore` 対象です。
コードレビュー対象にはなりません。
