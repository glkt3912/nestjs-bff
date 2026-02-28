import { HttpService } from '@nestjs/axios';
import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuration, DefaultApi } from '../../generated/api';
import type { AxiosInstance } from 'axios';

export const DEFAULT_API = Symbol('DEFAULT_API');

type ApiConstructor<T> = new (
  configuration: Configuration,
  basePath: string | undefined,
  axios: AxiosInstance,
) => T;

/**
 * 任意のバックエンド向け API クライアントプロバイダーを生成するファクトリ。
 *
 * - 単一の HttpService.axiosRef を共有するため、Axios インターセプター
 *   （ロギング・認証ヘッダ・モック）がすべてのバックエンドに一括適用される。
 * - 環境変数 `envKey` で BaseURL を管理し、バックエンドごとに独立したトークンで DI できる。
 *
 * @example 新しいバックエンドを追加する場合
 * ```typescript
 * // src/orders/config/orders-api.provider.ts
 * export const ORDER_SERVICE_API = Symbol('ORDER_SERVICE_API');
 * export const OrderServiceApiProvider = createApiProvider(
 *   ORDER_SERVICE_API,
 *   'ORDER_SERVICE_BASE_URL',
 *   OrdersApi,
 * );
 *
 * // src/orders/orders.module.ts
 * @Module({ providers: [OrderServiceApiProvider] })
 * export class OrdersModule {}
 *
 * // src/orders/orders.service.ts
 * constructor(@Inject(ORDER_SERVICE_API) private readonly api: OrdersApi) {}
 * ```
 *
 * @example 環境変数（.env）
 * ```
 * ORDER_SERVICE_BASE_URL=http://order-service:8080
 * ```
 */
export function createApiProvider<T>(
  token: symbol,
  envKey: string,
  ApiClass: ApiConstructor<T>,
): Provider {
  return {
    provide: token,
    inject: [HttpService, ConfigService],
    useFactory: (httpService: HttpService, configService: ConfigService) => {
      const basePath = configService.get<string>(envKey);
      const configuration = new Configuration({ basePath });
      // NestJS の axiosRef を渡すことで Interceptor が全 API リクエストに適用される
      return new ApiClass(configuration, basePath, httpService.axiosRef);
    },
  };
}

export const DefaultApiProvider = createApiProvider(
  DEFAULT_API,
  'BACKEND_API_BASE_URL',
  DefaultApi,
);
