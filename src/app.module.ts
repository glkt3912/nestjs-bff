import { Module } from '@nestjs/common';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import { LRUCache } from 'lru-cache';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module';
import { JwtAuthGuard } from './auth/guards/jwt-auth.guard';
import { HealthModule } from './health/health.module';
import { AxiosExceptionFilter } from './shared/filters/axios-exception.filter';
import { HttpExceptionFilter } from './shared/filters/http-exception.filter';
import { UserAwareCacheInterceptor } from './shared/interceptors/user-aware-cache.interceptor';
import { UserContextInterceptor } from './shared/interceptors/user-context.interceptor';
import { SharedModule } from './shared/shared.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    LoggerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        pinoHttp: {
          level: configService.get<string>('LOG_LEVEL', 'info'),
          genReqId: (req) =>
            (req.headers['x-request-id'] as string) ?? randomUUID(),
          transport:
            configService.get('NODE_ENV') !== 'production'
              ? {
                  target: 'pino-pretty',
                  options: { colorize: true, singleLine: true },
                }
              : undefined,
          serializers: {
            req: (req) => ({ method: req.method, url: req.url }),
            res: (res) => ({ statusCode: res.statusCode }),
          },
          autoLogging: { ignore: (req) => req.url === '/api/health' },
        },
      }),
    }),
    ThrottlerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => [
        {
          ttl: Number(configService.get('THROTTLE_TTL', 60000)),
          limit: Number(configService.get('THROTTLE_LIMIT', 100)),
        },
      ],
    }),
    CacheModule.registerAsync({
      isGlobal: true,
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // CACHE_TTL=0 は Keyv では「TTL なし（永久）」になるため 1ms にフォールバック
        const rawTtl = Number(config.get('CACHE_TTL', 30));
        const ttlMs = rawTtl > 0 ? rawTtl * 1000 : 1;
        if (config.get<string>('CACHE_STORE') === 'redis') {
          const host = config.getOrThrow<string>('REDIS_HOST');
          const port = Number(config.get('REDIS_PORT', 6379));
          const password = config.get<string>('REDIS_PASSWORD');
          const db = Number(config.get('REDIS_DB', 0));
          const url = password
            ? `redis://:${password}@${host}:${port}/${db}`
            : `redis://${host}:${port}/${db}`;
          return {
            stores: [new Keyv({ store: new KeyvRedis(url), ttl: ttlMs })],
          };
        }
        // in-memory: LRU でエントリ数上限を設けて OOM を防ぐ
        const maxItems = Number(config.get('CACHE_MAX_ITEMS', 500));
        return {
          stores: [
            new Keyv({ store: new LRUCache({ max: maxItems }), ttl: ttlMs }),
          ],
        };
      },
    }),
    SharedModule,
    HealthModule,
    UsersModule,
    AuthModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: UserAwareCacheInterceptor },
    { provide: APP_INTERCEPTOR, useClass: UserContextInterceptor },
    { provide: APP_FILTER, useClass: AxiosExceptionFilter },
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
  ],
})
export class AppModule {}
