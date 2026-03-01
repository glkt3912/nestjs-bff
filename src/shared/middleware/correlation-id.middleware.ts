import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { asyncLocalStorage } from '../context/request-context';

const CORRELATION_HEADER = 'x-request-id';
const SAFE_ID_PATTERN = /^[\w\-]{1,128}$/;

export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const raw = req.headers[CORRELATION_HEADER];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  const correlationId =
    candidate && SAFE_ID_PATTERN.test(candidate) ? candidate : randomUUID();

  req.headers[CORRELATION_HEADER] = correlationId;
  res.setHeader(CORRELATION_HEADER, correlationId);

  asyncLocalStorage.run({ correlationId }, () => next());
}
