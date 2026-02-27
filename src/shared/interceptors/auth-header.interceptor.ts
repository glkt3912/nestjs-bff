import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getUserId } from '../context/request-context';

@Injectable()
export class AuthHeaderInterceptor implements OnModuleInit {
  private readonly logger = new Logger(AuthHeaderInterceptor.name);
  private authType: string;

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    this.authType = this.configService.get<string>('AUTH_TYPE', 'none');

    this.httpService.axiosRef.interceptors.request.use((config) => {
      switch (this.authType) {
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
          break;
        default:
          this.logger.warn(
            `Unknown AUTH_TYPE: "${this.authType}", skipping auth header`,
          );
          break;
      }

      const userId = getUserId();
      if (userId) {
        config.headers['X-User-Id'] = userId;
      }

      return config;
    });

    this.logger.log('AuthHeaderInterceptor registered');
  }
}
