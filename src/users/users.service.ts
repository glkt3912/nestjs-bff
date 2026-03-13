// NOTE: このモジュールは BFF 実装パターンのリファレンス実装です。
// 実際の機能追加時はこのパターンを参考に新モジュールを作成してください。
import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { UserDto } from '../generated/models';
import { CreateUserRequest } from './dto/create-user.request';
import { UserResponse } from './dto/user.response';
import { UserBackendAdapter } from './adapters/user-backend.adapter';

@Injectable()
export class UsersService {
  constructor(
    private readonly adapter: UserBackendAdapter,
    private readonly httpService: HttpService,
  ) {}

  // try-catch 不要。AxiosError は Global ExceptionFilter が処理する
  async findAll(): Promise<UserResponse[]> {
    const data = await this.adapter.findAll();
    return plainToInstance(UserResponse, data, {
      excludeExtraneousValues: true,
    });
  }

  async findOne(id: number): Promise<UserResponse> {
    const data = await this.adapter.findById(id);
    return plainToInstance(UserResponse, data, {
      excludeExtraneousValues: true,
    });
  }

  async create(dto: CreateUserRequest): Promise<UserResponse> {
    const data = await this.adapter.create(dto as UserDto);
    return plainToInstance(UserResponse, data, {
      excludeExtraneousValues: true,
    });
  }

  async uploadFile(
    file: Express.Multer.File,
  ): Promise<{ filename: string; size: number }> {
    const form = new FormData();
    form.append(
      'file',
      new Blob([new Uint8Array(file.buffer)], { type: file.mimetype }),
      file.originalname,
    );
    const { data } = await this.httpService.axiosRef.post<{
      filename: string;
      size: number;
    }>('/upload', form);
    return data;
  }
}
