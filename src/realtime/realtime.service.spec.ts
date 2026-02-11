import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  it('no-ops when no gateway is bound', () => {
    const service = new RealtimeService();

    expect(() =>
      service.publishPresence('room-1', { connectedCount: 1 }),
    ).not.toThrow();
    expect(() =>
      service.publishRoomUpdate('room-1', 'chat.message.created', {}),
    ).not.toThrow();
    expect(() =>
      service.publishMatchState('match-1', 'turn.changed', {}),
    ).not.toThrow();
  });

  it('forwards room and match events to gateway adapter', () => {
    const gateway = {
      emitRoomPresence: jest.fn(),
      emitRoomUpdate: jest.fn(),
      emitMatchState: jest.fn(),
    };
    const service = new RealtimeService();
    service.bindGateway(gateway);

    service.publishPresence('room-1', { connectedCount: 2 });
    service.publishRoomUpdate('room-1', 'history.updated', {
      roomId: 'room-1',
    });
    service.publishMatchState('match-1', 'match.completed', {
      matchId: 'match-1',
    });

    expect(gateway.emitRoomPresence).toHaveBeenCalledWith('room-1', {
      connectedCount: 2,
    });
    expect(gateway.emitRoomUpdate).toHaveBeenCalledWith(
      'room-1',
      'history.updated',
      { roomId: 'room-1' },
    );
    expect(gateway.emitMatchState).toHaveBeenCalledWith(
      'match-1',
      'match.completed',
      { matchId: 'match-1' },
    );
  });
});
