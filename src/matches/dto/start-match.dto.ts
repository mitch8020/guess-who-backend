import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class StartMatchDto {
  @IsInt()
  @Min(4)
  @Max(10)
  boardSize!: number;

  @IsString()
  opponentMemberId!: string;
}

export class RematchDto {
  @IsOptional()
  @IsInt()
  @Min(4)
  @Max(10)
  boardSize?: number;
}
