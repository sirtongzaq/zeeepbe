import { Controller, Post, Body } from '@nestjs/common';
import { OtpService } from './otp.service';
import { AuthService } from './auth.service';
import { RequestOtpDto, VerifyOtpDto } from './dto/otp.dto/otp.dto';

@Controller('auth')
export class AuthController {
  constructor(
    private otpService: OtpService,
    private authService: AuthService,
  ) {}

  @Post('request-otp')
  requestOtp(@Body() dto: RequestOtpDto) {
    return this.otpService.generate(dto.email);
  }

  @Post('verify-otp')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    await this.otpService.verify(dto.email, dto.code);
    return this.authService.loginWithOtp(dto.email);
  }
}
