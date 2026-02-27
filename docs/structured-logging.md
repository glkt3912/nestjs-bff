# 構造化ロギングと Correlation ID 伝播

## 概要

本プロジェクトでは **nestjs-pino** を使用した構造化 JSON ロギングと、
リクエスト全体を追跡するための **Correlation ID (x-request-id)** 伝播を実装しています。

---

## nestjs-pino とは

[nestjs-pino](https://github.com/iamolegga/nestjs-pino) は、
高速な JSON ロガー **[Pino](https://getpino.io/)** を NestJS に統合するライブラリです。

### 主な特徴

| 特徴 | 説明 |
|------|------|
| **JSON 構造化ログ** | 全ログが JSON 形式で出力される。ELK / Datadog / CloudWatch と親和性が高い |
| **リクエストコンテキスト自動付与** | `AsyncLocalStorage` を利用し、任意のレイヤーのログに `req.id` が自動で含まれる |
| **高パフォーマンス** | Pino は winston / bunyan より最大 5〜10 倍高速 |
| **Express / Fastify 両対応** | プラットフォーム非依存 |
| **pino-pretty** | 開発環境では人間が読みやすいカラー出力に変換できる |

### pino-http との関係

```text
nestjs-pino
  └── pino-http   ← Express/Fastify の HTTP リクエスト/レスポンスを自動ログ
        └── pino  ← JSON シリアライザ本体
```

`nestjs-pino` は `pino-http` を NestJS Module として包んだものです。
`pino-http` が HTTP ミドルウェアとして request / response を自動的にロギングします。

---

## Winston との差異

### 比較表

| | Pino | Winston |
|---|------|---------|
| **出力形式** | JSON のみ（構造化ログが前提） | JSON・テキスト・カスタム形式 |
| **パフォーマンス** | 非常に高速（非同期書き込み） | Pino より 5〜10 倍遅い |
| **設計思想** | ログ処理を別プロセス（transport）に委譲 | プロセス内で全処理 |
| **NestJS 統合** | `nestjs-pino`（公式推奨） | `nest-winston` |
| **非同期コンテキスト** | `pino-http` が `AsyncLocalStorage` と統合済み | 自前実装が必要 |
| **開発時の可読性** | `pino-pretty` で変換 | デフォルトでカラー出力 |

### パフォーマンスが高い理由

Winston はログを**プロセス内で同期的に処理**します。
Pino は**最小限の JSON 文字列を生成して stdout に流す**だけにとどめ、フォーマットや色付けは別プロセスに委譲します。

```text
【Winston】
  ログ呼び出し → フォーマット → トランスポート処理 → 出力
                （すべてメインプロセス内）

【Pino】
  ログ呼び出し → JSON を stdout に書き込む（最小処理）
                     ↓ パイプ
               pino-pretty（別プロセス）→ 人間が読める形式
```

### 構造化ログの書き方の違い

```typescript
// Winston
logger.info('user fetched', { userId: 42 });
// → message が文字列、metadata は別フィールド（実装依存）

// Pino（nestjs-pino）
this.logger.info({ userId: 42 }, 'user fetched');
// → 第1引数がオブジェクト、第2引数がメッセージ（JSON に自然にマージされる）
```

### このプロジェクトで Pino を選んだ理由

- BFF はリクエストを中継するだけなので**ログ出力が多い** → パフォーマンスが重要
- `pino-http` が `AsyncLocalStorage` と統合済みで **Correlation ID 伝播が簡単**
- JSON 構造化ログが標準なので **Datadog / CloudWatch などのログ基盤と親和性が高い**

---

## AsyncLocalStorage とは

Node.js 標準モジュール (`async_hooks`) が提供する、**非同期処理をまたいでデータを共有する仕組み**です。

### 問題背景：非同期処理でコンテキストが消える

Node.js は1プロセスで複数リクエストを並行処理します。
グローバル変数に `correlationId` を書くと、リクエスト A の値がリクエスト B に上書きされます。

```text
リクエスト A ──┐
               ├─ await DB処理 ──→ correlationId = "aaa"
リクエスト B ──┤
               ├─ await DB処理 ──→ correlationId = "bbb" ← A が使うつもりだった値が消える
```

### AsyncLocalStorage の解決策

`run()` で囲まれたコールバックと、その中で発生するすべての非同期処理に**専用のストアが自動で紐づく**。

```typescript
const storage = new AsyncLocalStorage<{ correlationId: string }>();

// リクエスト A の処理開始
storage.run({ correlationId: 'aaa' }, async () => {
  await someAsyncOperation();
  storage.getStore(); // → { correlationId: 'aaa' } ← B に上書きされない
});

// リクエスト B の処理開始（同時並行）
storage.run({ correlationId: 'bbb' }, async () => {
  await someAsyncOperation();
  storage.getStore(); // → { correlationId: 'bbb' }
});
```

### NestJS の REQUEST スコープとの違い

| | `AsyncLocalStorage` | NestJS REQUEST スコープ |
|---|---------------------|------------------------|
| 仕組み | Node.js ネイティブ | DI コンテナがリクエストごとにインスタンス生成 |
| パフォーマンス | 高速（オーバーヘッドほぼなし） | リクエストごとに DI ツリーを再構築するコストあり |
| 使い方 | 関数呼び出しだけで取得可能 | コンストラクタ注入が必要 |
| 適用範囲 | Axios interceptor 等 DI 外でも使える | NestJS DI 管理クラス内のみ |

本プロジェクトでは `correlationIdMiddleware` が `asyncLocalStorage.run()` でコンテキストを確立し、
`LoggingInterceptor` や `AxiosExceptionFilter` から `getCorrelationId()` で取得しています。
また、`UserContextInterceptor` が JWT 検証後に `store.userId` を書き込み、
`AuthHeaderInterceptor` が `getUserId()` で読み取り `X-User-Id` ヘッダに付与します。

---

## パッケージ構成

```bash
npm install nestjs-pino pino-http        # 本体
npm install -D pino-pretty               # 開発時の可読フォーマッタ
```

---

## 実装アーキテクチャ

### リクエスト処理フロー

```text
Client (with optional x-request-id)
  │
  ▼ app.use()  ← main.ts (Express に直接登録: Phase 1)
correlationIdMiddleware
  - x-request-id ヘッダを読む or crypto.randomUUID() で生成
  - req.headers['x-request-id'] に書き戻す
  - AsyncLocalStorage.run({ correlationId }, next)
  - res.setHeader('x-request-id', correlationId)
  │
  ▼ configure() ← LoggerModule (NestJS middleware pipeline: Phase 2)
pino-http middleware
  - genReqId: req.headers['x-request-id'] を読む (一致保証)
  - 全 HTTP request/response を JSON で自動ロギング
  │
  ▼
JwtAuthGuard → req.user に JWT ペイロードを格納
  │
  ▼
UserContextInterceptor (NestJS APP_INTERCEPTOR)
  - req.user.sub を AsyncLocalStorage の store.userId に格納
  │
  ▼
NestJS route handler
  │
  ▼ AuthHeaderInterceptor / LoggingInterceptor (Axios interceptors)
  - getCorrelationId() → x-request-id ヘッダに付与
  - getUserId()        → X-User-Id ヘッダに付与（JWT_AUTH_ENABLED=true のとき）
  - 構造化ログ { direction, method, url, correlationId }
  │
  ▼
Backend API (x-request-id・X-User-Id ヘッダを受け取る)
```

### ミドルウェア実行順序の根拠

`app.use()` は Express に直接追加され、NestJS ブートストラップの **Phase 1** で実行される。
`LoggerModule.configure()` は `app.init()` 内部の **Phase 2**。
よって `correlationIdMiddleware` は必ず `pino-http` より先に動き、
correlation ID が確定した状態で pino-http がログを出力できる。

---

## 実装ファイル

### `src/shared/context/request-context.ts`

`AsyncLocalStorage` を使い、リクエストスコープの correlation ID をスタック全体で共有します。
NestJS の REQUEST スコープ (DI) と異なり、**パフォーマンスオーバーヘッドがありません**。

```typescript
import { AsyncLocalStorage } from 'async_hooks';

interface RequestContext {
  correlationId: string;
  userId?: string; // JWT 検証済みユーザーの sub クレーム（UserContextInterceptor が格納）
}

export const asyncLocalStorage = new AsyncLocalStorage<RequestContext>();

export function getCorrelationId(): string | undefined {
  return asyncLocalStorage.getStore()?.correlationId;
}

export function getUserId(): string | undefined {
  return asyncLocalStorage.getStore()?.userId;
}
```

### `src/shared/middleware/correlation-id.middleware.ts`

NestJS クラスではなく Plain 関数として定義することで `app.use()` に直接渡せます。

```typescript
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { asyncLocalStorage } from '../context/request-context';

const CORRELATION_HEADER = 'x-request-id';

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const raw = req.headers[CORRELATION_HEADER];
  const candidate = Array.isArray(raw) ? raw[0] : raw;
  // 128文字超の入力は破棄してUUID生成（ログ肥大化防止）
  const correlationId = candidate && candidate.length <= 128 ? candidate : randomUUID();

  req.headers[CORRELATION_HEADER] = correlationId;  // pino-http の genReqId が読む
  res.setHeader(CORRELATION_HEADER, correlationId); // クライアントへ折り返す

  asyncLocalStorage.run({ correlationId }, () => next());
}
```

### `src/app.module.ts` — LoggerModule 設定

```typescript
LoggerModule.forRootAsync({
  imports: [ConfigModule],
  inject: [ConfigService],
  useFactory: (configService: ConfigService) => ({
    pinoHttp: {
      level: configService.get<string>('LOG_LEVEL', 'info'),
      genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
      transport: configService.get('NODE_ENV') !== 'production'
        ? { target: 'pino-pretty', options: { colorize: true, singleLine: true } }
        : undefined,
      serializers: {
        req: (req) => ({ method: req.method, url: req.url }), // Authorization/Cookie をマスク
        res: (res) => ({ statusCode: res.statusCode }),
      },
      autoLogging: {
        ignore: (req) => req.url === '/api/health', // ヘルスチェックのノイズを抑制
      },
    },
  }),
}),
```

---

## ログ出力例

### 開発環境 (pino-pretty)

```text
[12:34:56.789] INFO (req.id=my-trace-123): request completed
  req: { "method": "GET", "url": "/api/users" }
  res: { "statusCode": 200 }
```

### 本番環境 (JSON)

```json
{
  "level": 30,
  "time": 1700000000000,
  "pid": 1234,
  "hostname": "app-pod-xyz",
  "req": { "method": "GET", "url": "/api/users" },
  "res": { "statusCode": 200 },
  "reqId": "my-trace-123",
  "responseTime": 42,
  "msg": "request completed"
}
```

### アウトバウンドリクエストログ (LoggingInterceptor)

```json
{
  "level": 30,
  "direction": "outbound",
  "method": "GET",
  "url": "http://backend/users",
  "correlationId": "my-trace-123",
  "msg": "→ GET http://backend/users"
}
```

---

## ログレベル制御

環境変数 `LOG_LEVEL` でレベルを変更できます。

| レベル | 用途 |
| ------ | ---- |
| `trace` | 非常に詳細なデバッグ情報 |
| `debug` | 開発時のデバッグ情報 |
| `info` | 通常の運用ログ (デフォルト) |
| `warn` | 警告（処理は継続） |
| `error` | エラー（処理が失敗） |
| `fatal` | 致命的エラー |

```bash
# .env
LOG_LEVEL=info
```

```bash
# 起動時に上書き
LOG_LEVEL=debug npm run start:dev
```

---

## InjectPinoLogger の使い方

`@InjectPinoLogger()` デコレータで Pino ネイティブ API を直接使えます。
`new Logger()` より型安全で、構造化オブジェクトを第一引数で渡せます。

```typescript
import { PinoLogger, InjectPinoLogger } from 'nestjs-pino';

@Injectable()
export class MyService {
  constructor(
    @InjectPinoLogger(MyService.name)
    private readonly logger: PinoLogger,
  ) {}

  doSomething() {
    // 構造化オブジェクト + メッセージ
    this.logger.info({ userId: 42, action: 'fetch' }, 'fetching user');

    // エラーログ
    this.logger.error({ err: new Error('oops') }, 'something went wrong');
  }
}
```

`new Logger(MyService.name)` との違い:

| | `new Logger()` (NestJS) | `@InjectPinoLogger()` |
| --- | --- | --- |
| 構造化オブジェクト | 第2引数以降が文字列変換される | 第1引数にオブジェクトを渡せる |
| DI | 不要 | コンストラクタ注入が必要 |
| テスト | `jest.spyOn(logger, 'log')` | `jest.fn()` でモック |
| APP_FILTER 等 | 使用可 | DI 対応クラスで使用可 |

---

## 検証方法

```bash
# 1. x-request-id を指定した場合 — 同じ ID がログと Backend 双方に現れる
curl -s http://localhost:3000/api/users -H "x-request-id: my-trace-123"

# 2. 指定なし — UUID が自動生成され全ログに同じ ID が出力される
curl -s http://localhost:3000/api/users

# 3. レスポンスヘッダに x-request-id が返ること
curl -v http://localhost:3000/api/users 2>&1 | grep x-request-id

# 4. ユニットテスト
npm test -- logging.interceptor

# 5. LOG_LEVEL=debug で詳細ログ確認
LOG_LEVEL=debug npm run start:dev
```

---

## 参考リンク

- [nestjs-pino GitHub](https://github.com/iamolegga/nestjs-pino)
- [pino 公式ドキュメント](https://getpino.io/)
- [pino-http](https://github.com/pinojs/pino-http)
- [pino-pretty](https://github.com/pinojs/pino-pretty)
