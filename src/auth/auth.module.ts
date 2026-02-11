import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { UsersModule } from '../users/users.module';

@Module({
  imports: [
    ConfigModule,
    UsersModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: (() => {
          const jwtSecret = configService.get<string>('JWT_SECRET');
          if (!jwtSecret || jwtSecret.trim().length < 32) {
            throw new Error(
              'JWT_SECRET must be configured with at least 32 characters.',
            );
          }
          return jwtSecret;
        })(),
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, AccessTokenGuard],
  exports: [AuthService],
})
export class AuthModule {}
