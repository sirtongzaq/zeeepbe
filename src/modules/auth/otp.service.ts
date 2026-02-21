import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from 'src/database/prisma.service';
import { addMinutes } from 'date-fns';

@Injectable()
export class OtpService {
  constructor(private prisma: PrismaService) {}

  async generate(email: string) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    await this.prisma.otp.create({
      data: {
        email,
        code,
        expiresAt: addMinutes(new Date(), 5),
      },
    });

    // TODO: send email
    console.log('OTP:', code);

    return { message: 'OTP sent' };
  }

  async verify(email: string, code: string) {
    const otp = await this.prisma.otp.findFirst({
      where: {
        email,
        code,
        used: false,
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!otp) throw new BadRequestException('Invalid or expired OTP');

    await this.prisma.otp.update({
      where: { id: otp.id },
      data: { used: true },
    });

    return true;
  }
}
