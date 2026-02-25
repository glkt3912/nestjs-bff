import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthHeaderInterceptor } from './auth-header.interceptor';

describe('AuthHeaderInterceptor', () => {
  let interceptor: AuthHeaderInterceptor;
  let configService: jest.Mocked<ConfigService>;
  let requestUseMock: jest.Mock;
  let requestInterceptors: Array<(config: unknown) => unknown>;

  beforeEach(async () => {
    requestInterceptors = [];

    requestUseMock = jest.fn((fn: (config: unknown) => unknown) => {
      requestInterceptors.push(fn);
      return 0;
    });

    const mockHttpService = {
      axiosRef: {
        interceptors: {
          request: { use: requestUseMock },
        },
      },
    } as unknown as HttpService;

    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthHeaderInterceptor,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    interceptor = module.get<AuthHeaderInterceptor>(AuthHeaderInterceptor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('onModuleInit で request インターセプタが 1 件登録される', () => {
    interceptor.onModuleInit();

    expect(requestUseMock).toHaveBeenCalledTimes(1);
    expect(requestInterceptors).toHaveLength(1);
  });

  it('BACKEND_API_KEY が設定されている場合 X-API-Key ヘッダがセットされる', () => {
    configService.get.mockReturnValue('secret-api-key');
    interceptor.onModuleInit();

    const config = { headers: {} as Record<string, string> };
    const result = requestInterceptors[0](config) as typeof config;

    expect(result.headers['X-API-Key']).toBe('secret-api-key');
  });

  it('BACKEND_API_KEY が undefined の場合 X-API-Key ヘッダはセットされない', () => {
    configService.get.mockReturnValue(undefined);
    interceptor.onModuleInit();

    const config = { headers: {} as Record<string, string> };
    const result = requestInterceptors[0](config) as typeof config;

    expect(result.headers['X-API-Key']).toBeUndefined();
  });

  it('BACKEND_API_KEY が空文字列の場合 X-API-Key ヘッダはセットされない', () => {
    configService.get.mockReturnValue('');
    interceptor.onModuleInit();

    const config = { headers: {} as Record<string, string> };
    const result = requestInterceptors[0](config) as typeof config;

    expect(result.headers['X-API-Key']).toBeUndefined();
  });

  it('インターセプタはリクエスト config をそのまま返す', () => {
    configService.get.mockReturnValue('my-key');
    interceptor.onModuleInit();

    const config = { headers: {} as Record<string, string>, url: '/test' };
    const result = requestInterceptors[0](config);

    expect(result).toBe(config);
  });
});
