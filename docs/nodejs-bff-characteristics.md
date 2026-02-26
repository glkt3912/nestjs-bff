# Node.js BFF の特性とパフォーマンス戦略

## パフォーマンス回避策

### 水平スケール（推奨）

ステートレス設計を維持したままコンテナを複数起動するのが最もシンプルな方法です。
`AsyncLocalStorage` で保持するコンテキスト（相関 ID など）はプロセス内のみで完結するため、複数インスタンスに分散しても問題ありません。

```text
                  ┌─────────────────────────────┐
Load Balancer     │   Kubernetes Ingress / ALB   │
                  └──────────┬──────────┬────────┘
                             │          │
                    ┌────────▼──┐  ┌────▼──────┐
                    │  BFF Pod  │  │  BFF Pod  │  ← HPA で自動増減
                    └────────┬──┘  └─────┬─────┘
                             │           │
                    ┌────────▼───────────▼─────┐
                    │      Backend API          │
                    └──────────────────────────┘
```

### クラスターモード（PM2）

コンテナ内で CPU コアを使い切りたい場合は PM2 のクラスターモードが利用できます。

```bash
pm2 start dist/main.js -i max   # CPU コア数分のワーカーを起動
```

`AsyncLocalStorage` はプロセス間を跨がないため、各ワーカープロセスが独立して相関 ID を管理し、互換性を保ちます。

### ヒープ上限の調整

デフォルトの V8 ヒープが不足する場合は起動オプションで拡張します。

```bash
node --max-old-space-size=4096 dist/main.js   # ヒープを 4 GB に設定
```

### CPU バウンド処理の分離

重い計算・画像処理・PDF 生成などが必要な場合は、Node.js の `worker_threads` か専用マイクロサービスへ委譲してイベントループをブロックしないようにします。

```typescript
// worker_threads を使う例（BFF 内で完結させる場合）
import { Worker } from 'worker_threads';
const worker = new Worker('./heavy-task.worker.js', { workerData: payload });
```

### HTTP Keep-Alive

バックエンドへの接続を再利用することでレイテンシと接続確立コストを削減できます。
`shared.module.ts` の `HttpModule.registerAsync` に `httpAgent` / `httpsAgent` を渡します。

```typescript
import * as http from 'http';
import * as https from 'https';

HttpModule.registerAsync({
  useFactory: (config: ConfigService) => ({
    baseURL: config.get('BACKEND_API_BASE_URL'),
    timeout: config.get('HTTP_TIMEOUT'),
    httpAgent: new http.Agent({ keepAlive: true }),
    httpsAgent: new https.Agent({ keepAlive: true }),
  }),
  inject: [ConfigService],
});
```
