import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { PlayerTokenGuard } from '../common/guards/player-token.guard';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [AuthModule],
  controllers: [RoomsController],
  providers: [RoomsService, AccessTokenGuard, PlayerTokenGuard],
  exports: [RoomsService],
})
export class RoomsModule {}
