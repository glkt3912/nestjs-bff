import { ArgumentsHost, HttpStatus } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { AxiosError } from 'axios';
import { getLoggerToken, PinoLogger } from 'nestjs-pino';
import * as requestContext from '../context/request-context';
import { AxiosExceptionFilter } from './axios-exception.filter';

describe('AxiosExceptionFilter', () => {
  let filter: AxiosExceptionFilter;
  let mockLogger: jest.Mocked<PinoLogger>;
  let mockJson: jest.Mock;
  let mockStatus: jest.Mock;
  let mockHost: ArgumentsHost;

  beforeEach(async () => {
    mockJson = jest.fn();
    mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    mockHost = {
      switchToHttp: () => ({
        getResponse: () => ({ status: mockStatus }),
        getRequest: () => ({ url: '/test' }),
      }),
    } as unknown as ArgumentsHost;

    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<PinoLogger>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AxiosExceptionFilter,
        {
          provide: getLoggerToken(AxiosExceptionFilter.name),
          useValue: mockLogger,
        },
      ],
    }).compile();

    filter = module.get<AxiosExceptionFilter>(AxiosExceptionFilter);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  const makeAxiosError = (
    status?: number,
    data?: unknown,
    message = 'Axios Error',
  ): AxiosError => {
    const error = new AxiosError(message);
    if (status !== undefined) {
      error.response = {
        status,
        data,
        statusText: String(status),
        headers: {},
        config: {} as never,
      };
    }
    return error;
  };

  it('バックエンドが 404 を返したとき response.status(404) が呼ばれる', () => {
    jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue('test-id');
    const exception = makeAxiosError(404);

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(404);
  });

  it('バックエンドが 500 を返したとき response.status(500) が呼ばれる', () => {
    jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue('test-id');
    const exception = makeAxiosError(500);

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(500);
  });

  it('exception.response が存在しない場合 INTERNAL_SERVER_ERROR (500) にフォールバックする', () => {
    jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue(undefined);
    const exception = makeAxiosError(undefined);

    filter.catch(exception, mockHost);

    expect(mockStatus).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR);
  });

  it('backendData.message があればそれをレスポンスの message として使う', () => {
    jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue('test-id');
    const exception = makeAxiosError(422, { message: 'Validation failed' });

    filter.catch(exception, mockHost);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Validation failed' }),
    );
  });

  it('backendData.message がなければ exception.message が使われる', () => {
    jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue('test-id');
    const exception = makeAxiosError(400, {}, 'Raw axios error');

    filter.catch(exception, mockHost);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Raw axios error' }),
    );
  });

  it('backendData が null の場合 exception.message が使われる', () => {
    jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue('test-id');
    const exception = makeAxiosError(502, null, 'Bad Gateway');

    filter.catch(exception, mockHost);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Bad Gateway' }),
    );
  });

  it('logger.error が { url, status, correlationId } を含むオブジェクト付きで呼ばれる', () => {
    const correlationId = 'corr-123';
    jest
      .spyOn(requestContext, 'getCorrelationId')
      .mockReturnValue(correlationId);
    const exception = makeAxiosError(503);
    exception.config = { url: '/api/users', headers: {} as never };

    filter.catch(exception, mockHost);

    expect(mockLogger.error).toHaveBeenCalledWith(
      expect.objectContaining({
        url: '/api/users',
        status: 503,
        correlationId,
      }),
      expect.any(String),
    );
  });

  it('レスポンスに statusCode と path と timestamp が含まれる', () => {
    jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue(undefined);
    const exception = makeAxiosError(404);

    filter.catch(exception, mockHost);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        path: '/test',
        timestamp: expect.any(String),
      }),
    );
  });
});
