# Express ミドルウェアと req / res / next

## 概要

Express（および NestJS が内部で使う HTTP フレームワーク）のミドルウェア関数には、
**`req` / `res` / `next`** という 3 つの引数が渡されます。

```typescript
function myMiddleware(req: Request, res: Response, next: NextFunction): void {
  // リクエストを処理して…
  next(); // 次の処理へ渡す
}
```

---

## 3 つの引数の役割

| 引数 | 型 | 役割 |
| --- | --- | --- |
| `req` | `Request` | 受信リクエスト（URL・ヘッダ・ボディ・クエリパラメータ等） |
| `res` | `Response` | 送信レスポンス（ステータスコード・ヘッダ・ボディを書き込む） |
| `next` | `NextFunction` | 次のミドルウェアまたはルートハンドラへ処理を渡す関数 |

---

## ミドルウェアチェーン

複数のミドルウェアは `next()` によって連鎖します。

```text
リクエスト
  │
  ▼ middleware A
  │  next() を呼ぶ
  ▼ middleware B
  │  next() を呼ぶ
  ▼ Route Handler
  │  res.json() でレスポンスを返す
クライアント
```

`next()` を呼ばなければリクエスト処理がそこで止まり、
クライアントはレスポンスを受け取れないままタイムアウトします。

ミドルウェアは必ず以下のどちらかを行う必要があります：

- `next()` を呼んで後続に処理を渡す
- `res.send()` / `res.json()` でレスポンスを返して処理を終了する

---

## このプロジェクトでの使用例

### `correlationIdMiddleware`

Correlation ID をセットしてから `next()` を呼ぶことで、
後続のすべてのハンドラに ID が伝播します。

```typescript
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const correlationId = /* UUID または受信ヘッダの値 */;

  req.headers['x-request-id'] = correlationId; // 後続の処理が req から読める
  res.setHeader('x-request-id', correlationId); // クライアントへ折り返す

  asyncLocalStorage.run({ correlationId }, () => next()); // 次へ渡す
}
```

### NestJS クラスミドルウェアとの違い

NestJS には `NestMiddleware` インターフェースを実装するクラス型のミドルウェアもあります。

```typescript
// クラス型（NestJS）
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log('Request...');
    next();
  }
}

// 関数型（このプロジェクト）
export function correlationIdMiddleware(req, res, next) {
  /* ... */
  next();
}
```

| | 関数型ミドルウェア | クラス型ミドルウェア |
| --- | --- | --- |
| DI（依存性注入） | 不可 | 可能（`@Injectable()`） |
| `app.use()` への登録 | ✅ 直接渡せる | ❌ インスタンス化が必要 |
| シンプルさ | ✅ 軽量 | クラス定義が必要 |
| テスト | Plain 関数として直接呼べる | `Test.createTestingModule` が必要 |

`correlationIdMiddleware` は DI が不要なため関数型を採用しています。
`app.use(correlationIdMiddleware)` で Express に直接登録でき、NestJS のブートストラップより前に実行されます。
これにより `pino-http` より確実に先に動作することが保証されます（→ [構造化ロギング](structured-logging.md) 参照）。

---

## テストでのモック方法

Plain 関数のため `Test.createTestingModule` 不要。
3 つをモックオブジェクトで構築して直接呼び出します。

```typescript
const req  = { headers: {} } as unknown as Request;
const res  = { setHeader: jest.fn() } as unknown as Response;
const next = jest.fn() as NextFunction;

correlationIdMiddleware(req, res, next);

expect(next).toHaveBeenCalledTimes(1);
expect(res.setHeader).toHaveBeenCalledWith('x-request-id', expect.any(String));
expect(req.headers['x-request-id']).toBeDefined();
```

`jest.fn()` で `next` をモックすることで、「ミドルウェアが処理を後続に渡したか」を検証できます。

---

## 実装ファイル

| ファイル | 役割 |
| ------- | ---- |
| `src/shared/middleware/correlation-id.middleware.ts` | Correlation ID を生成・伝播するミドルウェア本体 |
| `src/shared/middleware/correlation-id.middleware.spec.ts` | req / res / next モックを使ったユニットテスト |
| `src/main.ts` | `app.use(correlationIdMiddleware)` で登録 |
