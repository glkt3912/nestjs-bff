import { HttpService } from '@nestjs/axios';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { getCorrelationId } from '../context/request-context';

@Injectable()
export class LoggingInterceptor implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    @InjectPinoLogger(LoggingInterceptor.name)
    private readonly logger: PinoLogger,
  ) {}

  onModuleInit() {
    this.httpService.axiosRef.interceptors.request.use((config) => {
      const correlationId = getCorrelationId();
      if (correlationId) {
        config.headers['x-request-id'] = correlationId;
      }
      this.logger.info(
        { direction: 'outbound', method: config.method?.toUpperCase(), url: config.url, correlationId },
        `→ ${config.method?.toUpperCase()} ${config.url}`,
      );
      return config;
    });

    this.httpService.axiosRef.interceptors.response.use(
      (res) => {
        const correlationId = getCorrelationId();
        this.logger.info(
          { direction: 'inbound', status: res.status, url: res.config.url, correlationId },
          `← ${res.status} ${res.config.url}`,
        );
        return res;
      },
      (err) => Promise.reject(err),
    );
  }
}
