import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import * as fs from 'fs';
import { MediaService } from './media.service.js';
import { Public } from '../auth/decorators/public.decorator.js';

export const storageConfig = diskStorage({
  destination: (req, file, cb) => {
    let subDir = 'documents';
    const ext = extname(file.originalname).toLowerCase();
    const videoExts = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.m4v', '.flv'];
    const audioExts = ['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac', '.wma', '.opus'];
    const declaredType = (req.body?.media_type || (req.query as any)?.type || '').toUpperCase();

    if (
      declaredType === 'VIDEO' ||
      file.mimetype.startsWith('video/') ||
      videoExts.includes(ext)
    ) {
      subDir = 'videos';
    } else if (
      declaredType === 'AUDIO' ||
      file.mimetype.startsWith('audio/') ||
      audioExts.includes(ext)
    ) {
      subDir = 'audios';
    } else {
      subDir = 'documents';
    }

    const uploadPath = join(process.cwd(), 'uploads', subDir);
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = extname(file.originalname);
    cb(null, `${file.fieldname}-${uniqueSuffix}${ext}`);
  },
});

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Public()
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: storageConfig,
      limits: {
        fileSize: 500 * 1024 * 1024, // Up to 500MB
      },
    }),
  )
  async uploadFile(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    if (!file) {
      throw new BadRequestException('No file provided for upload');
    }
    const mediaType = req.body?.media_type || req.query?.type;
    return this.mediaService.saveUploadedMedia(file, mediaType);
  }

  @Get('access/:contentId')
  async getAccessUrl(@Param('contentId') contentId: string, @Req() req: any) {
    const studentId = req.user?.id || req.user?.sub;
    const ip = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.mediaService.getSignedUrl(studentId, contentId, ip, userAgent);
  }
}
