// NOTE: マルチバックエンド DI パターンのサンプル実装です。
// 実際のプロダクトサービスでは DefaultApi の代わりに専用の生成クライアント
//（例: ProductsApi）を使用してください。
import { DefaultApi } from '../../generated/api';
import { createApiProvider } from '../../shared/config/axios-client.provider';

export const PRODUCT_SERVICE_API = Symbol('PRODUCT_SERVICE_API');

export const ProductServiceApiProvider = createApiProvider(
  PRODUCT_SERVICE_API,
  'PRODUCT_SERVICE_BASE_URL',
  DefaultApi,
);
