import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { UserBackendAdapter } from './adapters/user-backend.adapter';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: {
          fileSize: config.get<number>(
            'UPLOAD_MAX_FILE_SIZE',
            10 * 1024 * 1024,
          ),
        },
      }),
    }),
  ],
  controllers: [UsersController],
  providers: [UserBackendAdapter, UsersService],
})
export class UsersModule {}
