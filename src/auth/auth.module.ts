import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (c: ConfigService) => {
        const enabled = c.get<string>('JWT_AUTH_ENABLED') === 'true';
        return {
          secret: enabled
            ? c.getOrThrow<string>('JWT_SECRET')
            : 'jwt-auth-disabled',
          signOptions: { expiresIn: c.get<string>('JWT_EXPIRES_IN', '3600s') },
        };
      },
    }),
  ],
  providers: [JwtStrategy, JwtAuthGuard],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
