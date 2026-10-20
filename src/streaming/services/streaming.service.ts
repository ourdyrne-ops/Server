import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';
import { TokenService, PlaybackTokenClaims } from './token.service.js';
import { randomUUID } from 'crypto';

@Injectable()
export class StreamingService {
  private readonly logger = new Logger(StreamingService.name);
  private readonly tokenTtlSeconds = 180; // 3 minutes token lifetime

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly tokenService: TokenService,
  ) {}

  /**
   * Authorizes and creates a new revocable PlaybackSession.
   */
  async createPlaybackSession(
    studentId: string,
    contentId: string,
    ip?: string,
    userAgent?: string,
  ) {
    // 1. Verify content exists and is published
    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      include: { media: true },
    });

    if (!content || content.status !== 'PUBLISHED') {
      throw new NotFoundException('Content not found or not published');
    }

    if (!content.media) {
      throw new NotFoundException('No media asset attached to this lesson');
    }

    // 2. Authoritative Subscription & Entitlement Check
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
    });

    if (!student || !student.is_active) {
      await this.logAuditEvent('ACCESS_DENIED_STUDENT_INACTIVE', studentId, null, contentId, ip, userAgent);
      throw new ForbiddenException('Student account is inactive or suspended');
    }

    const isFree = content.is_free_preview || content.access_level === 'FREE_PREVIEW';

    if (!isFree) {
      const now = new Date();
      const activeSubscription = await this.prisma.subscription.findFirst({
        where: {
          student_id: studentId,
          status: 'ACTIVE',
          current_period_end: { gt: now },
        },
      });

      if (!activeSubscription) {
        await this.logAuditEvent('ACCESS_DENIED_NO_SUBSCRIPTION', studentId, null, contentId, ip, userAgent);
        throw new ForbiddenException('Active course subscription required for playback');
      }
    }

    // 3. Create cryptographically secure session
    const sessionId = randomUUID();
    const expiresAtSec = Math.floor(Date.now() / 1000) + this.tokenTtlSeconds;

    // Masked watermark format: "TG: 987***321 | SES: 3b9a1***"
    const tgStr = student.telegram_user_id.toString();
    const maskedTg = tgStr.length > 5 ? `${tgStr.slice(0, 3)}***${tgStr.slice(-2)}` : tgStr;
    const watermarkText = `TG: ${maskedTg} | SES: ${sessionId.slice(0, 8)}`;

    const tokenClaims: PlaybackTokenClaims = {
      sessionId,
      studentId,
      contentId,
      mediaId: content.media.id,
      expiresAt: expiresAtSec,
      version: 1,
    };

    const token = this.tokenService.generateToken(tokenClaims);
    const tokenHash = this.tokenService.hashToken(token);

    await this.prisma.playbackSession.create({
      data: {
        id: sessionId,
        student_id: studentId,
        content_id: contentId,
        media_id: content.media.id,
        token_hash: tokenHash,
        status: 'ACTIVE',
        watermark_text: watermarkText,
        ip_address: ip || null,
        user_agent: userAgent || null,
        expires_at: new Date(expiresAtSec * 1000),
        last_active_at: new Date(),
      },
    });

    await this.logAuditEvent('PLAYBACK_SESSION_CREATED', studentId, sessionId, contentId, ip, userAgent, {
      mediaId: content.media.id,
      isFree,
    });

    return {
      sessionId,
      token,
      expiresAt: expiresAtSec,
      watermarkText,
      mediaId: content.media.id,
      playlistUrl: `/api/stream/${content.media.id}/master.m3u8?token=${token}`,
    };
  }

  /**
   * Renews playback authorization for an existing active session.
   */
  async renewPlaybackSession(sessionId: string, token: string, ip?: string, userAgent?: string) {
    const claims = this.tokenService.verifyToken(token);

    if (claims.sessionId !== sessionId) {
      throw new ForbiddenException('Token session mismatch');
    }

    const session = await this.prisma.playbackSession.findUnique({
      where: { id: sessionId },
      include: { content: true, student: true },
    });

    if (!session || session.status !== 'ACTIVE') {
      await this.logAuditEvent('RENEWAL_REJECTED_SESSION_INACTIVE', claims.studentId, sessionId, claims.contentId, ip, userAgent);
      throw new ForbiddenException('Playback session has been revoked or expired');
    }

    // Re-verify student subscription status if paid content
    const isFree = session.content.is_free_preview || session.content.access_level === 'FREE_PREVIEW';
    if (!isFree) {
      const now = new Date();
      const activeSubscription = await this.prisma.subscription.findFirst({
        where: {
          student_id: session.student_id,
          status: 'ACTIVE',
          current_period_end: { gt: now },
        },
      });

      if (!activeSubscription) {
        // Automatically revoke session due to subscription expiry mid-stream
        await this.prisma.playbackSession.update({
          where: { id: sessionId },
          data: { status: 'REVOKED', revoked_at: now, revoke_reason: 'SUBSCRIPTION_EXPIRED' },
        });
        await this.logAuditEvent('SESSION_REVOKED_SUBSCRIPTION_EXPIRED', session.student_id, sessionId, session.content_id, ip, userAgent);
        throw new ForbiddenException('Subscription expired during playback');
      }
    }

    // Extend session validity
    const newExpiresAtSec = Math.floor(Date.now() / 1000) + this.tokenTtlSeconds;
    const newClaims: PlaybackTokenClaims = {
      ...claims,
      expiresAt: newExpiresAtSec,
      version: claims.version + 1,
    };

    const newToken = this.tokenService.generateToken(newClaims);
    const newTokenHash = this.tokenService.hashToken(newToken);

    await this.prisma.playbackSession.update({
      where: { id: sessionId },
      data: {
        token_hash: newTokenHash,
        expires_at: new Date(newExpiresAtSec * 1000),
        last_active_at: new Date(),
      },
    });

    return {
      sessionId,
      token: newToken,
      expiresAt: newExpiresAtSec,
    };
  }

  /**
   * Revokes a specific playback session.
   */
  async revokeSession(sessionId: string, reason: string = 'MANUAL_REVOCATION', adminId?: string) {
    const session = await this.prisma.playbackSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    await this.prisma.playbackSession.update({
      where: { id: sessionId },
      data: {
        status: 'REVOKED',
        revoked_at: new Date(),
        revoke_reason: reason,
      },
    });

    await this.logAuditEvent('SESSION_REVOKED', session.student_id, sessionId, session.content_id, null, null, {
      reason,
      revokedBy: adminId || 'SYSTEM',
    });

    this.logger.log(`Revoked playback session ${sessionId}: reason=${reason}`);
    return { success: true, sessionId, status: 'REVOKED' };
  }

  /**
   * Revokes all active playback sessions for a student.
   */
  async revokeAllSessionsForStudent(studentId: string, reason: string = 'ACCOUNT_REVOCATION') {
    const res = await this.prisma.playbackSession.updateMany({
      where: {
        student_id: studentId,
        status: 'ACTIVE',
      },
      data: {
        status: 'REVOKED',
        revoked_at: new Date(),
        revoke_reason: reason,
      },
    });

    await this.logAuditEvent('ALL_SESSIONS_REVOKED', studentId, null, null, null, null, {
      count: res.count,
      reason,
    });

    this.logger.log(`Revoked ${res.count} sessions for student ${studentId}: reason=${reason}`);
    return { success: true, revokedCount: res.count };
  }

  /**
   * Validates authorization for an incoming media request (playlist, segment, key).
   */
  async validateMediaRequest(token: string, mediaId: string) {
    const claims = this.tokenService.verifyToken(token);

    if (claims.mediaId !== mediaId) {
      throw new ForbiddenException('Token not authorized for requested media asset');
    }

    const session = await this.prisma.playbackSession.findUnique({
      where: { id: claims.sessionId },
    });

    if (!session || session.status !== 'ACTIVE') {
      throw new ForbiddenException('Playback session has been revoked or expired');
    }

    // Check session expiration
    if (session.expires_at < new Date()) {
      throw new ForbiddenException('Playback session expired');
    }

    return { session, claims };
  }

  /**
   * Rewrites an HLS M3U8 playlist to ensure all internal segment and key URIs carry valid tokens.
   */
  rewritePlaylistWithTokens(playlistContent: string, mediaId: string, token: string): string {
    const lines = playlistContent.split(/\r?\n/);
    const rewrittenLines: string[] = [];

    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        rewrittenLines.push(line);
        continue;
      }

      // 1. Rewrite AES-128 Encryption Key URI
      // Matches #EXT-X-KEY:METHOD=AES-128,URI="index.key" or URI="keyId"
      if (trimmed.startsWith('#EXT-X-KEY:')) {
        const keyMatch = trimmed.match(/URI=["']([^"']+)["']/);
        if (keyMatch) {
          const originalUri = keyMatch[1];
          // Strip any file extensions to get keyId
          const keyId = originalUri.replace(/^.*[\\/]/, '').replace(/\.key$/, '');
          const secureKeyUrl = `/api/stream/key/${keyId}?token=${token}`;
          line = trimmed.replace(`URI="${originalUri}"`, `URI="${secureKeyUrl}"`).replace(`URI='${originalUri}'`, `URI="${secureKeyUrl}"`);
        }
        rewrittenLines.push(line);
        continue;
      }

      // 2. Comments / Directives (excluding URI lines)
      if (trimmed.startsWith('#')) {
        rewrittenLines.push(line);
        continue;
      }

      // 3. Media playlist / Sub-variant playlist references
      if (trimmed.endsWith('.m3u8')) {
        const cleanFile = trimmed.replace(/^.*[\\/]/, '');
        rewrittenLines.push(`/api/stream/${mediaId}/${cleanFile}?token=${token}`);
        continue;
      }

      // 4. TS or fMP4 segments
      if (trimmed.endsWith('.ts') || trimmed.endsWith('.m4s') || trimmed.endsWith('.mp4')) {
        const cleanFile = trimmed.replace(/^.*[\\/]/, '');
        rewrittenLines.push(`/api/stream/${mediaId}/segment/${cleanFile}?token=${token}`);
        continue;
      }

      rewrittenLines.push(line);
    }

    return rewrittenLines.join('\n');
  }

  /**
   * Retrieves AES-128 encryption key buffer after verifying authorization.
   */
  async getEncryptionKey(keyId: string, token: string) {
    const claims = this.tokenService.verifyToken(token);

    const session = await this.prisma.playbackSession.findUnique({
      where: { id: claims.sessionId },
    });

    if (!session || session.status !== 'ACTIVE') {
      throw new ForbiddenException('Playback session revoked');
    }

    const keyRecord = await this.prisma.encryptionKey.findUnique({
      where: { key_id: keyId },
    });

    if (!keyRecord || !keyRecord.is_active) {
      throw new NotFoundException('Encryption key not found or inactive');
    }

    // Verify key belongs to the media asset authorized in token
    if (keyRecord.media_id !== claims.mediaId) {
      throw new ForbiddenException('Encryption key does not belong to authorized media');
    }

    // Return 16-byte Buffer from hex cipher
    return Buffer.from(keyRecord.key_cipher, 'hex');
  }

  async listSessions(limit: number = 50) {
    return this.prisma.playbackSession.findMany({
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            telegram_user_id: true,
            username: true,
            first_name: true,
            last_name: true,
          },
        },
        content: {
          select: {
            id: true,
            title: true,
          },
        },
      },
    });
  }

  async recordHeartbeat(sessionId: string) {
    await this.prisma.playbackSession.update({
      where: { id: sessionId },
      data: { last_active_at: new Date() },
    });
  }

  private async logAuditEvent(
    eventType: string,
    studentId: string | null,
    sessionId: string | null,
    contentId: string | null,
    ip: string | null | undefined,
    userAgent: string | null | undefined,
    details?: any,
  ) {
    try {
      await this.prisma.securityAuditEvent.create({
        data: {
          event_type: eventType,
          student_id: studentId,
          session_id: sessionId,
          content_id: contentId,
          ip_address: ip || null,
          user_agent: userAgent || null,
          details: details || null,
        },
      });
    } catch (e: any) {
      this.logger.warn(`Failed to record audit event ${eventType}: ${e.message}`);
    }
  }
}
