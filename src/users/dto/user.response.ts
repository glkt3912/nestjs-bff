import { Expose } from 'class-transformer';

export class UserResponse {
  @Expose() id?: number;
  @Expose() name: string;
  @Expose() email: string;
  @Expose() age?: number;
  // @Expose() がないフィールドは excludeExtraneousValues: true により自動除去される
}
