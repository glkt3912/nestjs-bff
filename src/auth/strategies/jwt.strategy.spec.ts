import { ConfigService } from '@nestjs/config';
import { JwtPayload, JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let strategy: JwtStrategy;

  beforeEach(() => {
    const configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_AUTH_ENABLED') return 'true';
        return undefined;
      }),
      getOrThrow: jest.fn().mockReturnValue('test-secret'),
    } as unknown as ConfigService;

    strategy = new JwtStrategy(configService);
  });

  it('validate() はペイロードをそのまま返す', () => {
    const payload: JwtPayload = { sub: 'user-1', iat: 1000, exp: 2000 };
    expect(strategy.validate(payload)).toEqual(payload);
  });
});
