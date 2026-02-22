import { IsNotEmpty, IsUUID } from 'class-validator';

export class CreatePrivateRoomDto {
  @IsUUID()
  @IsNotEmpty()
  friendId: string;
}
