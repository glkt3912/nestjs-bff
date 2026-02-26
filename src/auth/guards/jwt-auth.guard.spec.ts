import { ExecutionContext } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { AuthGuard } from '@nestjs/passport';
import { JwtAuthGuard } from './jwt-auth.guard';

const mockExecutionContext = (handler = () => {}, cls = class {}) =>
  ({
    getHandler: () => handler,
    getClass: () => cls,
  }) as unknown as ExecutionContext;

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let reflector: Reflector;
  let configService: ConfigService;

  const buildGuard = (jwtAuthEnabled: string | undefined) => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    configService = {
      get: jest.fn().mockReturnValue(jwtAuthEnabled),
    } as unknown as ConfigService;
    return new JwtAuthGuard(reflector, configService);
  };

  describe('JWT_AUTH_ENABLED が false のとき', () => {
    it('canActivate は true を返す', () => {
      guard = buildGuard('false');
      expect(guard.canActivate(mockExecutionContext())).toBe(true);
    });
  });

  describe('JWT_AUTH_ENABLED が未設定のとき', () => {
    it('canActivate は true を返す', () => {
      guard = buildGuard(undefined);
      expect(guard.canActivate(mockExecutionContext())).toBe(true);
    });
  });

  describe('JWT_AUTH_ENABLED が true のとき', () => {
    beforeEach(() => {
      guard = buildGuard('true');
    });

    it('@Public() が付いたエンドポイントは true を返す', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(true);
      expect(guard.canActivate(mockExecutionContext())).toBe(true);
    });

    it('非 Public エンドポイントは super.canActivate に委譲する', () => {
      (reflector.getAllAndOverride as jest.Mock).mockReturnValue(false);
      const superSpy = jest
        .spyOn(AuthGuard('jwt').prototype, 'canActivate')
        .mockReturnValue(true);
      const ctx = mockExecutionContext();
      guard.canActivate(ctx);
      expect(superSpy).toHaveBeenCalledWith(ctx);
      superSpy.mockRestore();
    });
  });
});
