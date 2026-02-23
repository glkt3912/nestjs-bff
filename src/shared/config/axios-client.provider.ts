import { HttpService } from '@nestjs/axios';
import { Provider } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Configuration, DefaultApi } from '../../generated/api';

export const DEFAULT_API = Symbol('DEFAULT_API');

export const DefaultApiProvider: Provider = {
  provide: DEFAULT_API,
  inject: [HttpService, ConfigService],
  useFactory: (httpService: HttpService, configService: ConfigService) => {
    const basePath = configService.get<string>('BACKEND_API_BASE_URL');
    const configuration = new Configuration({ basePath });
    // NestJS の axiosRef を渡すことで Interceptor が全 API リクエストに適用される
    return new DefaultApi(configuration, basePath, httpService.axiosRef);
  },
};
