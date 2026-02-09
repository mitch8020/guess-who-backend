import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
} from 'class-validator';
import { ROOM_DEFAULTS } from '../../common/constants';

export class UpdateRoomSettingsDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(2, { each: true })
  @Max(10, { each: true })
  allowedBoardSizes?: number[];

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(2)
  minPlayers?: number;

  @IsOptional()
  @IsInt()
  @Min(2)
  @Max(ROOM_DEFAULTS.hardMaxPlayers)
  maxPlayers?: number;

  @IsOptional()
  @IsBoolean()
  allowGuestJoin?: boolean;

  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(10)
  defaultBoardSize?: number;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(4, { each: true })
  @Max(10, { each: true })
  rematchBoardSizes?: number[];
}

export class UpdateRoomDto {
  @IsOptional()
  @IsString()
  @Length(3, 80)
  name?: string;

  @IsOptional()
  @IsObject()
  settings?: UpdateRoomSettingsDto;
}
