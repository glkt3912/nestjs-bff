import { ExecutionContext, UnauthorizedException } from '@nestjs/common';
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

  const buildGuard = (jwtAuthEnabled: string | undefined, nodeEnv?: string) => {
    reflector = { getAllAndOverride: jest.fn() } as unknown as Reflector;
    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_AUTH_ENABLED') return jwtAuthEnabled;
        if (key === 'NODE_ENV') return nodeEnv;
        return undefined;
      }),
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

  describe('NODE_ENV が production かつ JWT_AUTH_ENABLED が true でないとき', () => {
    it('警告ログを出力する', () => {
      guard = buildGuard('false', 'production');
      const warnSpy = jest
        .spyOn((guard as any).logger, 'warn')
        .mockImplementation(() => {});
      guard.canActivate(mockExecutionContext());
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('JWT_AUTH_ENABLED is not true in production'),
      );
      warnSpy.mockRestore();
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

  describe('handleRequest', () => {
    beforeEach(() => {
      guard = buildGuard('true');
    });

    it('user が存在するとき user を返す', () => {
      const user = { id: 1 };
      expect(guard.handleRequest(null, user)).toBe(user);
    });

    it('user が null のとき UnauthorizedException をスローする', () => {
      expect(() => guard.handleRequest(null, null)).toThrow(
        UnauthorizedException,
      );
    });

    it('err が存在するとき UnauthorizedException をスローする', () => {
      expect(() => guard.handleRequest(new Error('token expired'), null)).toThrow(
        UnauthorizedException,
      );
    });
  });
});
