import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';

@Injectable()
export class LoggingInterceptor implements OnModuleInit {
  private readonly logger = new Logger('HttpClient');

  constructor(private readonly httpService: HttpService) {}

  onModuleInit() {
    this.httpService.axiosRef.interceptors.request.use((config) => {
      this.logger.log(`→ ${config.method?.toUpperCase()} ${config.url}`);
      return config;
    });

    this.httpService.axiosRef.interceptors.response.use(
      (res) => {
        this.logger.log(`← ${res.status} ${res.config.url}`);
        return res;
      },
      (err) => Promise.reject(err),
    );
  }
}
