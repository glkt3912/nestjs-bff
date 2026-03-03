import * as fs from 'fs';
import * as path from 'path';

import { HttpService } from '@nestjs/axios';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';

export class MockError extends Error {
  readonly isMock = true as const;
  constructor(
    readonly data: unknown,
    readonly status: number,
  ) {
    super('MockInterceptor: fixture response');
  }
}

@Injectable()
export class MockInterceptor implements OnModuleInit {
  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    @InjectPinoLogger(MockInterceptor.name)
    private readonly logger: PinoLogger,
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
        return Promise.reject(new MockError(data, 200));
      } catch {
        return config; // ファイルなし → 実リクエストへ
      }
    });

    this.httpService.axiosRef.interceptors.response.use(
      (res) => res,
      (err: unknown) => {
        if (err instanceof MockError)
          return Promise.resolve({ data: err.data, status: err.status });
        return Promise.reject(
          err instanceof Error ? err : new Error(String(err)),
        );
      },
    );

    this.logger.info(
      'MockInterceptor: MOCK_MODE=true, fixture responses enabled',
    );
  }
}
