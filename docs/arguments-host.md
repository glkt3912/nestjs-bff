# ArgumentsHost

## 概要

**ArgumentsHost** は NestJS の例外フィルター（`ExceptionFilter`）に渡される、
**リクエスト/レスポンスへのアクセスを抽象化したオブジェクト**です。

NestJS は HTTP・WebSocket・gRPC など複数のトランスポートに対応しています。
例外フィルターはどのトランスポートでも動作できるよう、`ArgumentsHost` を介してコンテキストにアクセスします。

---

## 主なメソッド

| メソッド | 返り値 | 用途 |
|---------|--------|------|
| `host.switchToHttp()` | `HttpArgumentsHost` | HTTP の req/res を取得 |
| `host.switchToWs()` | `WsArgumentsHost` | WebSocket のデータを取得 |
| `host.switchToRpc()` | `RpcArgumentsHost` | gRPC のデータを取得 |
| `host.getType()` | `'http'` \| `'ws'` \| `'rpc'` | 現在のトランスポート種別を判定 |

---

## HTTP コンテキストでの使い方

`switchToHttp()` で HTTP 専用のコンテキストに切り替え、Express の `req` / `res` を取得します。

```typescript
@Catch(AxiosError)
export class AxiosExceptionFilter implements ExceptionFilter {
  catch(exception: AxiosError, host: ArgumentsHost) {
    const ctx      = host.switchToHttp();
    const response = ctx.getResponse<Response>(); // Express の res
    const request  = ctx.getRequest<Request>();   // Express の req

    response.status(500).json({
      statusCode: 500,
      path: request.url,
    });
  }
}
```

---

## このプロジェクトでの使用箇所

### `AxiosExceptionFilter`

バックエンドから返ってきた `AxiosError` を BFF のクライアントへの HTTP レスポンスに変換します。

```typescript
catch(exception: AxiosError, host: ArgumentsHost) {
  const ctx      = host.switchToHttp();
  const response = ctx.getResponse<Response>();
  const request  = ctx.getRequest<Request>();

  // バックエンドのステータスをそのまま返す。なければ 500
  const status = exception.response?.status ?? HttpStatus.INTERNAL_SERVER_ERROR;

  response.status(status).json({
    statusCode: status,
    timestamp: new Date().toISOString(),
    path: request.url,
    message: backendData?.message ?? exception.message,
  });
}
```

---

## テストでのモック方法

実際の HTTP サーバーを起動せず、モックオブジェクトで代替します。
`as unknown as ArgumentsHost` でインターフェースの型チェックを回避し、
テストに必要なメソッドだけを定義します。

```typescript
const mockJson   = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

const mockHost = {
  switchToHttp: () => ({
    getResponse: () => ({ status: mockStatus }),
    getRequest:  () => ({ url: '/test' }),
  }),
} as unknown as ArgumentsHost;

filter.catch(exception, mockHost);

expect(mockStatus).toHaveBeenCalledWith(404);
expect(mockJson).toHaveBeenCalledWith(
  expect.objectContaining({ statusCode: 404, path: '/test' }),
);
```

---

## 実装ファイル

| ファイル | 役割 |
|---------|------|
| `src/shared/filters/axios-exception.filter.ts` | `ArgumentsHost` を使った例外フィルター本体 |
| `src/shared/filters/axios-exception.filter.spec.ts` | モックを使ったユニットテスト |
