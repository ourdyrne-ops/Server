import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import * as crypto from 'crypto';

@Injectable()
export class MediaService {
  constructor(private prisma: PrismaService) {}

  async getSignedUrl(studentId: string, contentId: string, ip?: string, userAgent?: string) {
    // 1. Verify content exists and is published
    const content = await this.prisma.content.findFirst({
      where: {
        id: contentId,
        status: 'PUBLISHED',
      },
      include: { media: true },
    });

    if (!content || !content.media || !content.media.hls_path) {
      throw new NotFoundException('Media not found or not ready');
    }

    // 2. Authorization is already handled by SubscriptionGuard,
    // but we can enforce rate limiting/abuse detection here based on MediaAccessLog
    
    // Log access
    await this.prisma.mediaAccessLog.create({
      data: {
        student_id: studentId,
        content_id: contentId,
        ip,
        user_agent: userAgent,
      },
    });

    // 3. Generate short-lived signed URL
    const secret = process.env.MEDIA_SIGNING_SECRET || 'fallback_secret';
    const expiresAt = Math.floor(Date.now() / 1000) + 120; // 120s TTL
    
    const signaturePayload = `${content.media.hls_path}:${expiresAt}:${studentId}`;
    const signature = crypto
      .createHmac('sha256', secret)
      .update(signaturePayload)
      .digest('hex');

    // In a real app, this would point to a CDN or a specific route that verifies the signature
    const signedUrl = `https://media.yourdomain.com/${content.media.hls_path}?expires=${expiresAt}&student=${studentId}&sig=${signature}`;

    return { url: signedUrl, expiresAt };
  }

  async saveUploadedMedia(file: Express.Multer.File, mediaType?: string) {
    if (!file) {
      throw new NotFoundException('No file uploaded');
    }

    // Normalize relative storage path (e.g. "uploads/videos/...")
    const relativePath = file.path
      .replace(process.cwd(), '')
      .replace(/^[\\\/]+/, '')
      .replace(/\\/g, '/');

    const media = await this.prisma.media.create({
      data: {
        storage_path: relativePath,
        status: 'READY',
      },
    });

    return {
      id: media.id,
      storage_path: relativePath,
      filename: file.filename,
      originalname: file.originalname,
      size: file.size,
      mimetype: file.mimetype,
      media_type: mediaType,
      url: `/${relativePath}`,
    };
  }

  async findOne(id: string) {
    const media = await this.prisma.media.findUnique({
      where: { id },
    });
    if (!media) {
      throw new NotFoundException('Media not found');
    }
    return media;
  }

  async queueMediaProcessing(mediaId: string, storagePath: string) {
    // Placeholder for background processing
    console.log(`Queued processing for media ${mediaId} at ${storagePath}`);
  }
}
