import { UnauthorizedException } from '@nestjs/common';
import { ChatController } from './chat.controller';

describe('ChatController', () => {
  const principal = { kind: 'user' as const, userId: 'user-1' };

  it('rejects list without principal', async () => {
    const chatService = { listMessages: jest.fn(), createMessage: jest.fn() };
    const controller = new ChatController(chatService as any);

    expect(() =>
      controller.list('room-1', undefined, undefined, undefined),
    ).toThrow(UnauthorizedException);
  });

  it('rejects create without principal', async () => {
    const chatService = { listMessages: jest.fn(), createMessage: jest.fn() };
    const controller = new ChatController(chatService as any);

    expect(() =>
      controller.create('room-1', undefined, { message: 'hello' }),
    ).toThrow(UnauthorizedException);
  });

  it('delegates list with normalized limit', async () => {
    const chatService = {
      listMessages: jest.fn(() =>
        Promise.resolve({ items: [], nextCursor: null }),
      ),
      createMessage: jest.fn(),
    };
    const controller = new ChatController(chatService as any);

    await expect(
      controller.list('room-1', principal, 'cursor-1', '22'),
    ).resolves.toEqual({
      items: [],
      nextCursor: null,
    });
    expect(chatService.listMessages).toHaveBeenCalledWith(
      'room-1',
      principal,
      'cursor-1',
      22,
    );
  });

  it('delegates create for authenticated principal', async () => {
    const chatService = {
      listMessages: jest.fn(),
      createMessage: jest.fn(() =>
        Promise.resolve({
          message: { _id: 'chat-1', message: 'hello' },
        }),
      ),
    };
    const controller = new ChatController(chatService as any);

    await expect(
      controller.create('room-1', principal, { message: 'hello' }),
    ).resolves.toEqual({
      message: { _id: 'chat-1', message: 'hello' },
    });
  });
});
