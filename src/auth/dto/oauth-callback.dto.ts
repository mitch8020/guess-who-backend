import { IsOptional, IsString } from 'class-validator';

export class OAuthCallbackDto {
  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  error?: string;

  @IsOptional()
  @IsString()
  scope?: string;

  @IsOptional()
  @IsString()
  authuser?: string;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsString()
  mockEmail?: string;

  @IsOptional()
  @IsString()
  mockSub?: string;

  @IsOptional()
  @IsString()
  mockName?: string;

  @IsOptional()
  @IsString()
  mockAvatarUrl?: string;
}
