import { RealtimeGateway } from './realtime.gateway';

describe('RealtimeGateway', () => {
  const buildGateway = (frontendUrl = 'http://localhost:1073') => {
    const authService = {
      extractBearerToken: jest.fn(),
      verifyPlayerToken: jest.fn(() => ({ kind: 'user', userId: 'user-1' })),
    };
    const roomsService = {
      ensureActiveMember: jest.fn(() => Promise.resolve({ _id: 'member-1' })),
      getRoomDetailForPrincipal: jest.fn(() =>
        Promise.resolve({ room: { _id: 'room-1' }, members: [] }),
      ),
    };
    const realtimeService = {
      bindGateway: jest.fn(),
    };
    const configService = {
      get: jest.fn((key: string) => {
        if (key === 'FRONTEND_URL') {
          return frontendUrl;
        }
        return undefined;
      }),
    };

    const gateway = new RealtimeGateway(
      authService as any,
      roomsService as any,
      realtimeService as any,
      configService as any,
    );

    const emit = jest.fn();
    const to = jest.fn(() => ({ emit }));
    gateway.server = { to } as any;

    return {
      gateway,
      authService,
      roomsService,
      realtimeService,
      configService,
      to,
      emit,
    };
  };

  it('binds gateway in constructor', () => {
    const { realtimeService } = buildGateway();
    expect(realtimeService.bindGateway).toHaveBeenCalledWith(
      expect.any(Object),
    );
  });

  it('configures socket cors from frontend origins', () => {
    const { gateway } = buildGateway(
      'https://app.example.com,http://localhost:1073',
    );
    const server = { engine: { opts: {} } } as any;

    gateway.afterInit(server);
    expect(server.engine.opts.cors).toEqual({
      origin: ['https://app.example.com', 'http://localhost:1073'],
      credentials: true,
    });
  });

  it('throws when websocket origins are not configured', () => {
    const { gateway } = buildGateway('');
    expect(() => gateway.afterInit({ engine: { opts: {} } } as any)).toThrow(
      'FRONTEND_URL must be configured',
    );
  });

  it('disconnects unauthenticated sockets', () => {
    const { gateway } = buildGateway();
    const client = {
      id: 'socket-1',
      handshake: { auth: {}, headers: {} },
      disconnect: jest.fn(),
    } as any;

    gateway.handleConnection(client);
    expect(client.disconnect).toHaveBeenCalledWith(true);
  });

  it('stores socket state for valid socket tokens', () => {
    const { gateway, authService } = buildGateway();
    authService.verifyPlayerToken.mockReturnValueOnce({
      kind: 'guest',
      roomId: 'room-1',
      memberId: 'member-1',
      displayName: 'Guest',
    });
    const client = {
      id: 'socket-1',
      handshake: { auth: { token: 'guest-token' }, headers: {} },
      disconnect: jest.fn(),
    } as any;

    gateway.handleConnection(client);
    const state = (gateway as any).socketState.get('socket-1');
    expect(state.principal.kind).toBe('guest');
    expect(client.disconnect).not.toHaveBeenCalled();
  });

  it('joins room channels and returns room snapshot', async () => {
    const { gateway, roomsService } = buildGateway();
    const client = {
      id: 'socket-1',
      handshake: { auth: { token: 'token' }, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn(() => Promise.resolve(undefined)),
    } as any;

    gateway.handleConnection(client);
    const result = await gateway.joinRoom(client, { roomId: 'room-1' });

    expect(roomsService.ensureActiveMember).toHaveBeenCalledWith('room-1', {
      kind: 'user',
      userId: 'user-1',
    });
    expect(client.join).toHaveBeenCalledWith('room:room-1:presence');
    expect(client.join).toHaveBeenCalledWith('room:room-1:updates');
    expect(result).toEqual({
      ok: true,
      snapshot: { room: { _id: 'room-1' }, members: [] },
    });
  });

  it('joins match channel for active members', async () => {
    const { gateway } = buildGateway();
    const client = {
      id: 'socket-1',
      handshake: { auth: { token: 'token' }, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn(() => Promise.resolve(undefined)),
    } as any;

    gateway.handleConnection(client);
    await expect(
      gateway.joinMatch(client, { roomId: 'room-1', matchId: 'match-1' }),
    ).resolves.toEqual({ ok: true });
    expect(client.join).toHaveBeenCalledWith('match:match-1:state');
  });

  it('emits room and match events to scoped channels', () => {
    const { gateway, to, emit } = buildGateway();

    gateway.emitRoomPresence('room-1', { connectedCount: 1 });
    gateway.emitRoomUpdate('room-1', 'history.updated', { roomId: 'room-1' });
    gateway.emitMatchState('match-1', 'turn.changed', { matchId: 'match-1' });

    expect(to).toHaveBeenNthCalledWith(1, 'room:room-1:presence');
    expect(to).toHaveBeenNthCalledWith(2, 'room:room-1:updates');
    expect(to).toHaveBeenNthCalledWith(3, 'match:match-1:state');
    expect(emit).toHaveBeenCalledTimes(3);
  });

  it('broadcasts reduced presence payload on disconnect', () => {
    const { gateway, to, emit } = buildGateway();
    const client = {
      id: 'socket-1',
      handshake: { auth: { token: 'token' }, headers: {} },
      disconnect: jest.fn(),
      join: jest.fn(() => Promise.resolve(undefined)),
    } as any;

    gateway.handleConnection(client);
    (gateway as any).socketState.get('socket-1').joinedRoomIds.add('room-1');
    gateway.handleDisconnect(client);

    expect(to).toHaveBeenCalledWith('room:room-1:presence');
    expect(emit).toHaveBeenCalledWith(
      'presence.updated',
      expect.objectContaining({
        roomId: 'room-1',
        connectedCount: 1,
      }),
    );
    expect((gateway as any).socketState.has('socket-1')).toBe(false);
  });
});
