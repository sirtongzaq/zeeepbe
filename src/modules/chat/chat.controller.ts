import {
  Controller,
  UseGuards,
  Get,
  Param,
  Query,
  Post,
  Body,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ChatService } from './chat.service';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtPayload } from 'src/common/interfaces/jwt-payload.interface';
import { CreatePrivateRoomDto } from './dto/create-private-room.dto.ts';
import { CreateGroupRoomDto } from './dto/create-group-room.dto.ts';
import { ChatGateway } from './chat.gateway';

@Controller('chat/rooms')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
  constructor(
    private chatService: ChatService,
    private chatGateway: ChatGateway,
  ) {}

  ////////////////////////////////////////////////
  // Create Private Room
  ////////////////////////////////////////////////

  @Post('private')
  async createPrivate(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreatePrivateRoomDto,
  ) {
    const room = await this.chatService.createPrivateRoom(
      user.sub,
      dto.friendId,
    );

    const participantIds = room.participants.map((p) => p.userId);

    await this.chatGateway.emitRoomCreated(room.id, participantIds);

    return room;
  }

  ////////////////////////////////////////////////
  // Create Group Room
  ////////////////////////////////////////////////

  @Post('group')
  createGroup(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateGroupRoomDto,
  ) {
    return this.chatService.createGroupRoom(user.sub, dto.name, dto.memberIds);
  }

  ////////////////////////////////////////////////
  // Get My Rooms
  ////////////////////////////////////////////////

  @Get()
  getMyRooms(@CurrentUser() user: JwtPayload) {
    return this.chatService.getMyRooms(user.sub);
  }

  ////////////////////////////////////////////////
  // Get Messages
  ////////////////////////////////////////////////

  @Get(':roomId/messages')
  getMessages(
    @CurrentUser() user: JwtPayload,
    @Param('roomId') roomId: string,
    @Query('cursor') cursor?: string,
    @Query('limit') limit?: string,
  ) {
    return this.chatService.getMessages(
      user.sub,
      roomId,
      cursor,
      limit ? parseInt(limit) : 20,
    );
  }

  ////////////////////////////////////////////////
  // Get Room Detail
  ////////////////////////////////////////////////

  @Get(':roomId')
  getRoomInfo(
    @CurrentUser() user: JwtPayload,
    @Param('roomId') roomId: string,
  ) {
    return this.chatService.getRoomDetail(user.sub, roomId);
  }
}
