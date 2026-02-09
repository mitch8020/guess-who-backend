import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { CurrentPrincipal } from '../common/decorators/current-principal.decorator';
import { PlayerTokenGuard } from '../common/guards/player-token.guard';
import { RequestPrincipal } from '../common/types/domain.types';
import { ChatService } from './chat.service';
import { CreateChatMessageDto } from './dto/create-chat-message.dto';

@Controller('rooms/:roomId/chat/messages')
@UseGuards(PlayerTokenGuard)
export class ChatController {
  constructor(private readonly chatService: ChatService) {}

  @Get()
  list(
    @Param('roomId') roomId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ): Promise<{ items: any[]; nextCursor: string | null }> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A room token is required to list chat messages.',
        details: {},
      });
    }

    return this.chatService.listMessages(roomId, principal, cursor, Number(limit ?? 50));
  }

  @Post()
  create(
    @Param('roomId') roomId: string,
    @CurrentPrincipal() principal: RequestPrincipal | undefined,
    @Body() dto: CreateChatMessageDto,
  ): Promise<{ message: any }> {
    if (!principal) {
      throw new UnauthorizedException({
        code: 'AUTH_REQUIRED',
        message: 'A room token is required to send chat messages.',
        details: {},
      });
    }

    return this.chatService.createMessage(roomId, principal, dto);
  }
}
