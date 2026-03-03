import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, SignApiOptions } from 'cloudinary';

@Injectable()
export class CloudinaryService implements OnModuleInit {
  constructor(private configService: ConfigService) {}

  onModuleInit() {
    cloudinary.config({
      cloud_name: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      api_key: this.configService.get<string>('CLOUDINARY_API_KEY'),
      api_secret: this.configService.get<string>('CLOUDINARY_API_SECRET'),
      secure: true,
    });
  }

  /**
   * Generate signed upload signature
   */
  generateUploadSignature(folder: string, publicId?: string) {
    const timestamp = Math.round(Date.now() / 1000);

    const paramsToSign: SignApiOptions = {
      timestamp,
      folder,
    };

    if (publicId) {
      paramsToSign.public_id = publicId;
      paramsToSign.overwrite = true;
    }

    const signature = cloudinary.utils.api_sign_request(
      paramsToSign,
      this.configService.get<string>('CLOUDINARY_API_SECRET')!,
    );

    return {
      timestamp,
      signature,
      cloudName: this.configService.get<string>('CLOUDINARY_CLOUD_NAME'),
      apiKey: this.configService.get<string>('CLOUDINARY_API_KEY'),
      folder,
      publicId,
    };
  }
}
