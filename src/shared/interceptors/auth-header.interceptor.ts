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
      const apiKey = this.configService.get<string>('BACKEND_API_KEY');
      if (apiKey) {
        config.headers['X-API-Key'] = apiKey;
      }
      return config;
    });

    this.logger.log('AuthHeaderInterceptor registered');
  }
}
