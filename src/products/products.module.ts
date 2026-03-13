import { Module } from '@nestjs/common';
import { ProductBackendAdapter } from './adapters/product-backend.adapter';
import { ProductServiceApiProvider } from './config/products-api.provider';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductServiceApiProvider, ProductBackendAdapter, ProductsService],
})
export class ProductsModule {}
