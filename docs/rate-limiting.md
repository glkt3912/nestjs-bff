# レート制限

## 概要

`@nestjs/throttler` を用いて BFF の全エンドポイントに対してレート制限を適用します。
同一 IP から一定時間内にリクエストが集中した場合、HTTP 429 Too Many Requests を返します。

## 仕組み

```text
フロントエンド
    │
    ▼
ThrottlerGuard (APP_GUARD)
    │ IP ごとにリクエスト数をカウント
    │ 制限超過 → 429 Too Many Requests
    │ 制限以内 → 処理を続行
    ▼
Controller → Service → バックエンド API
```

`ThrottlerGuard` は `APP_GUARD` としてグローバル登録されているため、
**すべてのエンドポイントに自動適用**されます。個別の `@UseGuards()` は不要です。

## 設定

環境変数で制限値を変更できます。

| 環境変数 | 説明 | デフォルト値 |
|---|---|---|
| `THROTTLE_TTL` | カウントウィンドウ（ミリ秒） | `60000`（1分） |
| `THROTTLE_LIMIT` | ウィンドウ内の最大リクエスト数 | `100` |

### 設定例

```env
# 30秒間に50リクエストまで許可
THROTTLE_TTL=30000
THROTTLE_LIMIT=50
```

## 特定エンドポイントで制限を変更する

`@Throttle()` デコレータで個別にオーバーライドできます。

```typescript
import { Throttle } from '@nestjs/throttler';

@Controller('users')
export class UsersController {
  // このエンドポイントは 10秒間に5リクエストまで
  @Throttle({ default: { ttl: 10000, limit: 5 } })
  @Post()
  create(@Body() dto: CreateUserRequest) {
    return this.usersService.create(dto);
  }
}
```

## 特定エンドポイントをレート制限から除外する

```typescript
import { SkipThrottle } from '@nestjs/throttler';

@SkipThrottle()
@Get('health')
check() { ... }
```

## 制限超過時のレスポンス

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json

{
  "statusCode": 429,
  "message": "ThrottlerException: Too Many Requests"
}
```

## 実装箇所

| ファイル | 変更内容 |
|---|---|
| `src/app.module.ts` | `ThrottlerModule.forRootAsync` 登録・`APP_GUARD` 設定 |
| `.env.example` | `THROTTLE_TTL` / `THROTTLE_LIMIT` 追記 |
