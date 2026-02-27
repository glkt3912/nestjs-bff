import { HttpService } from '@nestjs/axios';
import { Test, TestingModule } from '@nestjs/testing';
import { getLoggerToken, PinoLogger } from 'nestjs-pino';
import * as requestContext from '../context/request-context';
import { LoggingInterceptor } from './logging.interceptor';

describe('LoggingInterceptor', () => {
  let interceptor: LoggingInterceptor;
  let requestUseMock: jest.Mock;
  let responseUseMock: jest.Mock;
  let requestInterceptors: Array<(config: unknown) => unknown>;
  let responseInterceptors: Array<{
    fulfilled: (res: unknown) => unknown;
    rejected: (err: unknown) => unknown;
  }>;
  let mockLogger: jest.Mocked<PinoLogger>;

  beforeEach(async () => {
    requestInterceptors = [];
    responseInterceptors = [];

    requestUseMock = jest.fn((fn: (config: unknown) => unknown) => {
      requestInterceptors.push(fn);
      return 0;
    });

    responseUseMock = jest.fn(
      (
        fulfilled: (res: unknown) => unknown,
        rejected: (err: unknown) => unknown,
      ) => {
        responseInterceptors.push({ fulfilled, rejected });
        return 0;
      },
    );

    const mockHttpService = {
      axiosRef: {
        interceptors: {
          request: { use: requestUseMock },
          response: { use: responseUseMock },
        },
      },
    } as unknown as HttpService;

    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<PinoLogger>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LoggingInterceptor,
        { provide: HttpService, useValue: mockHttpService },
        {
          provide: getLoggerToken(LoggingInterceptor.name),
          useValue: mockLogger,
        },
      ],
    }).compile();

    interceptor = module.get<LoggingInterceptor>(LoggingInterceptor);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('onModuleInit で request / response インターセプタを各 1 件登録する', () => {
    interceptor.onModuleInit();

    expect(requestUseMock).toHaveBeenCalledTimes(1);
    expect(responseUseMock).toHaveBeenCalledTimes(1);
  });

  describe('request インターセプタ', () => {
    beforeEach(() => {
      interceptor.onModuleInit();
    });

    it('correlationId が存在する場合 x-request-id ヘッダをセットする', async () => {
      jest
        .spyOn(requestContext, 'getCorrelationId')
        .mockReturnValue('test-id-123');
      const config = {
        method: 'get',
        url: '/users',
        headers: {} as Record<string, string>,
      };

      const result = (await requestInterceptors[0](config)) as typeof config;

      expect(result.headers['x-request-id']).toBe('test-id-123');
    });

    it('correlationId が undefined の場合 x-request-id ヘッダをセットしない', async () => {
      jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue(undefined);
      const config = {
        method: 'get',
        url: '/users',
        headers: {} as Record<string, string>,
      };

      const result = (await requestInterceptors[0](config)) as typeof config;

      expect(result.headers['x-request-id']).toBeUndefined();
    });

    it('request ログに { direction, method, url, correlationId } が含まれる', async () => {
      jest
        .spyOn(requestContext, 'getCorrelationId')
        .mockReturnValue('trace-abc');
      const config = {
        method: 'get',
        url: '/users',
        headers: {} as Record<string, string>,
      };

      await requestInterceptors[0](config);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'outbound',
          method: 'GET',
          url: '/users',
          correlationId: 'trace-abc',
        }),
        expect.any(String),
      );
    });

    it('JSON リクエストのとき bodyLogged: true がログに含まれる', async () => {
      jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue(undefined);
      const config = {
        method: 'post',
        url: '/users',
        headers: { 'Content-Type': 'application/json' } as Record<
          string,
          string
        >,
      };

      await requestInterceptors[0](config);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ bodyLogged: true }),
        expect.any(String),
      );
    });

    it('multipart リクエストのとき bodyLogged: false がログに含まれる', async () => {
      jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue(undefined);
      const config = {
        method: 'post',
        url: '/upload',
        headers: {
          'Content-Type':
            'multipart/form-data; boundary=----WebKitFormBoundary',
        } as Record<string, string>,
      };

      await requestInterceptors[0](config);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ bodyLogged: false }),
        expect.any(String),
      );
    });
  });

  describe('response インターセプタ', () => {
    beforeEach(() => {
      interceptor.onModuleInit();
    });

    it('response ログに { direction, status, url, correlationId } が含まれる', async () => {
      jest
        .spyOn(requestContext, 'getCorrelationId')
        .mockReturnValue('trace-abc');
      const res = { status: 200, config: { url: '/users' } };

      await responseInterceptors[0].fulfilled(res);

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          direction: 'inbound',
          status: 200,
          url: '/users',
          correlationId: 'trace-abc',
        }),
        expect.any(String),
      );
    });

    it('response の fulfilled はレスポンスをそのまま返す', async () => {
      jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue(undefined);
      const res = { status: 200, config: { url: '/users' } };

      const result = await responseInterceptors[0].fulfilled(res);

      expect(result).toBe(res);
    });

    it('response の rejected は Promise.reject でそのまま返す', async () => {
      const error = new Error('Network Error');

      await expect(responseInterceptors[0].rejected(error)).rejects.toThrow(
        'Network Error',
      );
    });
  });
});
