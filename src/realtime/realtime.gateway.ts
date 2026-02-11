import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service';
import { RequestPrincipal } from '../common/types/domain.types';
import { RoomsService } from '../rooms/rooms.service';
import { RealtimeService } from './realtime.service';

interface SocketState {
  principal: RequestPrincipal;
  joinedRoomIds: Set<string>;
  joinedMatchIds: Set<string>;
}

@WebSocketGateway({
  namespace: '/ws',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly socketState = new Map<string, SocketState>();

  constructor(
    private readonly authService: AuthService,
    private readonly roomsService: RoomsService,
    private readonly realtimeService: RealtimeService,
  ) {
    this.realtimeService.bindGateway(this);
  }

  handleConnection(client: Socket): void {
    try {
      const token =
        this.extractSocketToken(client) ??
        this.authService.extractBearerToken(
          client.handshake.headers.authorization,
        );
      if (!token) {
        client.disconnect(true);
        return;
      }
      const principal = this.authService.verifyPlayerToken(token);
      this.socketState.set(client.id, {
        principal,
        joinedRoomIds: new Set<string>(),
        joinedMatchIds: new Set<string>(),
      });
    } catch (error) {
      this.logger.warn(`Socket auth failed: ${String(error)}`);
      client.disconnect(true);
    }
  }

  handleDisconnect(client: Socket): void {
    const state = this.socketState.get(client.id);
    if (!state) {
      return;
    }
    for (const roomId of state.joinedRoomIds) {
      this.emitRoomPresence(roomId, this.buildRoomPresence(roomId));
    }
    this.socketState.delete(client.id);
  }

  @SubscribeMessage('room.join')
  async joinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string },
  ): Promise<{ ok: true; snapshot?: Record<string, unknown> }> {
    const state = this.requireSocketState(client.id);
    await this.roomsService.ensureActiveMember(payload.roomId, state.principal);
    state.joinedRoomIds.add(payload.roomId);
    client.join(`room:${payload.roomId}:presence`);
    client.join(`room:${payload.roomId}:updates`);
    this.emitRoomPresence(
      payload.roomId,
      this.buildRoomPresence(payload.roomId),
    );
    const snapshot = await this.roomsService.getRoomDetailForPrincipal(
      payload.roomId,
      state.principal,
    );
    return { ok: true, snapshot };
  }

  @SubscribeMessage('match.join')
  async joinMatch(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { roomId: string; matchId: string },
  ): Promise<{ ok: true }> {
    const state = this.requireSocketState(client.id);
    await this.roomsService.ensureActiveMember(payload.roomId, state.principal);
    state.joinedMatchIds.add(payload.matchId);
    client.join(`match:${payload.matchId}:state`);
    return { ok: true };
  }

  emitRoomPresence(roomId: string, payload: Record<string, unknown>): void {
    this.server.to(`room:${roomId}:presence`).emit('presence.updated', payload);
  }

  emitRoomUpdate(
    roomId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    this.server.to(`room:${roomId}:updates`).emit(event, payload);
  }

  emitMatchState(
    matchId: string,
    event: string,
    payload: Record<string, unknown>,
  ): void {
    this.server.to(`match:${matchId}:state`).emit(event, payload);
  }

  private requireSocketState(socketId: string): SocketState {
    const state = this.socketState.get(socketId);
    if (!state) {
      throw new Error('Socket state not found');
    }
    return state;
  }

  private extractSocketToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string') {
      return authToken;
    }
    const queryToken = client.handshake.query?.token;
    return typeof queryToken === 'string' ? queryToken : undefined;
  }

  private buildRoomPresence(roomId: string): Record<string, unknown> {
    const activeSocketStates = [...this.socketState.values()].filter((state) =>
      state.joinedRoomIds.has(roomId),
    );

    const members = activeSocketStates.map((state) =>
      state.principal.kind === 'user'
        ? { kind: 'user', userId: state.principal.userId }
        : {
            kind: 'guest',
            memberId: state.principal.memberId,
            displayName: state.principal.displayName,
          },
    );
    return {
      roomId,
      connectedCount: members.length,
      members,
    };
  }
}
