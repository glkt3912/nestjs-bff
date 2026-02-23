import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { HealthCheckService, HttpHealthIndicator } from '@nestjs/terminus';
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
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [
        { provide: HealthCheckService, useValue: healthCheckService },
        { provide: HttpHealthIndicator, useValue: httpHealthIndicator },
        { provide: ConfigService, useValue: configService },
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

  it('BACKEND_API_BASE_URL 未設定時はエラーをスローする', () => {
    configService.getOrThrow.mockImplementation(() => {
      throw new Error('Config key "BACKEND_API_BASE_URL" is not defined');
    });

    expect(() => controller.check()).toThrow();
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
});
