// NOTE: マルチバックエンド DI パターン + Generic Adapter パターンのサンプル実装です。
import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { ProductResponse } from './dto/product.response';
import { ProductBackendAdapter } from './adapters/product-backend.adapter';

@Injectable()
export class ProductsService {
  constructor(private readonly adapter: ProductBackendAdapter) {}

  async findAll(): Promise<ProductResponse[]> {
    const data = await this.adapter.findAll();
    return plainToInstance(ProductResponse, data, {
      excludeExtraneousValues: true,
    });
  }
}
