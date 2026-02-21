import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // 👀 View Profile (ของตัวเอง)
  async getMyProfile(userId: string) {
    console.log('Fetching profile for userId:', userId); // Debug log
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        nickname: true,
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
        nickname: true,
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

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        nickname: dto.nickname,
        avatarUrl: dto.avatarUrl,
        bio: dto.bio,
      },
      select: {
        id: true,
        email: true,
        nickname: true,
        avatarUrl: true,
        bio: true,
      },
    });

    return updated;
  }
}
