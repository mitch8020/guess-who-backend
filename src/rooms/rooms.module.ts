import { Module, forwardRef } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { PlayerTokenGuard } from '../common/guards/player-token.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  imports: [AuthModule, forwardRef(() => RealtimeModule)],
  controllers: [RoomsController],
  providers: [RoomsService, AccessTokenGuard, PlayerTokenGuard],
  exports: [RoomsService],
})
export class RoomsModule {}
