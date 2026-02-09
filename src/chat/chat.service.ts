import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { MODEL_NAMES, ChatMessageDocument } from '../common/schemas/persistence.schemas';
import { ChatMessageRecord, RequestPrincipal } from '../common/types/domain.types';
import { createId } from '../common/utils/crypto.util';
import { RealtimeService } from '../realtime/realtime.service';
import { RoomsService } from '../rooms/rooms.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';

@Injectable()
export class ChatService {
  constructor(
    @InjectModel(MODEL_NAMES.ChatMessage)
    private readonly chatMessageModel: Model<ChatMessageDocument>,
    private readonly roomsService: RoomsService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async listMessages(
    roomId: string,
    principal: RequestPrincipal,
    cursor?: string,
    limit = 50,
  ): Promise<{ items: ChatMessageRecord[]; nextCursor: string | null }> {
    await this.roomsService.ensureActiveMember(roomId, principal);

    const query: Record<string, unknown> = { roomId };
    if (cursor) {
      query._id = { $lt: cursor };
    }

    const items = await this.chatMessageModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 200))
      .lean<ChatMessageRecord[]>()
      .exec();

    return {
      items,
      nextCursor: items.length > 0 ? items[items.length - 1]._id : null,
    };
  }

  async createMessage(
    roomId: string,
    principal: RequestPrincipal,
    dto: CreateChatMessageDto,
  ): Promise<{ message: ChatMessageRecord }> {
    const member = await this.roomsService.ensureActiveMember(roomId, principal);
    if (member.mutedUntil && member.mutedUntil.getTime() > Date.now()) {
      throw new BadRequestException({
        code: 'CHAT_MEMBER_MUTED',
        message: 'Muted members cannot send chat messages.',
        details: { mutedUntil: member.mutedUntil },
      });
    }

    const message: ChatMessageRecord = {
      _id: createId(),
      roomId,
      memberId: member._id,
      message: dto.message.trim(),
      createdAt: new Date(),
    };

    await this.chatMessageModel.create(message);
    this.realtimeService.publishRoomUpdate(roomId, 'chat.message.created', {
      roomId,
      message,
    });

    return { message };
  }
}
