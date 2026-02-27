# Guard / Interceptor / Middleware

## 概要

NestJS のリクエスト処理パイプラインには、横断的関心事（認証・ロギング・コンテキスト付与など）を
コントローラーから切り離して実装するための仕組みが 3 つあります。

| 仕組み | 一言で | 主な用途 |
|--------|--------|---------|
| **Middleware** | 通過処理 | 全リクエストへの前処理（ID 生成・ロギング） |
| **Guard** | 門番 | アクセス制御（認証・認可） |
| **Interceptor** | 前後処理 | コントローラーの前後への割り込み・レスポンス変換 |

---

## 実行順序

```text
クライアント リクエスト
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  Middleware                                           │
│  （Express レベル。NestJS Guard/Interceptor より先）  │
│  例: correlationIdMiddleware, pino-http               │
└───────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  Guard                                                │
│  （true → 次へ進む / false or throw → リクエスト拒否）│
│  例: ThrottlerGuard → JwtAuthGuard                    │
└───────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  Interceptor（前処理）                                │
│  例: UserContextInterceptor, ClassSerializerInterceptor│
└───────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  Controller → Service → Axios                         │
└───────────────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────────────┐
│  Interceptor（後処理）                                │
│  レスポンスへの割り込みはここで行う                   │
└───────────────────────────────────────────────────────┘
        │
        ▼
クライアント レスポンス
```

---

## Middleware

### 特徴

Express の仕組みをそのまま使う。`req`・`res`・`next` の 3 引数を受け取り、
処理後に `next()` を呼んで次の処理へ進める。

```typescript
export function correlationIdMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  const correlationId = req.headers['x-request-id'] ?? randomUUID();
  asyncLocalStorage.run({ correlationId }, () => next()); // ← next() を呼ぶ
}
```

### 登録方法

```typescript
// main.ts — Express に直接登録（NestJS パイプラインの外側）
app.use(correlationIdMiddleware);
```

### できること・できないこと

| できること | できないこと |
|-----------|-------------|
| Guard より前に実行できる | `ExecutionContext` を受け取れない（Handler・Class 情報が不明） |
| `req`・`res` を直接操作できる | Guard の結果（`req.user` 等）にはアクセスできない |
| NestJS の DI を使わずに書ける（Plain 関数） | レスポンスを Observable で扱えない |

### いつ使うか

- Guard より先に動かす必要がある処理（Correlation ID 生成、ロギング基盤の確立など）
- NestJS に依存しないシンプルな通過処理

---

## Guard

### 特徴

`canActivate()` が `true` を返せばリクエストを通し、`false` または例外をスローすれば拒否する。
**「通すか弾くか」の判断だけ** を担う。

```typescript
@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(), // メソッド単位のメタデータを確認
      context.getClass(),   // クラス単位のメタデータを確認
    ]);
    if (isPublic) return true;          // @Public() → 通過
    return super.canActivate(context);  // JWT 検証 → 失敗なら 401
  }

  handleRequest<TUser>(err: unknown, user: TUser): TUser {
    if (err || !user) throw new UnauthorizedException(); // 失敗を明示的にスロー
    return user; // 成功 → req.user に格納される
  }
}
```

### 登録方法

```typescript
// app.module.ts — グローバルガードとして登録
{ provide: APP_GUARD, useClass: ThrottlerGuard },
{ provide: APP_GUARD, useClass: JwtAuthGuard },
// 複数登録した場合は配列順に実行される
```

### できること・できないこと

| できること | できないこと |
|-----------|-------------|
| `ExecutionContext` 経由で Handler・Class のメタデータを読める | レスポンスを加工できない |
| `Reflector` でデコレータ（`@Public()` 等）を参照できる | Middleware より先に実行できない |
| NestJS の DI をフル活用できる | |

### いつ使うか

- 認証（JWT・API キー）
- 認可（ロール確認）
- レート制限

---

## Interceptor

### 特徴

`intercept()` はコントローラーの**前後両方**に割り込める。
`next.handle()` を境に「前処理」と「後処理」を書き分ける。
RxJS の `Observable` を返すため、レスポンスのストリームを変換できる。

```typescript
@Injectable()
export class UserContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // ── 前処理（Guard の後、Controller の前）──
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.sub; // Guard 後なので req.user が確定している
    if (userId) {
      asyncLocalStorage.getStore()!.userId = userId;
    }

    return next.handle(); // ← ここでコントローラーが実行される

    // ── 後処理が必要なら pipe() を使う ──
    // return next.handle().pipe(
    //   map((data) => ({ ...data, wrapped: true })),
    // );
  }
}
```

### 登録方法

```typescript
// app.module.ts — グローバルインターセプターとして登録
{ provide: APP_INTERCEPTOR, useClass: UserContextInterceptor },
```

### できること・できないこと

| できること | できないこと |
|-----------|-------------|
| Guard の後に動くため `req.user` にアクセスできる | Guard より前に実行できない |
| レスポンスを RxJS で変換できる（`map`・`tap` 等） | `true`/`false` でリクエストを止められない |
| 前処理と後処理の両方を 1 クラスに書ける | |
| `ExecutionContext` 経由で Handler・Class 情報を読める | |

### いつ使うか

- Guard の後に取得できる情報をコンテキストに格納する（`UserContextInterceptor`）
- レスポンスを一律変換する（`ClassSerializerInterceptor`）
- 処理時間の計測・後処理ロギング

---

## 3つの比較まとめ

| 観点 | Middleware | Guard | Interceptor |
|------|-----------|-------|-------------|
| 実行タイミング | 最初（Guard より前） | Middleware の後 | Guard の後・Controller の前後 |
| `req.user` へのアクセス | ❌（Guard 未実行） | ❌（Guard 自身が作る） | ✅（Guard 後） |
| リクエストを止める | `next()` を呼ばない | `false` / throw | throw のみ |
| レスポンスを変換 | 可能だが煩雑 | ❌ | ✅ RxJS |
| `ExecutionContext` | ❌ | ✅ | ✅ |
| NestJS DI | クラス型なら可 | ✅ | ✅ |
| 主な用途 | ID 生成・基盤ロギング | 認証・認可・レート制限 | コンテキスト付与・レスポンス変換 |

---

## このプロジェクトでの実装一覧

### Middleware

| ファイル | 役割 |
|---------|------|
| `src/shared/middleware/correlation-id.middleware.ts` | Correlation ID を生成し AsyncLocalStorage に格納 |

### Guard

| ファイル | 役割 |
|---------|------|
| `src/auth/guards/jwt-auth.guard.ts` | JWT 検証・`@Public()` スキップ・`handleRequest` で UnauthorizedException をスロー |

### Interceptor（NestJS）

| ファイル | 役割 |
|---------|------|
| `src/shared/interceptors/user-context.interceptor.ts` | Guard 後に `req.user.sub` を AsyncLocalStorage に格納し `X-User-Id` 転送を可能にする |

> **Axios インターセプター**（`AuthHeaderInterceptor`・`LoggingInterceptor`・`MockInterceptor`）は
> NestJS の `NestInterceptor` とは別物です。BFF→バックエンド間の Axios リクエストに割り込む仕組みで、
> 詳細は [Axios インターセプター](axios-interceptors.md) を参照してください。

---

## よくある判断基準

```
Q. 認証・認可をしたい
  → Guard

Q. Correlation ID を全リクエストに付与したい（Guard より先に動かしたい）
  → Middleware

Q. JWT 検証後のユーザー情報を別の場所で使いたい
  → Interceptor（Guard の後に動くため req.user が確定している）

Q. レスポンスのフィールドを一律で絞り込みたい
  → Interceptor（ClassSerializerInterceptor）

Q. バックエンドへのリクエストに認証ヘッダを付けたい
  → Axios インターセプター（NestJS パイプラインの外側・Axios の仕組みを使う）
```
