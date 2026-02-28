import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { HealthController } from './health.controller';

describe('HealthController', () => {
  let controller: HealthController;
  let healthCheckService: jest.Mocked<HealthCheckService>;
  let httpHealthIndicator: jest.Mocked<HttpHealthIndicator>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    healthCheckService = {
      check: jest.fn().mockResolvedValue({
        status: 'ok',
        info: { backend: { status: 'up' } },
        error: {},
        details: { backend: { status: 'up' } },
      }),
    } as unknown as jest.Mocked<HealthCheckService>;

    httpHealthIndicator = {
      pingCheck: jest.fn().mockResolvedValue({ backend: { status: 'up' } }),
    } as unknown as jest.Mocked<HttpHealthIndicator>;

    configService = {
      getOrThrow: jest.fn().mockReturnValue('http://localhost:8080'),
      get: jest.fn().mockReturnValue(undefined), // CACHE_STORE は未設定（memory）
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: HttpHealthIndicator, useValue: httpHealthIndicator },
        { provide: ConfigService, useValue: configService },
        {
          provide: CACHE_MANAGER,
          useValue: { set: jest.fn().mockResolvedValue(undefined) },
        },
      ],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('HealthCheckService.check を呼び出す', async () => {
    await controller.check();

    expect(healthCheckService.check).toHaveBeenCalledTimes(1);
  });

  it('正常時は status: ok を返す', async () => {
    const result = await controller.check();

    expect(result).toMatchObject({ status: 'ok' });
  });

  it('BACKEND_API_BASE_URL を使って pingCheck を呼び出す', async () => {
    await controller.check();

    // health.check に渡された indicators リストを取り出して実行
    const [indicators] = healthCheckService.check.mock.calls[0];
    await indicators[0]();

    expect(httpHealthIndicator.pingCheck).toHaveBeenCalledWith(
      'backend',
      'http://localhost:8080',
    );
  });

  it('BACKEND_API_BASE_URL 未設定時はモジュール初期化時にエラーをスローする', async () => {
    const failingConfig = {
      getOrThrow: jest.fn().mockImplementation(() => {
        throw new Error('Config key "BACKEND_API_BASE_URL" is not defined');
      }),
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as jest.Mocked<ConfigService>;

    await expect(
      Test.createTestingModule({
        controllers: [HealthController],
        providers: [
          { provide: HealthCheckService, useValue: healthCheckService },
          { provide: HttpHealthIndicator, useValue: httpHealthIndicator },
          { provide: ConfigService, useValue: failingConfig },
          { provide: CACHE_MANAGER, useValue: { set: jest.fn() } },
        ],
      }).compile(),
    ).rejects.toThrow('Config key "BACKEND_API_BASE_URL" is not defined');
  });

  it('バックエンド障害時は HealthCheckService がエラーレスポンスを返す', async () => {
    healthCheckService.check.mockResolvedValue({
      status: 'error',
      info: {},
      error: { backend: { status: 'down', message: 'connect ECONNREFUSED' } },
      details: { backend: { status: 'down', message: 'connect ECONNREFUSED' } },
    });

    const result = await controller.check();

    expect(result).toMatchObject({ status: 'error' });
    expect(result.error).toHaveProperty('backend');
  });

  it('CACHE_STORE が redis 以外の場合は checks が 1 件のみ（Redis チェックなし）', async () => {
    await controller.check();

    const [indicators] = healthCheckService.check.mock.calls[0];
    expect(indicators).toHaveLength(1);
  });

  describe('CACHE_STORE=redis', () => {
    let redisController: HealthController;
    let cacheMock: { set: jest.Mock };

    beforeEach(async () => {
      cacheMock = { set: jest.fn().mockResolvedValue(undefined) };

      const redisConfig = {
        getOrThrow: jest.fn().mockReturnValue('http://localhost:8080'),
        get: jest.fn().mockReturnValue('redis'),
      } as unknown as jest.Mocked<ConfigService>;

      const module = await Test.createTestingModule({
        controllers: [HealthController],
        providers: [
          { provide: HealthCheckService, useValue: healthCheckService },
          { provide: HttpHealthIndicator, useValue: httpHealthIndicator },
          { provide: ConfigService, useValue: redisConfig },
          { provide: CACHE_MANAGER, useValue: cacheMock },
        ],
      }).compile();

      redisController = module.get<HealthController>(HealthController);
    });

    it('checks に Redis インジケーターが追加され 2 件になる', async () => {
      await redisController.check();

      const [indicators] = healthCheckService.check.mock.calls[0];
      expect(indicators).toHaveLength(2);
    });

    it('Redis ping 成功時は { redis: { status: up } } を返す', async () => {
      await redisController.check();

      const [indicators] = healthCheckService.check.mock.calls[0];
      const result = await indicators[1]();

      expect(result).toEqual({ redis: { status: 'up' } });
    });

    it('Redis ping 失敗時は Error をスローする', async () => {
      cacheMock.set.mockRejectedValue(new Error('Connection refused'));
      await redisController.check();

      const [indicators] = healthCheckService.check.mock.calls[0];

      await expect(indicators[1]()).rejects.toThrow('Redis ping failed');
    });
  });
});
