import { Test } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Reflector } from '@nestjs/core';
import { UserAwareCacheInterceptor } from './user-aware-cache.interceptor';

const createContext = (
  url: string,
  user?: { sub?: string },
  handler: object = {},
  cls: object = {},
): ExecutionContext =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ url, user }),
    }),
    getHandler: () => handler,
    getClass: () => cls,
  }) as unknown as ExecutionContext;

describe('UserAwareCacheInterceptor', () => {
  let interceptor: UserAwareCacheInterceptor;
  let reflector: { getAllAndOverride: jest.Mock };

  beforeEach(async () => {
    reflector = { getAllAndOverride: jest.fn().mockReturnValue(false) };

    const module = await Test.createTestingModule({
      providers: [
        UserAwareCacheInterceptor,
        { provide: CACHE_MANAGER, useValue: {} },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();

    interceptor = module.get(UserAwareCacheInterceptor);
  });

  describe('trackBy', () => {
    it('認証済みユーザーは userId:url をキーとして返す', () => {
      const context = createContext('/api/users/42', { sub: 'user-1' });

      const key = (interceptor as any).trackBy(context) as string | undefined;

      expect(key).toBe('user-1:/api/users/42');
    });

    it('user.sub が空の場合は undefined を返す（キャッシュしない）', () => {
      const context = createContext('/api/users', { sub: undefined });

      const key = (interceptor as any).trackBy(context) as string | undefined;

      expect(key).toBeUndefined();
    });

    it('user が存在しない場合は undefined を返す（キャッシュしない）', () => {
      const context = createContext('/api/users');

      const key = (interceptor as any).trackBy(context) as string | undefined;

      expect(key).toBeUndefined();
    });

    it('@Public() エンドポイントは未認証でも super.trackBy が呼ばれる', () => {
      reflector.getAllAndOverride.mockReturnValue(true);
      const superTrackBy = jest
        .spyOn(Object.getPrototypeOf(Object.getPrototypeOf(interceptor)), 'trackBy')
        .mockReturnValue('/api/health');

      const context = createContext('/api/health');
      const key = (interceptor as any).trackBy(context) as string | undefined;

      expect(key).toBe('/api/health');
      superTrackBy.mockRestore();
    });

    it('未認証かつ非 @Public() は undefined を返す（キャッシュしない）', () => {
      reflector.getAllAndOverride.mockReturnValue(false);
      const context = createContext('/api/users');

      const key = (interceptor as any).trackBy(context) as string | undefined;

      expect(key).toBeUndefined();
    });

    it('同一ユーザーの異なる URL は別キーになる', () => {
      const ctx1 = createContext('/api/users', { sub: 'user-1' });
      const ctx2 = createContext('/api/users/42', { sub: 'user-1' });

      const key1 = (interceptor as any).trackBy(ctx1) as string;
      const key2 = (interceptor as any).trackBy(ctx2) as string;

      expect(key1).not.toBe(key2);
    });

    it('同一 URL でも異なるユーザーは別キーになる', () => {
      const ctx1 = createContext('/api/users/42', { sub: 'user-1' });
      const ctx2 = createContext('/api/users/42', { sub: 'user-2' });

      const key1 = (interceptor as any).trackBy(ctx1) as string;
      const key2 = (interceptor as any).trackBy(ctx2) as string;

      expect(key1).not.toBe(key2);
    });
  });
});
