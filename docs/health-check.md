# ヘルスチェック

## 概要

`@nestjs/terminus` を用いてバックエンドへの疎通確認を含む本格的なヘルスチェックを実装します。
バックエンドが停止している場合は HTTP 503 Service Unavailable を返し、
ロードバランサーや監視ツールに異常を通知できます。

## エンドポイント

```
GET /health
```

### 正常時（HTTP 200）

```json
{
  "status": "ok",
  "info": {
    "backend": { "status": "up" }
  },
  "error": {},
  "details": {
    "backend": { "status": "up" }
  }
}
```

### 異常時（HTTP 503）

```json
{
  "status": "error",
  "info": {},
  "error": {
    "backend": {
      "status": "down",
      "message": "connect ECONNREFUSED 127.0.0.1:8080"
    }
  },
  "details": {
    "backend": {
      "status": "down",
      "message": "connect ECONNREFUSED 127.0.0.1:8080"
    }
  }
}
```

## 仕組み

```text
GET /health
    │
    ▼
HealthController
    │  @HealthCheck() — 各インジケーターを並列実行
    ▼
HealthCheckService
    ├─ HttpHealthIndicator.pingCheck('backend', BACKEND_API_BASE_URL)
    │      └─ HTTP GET を送信、応答があれば "up"、失敗すれば "down"
    └─ 全インジケーターが "up" → 200 ok
       いずれかが "down"  → 503 error
```

`BACKEND_API_BASE_URL` 環境変数の値を ping 先として使用するため、
バックエンドの接続先変更に自動追従します。

## インジケーターの追加

将来的に DB やキャッシュの死活監視を追加する場合は `health.controller.ts` を拡張します。

```typescript
import { TypeOrmHealthIndicator } from '@nestjs/terminus';

// constructor に TypeOrmHealthIndicator を追加
constructor(
  private health: HealthCheckService,
  private http: HttpHealthIndicator,
  private db: TypeOrmHealthIndicator,
  private configService: ConfigService,
) {}

@Get()
@HealthCheck()
check() {
  return this.health.check([
    () => this.http.pingCheck('backend', backendUrl),
    () => this.db.pingCheck('database'),  // DB チェックを追加
  ]);
}
```

利用可能なインジケーター一覧は [@nestjs/terminus 公式ドキュメント](https://docs.nestjs.com/recipes/terminus) を参照してください。

## 設定

| 環境変数 | 説明 |
|---|---|
| `BACKEND_API_BASE_URL` | ping 先のバックエンド URL |

## 実装箇所

| ファイル | 変更内容 |
|---|---|
| `src/health/health.module.ts` | `TerminusModule` / `HttpModule` をインポート追加 |
| `src/health/health.controller.ts` | `HealthCheckService` + `HttpHealthIndicator` ベースに置き換え |
