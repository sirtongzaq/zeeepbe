import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayInit,
} from '@nestjs/websockets';
import { Server } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { ChatService } from './chat.service';
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
    console.log('🔌 [WS] Gateway Initialized');
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

      // ✅ Personal room (sync multi device)
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

    // join actual message room
    await socket.join(`room:${chatRoomId}`);

    // 🔥 reset unread badge on all devices
    this.server.to(`user:${userId}`).emit('room_read', {
      chatRoomId,
    });

    return { joined: true };
  }

  //////////////////////////////////////////////////////
  // SEND MESSAGE (Production Version)
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

    // save message
    const message = await this.chatService.sendMessageToRoom({
      senderId,
      chatRoomId: dto.chatRoomId,
      content: dto.content,
      type: dto.type ?? 'text',
    });

    // 1️⃣ broadcast message to room
    this.server.to(`room:${dto.chatRoomId}`).emit('new_message', message);

    // 2️⃣ update sidebar for all participants
    const participantIds = await this.chatService.getParticipantIds(
      dto.chatRoomId,
    );

    participantIds.forEach((userId) => {
      this.server.to(`user:${userId}`).emit('room_updated', {
        chatRoomId: dto.chatRoomId,
        lastMessage: message,
        lastMessageAt: message.createdAt,
        senderId,
      });
    });

    return message;
  }

  //////////////////////////////////////////////////////
  // READ RECEIPT
  //////////////////////////////////////////////////////

  @SubscribeMessage('read_message')
  async readMessage(
    @MessageBody('chatRoomId') chatRoomId: string,
    @ConnectedSocket() socket: AuthenticatedSocket,
  ) {
    const userId = socket.data.userId;

    if (!chatRoomId) {
      throw new WsException('chatRoomId required');
    }

    await this.chatService.markRoomAsRead(userId, chatRoomId);

    // update unread badge on all devices
    this.server.to(`user:${userId}`).emit('room_read', {
      chatRoomId,
    });

    // notify other users inside room
    this.server.to(`room:${chatRoomId}`).emit('message_read', {
      chatRoomId,
      userId,
    });
  }
}
