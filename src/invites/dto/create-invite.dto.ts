import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export class CreateInviteDto {
  @IsOptional()
  @IsBoolean()
  allowGuestJoin?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000)
  maxUses?: number;

  @IsOptional()
  @IsString()
  expiresAt?: string;
}
