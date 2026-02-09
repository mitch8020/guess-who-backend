import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlayerTokenGuard } from '../common/guards/player-token.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { RoomsModule } from '../rooms/rooms.module';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';

@Module({
  imports: [AuthModule, RoomsModule, RealtimeModule],
  controllers: [ChatController],
  providers: [ChatService, PlayerTokenGuard],
  exports: [ChatService],
})
export class ChatModule {}
