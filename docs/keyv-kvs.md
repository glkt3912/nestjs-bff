# Keyv とキーバリューストア（KVS）

## キーバリューストア（KVS）とは

**KVS（Key-Value Store）** は、データを「キー」と「値」のペアで管理するシンプルなデータストアです。
リレーショナルデータベースのようなテーブル・スキーマは持たず、キーを指定して値を読み書きするだけです。

```
get("user:42")      → { id: 42, name: "Alice" }
set("user:42", ...) → 値を保存（TTL付きで期限切れも設定可能）
del("user:42")      → 削除
```

### KVS の典型的な用途

| 用途 | 説明 |
|------|------|
| **キャッシュ** | DB・外部API レスポンスを短時間保持し重複リクエストを削減 |
| **セッション** | ユーザーセッションを一時保存 |
| **レート制限** | カウンターをインクリメントして上限チェック |
| **分散ロック** | 複数インスタンス間の排他制御 |
| **Pub/Sub** | Redis の Pub/Sub によるリアルタイム通信 |

---

## Keyv とは

**[Keyv](https://github.com/jaredwray/keyv)** は Node.js 向けのシンプルな KVS 抽象化ライブラリです。
複数のストレージバックエンドを同一インターフェースで扱えます。

```typescript
import Keyv from 'keyv';

const cache = new Keyv();            // メモリ（デフォルト）
await cache.set('foo', 'bar', 5000); // 5秒 TTL
await cache.get('foo');              // → 'bar'
await cache.delete('foo');
```

### サポートするストレージバックエンド

| バックエンド | パッケージ | 特徴 |
|------------|-----------|------|
| **メモリ（Map）** | なし（デフォルト） | 依存なし・プロセス内のみ |
| **Redis** | `@keyv/redis` | 高速・分散対応・TTL ネイティブサポート |
| **SQLite** | `@keyv/sqlite` | ファイル永続化 |
| **PostgreSQL** | `@keyv/postgres` | RDB にキャッシュを保存 |
| **MongoDB** | `@keyv/mongo` | MongoDB に KVS として保存 |

### 設計思想

Keyv は **アダプターパターン** を採用しています。

```
アプリケーションコード
       ↓
   Keyv (統一インターフェース)
       ↓
 KeyvRedis / KeyvSqlite / ... （バックエンドアダプター）
       ↓
  実際のストレージ
```

バックエンドを切り替えてもアプリケーションコードは変更不要です。

---

## cache-manager における Keyv の位置づけ

`cache-manager` は Node.js の汎用キャッシュ抽象化ライブラリです。
バージョンによって内部実装が大きく変わりました。

### バージョン変遷

| cache-manager | 内部実装 | Redis 用パッケージ |
|--------------|---------|-----------------|
| v4 / v5 | 独自ストア抽象（`ioredis` 直接ラップ） | `cache-manager-redis-yet` |
| v6 / v7 | **Keyv に移行** | `@keyv/redis` |

v6 以降は Keyv を内部ストアとして採用し、`stores` オプションに `Keyv` インスタンスを渡す設計に統一されました。

### なぜ Keyv に移行したか

- **エコシステム統一**: Keyv は Node.js コミュニティで広く使われており、アダプター数が豊富
- **メンテナンス効率**: ストアごとの実装を Keyv アダプターに委譲することで cache-manager 本体をスリム化
- **TTL の標準化**: Keyv が TTL 管理を担うため、バックエンド差異を吸収

---

## このプロジェクトでの使用方法

### app.module.ts での設定

```typescript
import Keyv from 'keyv';
import KeyvRedis from '@keyv/redis';
import { CacheModule } from '@nestjs/cache-manager';

CacheModule.registerAsync({
  isGlobal: true,
  useFactory: (config: ConfigService) => {
    const ttlMs = config.get<number>('CACHE_TTL', 30) * 1000;

    if (config.get<string>('CACHE_STORE') === 'redis') {
      // Redis バックエンド
      return {
        stores: [new Keyv({ store: new KeyvRedis('redis://localhost:6379'), ttl: ttlMs })],
      };
    }

    // インメモリ（デフォルト）
    return {
      stores: [new Keyv({ ttl: ttlMs })],
    };
  },
})
```

### インメモリ vs Redis の使い分け

| | インメモリ | Redis |
|-|-----------|-------|
| 設定 | 不要 | `CACHE_STORE=redis` + `REDIS_HOST` |
| スケールアウト | **不可**（インスタンスごとに独立） | **可**（共有ストア） |
| 永続化 | なし（プロセス再起動でクリア） | あり（RDB/AOF） |
| 適用場面 | 単一インスタンス・開発環境 | 本番・複数インスタンス構成 |

---

## Redis 接続 URL フォーマット

`@keyv/redis` は標準的な Redis URI を受け付けます。

```
redis://localhost:6379/0
redis://:password@localhost:6379/0
rediss://tls-host:6380/0   # TLS の場合
```

---

## deprecated になった cache-manager-redis-yet

```
npm warn deprecated cache-manager-redis-yet@5.x: With cache-manager v6 we now are using Keyv
```

このプロジェクトでは `@nestjs/cache-manager@3.x`（`cache-manager@7.x` 依存）を使用しているため、
`cache-manager-redis-yet` は**使用不可**です。必ず `@keyv/redis` を使用してください。

| パッケージ | cache-manager 対応バージョン | 状態 |
|-----------|--------------------------|------|
| `cache-manager-redis-yet` | v4 / v5 | **deprecated** |
| `@keyv/redis` | v6 / v7 | **推奨** |

---

## 参考リンク

- [Keyv GitHub](https://github.com/jaredwray/keyv)
- [@keyv/redis](https://github.com/jaredwray/keyv/tree/main/packages/redis)
- [cache-manager GitHub](https://github.com/jaredwray/cacheable/tree/main/packages/cache-manager)
- [@nestjs/cache-manager ドキュメント](https://docs.nestjs.com/techniques/caching)
