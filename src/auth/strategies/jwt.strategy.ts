import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: string;
  iat?: number;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(configService: ConfigService) {
    const enabled = configService.get<string>('JWT_AUTH_ENABLED') === 'true';
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: enabled
        ? JwtStrategy.resolveSecret(configService)
        : 'jwt-auth-disabled',
    });
  }

  validate(payload: JwtPayload): JwtPayload {
    return payload; // Thin BFF: DBアクセスなし。req.userに格納
  }

  private static resolveSecret(configService: ConfigService): string {
    const secret = configService.getOrThrow<string>('JWT_SECRET');
    if (!secret) {
      throw new Error(
        'JWT_SECRET must not be empty when JWT_AUTH_ENABLED=true',
      );
    }
    return secret;
  }
}
