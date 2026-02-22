// src/modules/chat/chat.service.ts

import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  //////////////////////////////////////////////////
  // ตรวจสอบว่า user อยู่ใน room ไหม
  //////////////////////////////////////////////////

  async validateParticipant(userId: string, chatRoomId: string) {
    const participant = await this.prisma.chatParticipant.findUnique({
      where: {
        userId_chatRoomId: {
          userId,
          chatRoomId,
        },
      },
    });

    if (!participant) {
      throw new ForbiddenException('You are not in this chat room');
    }

    return true;
  }

  //////////////////////////////////////////////////
  // สร้าง Message
  //////////////////////////////////////////////////

  async createMessage(
    userId: string,
    chatRoomId: string,
    content: string,
    type: string = 'text',
  ) {
    await this.validateParticipant(userId, chatRoomId);

    const message = await this.prisma.message.create({
      data: {
        senderId: userId,
        chatRoomId,
        content,
        type,
      },
      include: {
        sender: {
          select: {
            id: true,
            nickname: true,
            avatarUrl: true,
          },
        },
      },
    });

    return message;
  }

  //////////////////////////////////////////////////
  // mark as read
  //////////////////////////////////////////////////

  async markAsRead(userId: string, messageId: string) {
    return this.prisma.messageRead.upsert({
      where: {
        messageId_userId: {
          messageId,
          userId,
        },
      },
      update: {},
      create: {
        messageId,
        userId,
      },
    });
  }

  //////////////////////////////////////////////////
  // สร้าง private room (1-1)
  //////////////////////////////////////////////////

  async createPrivateRoom(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new BadRequestException('Cannot create room with yourself');
    }

    // 🔎 เช็คว่ามี room อยู่แล้วไหม
    const existingRoom = await this.prisma.chatRoom.findFirst({
      where: {
        isGroup: false,
        participants: {
          every: {
            userId: {
              in: [userId, friendId],
            },
          },
        },
      },
      include: {
        participants: true,
      },
    });

    if (existingRoom && existingRoom.participants.length === 2) {
      return existingRoom;
    }

    // 🆕 สร้างใหม่
    return this.prisma.chatRoom.create({
      data: {
        isGroup: false,
        participants: {
          create: [{ userId }, { userId: friendId }],
        },
      },
      include: {
        participants: true,
      },
    });
  }

  //////////////////////////////////////////////////
  // สร้าง group room
  //////////////////////////////////////////////////

  async createGroupRoom(userId: string, name: string, memberIds: string[]) {
    const uniqueMembers = [...new Set([userId, ...memberIds])];

    return this.prisma.chatRoom.create({
      data: {
        name,
        isGroup: true,
        createdById: userId,
        participants: {
          create: uniqueMembers.map((id) => ({
            userId: id,
            role: id === userId ? 'admin' : 'member',
          })),
        },
      },
      include: {
        participants: true,
      },
    });
  }
}
