import { UnauthorizedException } from '@nestjs/common';
import { MatchesController } from './matches.controller';

describe('MatchesController', () => {
  const principal = {
    kind: 'guest' as const,
    roomId: 'room-1',
    memberId: 'm-1',
    displayName: 'Guest',
  };

  const matchesService = {
    startMatch: jest.fn(() => Promise.resolve({ match: { _id: 'match-1' } })),
    listRoomHistory: jest.fn(() =>
      Promise.resolve({ items: [], nextCursor: null }),
    ),
    getReplay: jest.fn(() =>
      Promise.resolve({ matchId: 'match-1', frames: [] }),
    ),
    getMatchDetail: jest.fn(() =>
      Promise.resolve({ match: { _id: 'match-1' } }),
    ),
    submitAction: jest.fn(() => Promise.resolve({ match: { _id: 'match-1' } })),
    forfeitMatch: jest.fn(() => Promise.resolve({ match: { _id: 'match-1' } })),
    rematch: jest.fn(() => Promise.resolve({ match: { _id: 'match-2' } })),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('rejects requests when principal is missing', async () => {
    const controller = new MatchesController(matchesService as any);
    expect(() =>
      controller.startMatch('room-1', undefined, {
        boardSize: 4,
        opponentMemberId: 'm-2',
      }),
    ).toThrow(UnauthorizedException);
    expect(() =>
      controller.getHistory('room-1', undefined, undefined, undefined),
    ).toThrow(UnauthorizedException);
    expect(() => controller.getReplay('room-1', 'match-1', undefined)).toThrow(
      UnauthorizedException,
    );
    expect(() => controller.getMatch('room-1', 'match-1', undefined)).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      controller.submitAction('room-1', 'match-1', undefined, {
        actionType: 'ask',
      }),
    ).toThrow(UnauthorizedException);
    expect(() => controller.forfeit('room-1', 'match-1', undefined)).toThrow(
      UnauthorizedException,
    );
    expect(() =>
      controller.rematch('room-1', 'match-1', undefined, {}),
    ).toThrow(UnauthorizedException);
  });

  it('delegates all match actions to service', async () => {
    const controller = new MatchesController(matchesService as any);

    await expect(
      controller.startMatch('room-1', principal, {
        boardSize: 4,
        opponentMemberId: 'm-2',
      }),
    ).resolves.toEqual({ match: { _id: 'match-1' } });
    await expect(
      controller.getHistory('room-1', principal, 'cursor-1', '5'),
    ).resolves.toEqual({ items: [], nextCursor: null });
    await expect(
      controller.getReplay('room-1', 'match-1', principal),
    ).resolves.toEqual({
      matchId: 'match-1',
      frames: [],
    });
    await expect(
      controller.getMatch('room-1', 'match-1', principal),
    ).resolves.toEqual({
      match: { _id: 'match-1' },
    });
    await expect(
      controller.submitAction('room-1', 'match-1', principal, {
        actionType: 'ask',
        payload: { question: 'Is it an animal?' },
      }),
    ).resolves.toEqual({ match: { _id: 'match-1' } });
    await expect(
      controller.forfeit('room-1', 'match-1', principal),
    ).resolves.toEqual({
      match: { _id: 'match-1' },
    });
    await expect(
      controller.rematch('room-1', 'match-1', principal, { boardSize: 6 }),
    ).resolves.toEqual({ match: { _id: 'match-2' } });
    expect(matchesService.listRoomHistory).toHaveBeenCalledWith(
      'room-1',
      principal,
      'cursor-1',
      5,
    );
  });
});
