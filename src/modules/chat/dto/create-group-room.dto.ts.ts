import {
  IsString,
  IsNotEmpty,
  IsArray,
  ArrayMinSize,
  IsUUID,
  ArrayUnique,
} from 'class-validator';

export class CreateGroupRoomDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  memberIds: string[];
}
