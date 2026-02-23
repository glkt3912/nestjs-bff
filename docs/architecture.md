# アーキテクチャ設計

## 概要

NestJS BFF は外部バックエンド API の swagger.json からクライアントコードを自動生成し、
フロントエンドと外部 API の間に立つ中間層として機能します。

## レイヤー構成

```text
フロントエンド
    │
    ▼
NestJS BFF (port 3000)
    │  ・ValidationPipe        — 入力バリデーション
    │  ・AxiosExceptionFilter  — バックエンドエラーの透過マッピング
    │  ・LoggingInterceptor    — リクエスト/レスポンスログ
    │  ・AuthHeaderInterceptor — 認証ヘッダー一元付与
    │
    ▼
バックエンド API（外部サービス）
```

## Axios インスタンス統合

すべての HTTP リクエストが同一の `axiosRef` を経由することで、
インターセプターがすべての API 呼び出しに自動的に適用されます。

```text
HttpModule.registerAsync()
    └─ HttpService.axiosRef (単一 AxiosInstance)
            ├─ interceptors.request  : LoggingInterceptor, AuthHeaderInterceptor
            └─ DefaultApiProvider (useFactory)
                    └─ new DefaultApi(config, basePath, axiosRef)
                            └─ getUsers(), createUser() … すべて axiosRef を使用
```

## 例外処理の設計

個別の try-catch は一切書かない。バックエンドから返る `AxiosError` は
`AxiosExceptionFilter` が一箇所で処理してレスポンスに変換します。

```typescript
// Service は throw せずそのままエラーを伝播させる
async findAll(): Promise<UserDto[]> {
  const { data } = await this.api.getUsers();  // AxiosError は Filter へ
  return data;
}
```

## DTO の使い分け

| ケース | 方針 |
| ------ | ---- |
| フロントエンドからの入力（POST/PUT ボディ） | 手書きリクエスト DTO（class-validator 必須） |
| バックエンドへのパラメータ | 生成型をそのまま使用 |
| Controller の戻り値型 | **手書きレスポンス DTO**（`@Expose()` で公開フィールドを明示） |
| 複数 API の集約レスポンス | 手書きレスポンス DTO（`@Expose()` + `plainToInstance` で合成） |

### レスポンス DTO によるフィールドフィルタリング

バックエンドが内部向けフィールド（`passwordHash`, `internalId` 等）を含む場合でも、
`@Expose()` を明示したフィールドのみがフロントエンドに届きます。

```text
バックエンド API
    │ UserDto（生成型・全フィールド）
    ▼
UsersService
    │ plainToInstance(UserResponse, data, { excludeExtraneousValues: true })
    │ ← @Expose() されたフィールドだけが残る
    ▼
UsersController → フロントエンド
    UserResponse（手書きクラス・公開フィールドのみ）
```

`ClassSerializerInterceptor` をグローバル登録することで、
`@Expose()` によるフィルタリングがすべてのエンドポイントに自動適用されます。

## SharedModule の役割

`@Global()` デコレータにより、`SharedModule` を一度インポートすれば
`HttpService` と `DefaultApi` プロバイダーがアプリ全体で利用可能になります。

```typescript
@Global()
@Module({
  imports: [HttpModule.registerAsync(...)],
  providers: [DefaultApiProvider, LoggingInterceptor, AuthHeaderInterceptor],
  exports: [HttpModule, DefaultApiProvider],
})
export class SharedModule {}
```
