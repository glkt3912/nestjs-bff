# Axios インターセプター

## 概要

**Axios インターセプター** は、HTTP リクエストの送信前・レスポンスの受信後に処理を差し込む仕組みです。
認証ヘッダの付与・ロギング・モックなど、**全リクエストに共通する横断的関心事** を一箇所に集約できます。

本プロジェクトでは NestJS の `HttpService` が保持する単一の Axios インスタンスに対して、
複数のインターセプターを登録して運用しています。

---

## 動作フロー

```
[BFF]
  │
  ▼ request interceptors（登録順に実行）
  │
  │  AuthHeaderInterceptor  → AUTH_TYPE に応じた認証ヘッダを付与
  │  LoggingInterceptor     → アウトバウンドリクエストをログ出力
  │  MockInterceptor        → MOCK_MODE=true のときフィクスチャを返す
  │
  ├── HTTP ─────────────────────────────▶ [Backend API]
  │
  ▼ response interceptors（登録の逆順に実行）
  │
  │  MockInterceptor     → isMock エラーをレスポンスに変換
  │  LoggingInterceptor  → インバウンドレスポンスをログ出力
  │
[Service / Controller]
```

---

## 登録方法

NestJS では `OnModuleInit` を実装し、`HttpService.axiosRef` からインスタンスを取得して登録します。

```typescript
@Injectable()
export class MyInterceptor implements OnModuleInit {
  constructor(private readonly httpService: HttpService) {}

  onModuleInit() {
    // リクエストインターセプター
    this.httpService.axiosRef.interceptors.request.use(
      (config) => {
        // 送信前の処理（config を加工して返す）
        return config;
      },
      (error) => Promise.reject(error),
    );

    // レスポンスインターセプター
    this.httpService.axiosRef.interceptors.response.use(
      (response) => response,           // 正常時
      (error) => Promise.reject(error), // エラー時
    );
  }
}
```

`onModuleInit` はアプリ起動時に 1 度だけ呼ばれるため、インターセプターは全リクエストに適用されます。

---

## `HttpService.axiosRef` とは

### Axios インスタンスとは

Axios は Node.js・ブラウザで使われる HTTP クライアントライブラリです。
`axios.create()` を呼ぶと **Axios インスタンス** が生成されます。

```typescript
const axiosInstance = axios.create({ baseURL: 'http://example.com', timeout: 5000 });
// axiosInstance.get('/users')          — HTTP リクエスト
// axiosInstance.interceptors.request.use(fn) — インターセプター登録
```

インスタンスは独立した設定（baseURL・timeout など）と
インターセプターリストを持ちます。

### RxJS Observable とは

RxJS は非同期処理をストリームとして扱うライブラリで、`Observable` はその中心となる型です。
Promise の「1 回だけ値を返す」に対して、Observable は **0 回以上の値を時系列で流せる** 抽象です。

```typescript
// Promise — 1 回だけ解決する
const res: Promise<AxiosResponse> = axios.get('/users');

// Observable — subscribe するまで実行されない（遅延評価）
const res$: Observable<AxiosResponse> = httpService.get('/users');
res$.subscribe(res => console.log(res.data)); // ここで初めてリクエストが走る
```

HTTP のように「1 回リクエストして 1 回レスポンスが返る」用途では
Observable は Promise と実質同等ですが、RxJS の `pipe` / `map` / `catchError` などの
オペレーターで処理を合成できる利点があります。

### NestJS の HttpService とは

NestJS は Axios を薄くラップした `HttpService` を提供します。
`HttpService` のメソッドは Axios の戻り値（Promise）を RxJS の `Observable` に変換しており、
`@nestjs/axios` のエコシステムと相性よく使えます。

```
HttpService（NestJS ラッパー）
  ├── .get()  → Observable<AxiosResponse>   （RxJS）
  ├── .post() → Observable<AxiosResponse>   （RxJS）
  └── .axiosRef → 素の Axios インスタンス   ← ここに interceptors を登録する
```

> **このプロジェクトでは** Observable を使わず、生成 API クライアント（`this.api.getUsers()` など）
> または `httpService.axiosRef` を通じて素の Promise として呼び出しています。
> Observable のオペレーターが不要な Thin BFF では、Promise の方がシンプルだからです。

### axiosRef が必要な理由

インターセプターの登録など、Axios 固有の API を直接使いたいとき
`httpService.axiosRef` で素の Axios インスタンスを取得します。

### なぜ 1 つしか存在しないのか

NestJS の DI コンテナはデフォルトで **シングルトン** でインスタンスを管理します。

```
アプリ起動
  └── HttpModule が HttpService を 1 回だけ生成
        └── axiosRef = new Axios(...)（1 つだけ作られる）
```

どのクラスに `HttpService` を注入しても、DI コンテナは **同じインスタンス** を返します。

```typescript
// UsersService に注入される HttpService
@Injectable()
export class UsersService {
  constructor(private readonly httpService: HttpService) {}
}

// LoggingInterceptor が参照する HttpService
@Injectable()
export class LoggingInterceptor {
  constructor(private readonly httpService: HttpService) {}
}
// → 上の 2 つは同じ HttpService オブジェクト → axiosRef も同じ Axios インスタンス
```

`onModuleInit` でインターセプターを 1 度登録すれば、その Axios インスタンスを使う
**すべてのリクエストに自動で適用**されます。

### 複数バックエンドでも 1 つで十分な理由

`createApiProvider()` で作成した各バックエンド向け API クライアントも、同じ `axiosRef` を受け取ります。

```
UsersModule   → DefaultApi   ─┐
OrdersModule  → OrdersApi    ─┤── 同じ axiosRef ──→ インターセプター ──→ 各バックエンド
ProductsModule→ ProductsApi  ─┘
```

バックエンドごとに URL を切り替えるのは API クラスのコンストラクタに渡す `basePath` の役割であり、
Axios インスタンスを複数作る必要はありません。
詳細は [複数バックエンドへの動的ルーティング](multi-backend.md) を参照してください。

---

## このプロジェクトのインターセプター一覧

### AuthHeaderInterceptor

**役割：** `AUTH_TYPE` 環境変数に応じた認証ヘッダと、JWT 認証済みユーザーの ID（`X-User-Id`）をバックエンドへの全送信リクエストに付与する。

```typescript
private authType: string;

onModuleInit() {
  this.authType = this.configService.get<string>('AUTH_TYPE', 'none');

  this.httpService.axiosRef.interceptors.request.use((config) => {
    switch (this.authType) {
      case 'api-key': {
        const apiKey = this.configService.get<string>('BACKEND_API_KEY');
        if (apiKey) config.headers['X-API-Key'] = apiKey;
        break;
      }
      case 'bearer': {
        const token = this.configService.get<string>('BACKEND_BEARER_TOKEN');
        if (token) config.headers['Authorization'] = `Bearer ${token}`;
        break;
      }
      case 'none':
        break;
      default:
        this.logger.warn(`Unknown AUTH_TYPE: "${this.authType}", skipping auth header`);
        break;
    }

    // JWT 認証済みユーザーの sub クレームを転送（JWT_AUTH_ENABLED=false のとき未設定）
    const userId = getUserId();
    if (userId) config.headers['X-User-Id'] = userId;

    return config;
  });
}
```

`AUTH_TYPE` は起動時に一度だけ読み込み、インスタンス変数にキャッシュする。
`getUserId()` は `UserContextInterceptor` が AsyncLocalStorage に格納したユーザー ID を読み取る。

| ヘッダ | 設定条件 | 参照元 |
|--------|---------|--------|
| `X-API-Key: <value>` | `AUTH_TYPE=api-key` かつ `BACKEND_API_KEY` 設定済み | 環境変数 |
| `Authorization: Bearer <token>` | `AUTH_TYPE=bearer` かつ `BACKEND_BEARER_TOKEN` 設定済み | 環境変数 |
| `X-User-Id: <sub>` | `JWT_AUTH_ENABLED=true` かつ JWT 検証成功 | AsyncLocalStorage（req.user.sub） |

---

### LoggingInterceptor

**役割：** 送受信をログ出力し、`x-request-id` ヘッダを伝播する。ファイルアップロード（`multipart/form-data`）のバイナリボディはログに含めない。

```typescript
onModuleInit() {
  // リクエスト：アウトバウンドログ + correlationId をヘッダにセット
  this.httpService.axiosRef.interceptors.request.use((config) => {
    const correlationId = getCorrelationId();
    if (correlationId) {
      config.headers['x-request-id'] = correlationId;
    }
    // config.data で判定する（インターセプター実行時点では Content-Type ヘッダーが未設定のため）
    const isMultipart = config.data instanceof FormData;
    this.logger.info(
      {
        direction: 'outbound',
        method: config.method?.toUpperCase(),
        url: config.url,
        correlationId,
        bodyLogged: !isMultipart,  // FormData（ファイルアップロード）のとき false
      },
      `→ ${config.method?.toUpperCase()} ${config.url}`,
    );
    return config;
  });

  // レスポンス：インバウンドログ
  this.httpService.axiosRef.interceptors.response.use(
    (response) => {
      this.logger.info(
        { direction: 'inbound', status: response.status, url: response.config.url, correlationId: getCorrelationId() },
        `← ${response.status} ${response.config.url}`,
      );
      return response;
    },
    (error) => Promise.reject(error),
  );
}
```

| 項目 | 詳細 |
|------|------|
| 対象 | request / response |
| ログ形式 | `{ direction, method, url, status, correlationId, bodyLogged }` |
| ID 伝播 | `AsyncLocalStorage` から取得した ID を `x-request-id` ヘッダに設定 |
| `bodyLogged` | JSON リクエストは `true`、`multipart/form-data` は `false`（バイナリはログ対象外） |

#### なぜ `bodyLogged: false` を明示するのか

バイナリボディをそのままログに出力すると、ログが破損したり数 MB の出力が発生したりします。
「ログしない」を黙示的に行うのではなく、`bodyLogged: false` を明示することで
「意図的に省略している」とログ上で区別できます。

```json
// JSON リクエスト
{ "direction": "outbound", "method": "POST", "url": "/users", "bodyLogged": true }

// ファイルアップロード
{ "direction": "outbound", "method": "POST", "url": "/upload", "bodyLogged": false }
```

---

### MockInterceptor

**役割：** `MOCK_MODE=true` のとき、バックエンドへの実リクエストを行わずフィクスチャ JSON を返す。

```
request interceptor
  URL を正規化 → fixtures/{METHOD}_{path}.json のパスを解決
  ファイルあり  → { isMock: true, data, status: 200 } を reject（意図的にキャンセル）
  ファイルなし  → config をそのまま返す（実リクエストを通過させる）

response interceptor (rejected ハンドラ)
  isMock: true のエラー → { data, status } の正常レスポンスに変換
  それ以外             → そのまま reject
```

詳細は [開発用モック・スタブモード](mock-mode.md) を参照してください。

---

## なぜ NestJS の Interceptor（`NestInterceptor`）ではなくこのパターンを使うか

NestJS には `@Injectable()` + `NestInterceptor` というインターセプターの仕組みがあります。
しかし、Axios インターセプターとは目的が異なります。

| | NestJS `NestInterceptor` | Axios インターセプター |
|---|---|---|
| 対象 | クライアント ↔ BFF 間の HTTP 処理 | BFF ↔ バックエンド間の HTTP 処理 |
| 適用タイミング | Controller の前後 | Axios リクエスト/レスポンスの前後 |
| 主な用途 | レスポンス変換・タイムアウト・RxJS | 認証ヘッダ・ロギング・リトライ・モック |

バックエンドへの通信に横断処理を挟む場合は **Axios インターセプター** が適切です。

---

## テスト方法

インターセプターに渡される関数をキャプチャして直接呼び出します。

```typescript
let requestInterceptors: Array<(config: unknown) => unknown> = [];

const requestUseMock = jest.fn((fn) => {
  requestInterceptors.push(fn); // 登録された関数をキャプチャ
  return 0;
});

const mockHttpService = {
  axiosRef: {
    interceptors: { request: { use: requestUseMock } },
  },
} as unknown as HttpService;

// テスト対象を初期化
interceptor.onModuleInit();

// キャプチャした関数を直接実行して検証
const config = { headers: {} };
const result = await requestInterceptors[0](config);
expect(result.headers['X-API-Key']).toBe('secret');
```

詳細なパターンは [テスト戦略](testing-strategy.md) を参照してください。

---

## インターセプターはフロントエンドで行うべきでは？

フロントエンドと BFF、それぞれ**別の目的**でインターセプターを使います。どちらか一方ではなく、役割分担です。

### フロントエンドの Axios インターセプター

```text
[ブラウザ]
  ↓ request interceptor
  │  - JWT / Cookie をヘッダに付与（フロントしか持っていない）
  │  - ローディング表示の開始
  ↓
[BFF]
```

### BFF の Axios インターセプター

```text
[BFF]
  ↓ request interceptor
  │  - 認証ヘッダの付与（API キー / Bearer Token）（フロントに漏らしてはいけない）
  │  - JWT 認証済みユーザー ID の転送（X-User-Id）
  │  - Correlation ID の伝播
  │  - 構造化ロギング
  ↓
[Backend API]
```

### 処理の分担基準

| 処理 | フロント | BFF |
|------|----------|-----|
| JWT / Cookie 付与 | ✅ | — |
| 認証ヘッダ付与（API キー / Bearer） | ❌ 漏洩リスク | ✅ |
| X-User-Id 転送（JWT 検証済みユーザー ID） | — | ✅ |
| ローディング UI | ✅ | — |
| 構造化ロギング | — | ✅ |
| Correlation ID 伝播 | △ 起点を作る | ✅ 引き継いで転送 |
| モックモード | △ 開発用途 | ✅ バックエンド不要の開発 |

**基準は「誰が知るべき情報か」**。フロント（ユーザー文脈）の処理はフロントで、サーバー間通信の処理は BFF でやるのが自然な分担です。

---

## 実装ファイル

| ファイル | 役割 |
|---------|------|
| `src/shared/interceptors/auth-header.interceptor.ts` | 認証ヘッダ付与（AUTH_TYPE 切り替え・X-User-Id 転送） |
| `src/shared/interceptors/user-context.interceptor.ts` | JWT ユーザー情報を AsyncLocalStorage に格納（NestInterceptor） |
| `src/shared/interceptors/logging.interceptor.ts` | ロギング・Correlation ID 伝播 |
| `src/shared/interceptors/mock.interceptor.ts` | モックモード |
| `src/shared/shared.module.ts` | Axios インターセプターを `providers` に登録 |
