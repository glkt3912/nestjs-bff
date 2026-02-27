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

### `@Public()` は独自実装

`@nestjs/passport` に相当するデコレータは存在しないため、NestJS 標準の `SetMetadata()` を使って独自実装しています。

```typescript
// src/auth/decorators/public.decorator.ts
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

デコレータはハンドラー（またはクラス）に `isPublic: true` というメタデータを付与するだけです。
`JwtAuthGuard` 側で `Reflector` を使ってそのメタデータを読み取り、`true` であればガードをスキップします。

```typescript
// jwt-auth.guard.ts（抜粋）
const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
  context.getHandler(), // メソッド単位で確認
  context.getClass(),   // クラス単位で確認
]);
if (isPublic) return true;
```

`getAllAndOverride` はメソッドとクラスの両方を確認し、どちらかに `@Public()` があればスキップします。
これは NestJS 公式ドキュメントで推奨されているパターンです。

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

## インフラとの統合：役割分担の考え方

k8s や API Gateway を使う構成では、JWT 検証が複数レイヤーで可能になるため、**どこで一度だけ検証し、下流はその結果を信頼するか**を決める必要があります。

### 認証が発生しうるレイヤー

```text
インターネット
    │
    ▼
① Ingress / API Gateway  （Kong, AWS API GW, Nginx 等）
    │  JWT 検証・レート制限・ルーティング
    ▼
② BFF（JwtAuthGuard）
    │  JWT 検証・@Public() 制御
    ▼
③ バックエンド Service
    │  認可（ロールベース等）・ビジネスロジック
```

### ケース別の推奨設定

| 構成 | 推奨設定 | 理由 |
| --- | --- | --- |
| API Gateway なし・BFF が直接公開 | `JWT_AUTH_ENABLED=true` | Gateway がないため BFF が検証を担う |
| API Gateway あり | `JWT_AUTH_ENABLED=false` | Gateway が検証済み。BFF で二重検証するのは CPU の無駄 |
| Service Mesh（Istio 等）あり | `AUTH_TYPE=none` | Pod 間の mTLS が BFF→バックエンド認証を代替するため |

### API Gateway がある場合の連携パターン

Gateway が検証済みのユーザー情報をヘッダで渡すのが一般的です。

```text
Gateway ──(X-User-Id: 123 を付与)──▶ BFF ──▶ Backend
         JWT_AUTH_ENABLED=false でBFFは検証しない
```

### `JWT_AUTH_ENABLED=false` がデフォルトである理由

インフラの成熟度に応じて責務を移譲できるようにするためです。

```text
初期（インフラ未整備）  → JWT_AUTH_ENABLED=true  でBFFが担う
API Gateway 導入後     → JWT_AUTH_ENABLED=false でGatewayに委譲
```

デフォルトを `false` にすることで、Gateway なしでも Gateway ありでも同じコードベースで動作し、テンプレートとしての汎用性を保っています。

### 認可（何をしていいか？）について

現在の実装は**認証（誰か？）のみ**を担います。JwtAuthGuard は検証後にペイロードを `req.user` に格納するだけで、バックエンドにユーザー情報を転送しません。そのため認可（このユーザーはこのリソースにアクセスしていいか？）は引き続きバックエンドが担います。

バックエンドにユーザー情報を渡したい場合は `AuthHeaderInterceptor` を拡張して `X-User-Id` 等のヘッダを付与する実装が必要です（本テンプレートのスコープ外）。

## 実装箇所

| ファイル | 内容 |
| --- | --- |
| `src/auth/decorators/public.decorator.ts` | `@Public()` デコレータ定義 |
| `src/auth/strategies/jwt.strategy.ts` | Passport JWT ストラテジー（トークン検証・ペイロード取得） |
| `src/auth/guards/jwt-auth.guard.ts` | `JwtAuthGuard`（有効/無効制御・`@Public()` スキップ） |
| `src/auth/auth.module.ts` | Auth モジュール定義 |
| `src/app.module.ts` | `AuthModule` インポート・`JwtAuthGuard` を `APP_GUARD` 登録 |
| `src/health/health.controller.ts` | ヘルスチェックに `@Public()` 追加 |
| `.env.example` | `JWT_AUTH_ENABLED` / `JWT_SECRET` / `JWT_EXPIRES_IN` 追記 |
