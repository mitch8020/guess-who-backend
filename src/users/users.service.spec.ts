import { UsersService } from './users.service';

const leanExec = <T>(value: T) => ({
  lean: () => ({
    exec: () => Promise.resolve(value),
  }),
});

describe('UsersService', () => {
  it('findById returns undefined when user is missing', async () => {
    const userModel = {
      findById: jest.fn(() => leanExec(null)),
    };
    const service = new UsersService(userModel as any);

    await expect(service.findById('missing')).resolves.toBeUndefined();
    expect(userModel.findById).toHaveBeenCalledWith('missing');
  });

  it('findByEmail normalizes email before lookup', async () => {
    const user = { _id: 'u-1', email: 'user@example.com' };
    const userModel = {
      findOne: jest.fn(() => leanExec(user)),
    };
    const service = new UsersService(userModel as any);

    await expect(service.findByEmail('USER@EXAMPLE.COM')).resolves.toEqual(
      user,
    );
    expect(userModel.findOne).toHaveBeenCalledWith({
      email: 'user@example.com',
    });
  });

  it('upserts existing google user', async () => {
    const existingUser = {
      _id: 'u-1',
      googleId: 'google-1',
      email: 'old@example.com',
      displayName: 'Old',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastLoginAt: new Date(),
    };
    const userModel = {
      findOne: jest.fn(() => leanExec(existingUser)),
      findByIdAndUpdate: jest.fn(() => ({
        exec: () => Promise.resolve(undefined),
      })),
      create: jest.fn(),
    };
    const service = new UsersService(userModel as any);

    const updated = await service.upsertGoogleUser({
      googleId: 'google-1',
      email: 'NEW@EXAMPLE.COM',
      displayName: 'New Name',
      avatarUrl: 'https://example.com/avatar.png',
    });

    expect(updated.email).toBe('new@example.com');
    expect(updated.displayName).toBe('New Name');
    expect(userModel.findByIdAndUpdate).toHaveBeenCalledWith(
      'u-1',
      expect.objectContaining({
        email: 'new@example.com',
        displayName: 'New Name',
      }),
      { new: true },
    );
    expect(userModel.create).not.toHaveBeenCalled();
  });

  it('creates a new user when google id is not found', async () => {
    const userModel = {
      findOne: jest.fn(() => leanExec(null)),
      findByIdAndUpdate: jest.fn(),
      create: jest.fn(() => Promise.resolve(undefined)),
    };
    const service = new UsersService(userModel as any);

    const created = await service.upsertGoogleUser({
      googleId: 'google-2',
      email: 'Person@Example.com',
      displayName: 'Person',
    });

    expect(created.googleId).toBe('google-2');
    expect(created.email).toBe('person@example.com');
    expect(created.status).toBe('active');
    expect(userModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        googleId: 'google-2',
        email: 'person@example.com',
      }),
    );
  });
});
