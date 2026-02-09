import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MATCH_MIN_IMAGES } from '../common/constants';
import {
  MatchActionRecord,
  MatchParticipantRecord,
  MatchRecord,
  RequestPrincipal,
} from '../common/types/domain.types';
import { createId, createRandomHex, pickRandom, sha256, shuffle } from '../common/utils/crypto.util';
import { InMemoryStore } from '../store/in-memory.store';
import { ImagesService } from '../images/images.service';
import { RealtimeService } from '../realtime/realtime.service';
import { RoomsService } from '../rooms/rooms.service';
import { RematchDto, StartMatchDto } from './dto/start-match.dto';
import { SubmitActionDto } from './dto/submit-action.dto';

@Injectable()
export class MatchesService {
  constructor(
    private readonly store: InMemoryStore,
    private readonly roomsService: RoomsService,
    private readonly imagesService: ImagesService,
    private readonly realtimeService: RealtimeService,
  ) {}

  startMatch(
    roomId: string,
    principal: RequestPrincipal,
    dto: StartMatchDto,
  ): Record<string, unknown> {
    this.roomsService.getRoomById(roomId);
    const hostMember = this.roomsService.ensureHostMember(roomId, principal);

    const opponentMember = this.store.roomMembers.get(dto.opponentMemberId);
    if (!opponentMember || opponentMember.roomId !== roomId || opponentMember.status !== 'active') {
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

    const room = this.roomsService.getRoomById(roomId);
    if (!room.settings.allowedBoardSizes.includes(dto.boardSize)) {
      throw new BadRequestException({
        code: 'BOARD_SIZE_NOT_ALLOWED',
        message: 'Selected board size is not allowed for this room.',
        details: { allowedBoardSizes: room.settings.allowedBoardSizes },
      });
    }

    const activeMatch = [...this.store.matches.values()].find(
      (match) => match.roomId === roomId && (match.status === 'in_progress' || match.status === 'waiting'),
    );
    if (activeMatch) {
      throw new BadRequestException({
        code: 'MATCH_ALREADY_ACTIVE',
        message: 'Only one active match is allowed per room.',
        details: { matchId: activeMatch._id },
      });
    }

    const activeImageResult = this.imagesService.listImages(roomId, principal);
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
        details: { requiredImageCount, activeCount: activeImageResult.activeCount },
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
    this.store.matches.set(match._id, match);

    const participants = [hostMember._id, opponentMember._id].map((memberId) => {
      const participant: MatchParticipantRecord = {
        _id: createId(),
        matchId: match._id,
        roomMemberId: memberId,
        boardImageOrder: shuffle(selectedImages),
        secretTargetImageId: pickRandom(selectedImages),
        eliminatedImageIds: [],
        result: 'in_progress',
        readyAt: now,
        lastActionAt: now,
      };
      this.store.matchParticipants.set(participant._id, participant);
      return participant;
    });

    this.appendAction(match._id, {
      actionType: 'system',
      payload: {
        event: 'match.started',
        boardSize: match.boardSize,
      },
      actorMemberId: undefined,
    });

    this.roomsService.touchRoomActivity(roomId);
    this.realtimeService.publishMatchState(match._id, 'match.started', {
      matchId: match._id,
      roomId,
      boardSize: match.boardSize,
      turnMemberId: match.turnMemberId,
      participantMemberIds: participants.map((participant) => participant.roomMemberId),
    });
    this.realtimeService.publishRoomUpdate(roomId, 'match.started', {
      matchId: match._id,
      roomId,
    });

    return this.buildMatchView(match, principal);
  }

  getMatchDetail(roomId: string, matchId: string, principal: RequestPrincipal): Record<string, unknown> {
    this.roomsService.ensureActiveMember(roomId, principal);
    const match = this.requireMatch(roomId, matchId);
    return this.buildMatchView(match, principal);
  }

  submitAction(
    roomId: string,
    matchId: string,
    principal: RequestPrincipal,
    dto: SubmitActionDto,
  ): Record<string, unknown> {
    const actorMember = this.roomsService.ensureActiveMember(roomId, principal);
    const match = this.requireMatch(roomId, matchId);
    if (match.status !== 'in_progress') {
      throw new BadRequestException({
        code: 'MATCH_NOT_ACTIVE',
        message: 'Cannot submit actions to a completed match.',
        details: {},
      });
    }

    const participants = this.getParticipantsForMatch(match._id);
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
      (participant) => participant.roomMemberId !== actorParticipant.roomMemberId,
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
        const imageId = String(payload.imageId ?? '');
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
        const guessedImageId = String(payload.imageId ?? '');
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
    this.store.matchParticipants.set(actorParticipant._id, actorParticipant);
    this.store.matchParticipants.set(opponent._id, opponent);

    this.appendAction(match._id, {
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
    this.store.matches.set(match._id, match);
    this.roomsService.touchRoomActivity(roomId);

    this.realtimeService.publishMatchState(match._id, 'action.applied', {
      matchId: match._id,
      actionType: dto.actionType,
      actorMemberId: actorParticipant.roomMemberId,
      turnMemberId: match.turnMemberId,
      status: match.status,
      winnerMemberId: match.winnerMemberId,
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

  forfeitMatch(roomId: string, matchId: string, principal: RequestPrincipal): Record<string, unknown> {
    const actorMember = this.roomsService.ensureActiveMember(roomId, principal);
    const match = this.requireMatch(roomId, matchId);
    if (match.status !== 'in_progress') {
      return this.buildMatchView(match, principal);
    }

    const participants = this.getParticipantsForMatch(match._id);
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
    this.store.matchParticipants.set(actorParticipant._id, actorParticipant);
    this.store.matchParticipants.set(opponent._id, opponent);

    match.status = 'completed';
    match.winnerMemberId = opponent.roomMemberId;
    match.endedAt = new Date();
    match.updatedAt = new Date();
    this.store.matches.set(match._id, match);
    this.appendAction(match._id, {
      actionType: 'system',
      payload: { event: 'forfeit' },
      actorMemberId: actorParticipant.roomMemberId,
    });

    this.realtimeService.publishMatchState(match._id, 'match.completed', {
      matchId: match._id,
      winnerMemberId: match.winnerMemberId,
      reason: 'forfeit',
    });

    return this.buildMatchView(match, principal);
  }

  rematch(roomId: string, matchId: string, principal: RequestPrincipal, dto: RematchDto): Record<string, unknown> {
    const currentMatch = this.requireMatch(roomId, matchId);
    const participants = this.getParticipantsForMatch(currentMatch._id);
    if (participants.length !== 2) {
      throw new BadRequestException({
        code: 'MATCH_PARTICIPANT_COUNT_INVALID',
        message: 'Rematch requires exactly two participants.',
        details: {},
      });
    }
    const actorMember = this.roomsService.ensureActiveMember(roomId, principal);
    const opponent = participants.find((item) => item.roomMemberId !== actorMember._id);
    if (!opponent) {
      throw new BadRequestException({
        code: 'MATCH_OPPONENT_MISSING',
        message: 'Unable to find rematch opponent.',
        details: {},
      });
    }
    return this.startMatch(roomId, principal, {
      boardSize: dto.boardSize ?? currentMatch.boardSize,
      opponentMemberId: opponent.roomMemberId,
    });
  }

  private buildMatchView(match: MatchRecord, principal: RequestPrincipal): Record<string, unknown> {
    const participants = this.getParticipantsForMatch(match._id);
    const actions = [...(this.store.matchActions.get(match._id) ?? [])];
    const publicParticipants = participants.map((participant) => ({
      roomMemberId: participant.roomMemberId,
      eliminatedImageIds: participant.eliminatedImageIds,
      result: participant.result,
      readyAt: participant.readyAt,
      lastActionAt: participant.lastActionAt,
    }));

    const member = principal.kind === 'user'
      ? [...this.store.roomMembers.values()].find(
          (candidate) =>
            candidate.roomId === match.roomId &&
            candidate.userId === principal.userId &&
            candidate.status === 'active',
        )
      : this.store.roomMembers.get(principal.memberId);

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

  private requireMatch(roomId: string, matchId: string): MatchRecord {
    const match = this.store.matches.get(matchId);
    if (!match || match.roomId !== roomId) {
      throw new NotFoundException({
        code: 'MATCH_NOT_FOUND',
        message: 'Match was not found in this room.',
        details: {},
      });
    }
    return match;
  }

  private getParticipantsForMatch(matchId: string): MatchParticipantRecord[] {
    return [...this.store.matchParticipants.values()].filter(
      (participant) => participant.matchId === matchId,
    );
  }

  private appendAction(
    matchId: string,
    action: Pick<MatchActionRecord, 'actionType' | 'payload' | 'actorMemberId'>,
  ): MatchActionRecord {
    const actionRecord: MatchActionRecord = {
      _id: createId(),
      matchId,
      actorMemberId: action.actorMemberId,
      actionType: action.actionType,
      payload: action.payload,
      createdAt: new Date(),
    };
    const list = this.store.matchActions.get(matchId) ?? [];
    list.push(actionRecord);
    this.store.matchActions.set(matchId, list);
    return actionRecord;
  }
}
