import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PlayerTokenGuard } from '../common/guards/player-token.guard';
import { ImagesModule } from '../images/images.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { RoomsModule } from '../rooms/rooms.module';
import { MatchesController } from './matches.controller';
import { MatchesService } from './matches.service';

@Module({
  imports: [AuthModule, RoomsModule, ImagesModule, RealtimeModule],
  controllers: [MatchesController],
  providers: [MatchesService, PlayerTokenGuard],
  exports: [MatchesService],
})
export class MatchesModule {}
