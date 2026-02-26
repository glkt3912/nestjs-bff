import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { DefaultApiProvider } from './config/axios-client.provider';
import { AuthHeaderInterceptor } from './interceptors/auth-header.interceptor';
import { LoggingInterceptor } from './interceptors/logging.interceptor';
import { MockInterceptor } from './interceptors/mock.interceptor';

@Global()
@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        timeout: configService.get<number>('HTTP_TIMEOUT', 5000),
        maxRedirects: 5,
        baseURL: configService.get<string>('BACKEND_API_BASE_URL'),
      }),
    }),
  ],
  providers: [
    DefaultApiProvider,
    LoggingInterceptor,
    AuthHeaderInterceptor,
    MockInterceptor,
  ],
  exports: [HttpModule, DefaultApiProvider],
})
export class SharedModule {}
