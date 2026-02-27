import { ConfigService } from '@nestjs/config';
import { JwtPayload, JwtStrategy } from './jwt.strategy';

const buildConfigService = (secret: string | undefined) =>
  ({
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'JWT_AUTH_ENABLED') return 'true';
      return undefined;
    }),
    getOrThrow: jest.fn().mockReturnValue(secret),
  }) as unknown as ConfigService;

describe('JwtStrategy', () => {
  it('validate() はペイロードをそのまま返す', () => {
    const strategy = new JwtStrategy(buildConfigService('test-secret'));
    const payload: JwtPayload = { sub: 'user-1', iat: 1000, exp: 2000 };
    expect(strategy.validate(payload)).toEqual(payload);
  });

  it('JWT_SECRET が空文字列のとき throw する', () => {
    expect(() => new JwtStrategy(buildConfigService(''))).toThrow(
      'JWT_SECRET must not be empty when JWT_AUTH_ENABLED=true',
    );
  });
});
