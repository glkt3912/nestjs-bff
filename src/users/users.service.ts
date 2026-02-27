// NOTE: このモジュールは BFF 実装パターンのリファレンス実装です。
// 実際の機能追加時はこのパターンを参考に新モジュールを作成してください。
import { HttpService } from '@nestjs/axios';
import { Inject, Injectable } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { DEFAULT_API } from '../shared/config/axios-client.provider';
import { DefaultApi } from '../generated/api';
import { UserDto } from '../generated/models';
import { CreateUserRequest } from './dto/create-user.request';
import { UserResponse } from './dto/user.response';

@Injectable()
export class UsersService {
  constructor(
    @Inject(DEFAULT_API) private readonly api: DefaultApi,
    private readonly httpService: HttpService,
  ) {}

  // try-catch 不要。AxiosError は Global ExceptionFilter が処理する
  async findAll(): Promise<UserResponse[]> {
    const { data } = await this.api.getUsers();
    return plainToInstance(UserResponse, data, {
      excludeExtraneousValues: true,
    });
  }

  async findOne(id: number): Promise<UserResponse> {
    const { data } = await this.api.getUserById({ id });
    return plainToInstance(UserResponse, data, {
      excludeExtraneousValues: true,
    });
  }

  async create(dto: CreateUserRequest): Promise<UserResponse> {
    const { data } = await this.api.createUser({
      createUserDto: dto as UserDto,
    });
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
