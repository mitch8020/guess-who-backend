import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlayerTokenGuard } from '../common/guards/player-token.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { RoomsModule } from '../rooms/rooms.module';
import { ImagesController } from './images.controller';
import { ImagesService } from './images.service';

@Module({
  imports: [AuthModule, RoomsModule, RealtimeModule],
  controllers: [ImagesController],
  providers: [ImagesService, PlayerTokenGuard],
  exports: [ImagesService],
})
export class ImagesModule {}
