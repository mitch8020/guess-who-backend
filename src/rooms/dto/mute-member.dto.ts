import { IsInt, Max, Min } from 'class-validator';

export class MuteMemberDto {
  @IsInt()
  @Min(1)
  @Max(24 * 60)
  durationMinutes = 30;
}
