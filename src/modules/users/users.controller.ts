import { Controller, Get, Patch, Param, Body, UseGuards } from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';
import type { JwtPayload } from 'src/common/interfaces/jwt-payload.interface';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('profile')
export class UsersController {
  constructor(private usersService: UsersService) {}

  // 🔐 ดูโปรไฟล์ตัวเอง
  @UseGuards(AuthGuard('jwt'))
  @Get('me')
  getMe(@CurrentUser() user: JwtPayload) {
    return this.usersService.getMyProfile(user.sub);
  }

  // 🌍 ดูโปรไฟล์ public
  @UseGuards(AuthGuard('jwt'))
  @Get(':id')
  getPublic(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }

  // ✏️ แก้ไขโปรไฟล์
  @UseGuards(AuthGuard('jwt'))
  @Patch()
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.sub, dto);
  }
}
