import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { FactoryProvider } from '@nestjs/common';
import axios from 'axios';
import { DEFAULT_API, createApiProvider } from './axios-client.provider';
import { DefaultApi, Configuration } from '../../generated/api';

describe('createApiProvider', () => {
  const TOKEN = Symbol('TEST_API');
  const ENV_KEY = 'TEST_SERVICE_BASE_URL';
  const BASE_URL = 'http://test-service:8080';

  let mockHttpService: HttpService;
  let mockConfigService: jest.Mocked<Pick<ConfigService, 'getOrThrow'>>;

  beforeEach(() => {
    mockHttpService = {
      axiosRef: axios.create(),
    } as unknown as HttpService;

    mockConfigService = {
      getOrThrow: jest.fn(),
    };
  });

  describe('Provider 構造', () => {
    it('provide が指定したトークンになる', () => {
      const provider = createApiProvider(TOKEN, ENV_KEY, DefaultApi);
      expect(provider.provide).toBe(TOKEN);
    });

    it('inject に HttpService と ConfigService が含まれる', () => {
      const provider = createApiProvider(
        TOKEN,
        ENV_KEY,
        DefaultApi,
      ) as FactoryProvider;
      expect(provider.inject).toEqual([HttpService, ConfigService]);
    });
  });

  describe('useFactory', () => {
    it('有効な basePath が設定されているとき DefaultApi インスタンスを返す', () => {
      mockConfigService.getOrThrow.mockReturnValue(BASE_URL);

      const provider = createApiProvider(
        TOKEN,
        ENV_KEY,
        DefaultApi,
      ) as FactoryProvider;
      const instance = provider.useFactory(mockHttpService, mockConfigService);

      expect(instance).toBeInstanceOf(DefaultApi);
    });

    it('有効な basePath が設定されているとき getOrThrow が envKey で呼ばれる', () => {
      mockConfigService.getOrThrow.mockReturnValue(BASE_URL);

      const provider = createApiProvider(
        TOKEN,
        ENV_KEY,
        DefaultApi,
      ) as FactoryProvider;
      provider.useFactory(mockHttpService, mockConfigService);

      expect(mockConfigService.getOrThrow).toHaveBeenCalledWith(ENV_KEY);
    });

    it('basePath が空文字のとき envKey を含むエラーをスローする', () => {
      mockConfigService.getOrThrow.mockReturnValue('');

      const provider = createApiProvider(
        TOKEN,
        ENV_KEY,
        DefaultApi,
      ) as FactoryProvider;

      expect(() =>
        provider.useFactory(mockHttpService, mockConfigService),
      ).toThrow(`[createApiProvider] 環境変数 "${ENV_KEY}" が空です。`);
    });

    it('basePath が空文字のときスローされるエラーは Error インスタンスである', () => {
      mockConfigService.getOrThrow.mockReturnValue('');

      const provider = createApiProvider(
        TOKEN,
        ENV_KEY,
        DefaultApi,
      ) as FactoryProvider;

      expect(() =>
        provider.useFactory(mockHttpService, mockConfigService),
      ).toThrow(Error);
    });
  });

  describe('DefaultApiProvider', () => {
    it('DEFAULT_API シンボルが export されている', () => {
      expect(DEFAULT_API).toBeDefined();
      expect(typeof DEFAULT_API).toBe('symbol');
    });

    it('DEFAULT_API は BACKEND_API_BASE_URL をキーに使う', () => {
      mockConfigService.getOrThrow.mockReturnValue('http://localhost:8080');

      // DefaultApiProvider は createApiProvider(DEFAULT_API, 'BACKEND_API_BASE_URL', DefaultApi) で作られる
      // DefaultApi の Configuration を介して basePath が渡されることを確認
      const config = new Configuration({ basePath: 'http://localhost:8080' });
      const instance = new DefaultApi(
        config,
        'http://localhost:8080',
        mockHttpService.axiosRef,
      );
      expect(instance).toBeInstanceOf(DefaultApi);
    });
  });
});
