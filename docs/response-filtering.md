# レスポンス DTO フィルタリング

## 背景・動機

バックエンド API が内部向けフィールド（`passwordHash`, `internalId` 等）を含む場合、
Controller が生成型 `UserDto` をそのまま返すとすべてのフィールドがフロントエンドに露出する（Over-fetching）。

**解決策**: 手書きレスポンス DTO + `plainToInstance` + `excludeExtraneousValues: true` で
`@Expose()` を明示したフィールドだけをフロントエンドに返す。

---

## データフロー

```text
バックエンド API
    │ { id, name, email, passwordHash, internalSecret, ... }  ← 全フィールド
    ▼
UsersService
    │ plainToInstance(UserResponse, data, { excludeExtraneousValues: true })
    │                                      ↑ これが核心
    ▼
UsersController → フロントエンド
    { id, name, email }  ← @Expose() のみ。将来フィールドが増えても自動除去される
```

---

## 実装パターン

### 1. レスポンス DTO（`src/<feature>/dto/<feature>.response.ts`）

```typescript
import { Expose } from 'class-transformer';

export class UserResponse {
  @Expose() id?: number;
  @Expose() name: string;
  @Expose() email: string;
  @Expose() age?: number;
  // @Expose() がないフィールドは excludeExtraneousValues: true により自動除去
}
```

**ポイント**: `@Expose()` を書いたフィールドだけが残る「許可リスト」方式。
バックエンドが新フィールドを追加しても、ここに `@Expose()` を追加しない限り届かない。

### 2. Service（`src/<feature>/<feature>.service.ts`）

```typescript
import { plainToInstance } from 'class-transformer';
import { UserResponse } from './dto/user.response';

async findAll(): Promise<UserResponse[]> {
  const { data } = await this.api.getUsers();
  return plainToInstance(UserResponse, data, { excludeExtraneousValues: true });
}

async findOne(id: number): Promise<UserResponse> {
  const { data } = await this.api.getUserById({ id });
  return plainToInstance(UserResponse, data, { excludeExtraneousValues: true });
}

async create(dto: CreateUserRequest): Promise<UserResponse> {
  const { data } = await this.api.createUser({ createUserDto: dto as UserDto });
  return plainToInstance(UserResponse, data, { excludeExtraneousValues: true });
}
```

### 3. Controller（`src/<feature>/<feature>.controller.ts`）

```typescript
import { UserResponse } from './dto/user.response';

@Get()
findAll(): Promise<UserResponse[]> {
  return this.usersService.findAll();
}

@Get(':id')
findOne(@Param('id') id: number): Promise<UserResponse> {
  return this.usersService.findOne(id);
}

@Post()
create(@Body() dto: CreateUserRequest): Promise<UserResponse> {
  return this.usersService.create(dto);
}
```

### 4. グローバル登録（`src/main.ts`）

```typescript
import { ClassSerializerInterceptor, ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';

app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));
```

`ValidationPipe` の登録の後に追加する。`ClassSerializerInterceptor` は
`@Expose()` / `@Exclude()` デコレータを有効にするために必要。
`plainToInstance` 単体でも動作するが、グローバル登録しておくことで
`@SerializeOptions()` などのデコレータも使えるようになる。

---

## DTO の役割分担まとめ

| DTO の種別 | ファイル名規約 | 目的 |
| --------- | ----------- | ---- |
| リクエスト DTO | `create-<feature>.request.ts` | 入力バリデーション（class-validator） |
| レスポンス DTO | `<feature>.response.ts` | 出力フィールド制御（@Expose()） |
| 生成型 | `src/generated/models/*.ts` | バックエンドとの型合わせ（自動生成） |

---

## なぜ `excludeExtraneousValues: true` が必要か

`plainToInstance` はデフォルトでは **全フィールドをコピー**する。
`excludeExtraneousValues: true` を指定して初めて「`@Expose()` がないフィールドを除外」する動作になる。

```typescript
// NG: excludeExtraneousValues なし → passwordHash がそのままコピーされる
plainToInstance(UserResponse, data)

// OK: excludeExtraneousValues: true → @Expose() のみ残る
plainToInstance(UserResponse, data, { excludeExtraneousValues: true })
```

---

## 検証手順

### フィルタリングが効いているか確認

バックエンドが `internalSecret` を含む場合、BFF のレスポンスに含まれないことを確認する。

```bash
curl http://localhost:3000/api/users/1
# 期待値: {"id":1,"name":"Alice","email":"a@b.com"}
# internalSecret, passwordHash 等が含まれていないこと
```

### 型チェック

```bash
npx tsc --noEmit
```

---

## 認可フローへの影響

### BFF 内部処理は影響なし

`plainToInstance` は**返却用の変換**であり、`data`（生成型）は変換前にそのまま利用できる。
BFF 内部での認可チェックは `data` を直接使えばよく、`UserResponse` は関係しない。

```typescript
async findOne(id: number): Promise<UserResponse> {
  const { data } = await this.api.getUserById({ id });

  // BFF 内部の認可チェックは生成型 data を使う（フィルタリング前）
  // if (data.role !== 'admin') throw new ForbiddenException();

  return plainToInstance(UserResponse, data, { excludeExtraneousValues: true });
  // ↑ ここで初めてフィルタリング。内部処理には影響なし
}
```

### フロントエンドが認可情報を必要とする場合

フロントエンドが `role` や `permissions` を UI 制御（メニュー表示・ルーティング制御等）に使う場合、
`@Expose()` がないとフロントエンドに届かない。必要なフィールドは明示的に追加する。

```typescript
export class UserResponse {
  @Expose() id?: number;
  @Expose() name: string;
  @Expose() email: string;
  @Expose() age?: number;
  @Expose() role?: string;          // フロントエンドの UI 制御に必要なら追加
  @Expose() permissions?: string[]; // 同上
}
```

### フィールドごとの判断基準

| フィールド | フロントエンドに渡すか | 理由 |
| --------- | ------------------- | ---- |
| `passwordHash` | ✗ 渡さない | 機密情報 |
| `internalId` | ✗ 渡さない | 内部管理情報 |
| `role` | △ 必要なら渡す | フロントエンドの UI 制御用 |
| `permissions` | △ 必要なら渡す | フロントエンドの UI 制御用 |
| `id`, `name`, `email` | ✓ 渡す | 表示用情報 |

**設計原則**: 認可の本体は常にサーバー側（BFF の `@UseGuards()` またはバックエンド）で行う。
フロントエンドの `role` チェックは表示制御の補助にとどめ、サーバー側でも必ず再検証する。

---

## 注意事項

- `class-transformer` の `@Expose()` は `emitDecoratorMetadata: true` が有効な環境でのみ動作する（`tsconfig.json` 確認）
- 生成型（`UserDto`）には `@Expose()` を付けない。生成型は触らない運用とする
- 配列・ネスト型も `plainToInstance` で再帰的に処理されるが、ネストした DTO にも `@Expose()` が必要
