// NOTE: このファイルは BFF 実装パターンのリファレンス実装です。
// 実際の機能追加時はこのパターンを参考に新モジュールを作成してください。
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

export class CreateUserRequest {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  age?: number;
}
