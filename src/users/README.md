# users モジュール（リファレンス実装）

このモジュールは **BFF の実装パターンを示すリファレンス実装**です。
実際の機能追加時はこのパターンを参考に新しいモジュールを作成してください。

## 実装パターンの要点

### Controller

- `@Controller('リソース名')` でエンドポイントを定義
- 戻り値の型は手書きの `*Response` DTO を使用

### Service

- `@Inject(DEFAULT_API)` で自動生成の `DefaultApi` を DI
- `try-catch` 不要 — エラーは `AxiosExceptionFilter`（Global）が一元処理
- `plainToInstance(..., { excludeExtraneousValues: true })` でレスポンスをフィルタリング

### DTO

| ファイル | 用途 |
|---|---|
| `dto/*.request.ts` | 手書き。`class-validator` デコレータでバリデーション |
| `dto/*.response.ts` | 手書き。`@Expose()` で公開フィールドを明示的に指定 |

## 新モジュールを追加する手順

```
src/<feature>/
├── dto/
│   ├── <action>-<feature>.request.ts
│   └── <feature>.response.ts
├── <feature>.controller.ts
├── <feature>.module.ts
└── <feature>.service.ts
```

1. 上記の構成でファイルを作成
2. `AppModule` の `imports` に追加
3. `src/generated/api.ts` の対応メソッドを `Service` から呼び出す
