import { Injectable } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection, mongo, Types } from 'mongoose';
import { createId } from '../utils/crypto.util';

@Injectable()
export class GridFsService {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  async uploadBuffer(
    buffer: Buffer,
    filename: string,
    contentType: string,
    metadata?: Record<string, unknown>,
  ): Promise<string> {
    const id = createId();
    const objectId = new Types.ObjectId(id);
    const bucket = this.getBucket();

    await new Promise<void>((resolve, reject) => {
      const upload = bucket.openUploadStreamWithId(objectId, filename, {
        metadata: {
          ...(metadata ?? {}),
          contentType,
        },
      });
      upload.on('error', reject);
      upload.on('finish', () => resolve());
      upload.end(buffer);
    });

    return id;
  }

  async deleteById(fileId: string): Promise<void> {
    const bucket = this.getBucket();
    try {
      await bucket.delete(new Types.ObjectId(fileId));
    } catch {
      // Non-blocking; metadata deletion remains source of truth.
    }
  }

  private getBucket(): mongo.GridFSBucket {
    const db = this.connection.db;
    if (!db) {
      throw new Error('Mongo connection is not initialized');
    }
    return new mongo.GridFSBucket(db, { bucketName: 'images' });
  }
}
