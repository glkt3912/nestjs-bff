// NOTE: マルチバックエンド DI パターンのサンプル実装です。
// PRODUCT_SERVICE_API トークンで注入された API クライアントが
// PRODUCT_SERVICE_BASE_URL に向かって通信します。
// 実際の開発では ProductsApi.getProducts() などを呼び出してください。
import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DefaultApi } from '../generated/api';
import { PRODUCT_SERVICE_API } from './config/products-api.provider';
import { ProductResponse } from './dto/product.response';

@Injectable()
export class ProductsService {
  constructor(
    @Inject(PRODUCT_SERVICE_API) private readonly api: DefaultApi,
  ) {}

  async findAll(): Promise<ProductResponse[]> {
    const { data } = await this.api.getUsers();
    return plainToInstance(ProductResponse, data, {
      excludeExtraneousValues: true,
    });
  }
}
