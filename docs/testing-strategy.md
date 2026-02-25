# テスト戦略

## テスト方針

このプロジェクトは **Thin BFF** アーキテクチャを採用している。
Controller と Service は 1 行委譲のみで実質的なロジックを持たない。

```typescript
// 典型的な Controller（ロジックなし）
@Get()
findAll(): Observable<UserDto[]> {
  return this.usersService.findAll();
}

// 典型的な Service（ロジックなし）
findAll(): Observable<UserDto[]> {
  return this.usersApi.usersControllerFindAll();
}
```

これらに対するユニットテストは：

- **実質的な価値を提供しない**（委譲の呼び出しを確認するだけ）
- **将来の技術的負債になる**（全 API モジュールで同じボイラープレートが増殖する）
- **生成コードの仕様変更に追随するコストが高い**

したがって、Controller / Service テストは意図的に省略する。

---

## テストする価値があるレイヤー

実際のロジックを持つ**共通インフラ層**に絞ってテストを追加する。

| ファイル | 責務 | 検証内容 |
|---------|------|---------|
| `axios-exception.filter.ts` | バックエンドの Axios エラーを HTTP レスポンスに変換 | ステータスコードマッピング・フォールバック・ログ出力 |
| `auth-header.interceptor.ts` | 送信リクエストに API キーを付与 | インターセプタ登録・ヘッダ注入・キー未設定時のスキップ |
| `correlation-id.middleware.ts` | リクエスト ID の生成・伝播・バリデーション | UUID 生成・既存 ID の再利用・128 文字制限・AsyncLocalStorage への格納 |
| `logging.interceptor.ts` | Axios リクエスト/レスポンスの構造化ログ出力 | ログフィールド・correlationId 伝播・エラー処理 |
| `mock.interceptor.ts` | MOCK_MODE 時にフィクスチャ JSON を返す | モード判定・URL 正規化・パストラバーサル防止 |

---

## テストパターン集

### Axios インターセプタのキャプチャ

`HttpService.axiosRef.interceptors.request.use` に渡される関数を配列に格納し、
後から呼び出してテストするパターン。

```typescript
let requestInterceptors: Array<(config: unknown) => unknown> = [];

const requestUseMock = jest.fn((fn) => {
  requestInterceptors.push(fn);
  return 0;
});

const mockHttpService = {
  axiosRef: {
    interceptors: {
      request: { use: requestUseMock },
    },
  },
} as unknown as HttpService;
```

### PinoLogger のモック

`getLoggerToken()` を使って DI トークンを解決する。
`@InjectPinoLogger()` を使うクラスはこのパターンが必要。

```typescript
mockLogger = {
  error: jest.fn(),
  info: jest.fn(),
} as unknown as jest.Mocked<PinoLogger>;

providers: [
  MyClass,
  { provide: getLoggerToken(MyClass.name), useValue: mockLogger },
]
```

### ArgumentsHost のモック（ExceptionFilter）

NestJS の `ArgumentsHost` は完全なモックオブジェクトで代替する。

```typescript
const mockJson = jest.fn();
const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

const mockHost = {
  switchToHttp: () => ({
    getResponse: () => ({ status: mockStatus }),
    getRequest: () => ({ url: '/test' }),
  }),
} as unknown as ArgumentsHost;
```

### Plain 関数のテスト（Middleware）

`Test.createTestingModule` は不要。
`req / res / next` をモックオブジェクトとして構築し直接呼び出す。

```typescript
const req = { headers: {} } as unknown as Request;
const res = { setHeader: jest.fn() } as unknown as Response;
const next = jest.fn();

correlationIdMiddleware(req, res, next);

expect(req.headers['x-request-id']).toMatch(UUID_REGEX);
```

### AsyncLocalStorage のスパイ

`asyncLocalStorage.run` への引数を検証するパターン。

```typescript
import * as requestContext from '../context/request-context';

const runSpy = jest.spyOn(requestContext.asyncLocalStorage, 'run');

// テスト対象を実行後
expect(runSpy).toHaveBeenCalledWith(
  { correlationId: 'known-id' },
  expect.any(Function),
);
```

### getCorrelationId のモック

AsyncLocalStorage をまたがる関数呼び出しをシンプルにモックする。

```typescript
import * as requestContext from '../context/request-context';

jest.spyOn(requestContext, 'getCorrelationId').mockReturnValue('test-id-123');
```

---

## Jest を選定している理由

NestJS CLI がデフォルトで Jest を採用しており、このプロジェクトもそれを踏襲しています。
ただし、単なるデフォルト踏襲ではなく、以下の理由から積極的に採用しています。

### 他のテストフレームワークとの比較

| | Jest | Vitest | Mocha + Chai |
| --- | --- | --- | --- |
| **セットアップ** | ゼロコンフィグ（NestJS 統合済み） | Vite 環境向け | 別途 assertion / spy ライブラリが必要 |
| **モック** | `jest.fn()` / `jest.spyOn()` が組み込み | Jest 互換 API | `sinon` 等が必要 |
| **型サポート** | `@types/jest` で完結 | 同等 | 複数パッケージが必要 |
| **ts-jest** | NestJS 公式サポート | `vitest` に標準統合 | `ts-mocha` 等が必要 |
| **実行速度** | 並列実行（Worker ベース） | Vitest より遅い | 設定次第 |

### Jest を選ぶ理由

#### 1. NestJS との統合が最も成熟している

`@nestjs/testing` の `Test.createTestingModule()` は Jest を前提に設計されています。
DI コンテナをテスト用に構築し、`module.get<T>()` でインスタンスを取得するパターンは Jest と相性が良いです。

```typescript
const module = await Test.createTestingModule({
  providers: [AxiosExceptionFilter, { provide: getLoggerToken(...), useValue: mockLogger }],
}).compile();

filter = module.get<AxiosExceptionFilter>(AxiosExceptionFilter);
```

#### 2. モック機能がオールインワン

別ライブラリなしで spy・mock・stub・assertion が揃っています。

```typescript
jest.fn()                        // モック関数
jest.spyOn(obj, 'method')        // スパイ
jest.mock('./module')            // モジュール全体のモック
expect(fn).toHaveBeenCalledWith  // アサーション
```

#### 3. `ts-jest` による TypeScript サポート

コンパイルなしに `.spec.ts` を直接実行できます。
`tsconfig.json` の型チェックをそのままテストに活用できます。

#### 4. スナップショットテスト・カバレッジが組み込み

`jest --coverage` 一発でカバレッジレポートが生成され、CI との統合も容易です。

---

## カバレッジ設定

### 閾値

```json
"coverageThreshold": {
  "global": { "statements": 70 }
}
```

インフラ層テストを充実させることで **70% 以上** を目標とする。
実際の計測対象（後述の除外パターン適用後）では 90% 超を維持している。

### 除外パターン

```json
"coveragePathIgnorePatterns": [
  "/node_modules/",
  "src/generated/",
  "src/main\\.ts",
  "\\.module\\.ts$",
  "src/users/",
  "src/shared/config/"
]
```

| 除外パターン | 理由 |
| ---------- | ---- |
| `src/generated/` | `openapi-generator` で自動生成。生成のたびに上書きされるためテスト不可 |
| `src/main.ts` | NestJS ブートストラップのみ。ユニットテスト不可（E2E 対象） |
| `*.module.ts` | NestJS の DI 宣言メタデータのみ。ロジックなし |
| `src/users/` | Thin BFF 方針により意図的にテストなし（純粋委譲のため） |
| `src/shared/config/` | `src/generated/` の型に依存するファクトリー。生成コードなしにテスト不可 |

これらを除外することで、**テストする価値があるコードのみ** に対してカバレッジ閾値が適用される。

---

## 将来の API 追加時のガイドライン

新しい API モジュール（例：`orders`）を追加する際は：

1. **Controller / Service テストは作成しない**（Thin BFF の方針に従う）
2. **新規インフラ機能を追加した場合はテストを書く**
   - カスタムバリデーション、ビジネスルール変換、エラーマッピングなど
3. **既存インフラ層の変更はテストで検証する**
   - `AxiosExceptionFilter`、`AuthHeaderInterceptor` などを拡張した場合
4. **E2E テストで統合検証を行う**（将来的な `test/` ディレクトリ）

新しいモジュールが共通インフラを流用するだけであれば、既存テストがカバーしている。
