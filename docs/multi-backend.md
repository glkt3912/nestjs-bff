# 複数バックエンドへの動的ルーティング

## 概要

マイクロサービス構成では複数のバックエンドサービスが存在します。
BFF では「どのパスはどのバックエンドに転送するか」をモジュール構造で表現し、
各バックエンド向け API クライアントを DI トークンで管理します。

---

## 設計の核心：パスプレフィックス = NestJS モジュール

「動的ルーティング」というと複雑な実行時処理をイメージしがちですが、
Thin BFF では **NestJS のモジュール構造がそのままルーティングテーブル** になります。

```
/api/users/*    → UsersModule    → UserService  (http://user-service:8080)
/api/orders/*   → OrdersModule   → OrderService (http://order-service:8080)
/api/products/* → ProductsModule → ProductService (http://product-service:8080)
```

各モジュールのコントローラーが担当パスを宣言し、
対応するバックエンドの API クライアントをインジェクトするだけです。

---

## 実装パターン

### 1. 環境変数（`.env`）

バックエンドごとに BaseURL を定義します。

```env
USER_SERVICE_BASE_URL=http://user-service:8080
ORDER_SERVICE_BASE_URL=http://order-service:8080
PRODUCT_SERVICE_BASE_URL=http://product-service:8080
```

### 2. API クライアントプロバイダーを定義

`createApiProvider()` ファクトリを使うと、ボイラープレートなしに各バックエンド向けの
DI プロバイダーを1行で定義できます。

```typescript
// src/orders/config/orders-api.provider.ts
import { createApiProvider } from '../../shared/config/axios-client.provider';
import { OrdersApi } from '../../generated/orders-api'; // バックエンドの Swagger から生成

export const ORDER_SERVICE_API = Symbol('ORDER_SERVICE_API');

export const OrderServiceApiProvider = createApiProvider(
  ORDER_SERVICE_API,
  'ORDER_SERVICE_BASE_URL',
  OrdersApi,
);
```

### 3. モジュールに登録

```typescript
// src/orders/orders.module.ts
@Module({
  providers: [OrderServiceApiProvider, OrdersService],
  controllers: [OrdersController],
})
export class OrdersModule {}
```

### 4. サービスでインジェクト

```typescript
// src/orders/orders.service.ts
@Injectable()
export class OrdersService {
  constructor(
    @Inject(ORDER_SERVICE_API) private readonly api: OrdersApi,
  ) {}

  async findAll(): Promise<OrderResponse[]> {
    const { data } = await this.api.getOrders();
    return plainToInstance(OrderResponse, data, { excludeExtraneousValues: true });
  }
}
```

---

## なぜ単一の HttpService.axiosRef を使うのか

`createApiProvider()` は内部で `httpService.axiosRef`（単一の Axios インスタンス）を
すべてのバックエンドで共有します。

```
[BFF]
  │
  ├── UsersModule    → DefaultApi   ──┐
  ├── OrdersModule   → OrdersApi   ──┤── 共通 axiosRef ──→ Interceptors ──→ 各バックエンド
  └── ProductsModule → ProductsApi ──┘
```

これにより、`LoggingInterceptor`・`AuthHeaderInterceptor`・`MockInterceptor` が
**すべてのバックエンドへのリクエストに自動で適用**されます。
バックエンドを追加しても横断的関心事の実装を重複させる必要がありません。

---

## `createApiProvider()` の仕組み

```typescript
export function createApiProvider<T>(
  token: symbol,        // DI トークン（例: ORDER_SERVICE_API）
  envKey: string,       // BaseURL の環境変数名（例: 'ORDER_SERVICE_BASE_URL'）
  ApiClass: ApiConstructor<T>,  // 生成された API クラス
): Provider {
  return {
    provide: token,
    inject: [HttpService, ConfigService],
    useFactory: (httpService: HttpService, configService: ConfigService) => {
      const basePath = configService.get<string>(envKey);
      const configuration = new Configuration({ basePath });
      return new ApiClass(configuration, basePath, httpService.axiosRef);
    },
  };
}
```

| 引数 | 役割 |
|------|------|
| `token` | `Symbol` で作成した DI トークン。モジュール間で衝突しない |
| `envKey` | `.env` の変数名。バックエンドごとに独立した URL を管理できる |
| `ApiClass` | Swagger から生成した API クラス。型安全性が保たれる |

---

## 既存の単一バックエンド構成との関係

`DefaultApiProvider` は `createApiProvider()` で実装されています。
単一バックエンドの場合は `DEFAULT_API` + `BACKEND_API_BASE_URL` のままで動作します。

```typescript
// src/shared/config/axios-client.provider.ts
export const DefaultApiProvider = createApiProvider(
  DEFAULT_API,
  'BACKEND_API_BASE_URL',
  DefaultApi,
);
```

複数バックエンドに移行する際も、既存の `UsersModule` を変更せず、
新しいモジュールを追加するだけで対応できます。

---

## 新しいバックエンドを追加する手順

1. バックエンドの Swagger から API クライアントを生成（`npm run gen:all`）
2. `.env` に `<SERVICE>_BASE_URL` を追加
3. `createApiProvider()` で DI プロバイダーを定義
4. 新しいモジュールの `providers` に登録
5. サービスで `@Inject(token)` して利用

既存モジュール・インターセプター・認証設定は一切変更不要です。
