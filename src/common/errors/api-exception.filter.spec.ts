import { BadRequestException } from '@nestjs/common';
import { ApiExceptionFilter } from './api-exception.filter';

describe('ApiExceptionFilter', () => {
  const buildHost = (requestOverrides?: Record<string, unknown>) => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));
    const request = {
      method: 'POST',
      url: '/api/rooms/room-1/matches/match-1',
      params: { roomId: 'room-1', matchId: 'match-1' },
      body: { memberId: 'member-1' },
      headers: { 'x-request-id': 'req-1' },
      ...requestOverrides,
    };
    const response = { status };

    const host = {
      switchToHttp: () => ({
        getResponse: () => response,
        getRequest: () => request,
      }),
    } as any;

    return { host, status, json, request };
  };

  it('serializes known http exceptions with status-specific code', () => {
    const rollbarService = { error: jest.fn() };
    const filter = new ApiExceptionFilter(rollbarService as any);
    const { host, status, json } = buildHost();

    filter.catch(
      new BadRequestException({
        code: 'ROOM_INVALID',
        message: 'Invalid room payload',
        details: { field: 'name' },
      }),
      host,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'ROOM_INVALID',
        message: 'Invalid room payload',
        details: { field: 'name' },
      },
    });
    expect(rollbarService.error).not.toHaveBeenCalled();
  });

  it('masks unknown errors and reports 500 with rollbar context', () => {
    const rollbarService = { error: jest.fn() };
    const filter = new ApiExceptionFilter(rollbarService as any);
    const { host, status, json } = buildHost();

    filter.catch(new Error('db unavailable'), host);

    expect(status).toHaveBeenCalledWith(500);
    expect(json).toHaveBeenCalledWith({
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error.',
        details: {},
      },
    });
    expect(rollbarService.error).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({
        requestId: 'req-1',
        roomId: 'room-1',
        matchId: 'match-1',
        memberId: 'member-1',
      }),
    );
  });
});
