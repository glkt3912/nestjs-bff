import { Inject, Injectable } from '@nestjs/common';
import { DefaultApi } from '../../generated/api';
import { PRODUCT_SERVICE_API } from '../config/products-api.provider';
import { ProductDto } from '../dto/product.dto';
import { GenericApiAdapter } from '../../shared/adapters/generic-api.adapter';

/**
 * ProductsModule 向けの Backend Adapter。
 * NOTE: 現在は DefaultApi（UsersApi の代用）を使用しているが、
 * 実際の開発では ProductsApi に差し替え、getProducts() などを呼び出す。
 */
@Injectable()
export class ProductBackendAdapter extends GenericApiAdapter<ProductDto> {
  constructor(@Inject(PRODUCT_SERVICE_API) api: DefaultApi) {
    super(
      () => api.getUsers() as Promise<{ data: ProductDto[] }>,
      (id) => api.getUserById({ id }) as Promise<{ data: ProductDto }>,
      // NOTE: 実際の ProductsApi では createProduct() などに差し替える
      (_body) => Promise.reject(new Error('create is not supported')),
    );
  }
}
