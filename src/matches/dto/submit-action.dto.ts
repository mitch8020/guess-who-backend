import { IsIn, IsObject, IsOptional, IsString } from 'class-validator';

export class SubmitActionDto {
  @IsIn(['ask', 'answer', 'eliminate', 'guess'])
  actionType!: 'ask' | 'answer' | 'eliminate' | 'guess';

  @IsOptional()
  @IsObject()
  payload?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  note?: string;
}
