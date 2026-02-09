import { IsString, Length } from 'class-validator';

export class CreateChatMessageDto {
  @IsString()
  @Length(1, 1000)
  message!: string;
}
