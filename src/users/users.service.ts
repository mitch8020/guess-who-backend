import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MODEL_NAMES, UserDocument } from '../common/schemas/persistence.schemas';
import { UserRecord } from '../common/types/domain.types';
import { createId } from '../common/utils/crypto.util';

interface UpsertUserInput {
  googleId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectModel(MODEL_NAMES.User)
    private readonly userModel: Model<UserDocument>,
  ) {}

  async findById(userId: string): Promise<UserRecord | undefined> {
    const user = await this.userModel.findById(userId).lean<UserRecord>().exec();
    return user ?? undefined;
  }

  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const normalizedEmail = email.toLowerCase();
    const user = await this.userModel
      .findOne({ email: normalizedEmail })
      .lean<UserRecord>()
      .exec();
    return user ?? undefined;
  }

  async findByGoogleId(googleId: string): Promise<UserRecord | undefined> {
    const user = await this.userModel
      .findOne({ googleId })
      .lean<UserRecord>()
      .exec();
    return user ?? undefined;
  }

  async upsertGoogleUser(input: UpsertUserInput): Promise<UserRecord> {
    const now = new Date();
    const existingByGoogle = await this.findByGoogleId(input.googleId);
    if (existingByGoogle) {
      const updatedUser: UserRecord = {
        ...existingByGoogle,
        email: input.email.toLowerCase(),
        displayName: input.displayName,
        avatarUrl: input.avatarUrl,
        lastLoginAt: now,
        updatedAt: now,
      };
      await this.userModel
        .findByIdAndUpdate(updatedUser._id, updatedUser, { new: true })
        .exec();
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

    await this.userModel.create(createdUser);
    return createdUser;
  }
}
