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
    console.log('---------------------------------------');
    console.log('🔥 [WS] Incoming connection');

    try {
      let token = socket.handshake.auth?.token as string;
      console.log('🔍 [WS] Token received', { token });

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

      // 🔥 personal room
      await socket.join(`user:${payload.sub}`);

      console.log(`✅ [WS] User connected → userId=${payload.sub}`);
      console.log(`🏠 [WS] Joined personal room → user:${payload.sub}`);
    } catch (err) {
      console.log('❌ [WS] Auth failed → disconnecting', err);
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

    console.log('---------------------------------------');
    console.log(`📥 [JOIN] user=${userId} room=${chatRoomId}`);

    if (!chatRoomId) {
      throw new WsException('chatRoomId required');
    }

    await this.chatService.validateParticipant(userId, chatRoomId);

    await socket.join(chatRoomId);

    console.log(`✅ [JOIN] user=${userId} joined room=${chatRoomId}`);

    return { joined: true };
  }

  //////////////////////////////////////////////////////
  // SEND MESSAGE (Lazy Private Room)
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
    const userId = socket.data.userId;

    console.log('---------------------------------------');
    console.log('📤 [SEND] Payload received', dto);
    console.log(`📩 [SEND] from=${userId} room=${dto.chatRoomId}`);

    if (!dto.chatRoomId || !dto.content) {
      throw new WsException('Invalid payload');
    }

    const message = await this.chatService.sendMessageToRoom({
      senderId: userId,
      chatRoomId: dto.chatRoomId,
      content: dto.content,
      type: dto.type ?? 'text',
    });

    console.log(`📝 [DB] messageId=${message.id} room=${message.chatRoomId}`);

    this.server.to(dto.chatRoomId).emit('new_message', message);

    console.log(`📡 [BROADCAST] room=${dto.chatRoomId}`);

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

    console.log('---------------------------------------');
    console.log(`👁️ [READ] user=${userId} room=${chatRoomId}`);

    if (!chatRoomId) {
      throw new WsException('chatRoomId required');
    }

    await this.chatService.markRoomAsRead(userId, chatRoomId);

    this.server.to(chatRoomId).emit('message_read', {
      chatRoomId,
      userId,
    });

    console.log(`📡 [READ BROADCAST] room=${chatRoomId}`);
  }
}
