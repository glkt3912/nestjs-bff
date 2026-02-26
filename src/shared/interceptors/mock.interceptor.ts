import * as fs from 'fs';
import * as path from 'path';

import { HttpService } from '@nestjs/axios';
import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface MockError {
  isMock: true;
  data: unknown;
  status: number;
}

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

      const fixturesDir = path.join(process.cwd(), 'fixtures');
      const fixturePath = path.join(
        fixturesDir,
        `${method}_${normalized}.json`,
      );

      // [Critical] パストラバーサル防止
      if (!fixturePath.startsWith(fixturesDir + path.sep)) {
        return config;
      }

      // [Warning] 非同期 I/O + [Info] JSON パースエラーハンドリング
      try {
        const raw = await fs.promises.readFile(fixturePath, 'utf-8');
        let data: unknown;
        try {
          data = JSON.parse(raw);
        } catch {
          this.logger.warn(`Mock: invalid JSON in ${fixturePath}, skipping`);
          return config;
        }
        this.logger.debug(`Mock: ${method} ${url} → ${fixturePath}`);
        return Promise.reject({
          isMock: true,
          data,
          status: 200,
        } satisfies MockError);
      } catch {
        return config; // ファイルなし → 実リクエストへ
      }
    });

    this.httpService.axiosRef.interceptors.response.use(
      (res) => res,
      (err) => {
        if (err?.isMock)
          return Promise.resolve({ data: err.data, status: err.status });
        return Promise.reject(err);
      },
    );

    this.logger.log(
      'MockInterceptor: MOCK_MODE=true, fixture responses enabled',
    );
  }
}
