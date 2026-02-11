import { BadRequestException } from '@nestjs/common';
import { ChatService } from './chat.service';

describe('ChatService', () => {
  it('lists messages with cursor and bounded limit', async () => {
    const messages = [
      {
        _id: 'm-2',
        roomId: 'room-1',
        memberId: 'member-1',
        message: 'second',
        createdAt: new Date(),
      },
      {
        _id: 'm-1',
        roomId: 'room-1',
        memberId: 'member-1',
        message: 'first',
        createdAt: new Date(),
      },
    ];
    const limit = jest.fn(() => ({
      lean: () => ({
        exec: () => Promise.resolve(messages),
      }),
    }));
    const sort = jest.fn(() => ({ limit }));
    const chatMessageModel = {
      find: jest.fn(() => ({ sort })),
    };
    const roomsService = {
      ensureActiveMember: jest.fn(() => Promise.resolve({ _id: 'member-1' })),
    };
    const realtimeService = { publishRoomUpdate: jest.fn() };
    const service = new ChatService(
      chatMessageModel as any,
      roomsService as any,
      realtimeService as any,
    );

    const result = await service.listMessages(
      'room-1',
      { kind: 'user', userId: 'user-1' },
      'cursor-1',
      999,
    );

    expect(roomsService.ensureActiveMember).toHaveBeenCalledWith('room-1', {
      kind: 'user',
      userId: 'user-1',
    });
    expect(chatMessageModel.find).toHaveBeenCalledWith({
      roomId: 'room-1',
      _id: { $lt: 'cursor-1' },
    });
    expect(limit).toHaveBeenCalledWith(200);
    expect(result.nextCursor).toBe('m-1');
  });

  it('blocks muted members from posting', async () => {
    const chatMessageModel = { create: jest.fn() };
    const roomsService = {
      ensureActiveMember: jest.fn(() =>
        Promise.resolve({
          _id: 'member-1',
          mutedUntil: new Date(Date.now() + 60_000),
        }),
      ),
    };
    const realtimeService = { publishRoomUpdate: jest.fn() };
    const service = new ChatService(
      chatMessageModel as any,
      roomsService as any,
      realtimeService as any,
    );

    await expect(
      service.createMessage(
        'room-1',
        { kind: 'user', userId: 'user-1' },
        {
          message: 'hello',
        },
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(chatMessageModel.create).not.toHaveBeenCalled();
  });

  it('creates and publishes chat message for active members', async () => {
    const chatMessageModel = {
      create: jest.fn(() => Promise.resolve(undefined)),
    };
    const roomsService = {
      ensureActiveMember: jest.fn(() =>
        Promise.resolve({
          _id: 'member-1',
          mutedUntil: undefined,
        }),
      ),
    };
    const realtimeService = {
      publishRoomUpdate: jest.fn(),
    };
    const service = new ChatService(
      chatMessageModel as any,
      roomsService as any,
      realtimeService as any,
    );

    const result = await service.createMessage(
      'room-1',
      { kind: 'user', userId: 'user-1' },
      { message: '  hello world  ' },
    );

    expect(result.message.message).toBe('hello world');
    expect(chatMessageModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        roomId: 'room-1',
        memberId: 'member-1',
        message: 'hello world',
      }),
    );
    expect(realtimeService.publishRoomUpdate).toHaveBeenCalledWith(
      'room-1',
      'chat.message.created',
      expect.objectContaining({ roomId: 'room-1' }),
    );
  });
});
