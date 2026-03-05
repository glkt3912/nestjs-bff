import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ProductResponse } from './dto/product.response';
import { ProductsService } from './products.service';

@ApiBearerAuth()
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  findAll(): Promise<ProductResponse[]> {
    return this.productsService.findAll();
  }
}
