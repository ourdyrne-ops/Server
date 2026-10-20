import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  Body,
  Req,
  Res,
  BadRequestException,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { StreamingService } from './services/streaming.service.js';
import { TelegramAuthService } from './auth/telegram-auth.service.js';
import { StorageService } from './storage/storage.service.js';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('stream')
export class StreamingController {
  constructor(
    private readonly streamingService: StreamingService,
    private readonly telegramAuthService: TelegramAuthService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Requirement 1 & 2: Authenticated session creation via Telegram Mini App initData
   */
  @Public()
  @Post('session')
  async createSession(
    @Body() body: { contentId: string; initData?: string; telegramUserId?: string | number },
    @Req() req: Request,
  ) {
    if (!body.contentId) {
      throw new BadRequestException('contentId is required');
    }

    let studentId: string | null = null;

    // 1. Authenticate via Telegram Mini App initData
    if (body.initData) {
      const authResult = await this.telegramAuthService.validateInitData(body.initData);
      studentId = authResult.student.id;
    } else if ((req as any).user?.id || (req as any).user?.sub) {
      // Authenticated via standard session/JWT
      studentId = (req as any).user.id || (req as any).user.sub;
    } else {
      throw new UnauthorizedException('Telegram initData or valid user authentication required');
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.streamingService.createPlaybackSession(studentId!, body.contentId, ip, userAgent);
  }

  /**
   * Requirement 4: Short-lived token renewal before mid-stream expiration
   */
  @Public()
  @Post('session/:sessionId/renew')
  async renewSession(
    @Param('sessionId') sessionId: string,
    @Body() body: { token: string },
    @Req() req: Request,
  ) {
    if (!body.token) {
      throw new BadRequestException('Playback token is required for renewal');
    }

    const ip = req.ip || req.socket?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    return this.streamingService.renewPlaybackSession(sessionId, body.token, ip, userAgent);
  }

  /**
   * Requirement 6: Revoke a specific playback session
   */
  @Post('session/:sessionId/revoke')
  async revokeSession(
    @Param('sessionId') sessionId: string,
    @Body() body: { reason?: string },
    @Req() req: any,
  ) {
    const adminId = req.user?.id || req.user?.sub;
    return this.streamingService.revokeSession(sessionId, body?.reason || 'ADMIN_REVOCATION', adminId);
  }

  /**
   * Requirement 6: Revoke all active playback sessions for a student
   */
  @Post('student/:studentId/revoke-all')
  async revokeAllForStudent(
    @Param('studentId') studentId: string,
    @Body() body: { reason?: string },
  ) {
    return this.streamingService.revokeAllSessionsForStudent(studentId, body?.reason || 'ACCOUNT_REVOCATION');
  }

  /**
   * Admin session inspection
   */
  @Get('sessions')
  async listSessions(@Query('limit') limit?: string) {
    const lim = limit ? parseInt(limit, 10) : 50;
    return this.streamingService.listSessions(lim);
  }

  /**
   * Requirement 5: Protected Master HLS Playlist
   */
  @Public()
  @Get(':mediaId/master.m3u8')
  async getMasterPlaylist(
    @Param('mediaId') mediaId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new UnauthorizedException('Missing playback authorization token');
    }

    // Validate token and session state
    await this.streamingService.validateMediaRequest(token, mediaId);

    // Fetch master playlist from private storage
    const playlistBuffer = await this.storage.getHlsFileBuffer(mediaId, 'master.m3u8');
    const rawM3u8 = playlistBuffer.toString('utf-8');

    // Rewrite internal segment & key references with token
    const secureM3u8 = this.streamingService.rewritePlaylistWithTokens(rawM3u8, mediaId, token);

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).send(secureM3u8);
  }

  /**
   * Protected Variant Playlist (for ABR ladders)
   */
  @Public()
  @Get(':mediaId/:variant.m3u8')
  async getVariantPlaylist(
    @Param('mediaId') mediaId: string,
    @Param('variant') variant: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new UnauthorizedException('Missing playback authorization token');
    }

    // Sanitize variant filename
    if (!/^[a-zA-Z0-9_-]+$/.test(variant)) {
      throw new BadRequestException('Invalid variant name');
    }

    await this.streamingService.validateMediaRequest(token, mediaId);

    const playlistBuffer = await this.storage.getHlsFileBuffer(mediaId, `${variant}.m3u8`);
    const rawM3u8 = playlistBuffer.toString('utf-8');
    const secureM3u8 = this.streamingService.rewritePlaylistWithTokens(rawM3u8, mediaId, token);

    res.setHeader('Content-Type', 'application/vnd.apple.mpegurl');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    return res.status(200).send(secureM3u8);
  }

  /**
   * Requirement 3 & 5: Protected Video/Audio Segments
   */
  @Public()
  @Get(':mediaId/segment/:segmentFile')
  async getSegment(
    @Param('mediaId') mediaId: string,
    @Param('segmentFile') segmentFile: string,
    @Query('token') token: string,
    @Headers('range') rangeHeader: string | undefined,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new UnauthorizedException('Missing playback authorization token');
    }

    // Strict path traversal and filename validation
    if (!/^[a-zA-Z0-9_.-]+$/.test(segmentFile) || segmentFile.includes('..')) {
      throw new BadRequestException('Path traversal or invalid segment format detected');
    }

    await this.streamingService.validateMediaRequest(token, mediaId);

    const meta = await this.storage.headHlsFile(mediaId, segmentFile);
    if (!meta) {
      return res.status(404).json({ message: 'Segment not found' });
    }

    res.setHeader('Content-Type', 'video/mp2t');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Accept-Ranges', 'bytes');

    // Handle range requests if specified
    if (rangeHeader) {
      const parts = rangeHeader.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : meta.contentLength - 1;
      const chunkSize = end - start + 1;

      res.status(206);
      res.setHeader('Content-Range', `bytes ${start}-${end}/${meta.contentLength}`);
      res.setHeader('Content-Length', chunkSize);

      const stream = await this.storage.getHlsFileStream(mediaId, segmentFile, { start, end });
      return stream.pipe(res);
    }

    res.setHeader('Content-Length', meta.contentLength);
    const stream = await this.storage.getHlsFileStream(mediaId, segmentFile);
    return stream.pipe(res);
  }

  /**
   * Requirement 5: Protected AES-128 Encryption Key Delivery
   */
  @Public()
  @Get('key/:keyId')
  async getEncryptionKey(
    @Param('keyId') keyId: string,
    @Query('token') token: string,
    @Res() res: Response,
  ) {
    if (!token) {
      throw new UnauthorizedException('Missing playback token for key authorization');
    }

    // Sanitize key ID
    if (!/^[a-zA-Z0-9_-]+$/.test(keyId)) {
      throw new BadRequestException('Invalid encryption key ID');
    }

    const keyBytes = await this.streamingService.getEncryptionKey(keyId, token);

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Content-Length', keyBytes.length);
    return res.status(200).send(keyBytes);
  }

  /**
   * Playback heartbeat
   */
  @Public()
  @Post('session/:sessionId/heartbeat')
  async heartbeat(
    @Param('sessionId') sessionId: string,
    @Body() body: { token: string },
  ) {
    if (body.token) {
      await this.streamingService.validateMediaRequest(body.token, '');
    }
    await this.streamingService.recordHeartbeat(sessionId);
    return { success: true };
  }
}
