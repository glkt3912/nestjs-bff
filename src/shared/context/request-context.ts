import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  correlationId: string;
  userId?: string;
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function getCorrelationId(): string | undefined {
  return asyncLocalStorage.getStore()?.correlationId;
}

export function getUserId(): string | undefined {
  return asyncLocalStorage.getStore()?.userId;
}
