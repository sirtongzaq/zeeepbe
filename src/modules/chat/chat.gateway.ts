import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
  WsException,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { ChatEvents } from './chat.events';
import type { AuthenticatedSocket } from 'src/common/interfaces/auth-socket.interface';
import { JwtPayload } from 'src/common/interfaces/jwt-payload.interface';

@WebSocketGateway({
  cors: { origin: true },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  constructor(
    private jwtService: JwtService,
    private chatService: ChatService,
  ) {}

  //////////////////////////////////////////////////////
  // INIT
  //////////////////////////////////////////////////////

  afterInit() {
    console.log('🔌 [WS] Chat Gateway Initialized');
  }

  //////////////////////////////////////////////////////
  // AUTH ON CONNECT
  //////////////////////////////////////////////////////

  async handleConnection(socket: AuthenticatedSocket) {
    try {
      let token = socket.handshake.auth?.token as string;

      if (!token || typeof token !== 'string') {
        throw new Error('Token missing');
      }

      if (token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });

      socket.data.userId = payload.sub;

      // personal room (multi device sync)
      await socket.join(`user:${payload.sub}`);

      console.log(`✅ User connected → ${payload.sub}`);
    } catch (err) {
      console.error('❌ WS Auth failed:', err);
      socket.disconnect();
    }
  }

  //////////////////////////////////////////////////////
  // JOIN ROOM
  //////////////////////////////////////////////////////

  @SubscribeMessage('join_room')
  async joinRoom(
    @MessageBody('chatRoomId') chatRoomId: string,
    @ConnectedSocket() socket: AuthenticatedSocket,
  ) {
    const userId = socket.data.userId;

    if (!chatRoomId) {
      throw new WsException('chatRoomId required');
    }

    await this.chatService.validateParticipant(userId, chatRoomId);

    // mark as read
    await this.chatService.markRoomAsRead(userId, chatRoomId);

    await socket.join(`room:${chatRoomId}`);

    // notify other users that this user read messages
    this.server.to(`room:${chatRoomId}`).emit(ChatEvents.MESSAGE_READ, {
      chatRoomId,
      userId,
    });

    return { joined: true };
  }

  //////////////////////////////////////////////////////
  // SEND MESSAGE
  //////////////////////////////////////////////////////

  @SubscribeMessage('send_message')
  async sendMessage(
    @MessageBody()
    dto: {
      chatRoomId: string;
      content: string;
      type?: string;
    },
    @ConnectedSocket() socket: AuthenticatedSocket,
  ) {
    const senderId = socket.data.userId;

    if (!dto.chatRoomId || !dto.content) {
      throw new WsException('Invalid payload');
    }

    /////////////////////////////////////////////
    // save message
    /////////////////////////////////////////////

    const message = await this.chatService.sendMessageToRoom({
      senderId,
      chatRoomId: dto.chatRoomId,
      content: dto.content,
      type: dto.type ?? 'text',
    });

    /////////////////////////////////////////////
    // broadcast message
    /////////////////////////////////////////////

    this.server
      .to(`room:${dto.chatRoomId}`)
      .emit(ChatEvents.MESSAGE_RECEIVED, message);

    /////////////////////////////////////////////
    // update room sidebar
    /////////////////////////////////////////////

    const participantIds = await this.chatService.getParticipantIds(
      dto.chatRoomId,
    );

    participantIds.forEach((userId) => {
      this.server.to(`user:${userId}`).emit(ChatEvents.ROOM_UPDATED, {
        chatRoomId: dto.chatRoomId,
        lastMessage: message,
        lastMessageAt: message.createdAt,
        senderId,
      });
    });

    return message;
  }

  //////////////////////////////////////////////////////
  // MARK READ
  //////////////////////////////////////////////////////

  @SubscribeMessage('mark_read')
  async markRead(
    @MessageBody('chatRoomId') chatRoomId: string,
    @ConnectedSocket() socket: AuthenticatedSocket,
  ) {
    const userId = socket.data.userId;

    if (!chatRoomId) {
      throw new WsException('chatRoomId required');
    }

    await this.chatService.markRoomAsRead(userId, chatRoomId);

    this.server.to(`room:${chatRoomId}`).emit(ChatEvents.MESSAGE_READ, {
      chatRoomId,
      userId,
    });
  }

  //////////////////////////////////////////////////////
  // TYPING EVENT
  //////////////////////////////////////////////////////

  @SubscribeMessage('typing')
  typing(
    @MessageBody()
    payload: {
      chatRoomId: string;
      isTyping: boolean;
    },
    @ConnectedSocket() socket: AuthenticatedSocket,
  ) {
    const userId = socket.data.userId;

    if (!payload.chatRoomId) {
      throw new WsException('chatRoomId required');
    }

    socket.to(`room:${payload.chatRoomId}`).emit(ChatEvents.TYPING, {
      chatRoomId: payload.chatRoomId,
      userId,
      isTyping: payload.isTyping,
    });
  }

  //////////////////////////////////////////////////////
  // EMIT ROOM CREATED (call from controller/service)
  //////////////////////////////////////////////////////

  async emitRoomCreated(roomId: string, participantIds: string[]) {
    for (const userId of participantIds) {
      const room = await this.chatService.buildRoomForUser(roomId, userId);

      this.server.to(`user:${userId}`).emit(ChatEvents.ROOM_CREATED, room);
    }
  }
}
