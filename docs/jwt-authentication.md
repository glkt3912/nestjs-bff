# JWT 認証

## 概要

クライアント（フロントエンド）から BFF への HTTP リクエストに対して、JWT Bearer Token を検証します。
`JwtAuthGuard` を `APP_GUARD` としてグローバル登録することで、全エンドポイントに自動適用されます。

> **BFF→バックエンド間の認証**は別レイヤー（`AuthHeaderInterceptor`）で管理しており、本機能とは独立しています。

## 仕組み

```text
フロントエンド (JWT Bearer Token)
    │
    ▼
JwtAuthGuard (APP_GUARD)
    │ JWT_AUTH_ENABLED=false → 全通過
    │ @Public() → スキップ
    │ トークン検証失敗 → 401 Unauthorized
    ▼
Controller → Service → バックエンドAPI
                            ↑
                  AuthHeaderInterceptor（既存）
                  BFF→バックエンド認証は別レイヤー
```

`ThrottlerGuard` → `JwtAuthGuard` の順で `APP_GUARD` に登録されているため、
レート制限チェックの後に JWT 検証が行われます。

## 設定

| 環境変数 | 説明 | デフォルト値 |
|---|---|---|
| `JWT_AUTH_ENABLED` | `true` にすると JWT 検証を有効化 | `false` |
| `JWT_SECRET` | JWT 署名検証に使う秘密鍵 | （空） |
| `JWT_EXPIRES_IN` | トークン有効期限（JwtModule 発行時） | `3600s` |

### 設定例

```env
JWT_AUTH_ENABLED=true
JWT_SECRET=your-secret-key
JWT_EXPIRES_IN=3600s
```

> `JWT_AUTH_ENABLED=false`（デフォルト）の場合、`JWT_SECRET` が未設定でも起動できます。

## エンドポイントごとの制御

`@Public()` デコレータを付けたエンドポイントは、`JWT_AUTH_ENABLED=true` でも認証をスキップします。

```typescript
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  @Get()
  @HealthCheck()
  @Public() // 認証不要
  check() { ... }
}
```

## 認証エラー時のレスポンス

トークンが無効・期限切れ・未指定の場合、以下のレスポンスを返します。

```http
HTTP/1.1 401 Unauthorized
Content-Type: application/json

{
  "statusCode": 401,
  "message": "Unauthorized"
}
```

## 実装箇所

| ファイル | 内容 |
|---|---|
| `src/auth/decorators/public.decorator.ts` | `@Public()` デコレータ定義 |
| `src/auth/strategies/jwt.strategy.ts` | Passport JWT ストラテジー（トークン検証・ペイロード取得） |
| `src/auth/guards/jwt-auth.guard.ts` | `JwtAuthGuard`（有効/無効制御・`@Public()` スキップ） |
| `src/auth/auth.module.ts` | Auth モジュール定義 |
| `src/app.module.ts` | `AuthModule` インポート・`JwtAuthGuard` を `APP_GUARD` 登録 |
| `src/health/health.controller.ts` | ヘルスチェックに `@Public()` 追加 |
| `.env.example` | `JWT_AUTH_ENABLED` / `JWT_SECRET` / `JWT_EXPIRES_IN` 追記 |
