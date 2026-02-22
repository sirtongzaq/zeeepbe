// src/modules/chat/chat.gateway.ts

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
import { ChatService } from './chat.service';
import { SendMessageDto } from './dto/send-message.dto';
import type { AuthenticatedSocket } from 'src/common/interfaces/auth-socket.interface';
import { JwtPayload } from 'src/common/interfaces/jwt-payload.interface';

@WebSocketGateway({
  cors: { origin: '*' },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayInit {
  @WebSocketServer()
  server: Server;

  afterInit() {
    console.log('WebSocket Gateway Initialized 🔌');
  }

  constructor(
    private jwtService: JwtService,
    private chatService: ChatService,
  ) {}

  ////////////////////////////////////////////////
  // Auth ตอน connect
  ////////////////////////////////////////////////

  handleConnection(socket: AuthenticatedSocket) {
    console.log('🔥 Incoming WS connection');

    try {
      let token = socket.handshake.auth?.token as string;

      console.log('Token received:', token);

      if (!token || typeof token !== 'string') {
        throw new Error('Invalid token');
      }

      // 🔥 ตัด Bearer ออกถ้ามี
      if (token.startsWith('Bearer ')) {
        token = token.slice(7);
      }

      const payload = this.jwtService.verify<JwtPayload>(token, {
        secret: process.env.JWT_SECRET,
      });

      console.log(`✅ User ${payload.sub} connected`);

      socket.data.userId = payload.sub;
    } catch (err: unknown) {
      if (err instanceof Error) {
        console.log('❌ WS auth error:', err.message);
      } else {
        console.log('❌ WS auth error:', err);
      }

      socket.disconnect();
    }
  }

  ////////////////////////////////////////////////
  // join room
  ////////////////////////////////////////////////

  @SubscribeMessage('join_room')
  async joinRoom(
    @MessageBody('chatRoomId') chatRoomId: string,
    @ConnectedSocket() socket: AuthenticatedSocket,
  ) {
    const userId = socket.data.userId;

    await this.chatService.validateParticipant(userId, chatRoomId);

    await socket.join(chatRoomId);

    return { joined: true };
  }

  ////////////////////////////////////////////////
  // send message
  ////////////////////////////////////////////////

  @SubscribeMessage('send_message')
  async sendMessage(
    @MessageBody() dto: SendMessageDto,
    @ConnectedSocket() socket: AuthenticatedSocket,
  ) {
    const userId = socket.data.userId;

    console.log('📩 send_message from:', userId);
    console.log('payload:', dto);
    console.log('socket rooms:', socket.rooms);

    // 🔥 เช็คว่า user join room แล้วหรือยัง
    if (!socket.rooms.has(dto.chatRoomId)) {
      console.log('⚠️ socket not in room, joining...');
      await socket.join(dto.chatRoomId);
    }

    const message = await this.chatService.createMessage(
      userId,
      dto.chatRoomId,
      dto.content,
      dto.type ?? 'text',
    );

    console.log('✅ message created:', message.id);

    // 🔥 broadcast ไปทุกคนใน room (รวม sender)
    this.server.to(dto.chatRoomId).emit('new_message', {
      id: message.id,
      chatRoomId: message.chatRoomId,
      senderId: message.senderId,
      content: message.content,
      type: message.type,
      createdAt: message.createdAt,
    });

    return message;
  }

  ////////////////////////////////////////////////
  // read receipt
  ////////////////////////////////////////////////

  @SubscribeMessage('read_message')
  async readMessage(
    @MessageBody('messageId') messageId: string,
    @ConnectedSocket() socket: AuthenticatedSocket,
  ) {
    const userId = socket.data.userId;

    await this.chatService.markAsRead(userId, messageId);

    this.server.to(socket.id).emit('message_read', {
      messageId,
      userId,
    });
  }
}
