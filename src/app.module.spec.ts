import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';

@Controller('test')
class TestController {
  @Get()
  index() {
    return 'ok';
  }
}

describe('ThrottlerGuard', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        // テスト用に低い制限値（10秒間に3リクエストまで）を設定
        ThrottlerModule.forRoot([{ ttl: 10000, limit: 3 }]),
      ],
      controllers: [TestController],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('制限内のリクエストは 200 を返す', async () => {
    await request(app.getHttpServer()).get('/test').expect(200);
  });

  it('制限内で複数リクエストしても 200 を返す', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).get('/test').expect(200);
    }
  });

  it('制限超過後は 429 Too Many Requests を返す', async () => {
    for (let i = 0; i < 3; i++) {
      await request(app.getHttpServer()).get('/test').expect(200);
    }
    await request(app.getHttpServer()).get('/test').expect(429);
  });
});

describe('ThrottlerModule useFactory', () => {
  const throttlerFactory = (configService: ConfigService) => [
    {
      ttl: Number(configService.get('THROTTLE_TTL', 60000)),
      limit: Number(configService.get('THROTTLE_LIMIT', 100)),
    },
  ];

  it('ConfigService の値を ttl・limit に反映する', () => {
    const configService = {
      get: jest.fn().mockImplementation((key: string, defaultVal: number) => {
        if (key === 'THROTTLE_TTL') return 30000;
        if (key === 'THROTTLE_LIMIT') return 50;
        return defaultVal;
      }),
    } as unknown as ConfigService;

    const [config] = throttlerFactory(configService);

    expect(config.ttl).toBe(30000);
    expect(config.limit).toBe(50);
  });

  it('環境変数が未設定の場合はデフォルト値（ttl=60000, limit=100）を使用する', () => {
    const configService = {
      get: jest
        .fn()
        .mockImplementation((_key: string, defaultVal: number) => defaultVal),
    } as unknown as ConfigService;

    const [config] = throttlerFactory(configService);

    expect(config.ttl).toBe(60000);
    expect(config.limit).toBe(100);
  });
});
