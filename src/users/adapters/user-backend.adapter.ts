import { Inject, Injectable } from '@nestjs/common';
import { DefaultApi } from '../../generated/api';
import { UserDto } from '../../generated/models';
import { DEFAULT_API } from '../../shared/config/axios-client.provider';
import { GenericApiAdapter } from '../../shared/adapters/generic-api.adapter';

/**
 * UsersModule 向けの Backend Adapter。
 * DefaultApi のメソッドを GenericApiAdapter に渡すことで、
 * 生成コードのメソッド名変更は UsersService に影響せずここで吸収される。
 */
@Injectable()
export class UserBackendAdapter extends GenericApiAdapter<UserDto, UserDto> {
  constructor(@Inject(DEFAULT_API) api: DefaultApi) {
    super(
      () => api.getUsers(),
      (id) => api.getUserById({ id }),
      (body) => api.createUser({ createUserDto: body }),
    );
  }
}
