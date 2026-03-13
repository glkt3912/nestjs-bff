/**
 * バックエンド API の CRUD 操作を抽象化する汎用 Adapter クラス。
 *
 * - 生成コード（DefaultApi など）と Service 層の間に挟まることで、
 *   バックエンドのメソッド名変更・引数変更の影響をこの層で吸収できる。
 * - コンストラクタに関数を渡す構成のため、どの API クラスでも再利用可能。
 * - Adapter 自体はビジネスロジックを持たない。型変換・フィルタリングは Service が担う。
 *
 * @example
 * ```typescript
 * // src/users/adapters/user-backend.adapter.ts
 * @Injectable()
 * export class UserBackendAdapter extends GenericApiAdapter<UserDto, UserDto> {
 *   constructor(@Inject(DEFAULT_API) api: DefaultApi) {
 *     super(
 *       () => api.getUsers(),
 *       (id) => api.getUserById({ id }),
 *       (body) => api.createUser({ createUserDto: body }),
 *     );
 *   }
 * }
 * ```
 */
export class GenericApiAdapter<TItem, TCreate = unknown> {
  constructor(
    private readonly listFn: () => Promise<{ data: TItem[] }>,
    private readonly getFn: (id: number) => Promise<{ data: TItem }>,
    private readonly createFn: (body: TCreate) => Promise<{ data: TItem }>,
  ) {}

  findAll(): Promise<TItem[]> {
    return this.listFn().then((r) => r.data);
  }

  findById(id: number): Promise<TItem> {
    return this.getFn(id).then((r) => r.data);
  }

  create(body: TCreate): Promise<TItem> {
    return this.createFn(body).then((r) => r.data);
  }
}
