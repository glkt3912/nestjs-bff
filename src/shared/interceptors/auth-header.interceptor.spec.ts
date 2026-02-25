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

  it('インターセプタはリクエスト config をそのまま返す', () => {
    configService.get.mockImplementation((key: string, defaultValue?: string) => {
      if (key === 'AUTH_TYPE') return 'none';
      return defaultValue ?? undefined;
    });
    interceptor.onModuleInit();

    const config = { headers: {} as Record<string, string>, url: '/test' };
    const result = requestInterceptors[0](config);

    expect(result).toBe(config);
  });

  describe('AUTH_TYPE=api-key', () => {
    it('BACKEND_API_KEY が設定されている場合 X-API-Key ヘッダがセットされる', () => {
      configService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'AUTH_TYPE') return 'api-key';
        if (key === 'BACKEND_API_KEY') return 'secret-api-key';
        return defaultValue ?? undefined;
      });
      interceptor.onModuleInit();

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptors[0](config) as typeof config;

      expect(result.headers['X-API-Key']).toBe('secret-api-key');
    });

    it('BACKEND_API_KEY が未設定の場合 X-API-Key ヘッダはセットされない', () => {
      configService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'AUTH_TYPE') return 'api-key';
        if (key === 'BACKEND_API_KEY') return undefined;
        return defaultValue ?? undefined;
      });
      interceptor.onModuleInit();

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptors[0](config) as typeof config;

      expect(result.headers['X-API-Key']).toBeUndefined();
    });

    it('BACKEND_API_KEY が空文字列の場合 X-API-Key ヘッダはセットされない', () => {
      configService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'AUTH_TYPE') return 'api-key';
        if (key === 'BACKEND_API_KEY') return '';
        return defaultValue ?? undefined;
      });
      interceptor.onModuleInit();

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptors[0](config) as typeof config;

      expect(result.headers['X-API-Key']).toBeUndefined();
    });
  });

  describe('AUTH_TYPE=bearer', () => {
    it('BACKEND_BEARER_TOKEN が設定されている場合 Authorization: Bearer ヘッダがセットされる', () => {
      configService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'AUTH_TYPE') return 'bearer';
        if (key === 'BACKEND_BEARER_TOKEN') return 'mytoken';
        return defaultValue ?? undefined;
      });
      interceptor.onModuleInit();

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptors[0](config) as typeof config;

      expect(result.headers['Authorization']).toBe('Bearer mytoken');
    });

    it('BACKEND_BEARER_TOKEN が未設定の場合 Authorization ヘッダはセットされない', () => {
      configService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'AUTH_TYPE') return 'bearer';
        if (key === 'BACKEND_BEARER_TOKEN') return undefined;
        return defaultValue ?? undefined;
      });
      interceptor.onModuleInit();

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptors[0](config) as typeof config;

      expect(result.headers['Authorization']).toBeUndefined();
    });
  });

  describe('AUTH_TYPE=none', () => {
    it('AUTH_TYPE=none のとき認証ヘッダはセットされない', () => {
      configService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'AUTH_TYPE') return 'none';
        return defaultValue ?? undefined;
      });
      interceptor.onModuleInit();

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptors[0](config) as typeof config;

      expect(result.headers['X-API-Key']).toBeUndefined();
      expect(result.headers['Authorization']).toBeUndefined();
    });
  });

  describe('AUTH_TYPE 未設定（デフォルト）', () => {
    it('AUTH_TYPE が未設定のとき認証ヘッダはセットされない', () => {
      configService.get.mockImplementation((key: string, defaultValue?: string) => {
        if (key === 'AUTH_TYPE') return defaultValue ?? 'none';
        return defaultValue ?? undefined;
      });
      interceptor.onModuleInit();

      const config = { headers: {} as Record<string, string> };
      const result = requestInterceptors[0](config) as typeof config;

      expect(result.headers['X-API-Key']).toBeUndefined();
      expect(result.headers['Authorization']).toBeUndefined();
    });
  });
});
