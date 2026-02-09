import { Injectable } from '@nestjs/common';
import { UserRecord } from '../common/types/domain.types';
import { createId } from '../common/utils/crypto.util';
import { InMemoryStore } from '../store/in-memory.store';

interface UpsertUserInput {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(private readonly store: InMemoryStore) {}

  findById(userId: string): UserRecord | undefined {
    return this.store.users.get(userId);
  }

  findByEmail(email: string): UserRecord | undefined {
    const normalizedEmail = email.toLowerCase();
    return [...this.store.users.values()].find(
      (user) => user.email.toLowerCase() === normalizedEmail,
    );
  }

  findByGoogleId(googleId: string): UserRecord | undefined {
    return [...this.store.users.values()].find((user) => user.googleId === googleId);
  }

  upsertGoogleUser(input: UpsertUserInput): UserRecord {
    const now = new Date();
    const existingByGoogle = this.findByGoogleId(input.googleId);
    if (existingByGoogle) {
      const updatedUser: UserRecord = {
        ...existingByGoogle,
        email: input.email.toLowerCase(),
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        lastLoginAt: now,
        updatedAt: now,
      };
      this.store.users.set(updatedUser._id, updatedUser);
      return updatedUser;
    }

    const createdUser: UserRecord = {
      _id: createId(),
      googleId: input.googleId,
      email: input.email.toLowerCase(),
      displayName: input.displayName,
      avatarUrl: input.avatarUrl,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      lastLoginAt: now,
    };

    this.store.users.set(createdUser._id, createdUser);
    return createdUser;
  }
}
