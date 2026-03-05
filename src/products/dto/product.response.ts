import { Expose } from 'class-transformer';

export class ProductResponse {
  @Expose() id?: number;
  @Expose() name: string;
}
