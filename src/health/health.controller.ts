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
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private configService: ConfigService,
    @Inject(CACHE_MANAGER) private cache: Cache,
  ) {}

  @Get()
  @HealthCheck()
  @Public()
  check() {
    const backendUrl = this.configService.getOrThrow<string>(
      'BACKEND_API_BASE_URL',
    );
    const checks: (() => Promise<HealthIndicatorResult>)[] = [
      () => this.http.pingCheck('backend', backendUrl),
    ];
    if (this.configService.get<string>('CACHE_STORE') === 'redis') {
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
