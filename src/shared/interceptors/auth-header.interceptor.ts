import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AuthHeaderInterceptor implements OnModuleInit {
  private readonly logger = new Logger(AuthHeaderInterceptor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.httpService.axiosRef.interceptors.request.use((config) => {
      const authType = this.configService.get<string>('AUTH_TYPE', 'none');

      switch (authType) {
        case 'api-key': {
          const apiKey = this.configService.get<string>('BACKEND_API_KEY');
          if (apiKey) {
            config.headers['X-API-Key'] = apiKey;
          }
          break;
        }
        case 'bearer': {
          const token = this.configService.get<string>('BACKEND_BEARER_TOKEN');
          if (token) {
            config.headers['Authorization'] = `Bearer ${token}`;
          }
          break;
        }
        case 'none':
        default:
          break;
      }

      return config;
    });

    this.logger.log('AuthHeaderInterceptor registered');
  }
}
