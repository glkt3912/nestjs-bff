import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

jest.mock('fs');
import * as fs from 'fs';

import { MockInterceptor } from './mock.interceptor';

describe('MockInterceptor', () => {
  let interceptor: MockInterceptor;
  let configService: jest.Mocked<ConfigService>;
  let requestUseMock: jest.Mock;
  let responseUseMock: jest.Mock;
  let requestInterceptors: Array<(config: unknown) => unknown>;
  let responseInterceptors: Array<{
    fulfilled: (res: unknown) => unknown;
    rejected: (err: unknown) => unknown;
  }>;

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

    configService = {
      get: jest.fn(),
    } as unknown as jest.Mocked<ConfigService>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MockInterceptor,
        { provide: HttpService, useValue: mockHttpService },
        { provide: ConfigService, useValue: configService },
      ],
    }).compile();

    interceptor = module.get<MockInterceptor>(MockInterceptor);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('MOCK_MODE が無効の場合', () => {
    it('MOCK_MODE=false のときインターセプタを登録しない', () => {
      configService.get.mockReturnValue('false');
      interceptor.onModuleInit();

      expect(requestUseMock).not.toHaveBeenCalled();
      expect(responseUseMock).not.toHaveBeenCalled();
    });

    it('MOCK_MODE 未設定のときインターセプタを登録しない', () => {
      configService.get.mockReturnValue(undefined);
      interceptor.onModuleInit();

      expect(requestUseMock).not.toHaveBeenCalled();
    });
  });

  describe('MOCK_MODE が有効の場合', () => {
    beforeEach(() => {
      configService.get.mockReturnValue('true');
      interceptor.onModuleInit();
    });

    it('request インターセプタと response インターセプタを 1 件ずつ登録する', () => {
      expect(requestUseMock).toHaveBeenCalledTimes(1);
      expect(responseUseMock).toHaveBeenCalledTimes(1);
    });

    it('フィクスチャが存在する場合は isMock エラーを reject する', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(true);
      jest
        .mocked(fs.readFileSync)
        .mockReturnValue(JSON.stringify([{ id: 1, name: 'Alice' }]) as never);

      const requestFn = requestInterceptors[0];
      await expect(
        requestFn({ method: 'get', url: '/users' }),
      ).rejects.toMatchObject({
        isMock: true,
        data: [{ id: 1, name: 'Alice' }],
        status: 200,
      });
    });

    it('フィクスチャが存在しない場合はリクエスト config をそのまま返す', async () => {
      jest.mocked(fs.existsSync).mockReturnValue(false);
      const config = { method: 'get', url: '/unknown' };

      const requestFn = requestInterceptors[0];
      await expect(requestFn(config)).resolves.toBe(config);
    });

    it('isMock エラーを正常レスポンスオブジェクトに変換する', async () => {
      const { rejected } = responseInterceptors[0];
      const mockError = { isMock: true, data: [{ id: 1 }], status: 200 };

      await expect(rejected(mockError)).resolves.toEqual({
        data: [{ id: 1 }],
        status: 200,
      });
    });

    it('通常のエラーはそのまま reject する', async () => {
      const { rejected } = responseInterceptors[0];
      const error = new Error('Network Error');

      await expect(rejected(error)).rejects.toThrow('Network Error');
    });

    it('fulfilled レスポンスはそのまま返す', async () => {
      const { fulfilled } = responseInterceptors[0];
      const response = { data: { id: 1 }, status: 200 };

      expect(fulfilled(response)).toBe(response);
    });

    describe('URL 正規化', () => {
      beforeEach(() => {
        jest.mocked(fs.existsSync).mockReturnValue(false);
      });

      it('GET /users → GET_users.json として解決する', async () => {
        await requestInterceptors[0]({ method: 'get', url: '/users' });

        expect(fs.existsSync).toHaveBeenCalledWith(
          expect.stringContaining('GET_users.json'),
        );
      });

      it('GET /users/1 → GET_users_1.json として解決する', async () => {
        await requestInterceptors[0]({ method: 'get', url: '/users/1' });

        expect(fs.existsSync).toHaveBeenCalledWith(
          expect.stringContaining('GET_users_1.json'),
        );
      });

      it('POST /users → POST_users.json として解決する', async () => {
        await requestInterceptors[0]({ method: 'post', url: '/users' });

        expect(fs.existsSync).toHaveBeenCalledWith(
          expect.stringContaining('POST_users.json'),
        );
      });

      it('method が未設定の場合は GET として扱う', async () => {
        await requestInterceptors[0]({ url: '/users' });

        expect(fs.existsSync).toHaveBeenCalledWith(
          expect.stringContaining('GET_users.json'),
        );
      });
    });
  });
});
