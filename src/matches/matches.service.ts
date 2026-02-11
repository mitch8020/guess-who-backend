import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { MongoServerError } from 'mongodb';
import { Model } from 'mongoose';
import { MATCH_MIN_IMAGES } from '../common/constants';
import {
  MatchActionDocument,
  MatchDocument,
  MatchParticipantDocument,
  MODEL_NAMES,
  RoomMemberDocument,
} from '../common/schemas/persistence.schemas';
import {
  MatchActionRecord,
  MatchParticipantRecord,
  MatchRecord,
  MatchReplayFrame,
  RequestPrincipal,
  RoomMemberRecord,
} from '../common/types/domain.types';
import {
  createId,
  createRandomHex,
  pickRandom,
  sha256,
  shuffle,
} from '../common/utils/crypto.util';
import { ImagesService } from '../images/images.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RoomsService } from '../rooms/rooms.service';
import { RematchDto, StartMatchDto } from './dto/start-match.dto';
import { SubmitActionDto } from './dto/submit-action.dto';

@Injectable()
export class MatchesService {
  constructor(
    @InjectModel(MODEL_NAMES.Match)
    private readonly matchModel: Model<MatchDocument>,
    @InjectModel(MODEL_NAMES.MatchParticipant)
    private readonly matchParticipantModel: Model<MatchParticipantDocument>,
    @InjectModel(MODEL_NAMES.MatchAction)
    private readonly matchActionModel: Model<MatchActionDocument>,
    @InjectModel(MODEL_NAMES.RoomMember)
    private readonly roomMemberModel: Model<RoomMemberDocument>,
    private readonly roomsService: RoomsService,
    private readonly imagesService: ImagesService,
    private readonly realtimeService: RealtimeService,
  ) {}

  async startMatch(
    roomId: string,
    principal: RequestPrincipal,
    dto: StartMatchDto,
  ): Promise<Record<string, unknown>> {
    await this.roomsService.getRoomById(roomId);
    const hostMember = await this.roomsService.ensureHostMember(
      roomId,
      principal,
    );

    const opponentMember = await this.roomMemberModel
      .findById(dto.opponentMemberId)
      .lean<RoomMemberRecord>()
      .exec();
    if (
      !opponentMember ||
      opponentMember.roomId !== roomId ||
      opponentMember.status !== 'active'
    ) {
      throw new BadRequestException({
        code: 'MATCH_OPPONENT_INVALID',
        message: 'Opponent member is not active in this room.',
        details: {},
      });
    }
    if (opponentMember._id === hostMember._id) {
      throw new BadRequestException({
        code: 'MATCH_OPPONENT_REQUIRED',
        message: 'Opponent must be different from host.',
        details: {},
      });
    }

    const room = await this.roomsService.getRoomById(roomId);
    if (!room.settings.allowedBoardSizes.includes(dto.boardSize)) {
      throw new BadRequestException({
        code: 'BOARD_SIZE_NOT_ALLOWED',
        message: 'Selected board size is not allowed for this room.',
        details: { allowedBoardSizes: room.settings.allowedBoardSizes },
      });
    }

    await this.roomsService.ensureMatchCapacity(roomId);

    const activeImageResult = await this.imagesService.listImages(
      roomId,
      principal,
    );
    if (activeImageResult.activeCount < MATCH_MIN_IMAGES) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_IMAGES_MINIMUM',
        message: `At least ${MATCH_MIN_IMAGES} active images are required.`,
        details: { activeCount: activeImageResult.activeCount },
      });
    }

    const requiredImageCount = dto.boardSize * dto.boardSize;
    if (activeImageResult.activeCount < requiredImageCount) {
      throw new BadRequestException({
        code: 'INSUFFICIENT_IMAGES_BOARD_SIZE',
        message: 'Not enough images for selected board size.',
        details: {
          requiredImageCount,
          activeCount: activeImageResult.activeCount,
        },
      });
    }

    const selectedImages = shuffle(activeImageResult.images)
      .slice(0, requiredImageCount)
      .map((image) => image._id);

    const seed = createRandomHex(32);
    const now = new Date();
    const match: MatchRecord = {
      _id: createId(),
      roomId,
      status: 'in_progress',
      boardSize: dto.boardSize,
      selectedImageIds: selectedImages,
      startedByMemberId: hostMember._id,
      turnMemberId: pickRandom([hostMember._id, opponentMember._id]),
      winnerMemberId: undefined,
      randomizationSeedHash: sha256(seed),
      startedAt: now,
      endedAt: undefined,
      createdAt: now,
      updatedAt: now,
    };
    try {
      await this.matchModel.create(match);
    } catch (error) {
      if (error instanceof MongoServerError && error.code === 11000) {
        throw new BadRequestException({
          code: 'MATCH_ALREADY_ACTIVE',
          message: 'Only one active match is allowed per room.',
          details: {},
        });
      }
      throw error;
    }

    const participants: MatchParticipantRecord[] = [
      hostMember._id,
      opponentMember._id,
    ].map((memberId) => ({
      _id: createId(),
      matchId: match._id,
      roomMemberId: memberId,
      boardImageOrder: shuffle(selectedImages),
      secretTargetImageId: pickRandom(selectedImages),
      eliminatedImageIds: [],
      result: 'in_progress' as const,
      readyAt: now,
      lastActionAt: now,
    }));
    await this.matchParticipantModel.insertMany(participants);

    await this.appendAction(match._id, {
      actionType: 'system',
      payload: {
        event: 'match.started',
        boardSize: match.boardSize,
      },
      actorMemberId: undefined,
    });

    await this.roomsService.touchRoomActivity(roomId);
    this.realtimeService.publishMatchState(match._id, 'match.started', {
      matchId: match._id,
      roomId,
      boardSize: match.boardSize,
      turnMemberId: match.turnMemberId,
      participantMemberIds: participants.map(
        (participant) => participant.roomMemberId,
      ),
    });
    this.realtimeService.publishRoomUpdate(roomId, 'match.started', {
      matchId: match._id,
      roomId,
    });

    return this.buildMatchView(match, principal);
  }

  async getMatchDetail(
    roomId: string,
    matchId: string,
    principal: RequestPrincipal,
  ): Promise<Record<string, unknown>> {
    await this.roomsService.ensureActiveMember(roomId, principal);
    const match = await this.requireMatch(roomId, matchId);
    return this.buildMatchView(match, principal);
  }

  async listRoomHistory(
    roomId: string,
    principal: RequestPrincipal,
    cursor?: string,
    limit = 20,
  ): Promise<Record<string, unknown>> {
    await this.roomsService.ensureActiveMember(roomId, principal);
    const query: Record<string, unknown> = {
      roomId,
      status: { $in: ['completed', 'cancelled'] },
    };

    if (cursor) {
      query._id = { $lt: cursor };
    }

    const matches = await this.matchModel
      .find(query)
      .sort({ createdAt: -1 })
      .limit(Math.min(Math.max(limit, 1), 100))
      .lean<MatchRecord[]>()
      .exec();

    const items = matches.map((match) => ({
      matchId: match._id,
      roomId: match.roomId,
      status: match.status,
      boardSize: match.boardSize,
      winnerMemberId: match.winnerMemberId,
      startedAt: match.startedAt,
      endedAt: match.endedAt,
      createdAt: match.createdAt,
    }));

    const nextCursor =
      matches.length > 0 ? matches[matches.length - 1]._id : null;
    return { items, nextCursor };
  }

  async getReplay(
    roomId: string,
    matchId: string,
    principal: RequestPrincipal,
  ): Promise<{ matchId: string; frames: MatchReplayFrame[] }> {
    await this.roomsService.ensureActiveMember(roomId, principal);
    await this.requireMatch(roomId, matchId);

    const actions = await this.matchActionModel
      .find({ matchId })
      .sort({ createdAt: 1 })
      .lean<MatchActionRecord[]>()
      .exec();

    return {
      matchId,
      frames: actions.map((action) => ({
        actionId: action._id,
        actionType: action.actionType,
        actorMemberId: action.actorMemberId,
        payload: action.payload,
        createdAt: action.createdAt,
      })),
    };
  }

  async submitAction(
    roomId: string,
    matchId: string,
    principal: RequestPrincipal,
    dto: SubmitActionDto,
  ): Promise<Record<string, unknown>> {
    const actorMember = await this.roomsService.ensureActiveMember(
      roomId,
      principal,
    );
    const match = await this.requireMatch(roomId, matchId);
    if (match.status !== 'in_progress') {
      throw new BadRequestException({
        code: 'MATCH_NOT_ACTIVE',
        message: 'Cannot submit actions to a completed match.',
        details: {},
      });
    }

    const participants = await this.getParticipantsForMatch(match._id);
    const actorParticipant = participants.find(
      (participant) => participant.roomMemberId === actorMember._id,
    );
    if (!actorParticipant) {
      throw new ForbiddenException({
        code: 'MATCH_PARTICIPANT_REQUIRED',
        message: 'Only participants can submit match actions.',
        details: {},
      });
    }
    const opponent = participants.find(
      (participant) =>
        participant.roomMemberId !== actorParticipant.roomMemberId,
    );
    if (!opponent) {
      throw new BadRequestException({
        code: 'MATCH_PARTICIPANT_CORRUPT',
        message: 'Opponent participant record is missing.',
        details: {},
      });
    }

    if (dto.actionType === 'answer') {
      if (match.turnMemberId === actorParticipant.roomMemberId) {
        throw new ForbiddenException({
          code: 'TURN_ANSWER_INVALID',
          message: 'Turn owner cannot submit answer action.',
          details: {},
        });
      }
    } else if (match.turnMemberId !== actorParticipant.roomMemberId) {
      throw new ForbiddenException({
        code: 'TURN_REQUIRED',
        message: 'Only the active turn player can submit this action.',
        details: {},
      });
    }

    const payload = dto.payload ?? {};
    switch (dto.actionType) {
      case 'eliminate': {
        const imageId = this.readImageId(payload);
        if (!imageId || !actorParticipant.boardImageOrder.includes(imageId)) {
          throw new BadRequestException({
            code: 'ELIMINATE_IMAGE_INVALID',
            message: 'Eliminate action requires a valid board image id.',
            details: {},
          });
        }
        if (!actorParticipant.eliminatedImageIds.includes(imageId)) {
          actorParticipant.eliminatedImageIds.push(imageId);
        }
        break;
      }
      case 'guess': {
        const guessedImageId = this.readImageId(payload);
        if (!guessedImageId) {
          throw new BadRequestException({
            code: 'GUESS_IMAGE_REQUIRED',
            message: 'Guess action requires imageId payload.',
            details: {},
          });
        }

        if (guessedImageId === opponent.secretTargetImageId) {
          actorParticipant.result = 'guessed_correct';
          opponent.result = 'timeout';
          match.status = 'completed';
          match.winnerMemberId = actorParticipant.roomMemberId;
          match.endedAt = new Date();
        } else {
          actorParticipant.result = 'guessed_wrong';
          opponent.result = 'guessed_correct';
          match.status = 'completed';
          match.winnerMemberId = opponent.roomMemberId;
          match.endedAt = new Date();
        }
        break;
      }
      case 'ask':
      case 'answer':
      default:
        break;
    }

    actorParticipant.lastActionAt = new Date();
    await this.matchParticipantModel
      .updateOne({ _id: actorParticipant._id }, actorParticipant)
      .exec();
    await this.matchParticipantModel
      .updateOne({ _id: opponent._id }, opponent)
      .exec();

    await this.appendAction(match._id, {
      actionType: dto.actionType,
      payload,
      actorMemberId: actorParticipant.roomMemberId,
    });

    if (match.status === 'in_progress') {
      if (dto.actionType === 'answer' || dto.actionType === 'eliminate') {
        match.turnMemberId = opponent.roomMemberId;
      }
    }
    match.updatedAt = new Date();
    await this.matchModel.updateOne({ _id: match._id }, match).exec();
    await this.roomsService.touchRoomActivity(roomId);

    this.realtimeService.publishMatchState(match._id, 'action.applied', {
      matchId: match._id,
      actionType: dto.actionType,
      actorMemberId: actorParticipant.roomMemberId,
      turnMemberId: match.turnMemberId,
      status: match.status,
      winnerMemberId: match.winnerMemberId,
    });
    this.realtimeService.publishRoomUpdate(roomId, 'history.updated', {
      roomId,
      matchId: match._id,
    });
    if (match.status === 'completed') {
      this.realtimeService.publishMatchState(match._id, 'match.completed', {
        matchId: match._id,
        winnerMemberId: match.winnerMemberId,
      });
    } else {
      this.realtimeService.publishMatchState(match._id, 'turn.changed', {
        matchId: match._id,
        turnMemberId: match.turnMemberId,
      });
    }

    return this.buildMatchView(match, principal);
  }

  async forfeitMatch(
    roomId: string,
    matchId: string,
    principal: RequestPrincipal,
  ): Promise<Record<string, unknown>> {
    const actorMember = await this.roomsService.ensureActiveMember(
      roomId,
      principal,
    );
    const match = await this.requireMatch(roomId, matchId);
    if (match.status !== 'in_progress') {
      return this.buildMatchView(match, principal);
    }

    const participants = await this.getParticipantsForMatch(match._id);
    const actorParticipant = participants.find(
      (participant) => participant.roomMemberId === actorMember._id,
    );
    const opponent = participants.find(
      (participant) => participant.roomMemberId !== actorMember._id,
    );
    if (!actorParticipant || !opponent) {
      throw new BadRequestException({
        code: 'MATCH_PARTICIPANTS_INVALID',
        message: 'Cannot forfeit due to missing participant state.',
        details: {},
      });
    }

    actorParticipant.result = 'timeout';
    opponent.result = 'guessed_correct';
    actorParticipant.lastActionAt = new Date();
    opponent.lastActionAt = new Date();
    await this.matchParticipantModel
      .updateOne({ _id: actorParticipant._id }, actorParticipant)
      .exec();
    await this.matchParticipantModel
      .updateOne({ _id: opponent._id }, opponent)
      .exec();

    match.status = 'completed';
    match.winnerMemberId = opponent.roomMemberId;
    match.endedAt = new Date();
    match.updatedAt = new Date();
    await this.matchModel.updateOne({ _id: match._id }, match).exec();
    await this.appendAction(match._id, {
      actionType: 'system',
      payload: { event: 'forfeit' },
      actorMemberId: actorParticipant.roomMemberId,
    });

    this.realtimeService.publishMatchState(match._id, 'match.completed', {
      matchId: match._id,
      winnerMemberId: match.winnerMemberId,
      reason: 'forfeit',
    });
    this.realtimeService.publishRoomUpdate(roomId, 'history.updated', {
      roomId,
      matchId: match._id,
    });

    return this.buildMatchView(match, principal);
  }

  async rematch(
    roomId: string,
    matchId: string,
    principal: RequestPrincipal,
    dto: RematchDto,
  ): Promise<Record<string, unknown>> {
    const currentMatch = await this.requireMatch(roomId, matchId);
    const participants = await this.getParticipantsForMatch(currentMatch._id);
    if (participants.length !== 2) {
      throw new BadRequestException({
        code: 'MATCH_PARTICIPANT_COUNT_INVALID',
        message: 'Rematch requires exactly two participants.',
        details: {},
      });
    }
    const actorMember = await this.roomsService.ensureActiveMember(
      roomId,
      principal,
    );
    const opponent = participants.find(
      (item) => item.roomMemberId !== actorMember._id,
    );
    if (!opponent) {
      throw new BadRequestException({
        code: 'MATCH_OPPONENT_MISSING',
        message: 'Unable to find rematch opponent.',
        details: {},
      });
    }

    const room = await this.roomsService.getRoomById(roomId);
    const boardSize =
      dto.boardSize ??
      room.settings.defaultBoardSize ??
      room.settings.rematchBoardSizes?.[0] ??
      currentMatch.boardSize;

    return this.startMatch(roomId, principal, {
      boardSize,
      opponentMemberId: opponent.roomMemberId,
    });
  }

  private async buildMatchView(
    match: MatchRecord,
    principal: RequestPrincipal,
  ): Promise<Record<string, unknown>> {
    const participants = await this.getParticipantsForMatch(match._id);
    const actions = await this.matchActionModel
      .find({ matchId: match._id })
      .sort({ createdAt: 1 })
      .lean<MatchActionRecord[]>()
      .exec();

    const publicParticipants = participants.map((participant) => ({
      roomMemberId: participant.roomMemberId,
      eliminatedImageIds: participant.eliminatedImageIds,
      result: participant.result,
      readyAt: participant.readyAt,
      lastActionAt: participant.lastActionAt,
    }));

    const member =
      principal.kind === 'user'
        ? await this.roomMemberModel
            .findOne({
              roomId: match.roomId,
              userId: principal.userId,
              status: 'active',
            })
            .lean<RoomMemberRecord>()
            .exec()
        : await this.roomMemberModel
            .findById(principal.memberId)
            .lean<RoomMemberRecord>()
            .exec();

    const myParticipant = participants.find(
      (participant) => participant.roomMemberId === member?._id,
    );
    return {
      match: {
        ...match,
        participants: publicParticipants,
      },
      participantState: myParticipant
        ? {
            roomMemberId: myParticipant.roomMemberId,
            boardImageOrder: myParticipant.boardImageOrder,
            secretTargetImageId: myParticipant.secretTargetImageId,
            eliminatedImageIds: myParticipant.eliminatedImageIds,
            result: myParticipant.result,
          }
        : null,
      actions,
    };
  }

  private async requireMatch(
    roomId: string,
    matchId: string,
  ): Promise<MatchRecord> {
    const match = await this.matchModel
      .findById(matchId)
      .lean<MatchRecord>()
      .exec();
    if (!match || match.roomId !== roomId) {
      throw new NotFoundException({
        code: 'MATCH_NOT_FOUND',
        message: 'Match was not found in this room.',
        details: {},
      });
    }
    return match;
  }

  private async getParticipantsForMatch(
    matchId: string,
  ): Promise<MatchParticipantRecord[]> {
    return this.matchParticipantModel
      .find({ matchId })
      .lean<MatchParticipantRecord[]>()
      .exec();
  }

  private async appendAction(
    matchId: string,
    action: Pick<MatchActionRecord, 'actionType' | 'payload' | 'actorMemberId'>,
  ): Promise<MatchActionRecord> {
    const actionRecord: MatchActionRecord = {
      _id: createId(),
      matchId,
      actorMemberId: action.actorMemberId,
      actionType: action.actionType,
      payload: action.payload,
      createdAt: new Date(),
    };
    await this.matchActionModel.create(actionRecord);
    return actionRecord;
  }

  private readImageId(payload: Record<string, unknown>): string {
    const imageId = payload.imageId;
    return typeof imageId === 'string' ? imageId.trim() : '';
  }
}
