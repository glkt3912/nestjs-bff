import { Inject, Injectable } from '@nestjs/common';
import { DefaultApi } from '../../generated/api';
import { UserDto } from '../../generated/models';
import { PRODUCT_SERVICE_API } from '../config/products-api.provider';
import { GenericApiAdapter } from '../../shared/adapters/generic-api.adapter';

/**
 * ProductsModule 向けの Backend Adapter。
 * NOTE: 現在は DefaultApi（UsersApi の代用）を使用しているが、
 * 実際の開発では ProductsApi に差し替え、getProducts() などを呼び出す。
 */
@Injectable()
export class ProductBackendAdapter extends GenericApiAdapter<UserDto> {
  constructor(@Inject(PRODUCT_SERVICE_API) api: DefaultApi) {
    super(
      () => api.getUsers(),
      (id) => api.getUserById({ id }),
      // NOTE: 実際の ProductsApi では createProduct() などに差し替える
      (_body) => Promise.reject(new Error('create is not supported')),
    );
  }
}
