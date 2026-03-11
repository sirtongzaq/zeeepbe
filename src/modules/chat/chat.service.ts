import {
  Injectable,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { User } from '@prisma/client';

@Injectable()
export class ChatService {
  constructor(private prisma: PrismaService) {}

  //////////////////////////////////////////////////
  // Validate user in room
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
  // Mark Room as Read
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
  // Create Private Room
  //////////////////////////////////////////////////

  async createPrivateRoom(userId: string, friendId: string) {
    if (userId === friendId) {
      throw new BadRequestException('Cannot create room with yourself');
    }

    const existingRoom = await this.prisma.chatRoom.findFirst({
      where: {
        isGroup: false,
        participants: {
          some: { userId },
        },
        AND: {
          participants: {
            some: { userId: friendId },
          },
        },
      },
      include: {
        participants: true,
      },
    });

    if (existingRoom) return existingRoom;

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
  // Create Group Room
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
    const rooms = await this.prisma.chatRoom.findMany({
      where: {
        participants: {
          some: { userId },
        },
      },
      orderBy: [{ lastMessageAt: 'desc' }, { createdAt: 'desc' }],
      include: {
        participants: {
          include: {
            user: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: { sender: true },
        },
      },
    });

    return Promise.all(
      rooms.map(async (chatRoom) => {
        const myParticipant = chatRoom.participants.find(
          (p) => p.userId === userId,
        );

        const lastReadAt = myParticipant?.lastReadAt ?? null;

        const unreadCount = await this.prisma.message.count({
          where: {
            chatRoomId: chatRoom.id,
            createdAt: {
              gt: lastReadAt ?? new Date(0),
            },
            senderId: { not: userId },
          },
        });

        let otherUser: User | null = null;

        if (!chatRoom.isGroup) {
          const other = chatRoom.participants.find((p) => p.userId !== userId);
          otherUser = other?.user ?? null;
        }

        return {
          id: chatRoom.id,
          name: chatRoom.name,
          isGroup: chatRoom.isGroup,
          lastMessage: chatRoom.messages[0] ?? null,
          unreadCount,
          otherUser,
        };
      }),
    );
  }

  //////////////////////////////////////////////////
  // Get Messages (Cursor Pagination)
  //////////////////////////////////////////////////

  async getMessages(
    userId: string,
    roomId: string,
    cursor?: string,
    limit = 20,
  ) {
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
        cursor: { id: cursor },
        skip: 1,
      }),
      include: {
        sender: {
          select: {
            id: true,
            username: true,
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

  //////////////////////////////////////////////////
  // Send Message
  //////////////////////////////////////////////////

  async sendMessageToRoom(data: {
    senderId: string;
    chatRoomId: string;
    content: string;
    type: string;
  }) {
    const { senderId, chatRoomId, content, type } = data;

    const now = new Date();

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: {
          senderId,
          chatRoomId,
          content,
          type,
        },
        include: {
          sender: true,
        },
      }),

      this.prisma.chatRoom.update({
        where: { id: chatRoomId },
        data: { lastMessageAt: now },
      }),
    ]);

    return message;
  }

  //////////////////////////////////////////////////
  // Get Room Detail
  //////////////////////////////////////////////////

  async getRoomDetail(userId: string, roomId: string) {
    await this.validateParticipant(userId, roomId);

    return this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: {
              select: {
                id: true,
                username: true,
                avatarUrl: true,
                email: true,
              },
            },
          },
        },
      },
    });
  }

  //////////////////////////////////////////////////
  // Get Participant IDs
  //////////////////////////////////////////////////

  async getParticipantIds(chatRoomId: string): Promise<string[]> {
    const participants = await this.prisma.chatParticipant.findMany({
      where: { chatRoomId },
      select: { userId: true },
    });

    return participants.map((p) => p.userId);
  }

  /////////////////////////////////////////////////
  // Build Room for User (for sidebar)
  /////////////////////////////////////////////////

  async buildRoomForUser(roomId: string, userId: string) {
    const room = await this.prisma.chatRoom.findUnique({
      where: { id: roomId },
      include: {
        participants: {
          include: {
            user: true,
          },
        },
        messages: {
          take: 1,
          orderBy: { createdAt: 'desc' },
          include: {
            sender: true,
          },
        },
      },
    });

    if (!room) return null;

    const lastMessage = room.messages[0] ?? null;

    const participant = room.participants.find((p) => p.userId === userId);
    const lastReadAt = participant?.lastReadAt ?? new Date(0);

    const unreadCount = await this.prisma.message.count({
      where: {
        chatRoomId: roomId,
        createdAt: { gt: lastReadAt },
        senderId: { not: userId },
      },
    });

    const other = room.participants.find((p) => p.userId !== userId);

    return {
      id: room.id,
      isGroup: room.isGroup,
      name: room.name,
      lastMessage,
      lastMessageAt: lastMessage?.createdAt ?? null,
      unreadCount,
      otherUser: other?.user ?? null,
    };
  }
}
