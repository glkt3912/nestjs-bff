import * as fs from 'fs';
import * as path from 'path';

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MockInterceptor implements OnModuleInit {
  private readonly logger = new Logger(MockInterceptor.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {}

  onModuleInit() {
    const mockMode = this.configService.get<string>('MOCK_MODE');
    if (mockMode !== 'true') return;

    this.httpService.axiosRef.interceptors.request.use(async (config) => {
      const method = (config.method ?? 'get').toUpperCase();
      const url = config.url ?? '';
      const normalized = url.replace(/^\//, '').replace(/\//g, '_');
      const fixturePath = path.join(
        process.cwd(),
        'fixtures',
        `${method}_${normalized}.json`,
      );

      if (fs.existsSync(fixturePath)) {
        const data = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));
        this.logger.debug(`Mock: ${method} ${url} → ${fixturePath}`);
        return Promise.reject({ isMock: true, data, status: 200 });
      }
      return config;
    });

    this.httpService.axiosRef.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err?.isMock)
          return Promise.resolve({ data: err.data, status: err.status });
        return Promise.reject(err);
      },
    );

    this.logger.log('MockInterceptor: MOCK_MODE=true, fixture responses enabled');
  }
}
