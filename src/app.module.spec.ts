import { Controller, Get, INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import request from 'supertest';
import { App } from 'supertest/types';
import { computeCacheStoreParams } from './app.module';

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

describe('CacheModule useFactory', () => {
  const mockConfig = (overrides: Record<string, unknown>) =>
    ({
      get: jest.fn().mockImplementation((key: string, def: unknown) =>
        key in overrides ? overrides[key] : def,
      ),
      getOrThrow: jest.fn().mockImplementation((key: string) => {
        if (key in overrides) return overrides[key];
        throw new Error(`Missing required config: ${key}`);
      }),
    }) as unknown as ConfigService;

  describe('TTL 計算', () => {
    it('CACHE_TTL > 0 のとき秒 × 1000 ms に変換する', () => {
      const result = computeCacheStoreParams(mockConfig({ CACHE_TTL: 30 }));
      expect(result.ttlMs).toBe(30_000);
    });

    it('CACHE_TTL = 0 のとき 1ms にフォールバックする（Keyv は 0 = 永久保存のため）', () => {
      const result = computeCacheStoreParams(mockConfig({ CACHE_TTL: 0 }));
      expect(result.ttlMs).toBe(1);
    });
  });

  describe('Redis ストア', () => {
    it('パスワードなしのとき socket オプションで host/port を指定する', () => {
      const result = computeCacheStoreParams(
        mockConfig({
          CACHE_STORE: 'redis',
          REDIS_HOST: 'localhost',
          REDIS_PORT: 6379,
          REDIS_DB: 0,
        }),
      );
      expect(result.type).toBe('redis');
      if (result.type === 'redis') {
        expect(result.redisOptions).toEqual({
          socket: { host: 'localhost', port: 6379 },
          database: 0,
        });
      }
    });

    it('パスワードありのとき redisOptions に password フィールドを含む', () => {
      const result = computeCacheStoreParams(
        mockConfig({
          CACHE_STORE: 'redis',
          REDIS_HOST: 'redis.example.com',
          REDIS_PORT: 6380,
          REDIS_PASSWORD: 'secret',
          REDIS_DB: 1,
        }),
      );
      expect(result.type).toBe('redis');
      if (result.type === 'redis') {
        expect(result.redisOptions).toEqual({
          socket: { host: 'redis.example.com', port: 6380 },
          password: 'secret',
          database: 1,
        });
      }
    });
  });

  describe('インメモリ LRU ストア', () => {
    it('CACHE_MAX_ITEMS を指定した場合はその値を maxItems に使用する', () => {
      const result = computeCacheStoreParams(mockConfig({ CACHE_MAX_ITEMS: 200 }));
      expect(result.type).toBe('memory');
      if (result.type === 'memory') {
        expect(result.maxItems).toBe(200);
      }
    });

    it('CACHE_MAX_ITEMS 未指定のときデフォルト 500 を使用する', () => {
      const result = computeCacheStoreParams(mockConfig({}));
      expect(result.type).toBe('memory');
      if (result.type === 'memory') {
        expect(result.maxItems).toBe(500);
      }
    });
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
