import { NextFunction, Request, Response } from 'express';
import * as requestContext from '../context/request-context';
import { correlationIdMiddleware } from './correlation-id.middleware';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('correlationIdMiddleware', () => {
  let res: jest.Mocked<Pick<Response, 'setHeader'>>;
  let next: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    res = { setHeader: jest.fn() } as unknown as jest.Mocked<
      Pick<Response, 'setHeader'>
    >;
    next = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
  });

  it('x-request-id ヘッダがない場合 UUID が生成される', () => {
    const req = { headers: {} } as unknown as Request;

    correlationIdMiddleware(req, res as unknown as Response, next);

    expect(req.headers['x-request-id']).toMatch(UUID_REGEX);
  });

  it('生成した UUID が res.setHeader に設定される', () => {
    const req = { headers: {} } as unknown as Request;

    correlationIdMiddleware(req, res as unknown as Response, next);

    expect(res.setHeader).toHaveBeenCalledWith(
      'x-request-id',
      expect.stringMatching(UUID_REGEX),
    );
  });

  it('有効な x-request-id ヘッダがある場合そのまま使われる', () => {
    const existingId = 'existing-correlation-id';
    const req = {
      headers: { 'x-request-id': existingId },
    } as unknown as Request;

    correlationIdMiddleware(req, res as unknown as Response, next);

    expect(req.headers['x-request-id']).toBe(existingId);
    expect(res.setHeader).toHaveBeenCalledWith('x-request-id', existingId);
  });

  it('x-request-id が配列の場合は最初の要素が使われる', () => {
    const req = {
      headers: { 'x-request-id': ['first-id', 'second-id'] },
    } as unknown as Request;

    correlationIdMiddleware(req, res as unknown as Response, next);

    expect(req.headers['x-request-id']).toBe('first-id');
  });

  it('x-request-id が配列かつ最初の要素が 128 文字超の場合 UUID に差し替えられる', () => {
    const longId = 'a'.repeat(129);
    const req = {
      headers: { 'x-request-id': [longId, 'second-id'] },
    } as unknown as Request;

    correlationIdMiddleware(req, res as unknown as Response, next);

    expect(req.headers['x-request-id']).toMatch(UUID_REGEX);
  });

  it('x-request-id が空文字列の場合 UUID が生成される', () => {
    const req = {
      headers: { 'x-request-id': '' },
    } as unknown as Request;

    correlationIdMiddleware(req, res as unknown as Response, next);

    expect(req.headers['x-request-id']).toMatch(UUID_REGEX);
  });

  it('x-request-id が 128 文字超の場合 UUID に差し替えられる', () => {
    const longId = 'a'.repeat(129);
    const req = {
      headers: { 'x-request-id': longId },
    } as unknown as Request;

    correlationIdMiddleware(req, res as unknown as Response, next);

    expect(req.headers['x-request-id']).toMatch(UUID_REGEX);
  });

  it('x-request-id がちょうど 128 文字の場合そのまま使われる', () => {
    const exactId = 'b'.repeat(128);
    const req = {
      headers: { 'x-request-id': exactId },
    } as unknown as Request;

    correlationIdMiddleware(req, res as unknown as Response, next);

    expect(req.headers['x-request-id']).toBe(exactId);
  });

  it('next() が呼ばれる', () => {
    const req = { headers: {} } as unknown as Request;

    correlationIdMiddleware(req, res as unknown as Response, next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('asyncLocalStorage.run が { correlationId } を受け取って呼ばれる', () => {
    const runSpy = jest.spyOn(requestContext.asyncLocalStorage, 'run');
    const req = {
      headers: { 'x-request-id': 'known-id' },
    } as unknown as Request;

    correlationIdMiddleware(req, res as unknown as Response, next);

    expect(runSpy).toHaveBeenCalledWith(
      { correlationId: 'known-id' },
      expect.any(Function),
    );
  });
});
