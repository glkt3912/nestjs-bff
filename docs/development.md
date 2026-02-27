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

## ファイルアップロードエンドポイントの追加

通常の JSON エンドポイントと異なり、`multipart/form-data` を扱うには以下の追加手順が必要です。
`src/users/` に参照実装があります。

### 1. Module に MulterModule を追加

`UPLOAD_MAX_FILE_SIZE` 環境変数でサイズ上限を設定します。

```typescript
// src/<feature>/<feature>.module.ts
import { MulterModule } from '@nestjs/platform-express';

@Module({
  imports: [
    MulterModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: config.get<number>('UPLOAD_MAX_FILE_SIZE', 10 * 1024 * 1024),
        },
      }),
    }),
  ],
  controllers: [ExampleController],
  providers: [ExampleService],
})
export class ExampleModule {}
```

### 2. Controller に FileInterceptor を追加

```typescript
import { Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';

@Post('upload')
@UseInterceptors(FileInterceptor('file'))  // フォームフィールド名を指定
uploadFile(
  @UploadedFile() file: Express.Multer.File,
): Promise<{ filename: string; size: number }> {
  return this.exampleService.uploadFile(file);
}
```

`FileInterceptor('file')` が `multipart/form-data` からファイルを取り出し、メモリ（`file.buffer`）に格納します。
Module の MulterModule 設定が適用されるため、Controller 側にサイズ上限を再指定する必要はありません。

### 3. Service でバックエンドへ転送

```typescript
import { HttpService } from '@nestjs/axios';

async uploadFile(
  file: Express.Multer.File,
): Promise<{ filename: string; size: number }> {
  // FormData に詰め替えてバックエンドへ転送
  const form = new FormData();
  form.append(
    'file',
    new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
    file.originalname,
  );
  // axios が Content-Type: multipart/form-data; boundary=... を自動付与する
  const { data } = await this.httpService.axiosRef.post<{
    filename: string;
    size: number;
  }>('/upload', form);
  return data;
}
```

**ポイント：`Content-Type` の boundary について**

`multipart/form-data` の `Content-Type` には `boundary`（各パーツの区切り文字）が含まれます。

```
Content-Type: multipart/form-data; boundary=----WebKitFormBoundary7MA4YWxk
```

ネイティブの `FormData` を axios に渡すと、axios が boundary を自動で生成して `Content-Type` に設定します。
手動で `Content-Type` を上書きすると boundary が失われてバックエンドがパースできなくなるため、設定しないのが正しい実装です。

### フロー図

```
フロント
  │  POST /api/<feature>/upload
  │  Content-Type: multipart/form-data; boundary=xxx
  │  (バイナリデータ)
  ▼
BFF
  │  FileInterceptor がファイルをメモリ（buffer）に取り出す
  │  → Controller → Service
  │  → FormData を再構築
  │  → LoggingInterceptor: bodyLogged: false でログ記録
  ▼
バックエンド
     POST /upload
     Content-Type: multipart/form-data; boundary=yyy（axios が自動付与）
     (バイナリデータ)
```

### 注意事項

| 項目 | 説明 |
|------|------|
| メモリ使用量 | `FileInterceptor` はデフォルトでファイルをメモリに展開する。大容量ファイルは `diskStorage` の使用を検討する |
| `Buffer` → `Uint8Array` | `new Blob([file.buffer])` は TypeScript の型エラーになる。`new Uint8Array(file.buffer)` を使う |
| 環境変数 `UPLOAD_MAX_FILE_SIZE` | バイト単位。デフォルト 10 MB（= 10 × 1024 × 1024） |

---

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
