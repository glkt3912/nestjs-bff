// NOTE: このファイルは BFF 実装パターンのリファレンス実装です。
// 実際の機能追加時はこのパターンを参考に新モジュールを作成してください。
import { Expose } from 'class-transformer';

export class UserResponse {
  @Expose() id?: number;
  @Expose() name: string;
  @Expose() email: string;
  @Expose() age?: number;
  // @Expose() がないフィールドは excludeExtraneousValues: true により自動除去される
}
