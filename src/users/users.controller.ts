// NOTE: このモジュールは BFF 実装パターンのリファレンス実装です。
// 実際の機能追加時はこのパターンを参考に新モジュールを作成してください。
import {
  Body,
  Controller,
  Get,
  Param,
  ParseFilePipe,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { CacheTTL } from '@nestjs/cache-manager';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CreateUserRequest } from './dto/create-user.request';
import { UserResponse } from './dto/user.response';
import { UsersService } from './users.service';

@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @CacheTTL(30_000) // 30 seconds (unit: ms)
  findAll(): Promise<UserResponse[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  @CacheTTL(30_000) // 30 seconds (unit: ms)
  findOne(@Param('id') id: number): Promise<UserResponse> {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserRequest): Promise<UserResponse> {
    return this.usersService.create(dto);
  }

  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadFile(
    @UploadedFile(new ParseFilePipe({ fileIsRequired: true }))
    file: Express.Multer.File,
  ): Promise<{ filename: string; size: number }> {
    return this.usersService.uploadFile(file);
  }
}
