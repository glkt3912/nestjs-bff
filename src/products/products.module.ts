import { Module } from '@nestjs/common';
import { ProductServiceApiProvider } from './config/products-api.provider';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductServiceApiProvider, ProductsService],
})
export class ProductsModule {}
