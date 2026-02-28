# レスポンスキャッシュ（@nestjs/cache-manager）

## 概要

`@nestjs/cache-manager` を使い、BFF の GET エンドポイントへのバックエンド重複リクエストを削減します。
同一リクエストが TTL 内に再度届いた場合、バックエンドへの転送をスキップしてキャッシュから即座にレスポンスを返します。

### なぜ BFF でキャッシュするのか

| 観点 | 説明 |
|------|------|
| バックエンド負荷削減 | 同一データの重複フェッチを防ぐ |
| レスポンス高速化 | ネットワーク RTT と処理時間をスキップ |
| フロントエンド体験向上 | 一時的なバックエンド遅延をバッファリング |

---

## 動作フロー

```
クライアント → BFF
                ↓
         CacheInterceptor（APP_INTERCEPTOR）
                ↓
        キャッシュにヒット？
       YES ↓           NO ↓
    キャッシュから返す   UserContextInterceptor
                            ↓
                       Axios インターセプター
                            ↓
                        バックエンド API
                            ↓
                       レスポンスをキャッシュに保存
                            ↓
                        クライアントへ返す
```

**CacheInterceptor がヒットした場合**、UserContextInterceptor・Axios インターセプター・
バックエンド呼び出しをすべてスキップします。これが CacheInterceptor を先頭に登録する理由です。

---

## 設定

### 環境変数

| 変数 | デフォルト | 説明 |
|------|-----------|------|
| `CACHE_TTL` | `30` | キャッシュ有効期間（秒）。`0` は 1ms にフォールバック（Keyv は 0 = 永久保存のため） |
| `CACHE_STORE` | `memory` | `memory` / `redis` |
| `REDIS_HOST` | `` | `CACHE_STORE=redis` のとき必須 |
| `REDIS_PORT` | `6379` | Redis ポート |
| `REDIS_PASSWORD` | `` | Redis 認証パスワード |
| `REDIS_DB` | `0` | Redis データベース番号 |

### app.module.ts の登録順序

```typescript
providers: [
  { provide: APP_GUARD,       useClass: ThrottlerGuard },
  { provide: APP_GUARD,       useClass: JwtAuthGuard },
  { provide: APP_INTERCEPTOR, useClass: UserAwareCacheInterceptor }, // ← 先頭
  { provide: APP_INTERCEPTOR, useClass: UserContextInterceptor },
  { provide: APP_FILTER,      useClass: AxiosExceptionFilter },
  { provide: APP_FILTER,      useClass: HttpExceptionFilter },
],
```

APP_INTERCEPTOR は登録順に実行されるため、CacheInterceptor を先頭に置くことで
キャッシュヒット時に後続処理を完全にスキップできます。

---

## @CacheTTL デコレータの使い方

エンドポイント単位で TTL をオーバーライドできます。

```typescript
import { CacheTTL } from '@nestjs/cache-manager';

@Get()
@CacheTTL(30_000)       // 30 秒（cache-manager v7 は ms 単位）
findAll(): Promise<UserResponse[]> {
  return this.usersService.findAll();
}

@Get(':id')
@CacheTTL(60_000)       // 60 秒（cache-manager v7 は ms 単位）
findOne(@Param('id') id: number): Promise<UserResponse> {
  return this.usersService.findOne(id);
}
```

POST / PUT / DELETE エンドポイントは CacheInterceptor が自動で除外するため変更不要です。

---

## Redis への切り替え方法

`.env` を以下に変更して再起動するだけです。

```env
CACHE_STORE=redis
REDIS_HOST=localhost
REDIS_PORT=6379
# REDIS_PASSWORD=secret   # 認証が必要な場合
# REDIS_DB=0
```

`CACHE_STORE=redis` のとき、ヘルスチェック（`/api/health`）に Redis ping が自動追加されます。

---

## 内部実装：なぜ @keyv/redis を使うのか

このプロジェクトでは `@nestjs/cache-manager@3.x` を使用しており、
内部の `cache-manager@7.x` は **Keyv** ベースに移行しています。

```
@nestjs/cache-manager@3.x
       └── cache-manager@7.x
                └── Keyv（KVS 抽象化）
                        └── @keyv/redis（Redis アダプター）
```

`cache-manager-redis-yet` は `cache-manager@5.x` 専用のため使用不可です。
詳しくは `docs/keyv-kvs.md` を参照してください。

---

## 制約と注意点

| 制約 | 説明 |
|------|------|
| **キャッシュ無効化が自動でない** | Thin BFF のためバックエンドのデータ更新を BFF が検知できない。短い TTL（30 秒程度）での運用が推奨 |
| **スケールアウト時** | インメモリストアはインスタンスごとに独立。複数インスタンス構成では必ず `CACHE_STORE=redis` を使用する |
| **POST / PUT / DELETE** | CacheInterceptor は GET のみキャッシュ。変更系リクエストは対象外 |
| **JWT_AUTH_ENABLED=true が前提** | キャッシュは JWT 認証が有効な場合のみ機能する。`JWT_AUTH_ENABLED=false`（デフォルト）では `request.user` が設定されないため全リクエストがキャッシュをスキップする。URL のみのキャッシュはバックエンドの認可を迂回するリスクがあるため意図的に無効化している |
| **JWT 認証付きエンドポイント** | `UserAwareCacheInterceptor` が `userId:url` をキーとして使用するためユーザー間は分離済み。有効な JWT がない場合は `UnauthorizedException` で弾かれるためキャッシュ判定に到達しない |
| **@CacheTTL の単位は ms** | `@CacheTTL(n)` の `n` はミリ秒。`CACHE_TTL` 環境変数（秒）と単位が異なる点に注意。30秒は `@CacheTTL(30_000)` と書く |
| **インメモリ時のサイズ上限** | `CACHE_MAX_ITEMS`（デフォルト 500）でエントリ数を制限。上限超過時は LRU で古いエントリを自動削除 |
| **エラーレスポンスはキャッシュされない** | バックエンドが 5xx を返した場合、`AxiosExceptionFilter` が例外に変換するため `UserAwareCacheInterceptor` はキャッシュしない |
| **キャッシュスタンピード** | 人気キーの TTL 切れ時に大量ミスが発生しうる。TTL を長めに設定するか Redis の `PEXPIRE` + Lock パターンで対応（本実装の範囲外） |
