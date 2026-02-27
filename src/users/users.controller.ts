// NOTE: このモジュールは BFF 実装パターンのリファレンス実装です。
// 実際の機能追加時はこのパターンを参考に新モジュールを作成してください。
import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { CreateUserRequest } from './dto/create-user.request';
import { UserResponse } from './dto/user.response';
import { UsersService } from './users.service';

@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  findAll(): Promise<UserResponse[]> {
    return this.usersService.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number): Promise<UserResponse> {
    return this.usersService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateUserRequest): Promise<UserResponse> {
    return this.usersService.create(dto);
  }
}
