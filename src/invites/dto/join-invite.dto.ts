import { IsOptional, IsString, Length } from 'class-validator';

export class JoinInviteDto {
  @IsString()
  @Length(2, 40)
  displayName!: string;

  @IsOptional()
  @IsString()
  authToken?: string;
}
