import { Controller, Get, Inject } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HealthIndicatorResult,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  private readonly backendUrl: string;
  private readonly isRedis: boolean;

  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    configService: ConfigService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {
    this.backendUrl = configService.getOrThrow<string>('BACKEND_API_BASE_URL');
    this.isRedis = configService.get<string>('CACHE_STORE') === 'redis';
  }

  @Get('live')
  @Public()
  live(): { status: string } {
    return { status: 'ok' };
  }

  @Get()
  @HealthCheck()
  @Public()
  check() {
    const checks: (() => Promise<HealthIndicatorResult>)[] = [
      () => this.http.pingCheck('backend', this.backendUrl),
    ];
    if (this.isRedis) {
      checks.push(() =>
        this.cache
          .set('__health__', 1, 1)
          .then(() => ({ redis: { status: 'up' as const } }))
          .catch(() => {
            throw new Error('Redis ping failed');
          }),
      );
    }
    return this.health.check(checks);
  }
}
