/** Products バックエンドから返るデータ構造の暫定型定義。
 * 実際の ProductsApi が生成されたら src/generated/models に差し替える。
 */
export interface ProductDto {
  id?: number;
  name: string;
}
