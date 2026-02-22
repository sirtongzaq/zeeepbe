import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { CreatePrivateRoomDto } from './dto/create-private-room.dto.ts';
import { CreateGroupRoomDto } from './dto/create-group-room.dto.ts';
import type { JwtPayload } from 'src/common/interfaces/jwt-payload.interface';

@Controller('chat/rooms')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(private chatService: ChatService) {}

  ////////////////////////////////////////////////
  // Private Room
  ////////////////////////////////////////////////

  @Post('private')
  createPrivate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePrivateRoomDto,
  ) {
    console.log('Creating private room with friendId:', dto);
    return this.chatService.createPrivateRoom(user.sub, dto.friendId);
  }

  ////////////////////////////////////////////////
  // Group Room
  ////////////////////////////////////////////////

  @Post('group')
  createGroup(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateGroupRoomDto,
  ) {
    return this.chatService.createGroupRoom(user.sub, dto.name, dto.memberIds);
  }
}
