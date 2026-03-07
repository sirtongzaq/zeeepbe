import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UploadService } from '../upload/upload.service';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
  ) {}

  // 👀 View Profile (ของตัวเอง)
  async getMyProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        bio: true,
        createdAt: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  // 👀 View Public Profile
  async getPublicProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        avatarUrl: true,
        bio: true,
      },
    });

    if (!user) throw new NotFoundException('User not found');

    return user;
  }

  // ✏️ Edit Profile
  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) throw new NotFoundException('User not found');

    // 🔐 Verify avatarUrl ถ้ามีการส่งมา
    if (dto.avatarUrl) {
      this.uploadService.validateAvatarUrl(dto.avatarUrl, userId);
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        username: dto.username,
        avatarUrl: dto.avatarUrl,
        bio: dto.bio,
      },
      select: {
        id: true,
        email: true,
        username: true,
        avatarUrl: true,
        bio: true,
      },
    });

    return updated;
  }

  async searchUsers(
    currentUserId: string,
    query?: string,
    page = 1,
    limit = 20,
  ) {
    page = Math.max(page, 1);
    limit = Math.min(limit, 50);

    const skip = (page - 1) * limit;
    const keyword = query?.trim();

    const where = {
      id: { not: currentUserId },
      ...(keyword && {
        OR: [
          {
            username: {
              contains: keyword,
              mode: 'insensitive' as const,
            },
          },
          {
            email: {
              contains: keyword,
              mode: 'insensitive' as const,
            },
          },
        ],
      }),
    };

    const [users, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          avatarUrl: true,
          bio: true,
        },
        take: limit,
        skip,
        orderBy: {
          username: 'asc',
        },
      }),
      this.prisma.user.count({ where }),
    ]);

    if (!users.length) {
      return {
        data: [],
        meta: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit),
        },
      };
    }

    return {
      data: users,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }
}
