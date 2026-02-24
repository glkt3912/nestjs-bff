import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { asyncLocalStorage } from '../context/request-context';

const CORRELATION_HEADER = 'x-request-id';

export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const raw = req.headers[CORRELATION_HEADER];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const correlationId = candidate && candidate.length <= 128 ? candidate : randomUUID();

  req.headers[CORRELATION_HEADER] = correlationId;
  res.setHeader(CORRELATION_HEADER, correlationId);

  asyncLocalStorage.run({ correlationId }, () => next());
}
