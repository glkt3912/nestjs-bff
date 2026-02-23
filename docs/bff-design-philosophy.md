# BFF 設計の2つの流儀

BFF（Backend For Frontend）の実装には「Thin」と「Thick」という対照的なアプローチが存在する。
どちらが正解かはプロジェクトの規模・チーム・バックエンドの安定度によって異なる。

---

## Thin BFF

### 構造

```
Controller → Service → DefaultApi（生成コード）→ バックエンド
```

生成コードを Service が**直接**使う。抽象化層を持たない。

### このリポジトリの実装

```typescript
@Injectable()
export class UsersService {
  constructor(@Inject(DEFAULT_API) private readonly api: DefaultApi) {}

  async findAll(): Promise<UserResponse[]> {
    const { data } = await this.api.getUsers(); // 生成コードを直接呼び出す
    return plainToInstance(UserResponse, data, { excludeExtraneousValues: true });
  }
}
```

### メリット

- **コード量が少ない** — エンドポイントごとに修正箇所が最小限
- **型エラーが即座に伝播する** — バックエンドの変更 → 生成コード更新 → `tsc --noEmit` が Service まで直撃するため見落としがない
- **全体が見渡しやすい** — テンプレートとして出発点にしやすい

### デメリット

- **バックエンドの変更が直撃する** — `getUsers()` が `listAllUsers()` にリネームされると Service が直接壊れる
- **メソッド名が不格好なまま漏れる** — 生成コードの命名（`apiV1UsersGet` など）が Service 層に露出する
- **モック化しづらい** — テストで DefaultApi をモックするためにインターフェースを別途定義する必要がある

---

## Thick BFF（Repositoryパターン / Adapterパターン）

### 構造

```
Controller → Service → UserBackendAdapter → DefaultApi（生成コード）→ バックエンド
```

生成コードと Service の間に **Adapter 層**を挟む。

### 実装例

```typescript
// src/users/adapters/user-backend.adapter.ts
@Injectable()
export class UserBackendAdapter {
  constructor(@Inject(DEFAULT_API) private readonly api: DefaultApi) {}

  // 内部では綺麗な命名を使える
  async findAll(): Promise<UserDto[]> {
    const { data } = await this.api.getUsers();
    return data;
  }

  async findById(id: number): Promise<UserDto> {
    const { data } = await this.api.getUserById({ id });
    return data;
  }
}

// src/users/users.service.ts
@Injectable()
export class UsersService {
  constructor(private readonly adapter: UserBackendAdapter) {}

  async findAll(): Promise<UserResponse[]> {
    const data = await this.adapter.findAll(); // Adapter経由
    return plainToInstance(UserResponse, data, { excludeExtraneousValues: true });
  }
}
```

### メリット

- **バックエンドの変更を Adapter で吸収できる** — 生成コードのメソッド名が変わっても修正箇所が Adapter のみに限定される
- **BFF 内部で綺麗な命名を使える** — `apiV1UsersGet` を `findAll` として公開できる
- **モック化が容易** — テストで Adapter をモックすれば Service のテストが書きやすい
- **バックエンド未完成でも開発できる** — Adapter をスタブに差し替えるだけ

### デメリット

- **ボイラープレートが3倍になる** — エンドポイントが増えるたびに生成コード・Adapter・Service の3箇所を修正する義務が生まれる
- **型エラーの伝播が Adapter で止まるリスク** — Adapter が独自型を定義すると生成コードの変更が上位層に届かなくなる
- **意味的不整合はスクリプトで検出できない** — 型は合っているがバックエンドの仕様が変わったケース（論理削除→物理削除など）は `tsc` を素通りする

---

## 型エラーの伝播：Thin vs Thick

Thick BFF の型問題は Adapter の設計次第で大きく変わる。

### Adapter が生成型を使う（推奨）

```typescript
// UserDto は生成型 → tsc が3層を貫通して検出できる
async findAll(): Promise<UserDto[]> {
  const { data } = await this.api.getUsers();
  return data;
}
```

バックエンドの変更 → 生成コード更新 → `tsc` が Adapter → Service まで伝播する。

### Adapter が独自型を定義する（非推奨）

```typescript
// MyUser は手書き独自型 → ここで型の橋が断絶する
async findAll(): Promise<MyUser[]> {
  const { data } = await this.api.getUsers();
  return data.map(u => ({ id: u.id, name: u.name })); // 断絶点
}
```

Generated 側でフィールドが増えても `tsc` は MyUser 側を検出しない。

### スクリプトで網羅できない領域

| 問題の種類 | tsc で検出 |
|-----------|------------|
| メソッド名の変更 | ✅ |
| フィールド型の変更（生成型を使っている場合） | ✅ |
| Adapter が独自型で断絶している場合 | ❌ |
| 意味・仕様の変更（型は変わらず動作が変わる） | ❌ |

**型の正しさと意味の正しさは別物**。スクリプトは構造的な変更しか保証できない。

---

## どちらを選ぶか

| 条件 | 推奨 |
|------|------|
| テンプレート・初期構築・少人数 | **Thin** |
| バックエンドが頻繁に変更される | **Thick** |
| 複数チームで並行開発する | **Thick** |
| バックエンドが安定している | **Thin** |
| バックエンド未完成で先行開発が必要 | **Thick** |
| エンドポイント数が多い（20本以上） | トレードオフを慎重に検討 |

---

## このリポジトリの立場

このテンプレートは **Thin BFF** を採用している。

理由は「テンプレートとして出発点にしやすいこと」と「型エラーの即時伝播による変更の検知性」を優先したため。
Adapter 層が必要になった時点で `src/users/adapters/` を追加する形で拡張してほしい。

> Thick BFF に移行する際は、Adapter が生成型を返すよう設計することで型の断絶を防ぐことができる。
