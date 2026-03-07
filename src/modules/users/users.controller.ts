import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  UseGuards,
  Query,
} from '@nestjs/common';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UsersService } from './users.service';
import { AuthGuard } from '@nestjs/passport';
import type { JwtPayload } from 'src/common/interfaces/jwt-payload.interface';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';

@Controller('users')
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
  @Get('profile/:id')
  getPublic(@Param('id') id: string) {
    return this.usersService.getPublicProfile(id);
  }

  // ✏️ แก้ไขโปรไฟล์
  @UseGuards(AuthGuard('jwt'))
  @Patch()
  update(@CurrentUser() user: JwtPayload, @Body() dto: UpdateProfileDto) {
    return this.usersService.updateProfile(user.sub, dto);
  }

  // 🔍 Search Users
  @UseGuards(AuthGuard('jwt'))
  @Get('search')
  searchUsers(
    @CurrentUser() user: JwtPayload,
    @Query('q') q?: string,
    @Query('page') page = '1',
    @Query('limit') limit = '20',
  ) {
    return this.usersService.searchUsers(
      user.sub,
      q,
      Number(page),
      Number(limit),
    );
  }
}
