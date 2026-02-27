import { ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import { asyncLocalStorage } from '../context/request-context';
import { UserContextInterceptor } from './user-context.interceptor';

const makeContext = (user: unknown) =>
  ({
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  }) as unknown as ExecutionContext;

const makeCallHandler = () => ({ handle: () => of(null) });

describe('UserContextInterceptor', () => {
  let interceptor: UserContextInterceptor;

  beforeEach(() => {
    interceptor = new UserContextInterceptor();
  });

  it('req.user.sub が存在するとき AsyncLocalStorage の userId に格納される', (done) => {
    asyncLocalStorage.run({ correlationId: 'test-id' }, () => {
      interceptor.intercept(makeContext({ sub: 'user-123' }), makeCallHandler());
      expect(asyncLocalStorage.getStore()?.userId).toBe('user-123');
      done();
    });
  });

  it('req.user が null のとき userId は格納されない', (done) => {
    asyncLocalStorage.run({ correlationId: 'test-id' }, () => {
      interceptor.intercept(makeContext(null), makeCallHandler());
      expect(asyncLocalStorage.getStore()?.userId).toBeUndefined();
      done();
    });
  });

  it('req.user.sub が undefined のとき userId は格納されない', (done) => {
    asyncLocalStorage.run({ correlationId: 'test-id' }, () => {
      interceptor.intercept(makeContext({ sub: undefined }), makeCallHandler());
      expect(asyncLocalStorage.getStore()?.userId).toBeUndefined();
      done();
    });
  });

  it('AsyncLocalStorage のストアが存在しないとき例外をスローしない', () => {
    expect(() => {
      interceptor.intercept(makeContext({ sub: 'user-123' }), makeCallHandler());
    }).not.toThrow();
  });

  it('next.handle() の Observable をそのまま返す', (done) => {
    asyncLocalStorage.run({ correlationId: 'test-id' }, () => {
      const result$ = interceptor.intercept(
        makeContext({ sub: 'user-123' }),
        makeCallHandler(),
      );
      result$.subscribe({
        complete: () => done(),
      });
    });
  });
});
