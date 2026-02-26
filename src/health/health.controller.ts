import { Controller, Get } from '@nestjs/common';
import {
  HealthCheck,
  HealthCheckService,
  HttpHealthIndicator,
} from '@nestjs/terminus';
import { ConfigService } from '@nestjs/config';
import { Public } from '../auth/decorators/public.decorator';

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private http: HttpHealthIndicator,
    private configService: ConfigService,
  ) {}

  @Get()
  @HealthCheck()
  @Public()
  check() {
    const backendUrl = this.configService.getOrThrow<string>(
      'BACKEND_API_BASE_URL',
    );
    return this.health.check([
      () => this.http.pingCheck('backend', backendUrl),
    ]);
  }
}
