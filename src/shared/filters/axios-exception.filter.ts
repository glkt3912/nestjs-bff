import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpStatus,
} from '@nestjs/common';
import { AxiosError } from 'axios';
import { Request, Response } from 'express';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import { getCorrelationId } from '../context/request-context';

@Catch(AxiosError)
export class AxiosExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(AxiosExceptionFilter.name)
    private readonly logger: PinoLogger,
  ) {}

  catch(exception: AxiosError, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const status =
      exception.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;
    const backendData = exception.response?.data as
      | Record<string, unknown>
      | undefined;

    this.logger.error(
      {
        url: exception.config?.url,
        status,
        correlationId: getCorrelationId(),
      },
      `Backend API error: ${exception.config?.url} → ${status}`,
    );

    response.status(status).json({
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: backendData?.message ?? exception.message,
    });
  }
}
