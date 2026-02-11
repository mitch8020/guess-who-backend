import { Injectable } from '@nestjs/common';

interface GatewayAdapter {
  emitRoomPresence(roomId: string, payload: Record<string, unknown>): void;
  emitRoomUpdate(
    roomId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void;
  emitMatchState(
    matchId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void;
}

@Injectable()
export class RealtimeService {
  private gateway?: GatewayAdapter;

  bindGateway(gateway: GatewayAdapter): void {
    this.gateway = gateway;
  }

  publishPresence(roomId: string, payload: Record<string, unknown>): void {
    this.gateway?.emitRoomPresence(roomId, payload);
  }

  publishRoomUpdate(
    roomId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    this.gateway?.emitRoomUpdate(roomId, event, payload);
  }

  publishMatchState(
    matchId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    this.gateway?.emitMatchState(matchId, event, payload);
  }
}
