import { Injectable } from '@nestjs/common';
import { CloudinaryService } from 'src/common/cloudinary/cloudinary.service';

@Injectable()
export class UploadService {
  constructor(private cloudinary: CloudinaryService) {}

  getAvatarSignature(userId: string) {
    return this.cloudinary.generateUploadSignature(
      'avatars',
      `avatar_${userId}`,
    );
  }

  validateAvatarUrl(url: string, userId: string) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;

    if (!url.includes(`res.cloudinary.com/${cloudName}`)) {
      throw new Error('Invalid avatar URL (not from our Cloudinary)');
    }

    if (!url.includes(`avatars/avatar_${userId}`)) {
      throw new Error('Invalid avatar public_id');
    }
  }
}
