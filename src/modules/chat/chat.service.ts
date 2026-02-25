// src/modules/chat/chat.service.ts

import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { User } from '@prisma/client';
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
  // mark as read
  //////////////////////////////////////////////////

  async markRoomAsRead(userId: string, chatRoomId: string) {
    await this.prisma.chatParticipant.update({
      where: {
        userId_chatRoomId: {
          userId,
          chatRoomId,
        },
      },
      data: {
        lastReadAt: new Date(),
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

  //////////////////////////////////////////////////
  // Get My Rooms
  //////////////////////////////////////////////////
  async getMyRooms(userId: string) {
    const rooms = await this.prisma.chatParticipant.findMany({
      where: { userId },
      include: {
        chatRoom: {
          include: {
            participants: {
              include: {
                user: true, // ✅ ดึงข้อมูล user
              },
            },
            messages: {
              take: 1,
              orderBy: { createdAt: 'desc' },
              include: { sender: true },
            },
          },
        },
      },
    });

    return Promise.all(
      rooms.map(async (participant) => {
        const { chatRoom, lastReadAt } = participant;

        const unreadCount = await this.prisma.message.count({
          where: {
            chatRoomId: chatRoom.id,
            createdAt: {
              gt: lastReadAt ?? new Date(0),
            },
            senderId: { not: userId },
          },
        });

        ////////////////////////////////////////////
        // 🔥 หาอีกฝ่าย (กรณีไม่ใช่ group)
        ////////////////////////////////////////////
        let otherUser: User | null = null;

        if (!chatRoom.isGroup) {
          const otherParticipant = chatRoom.participants.find(
            (p) => p.userId !== userId,
          );

          otherUser = otherParticipant?.user ?? null;
        }

        return {
          id: chatRoom.id,
          name: chatRoom.name,
          isGroup: chatRoom.isGroup,
          lastMessage: chatRoom.messages[0] ?? null,
          unreadCount,
          otherUser, // ✅ เพิ่มอันนี้
        };
      }),
    );
  }

  //////////////////////////////////////////////////
  // Get Messages with Cursor Pagination
  //////////////////////////////////////////////////

  async getMessages(
    userId: string,
    roomId: string,
    cursor?: string,
    limit = 20,
  ) {
    // check permission ก่อน
    await this.validateParticipant(userId, roomId);

    const messages = await this.prisma.message.findMany({
      where: {
        chatRoomId: roomId,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      ...(cursor && {
        cursor: {
          id: cursor, // ถ้าใช้ id เป็น cursor
        },
        skip: 1,
      }),
      include: {
        sender: {
          select: {
            id: true,
            nickname: true,
            email: true,
          },
        },
      },
    });

    const nextCursor =
      messages.length === limit ? messages[messages.length - 1].id : null;

    return {
      messages,
      nextCursor,
      hasMore: !!nextCursor,
    };
  }

  /////////////////////////////////////////////////
  // หา private room ระหว่าง userA กับ userB
  /////////////////////////////////////////////////

  async findPrivateRoom(userA: string, userB: string) {
    const rooms = await this.prisma.chatRoom.findMany({
      where: {
        isGroup: false,
        participants: {
          some: { userId: userA },
        },
      },
      include: {
        participants: true,
      },
    });

    return rooms.find(
      (room) =>
        room.participants.length === 2 &&
        room.participants.some((p) => p.userId === userB),
    );
  }

  /////////////////////////////////////////////////
  // ถ้ามี private room อยู่แล้ว ให้ดึงห้องนั้นมาใช้เลย พร้อมกับข้อความล่าสุด 50 ข้อความ
  /////////////////////////////////////////////////

  async getExistingPrivateRoom(userId: string, targetUserId: string) {
    const room = await this.findPrivateRoom(userId, targetUserId);

    if (!room) return null;

    const messages = await this.prisma.message.findMany({
      where: { chatRoomId: room.id },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    return { room, messages };
  }

  async sendPrivateMessage(data: {
    senderId: string;
    targetUserId: string;
    content: string;
    type: string;
  }) {
    const { senderId, targetUserId, content, type } = data;

    let room = await this.findPrivateRoom(senderId, targetUserId);

    if (!room) {
      room = await this.prisma.chatRoom.create({
        data: {
          isGroup: false,
          participants: {
            create: [{ userId: senderId }, { userId: targetUserId }],
          },
        },
        include: {
          participants: true, // 👈 เพิ่มตรงนี้
        },
      });
    }

    return this.prisma.message.create({
      data: {
        chatRoomId: room.id,
        senderId,
        content,
        type,
      },
    });
  }

  /////////////////////////////////////////////////
  // ส่งข้อความในห้องแชท (ไม่ต้องสนใจว่าห้องนั้นเป็น private หรือ group)
  /////////////////////////////////////////////////

  async sendMessageToRoom(data: {
    senderId: string;
    chatRoomId: string;
    content: string;
    type: string;
  }) {
    const { senderId, chatRoomId, content, type } = data;
    return this.prisma.message.create({
      data: {
        senderId,
        chatRoomId,
        content,
        type,
      },
      include: {
        sender: true, // ✅ สำคัญมาก
      },
    });
  }

  /////////////////////////////////////////////////
  // ดึงรายละเอียดห้องแชท (รวมถึงรายชื่อผู้เข้าร่วม)
  /////////////////////////////////////////////////

  async getRoomDetail(userId: string, roomId: string) {
    await this.validateParticipant(userId, roomId);

    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                nickname: true,
                avatarUrl: true,
                email: true,
              },
            },
          },
        },
      },
    });

    return room;
  }

  /////////////////////////////////////////////////
  // ดึงรายชื่อ participant ในห้อง
  /////////////////////////////////////////////////

  async getParticipants(chatRoomId: string) {
    return this.prisma.chatParticipant.findMany({
      where: { chatRoomId },
      select: {
        userId: true,
      },
    });
  }

  async getParticipantIds(chatRoomId: string): Promise<string[]> {
    const participants = await this.prisma.chatParticipant.findMany({
      where: { chatRoomId },
      select: { userId: true },
    });

    return participants.map((p) => p.userId);
  }
}
