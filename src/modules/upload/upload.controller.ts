import { Controller, Get, UseGuards } from '@nestjs/common';
import { UploadService } from './upload.service';
import { AuthGuard } from '@nestjs/passport';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { JwtPayload } from 'src/common/interfaces/jwt-payload.interface';

@Controller('upload')
@UseGuards(AuthGuard('jwt'))
export class UploadController {
  constructor(private uploadService: UploadService) {}

  @Get('avatar-signature')
  getAvatarSignature(@CurrentUser() user: JwtPayload) {
    return this.uploadService.getAvatarSignature(user.sub);
  }
}
