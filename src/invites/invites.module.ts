import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AccessTokenGuard } from '../common/guards/access-token.guard';
import { PlayerTokenGuard } from '../common/guards/player-token.guard';
import { RealtimeModule } from '../realtime/realtime.module';
import { RoomsModule } from '../rooms/rooms.module';
import { InvitesController } from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  imports: [AuthModule, RoomsModule, RealtimeModule],
  controllers: [InvitesController],
  providers: [InvitesService, AccessTokenGuard, PlayerTokenGuard],
  exports: [InvitesService],
})
export class InvitesModule {}
