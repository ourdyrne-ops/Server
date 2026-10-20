import { describe, it, expect, beforeEach, vi } from 'vitest';
import { TelegramAuthService } from './auth/telegram-auth.service.js';
import { TokenService } from './services/token.service.js';
import { StreamingService } from './services/streaming.service.js';
import { LocalStorageAdapter } from './storage/local-storage.adapter.js';
import { StorageService } from './storage/storage.service.js';
import { UnauthorizedException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';

describe('Secure Streaming & Ten Security Gates Test Suite', () => {
  let telegramAuthService: TelegramAuthService;
  let tokenService: TokenService;
  let streamingService: StreamingService;
  let storageAdapter: LocalStorageAdapter;
  let storageService: StorageService;
  let mockPrisma: any;

  const testBotToken = '123456789:TEST_BOT_TOKEN_FOR_SIGNATURES';
  const testSigningSecret = 'super_secret_test_signing_key_for_hmac_tests';

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = testBotToken;
    process.env.MEDIA_SIGNING_SECRET = testSigningSecret;

    mockPrisma = {
      student: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      content: {
        findUnique: vi.fn(),
      },
      subscription: {
        findFirst: vi.fn(),
      },
      playbackSession: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      encryptionKey: {
        findUnique: vi.fn(),
        create: vi.fn(),
        updateMany: vi.fn(),
      },
      securityAuditEvent: {
        create: vi.fn().mockResolvedValue({}),
      },
    };

    tokenService = new TokenService();
    storageAdapter = new LocalStorageAdapter();
    storageService = new StorageService();
    telegramAuthService = new TelegramAuthService(mockPrisma);
    streamingService = new StreamingService(mockPrisma, storageService, tokenService);
  });

  // =========================================================================
  // REQUIREMENT 1: Unauthenticated users cannot watch lessons
  // =========================================================================
  describe('Gate 1: Telegram Mini App Authentication & Non-Forgability', () => {
    it('accepts validly signed Telegram initData and resolves student', async () => {
      const user = { id: 987654321, first_name: 'Alex', username: 'alex_test' };
      const validInitData = TelegramAuthService.generateTestInitData(user, testBotToken);

      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student_123',
        telegram_user_id: BigInt(987654321),
        is_active: true,
      });

      const result = await telegramAuthService.validateInitData(validInitData);
      expect(result.student.id).toBe('student_123');
      expect(result.telegramUser.id).toBe(987654321);
    });

    it('rejects initData with missing or forged signature hash', async () => {
      const forgedData = 'auth_date=1700000000&user=%7B%22id%22%3A123%7D&hash=fake_invalid_hash_12345';
      await expect(telegramAuthService.validateInitData(forgedData)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects tampered user payload with original hash', async () => {
      const user = { id: 111111, first_name: 'Alice' };
      const validInitData = TelegramAuthService.generateTestInitData(user, testBotToken);
      // Tamper user ID to impersonate another user
      const tampered = validInitData.replace('111111', '999999');

      await expect(telegramAuthService.validateInitData(tampered)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects expired initData older than 24 hours', async () => {
      const user = { id: 987654321 };
      // 25 hours in the past
      const expiredInitData = TelegramAuthService.generateTestInitData(user, testBotToken, -90000);

      await expect(telegramAuthService.validateInitData(expiredInitData)).rejects.toThrow(UnauthorizedException);
    });

    it('rejects inactive or suspended students', async () => {
      const user = { id: 987654321 };
      const validInitData = TelegramAuthService.generateTestInitData(user, testBotToken);

      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student_suspended',
        telegram_user_id: BigInt(987654321),
        is_active: false, // Suspended
      });

      await expect(telegramAuthService.validateInitData(validInitData)).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // REQUIREMENT 2: Expired or suspended subscribers cannot start playback
  // =========================================================================
  describe('Gate 2: Authoritative Subscription Entitlement', () => {
    it('authorizes playback session for active subscriber', async () => {
      mockPrisma.content.findUnique.mockResolvedValue({
        id: 'content_paid_1',
        status: 'PUBLISHED',
        is_free_preview: false,
        access_level: 'SUBSCRIBER',
        media: { id: 'media_100' },
      });

      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student_active',
        telegram_user_id: BigInt(987654321),
        is_active: true,
      });

      mockPrisma.subscription.findFirst.mockResolvedValue({
        id: 'sub_active_1',
        status: 'ACTIVE',
        current_period_end: new Date(Date.now() + 86400000), // Active tomorrow
      });

      mockPrisma.playbackSession.create.mockResolvedValue({});

      const session = await streamingService.createPlaybackSession('student_active', 'content_paid_1');
      expect(session.sessionId).toBeDefined();
      expect(session.token).toBeDefined();
      expect(session.playlistUrl).toContain('master.m3u8');
    });

    it('rejects playback session when student has no active subscription', async () => {
      mockPrisma.content.findUnique.mockResolvedValue({
        id: 'content_paid_1',
        status: 'PUBLISHED',
        is_free_preview: false,
        access_level: 'SUBSCRIBER',
        media: { id: 'media_100' },
      });

      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student_unpaid',
        telegram_user_id: BigInt(123456),
        is_active: true,
      });

      // No active subscription in database
      mockPrisma.subscription.findFirst.mockResolvedValue(null);

      await expect(streamingService.createPlaybackSession('student_unpaid', 'content_paid_1')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('permits playback session for free preview content without subscription', async () => {
      mockPrisma.content.findUnique.mockResolvedValue({
        id: 'content_free_1',
        status: 'PUBLISHED',
        is_free_preview: true,
        access_level: 'FREE_PREVIEW',
        media: { id: 'media_free' },
      });

      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'student_guest',
        telegram_user_id: BigInt(112233),
        is_active: true,
      });

      mockPrisma.playbackSession.create.mockResolvedValue({});

      const session = await streamingService.createPlaybackSession('student_guest', 'content_free_1');
      expect(session.sessionId).toBeDefined();
    });
  });

  // =========================================================================
  // REQUIREMENT 3: Storage isolation & Path Traversal Prevention
  // =========================================================================
  describe('Gate 3: Private Storage & Path Traversal Guards', () => {
    it('rejects path traversal attempts with dot-dot escape', async () => {
      await expect(storageAdapter.putObject('raw-media', '../../etc/passwd', 'malicious')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects path with null byte injection', async () => {
      await expect(storageAdapter.getObjectBuffer('raw-media', 'segment.ts\0.mp4')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  // =========================================================================
  // REQUIREMENT 4: Short-lived, signed, revocable playback authorization
  // =========================================================================
  describe('Gate 4: Short-Lived Playback Tokens & Renewal', () => {
    it('verifies valid HMAC token and extracts correct claims', () => {
      const claims = {
        sessionId: 'ses_123',
        studentId: 'stud_1',
        contentId: 'cnt_1',
        mediaId: 'med_1',
        expiresAt: Math.floor(Date.now() / 1000) + 180,
        version: 1,
      };

      const token = tokenService.generateToken(claims);
      const verified = tokenService.verifyToken(token);

      expect(verified.sessionId).toBe('ses_123');
      expect(verified.mediaId).toBe('med_1');
    });

    it('rejects expired playback tokens', () => {
      const expiredClaims = {
        sessionId: 'ses_old',
        studentId: 'stud_1',
        contentId: 'cnt_1',
        mediaId: 'med_1',
        expiresAt: Math.floor(Date.now() / 1000) - 10, // 10 seconds ago
        version: 1,
      };

      const token = tokenService.generateToken(expiredClaims);
      expect(() => tokenService.verifyToken(token)).toThrow(ForbiddenException);
    });

    it('rejects modified or tampered tokens', () => {
      const claims = {
        sessionId: 'ses_123',
        studentId: 'stud_1',
        contentId: 'cnt_1',
        mediaId: 'med_1',
        expiresAt: Math.floor(Date.now() / 1000) + 180,
        version: 1,
      };

      const token = tokenService.generateToken(claims);
      const tampered = token.slice(0, -4) + 'abcd';
      expect(() => tokenService.verifyToken(tampered)).toThrow(ForbiddenException);
    });

    it('renews active session before expiration', async () => {
      const claims = {
        sessionId: 'ses_renew',
        studentId: 'stud_1',
        contentId: 'cnt_1',
        mediaId: 'med_1',
        expiresAt: Math.floor(Date.now() / 1000) + 60,
        version: 1,
      };
      const token = tokenService.generateToken(claims);

      mockPrisma.playbackSession.findUnique.mockResolvedValue({
        id: 'ses_renew',
        student_id: 'stud_1',
        content_id: 'cnt_1',
        status: 'ACTIVE',
        content: { is_free_preview: true },
        student: { is_active: true },
      });
      mockPrisma.playbackSession.update.mockResolvedValue({});

      const renewed = await streamingService.renewPlaybackSession('ses_renew', token);
      expect(renewed.sessionId).toBe('ses_renew');
      expect(renewed.token).toBeDefined();
      expect(renewed.expiresAt).toBeGreaterThan(claims.expiresAt);
    });
  });

  // =========================================================================
  // REQUIREMENT 5: Playlists, segments, and encryption-key protection
  // =========================================================================
  describe('Gate 5: HLS Playlist Rewriting & AES-128 Key Delivery', () => {
    it('rewrites HLS playlist segment and key URIs with token parameter', () => {
      const rawM3u8 = [
        '#EXTM3U',
        '#EXT-X-VERSION:3',
        '#EXT-X-KEY:METHOD=AES-128,URI="abc-123.key"',
        '#EXTINF:10.000000,',
        'segment_000.ts',
        '#EXT-X-ENDLIST',
      ].join('\n');

      const token = 'test_token_123.sig';
      const rewritten = streamingService.rewritePlaylistWithTokens(rawM3u8, 'media_xyz', token);

      expect(rewritten).toContain('/api/stream/key/abc-123?token=test_token_123.sig');
      expect(rewritten).toContain('/api/stream/media_xyz/segment/segment_000.ts?token=test_token_123.sig');
    });

    it('delivers 16-byte raw AES-128 key for authorized session', async () => {
      const claims = {
        sessionId: 'ses_key_test',
        studentId: 'stud_1',
        contentId: 'cnt_1',
        mediaId: 'media_encrypted',
        expiresAt: Math.floor(Date.now() / 1000) + 180,
        version: 1,
      };
      const token = tokenService.generateToken(claims);
      const rawKey = crypto.randomBytes(16);

      mockPrisma.playbackSession.findUnique.mockResolvedValue({
        id: 'ses_key_test',
        status: 'ACTIVE',
      });

      mockPrisma.encryptionKey.findUnique.mockResolvedValue({
        key_id: 'key_valid_uuid',
        media_id: 'media_encrypted',
        key_cipher: rawKey.toString('hex'),
        is_active: true,
      });

      const keyBuffer = await streamingService.getEncryptionKey('key_valid_uuid', token);
      expect(keyBuffer.length).toBe(16);
      expect(keyBuffer.equals(rawKey)).toBe(true);
    });

    it('rejects key delivery when token mediaId does not match key mediaId', async () => {
      const claims = {
        sessionId: 'ses_key_test',
        studentId: 'stud_1',
        contentId: 'cnt_1',
        mediaId: 'media_authorized',
        expiresAt: Math.floor(Date.now() / 1000) + 180,
        version: 1,
      };
      const token = tokenService.generateToken(claims);

      mockPrisma.playbackSession.findUnique.mockResolvedValue({
        id: 'ses_key_test',
        status: 'ACTIVE',
      });

      mockPrisma.encryptionKey.findUnique.mockResolvedValue({
        key_id: 'key_diff_media',
        media_id: 'media_another_course', // Different media
        key_cipher: crypto.randomBytes(16).toString('hex'),
        is_active: true,
      });

      await expect(streamingService.getEncryptionKey('key_diff_media', token)).rejects.toThrow(ForbiddenException);
    });
  });

  // =========================================================================
  // REQUIREMENT 6: Revoked playback sessions are rejected
  // =========================================================================
  describe('Gate 6: Session Revocation Enforcement', () => {
    it('rejects media request when session status is REVOKED', async () => {
      const claims = {
        sessionId: 'ses_revoked',
        studentId: 'stud_1',
        contentId: 'cnt_1',
        mediaId: 'med_1',
        expiresAt: Math.floor(Date.now() / 1000) + 180,
        version: 1,
      };
      const token = tokenService.generateToken(claims);

      mockPrisma.playbackSession.findUnique.mockResolvedValue({
        id: 'ses_revoked',
        status: 'REVOKED', // Session was revoked
        expires_at: new Date(Date.now() + 180000),
      });

      await expect(streamingService.validateMediaRequest(token, 'med_1')).rejects.toThrow(ForbiddenException);
    });

    it('revokes all active sessions for a student on demand', async () => {
      mockPrisma.playbackSession.updateMany.mockResolvedValue({ count: 3 });

      const res = await streamingService.revokeAllSessionsForStudent('student_to_ban', 'SUBSCRIPTION_REFUNDED');
      expect(res.revokedCount).toBe(3);
    });
  });

  // =========================================================================
  // REQUIREMENT 8: Watermark format validation
  // =========================================================================
  describe('Gate 8: Watermark Integrity', () => {
    it('creates masked dynamic watermark string identifying student and session', async () => {
      mockPrisma.content.findUnique.mockResolvedValue({
        id: 'cnt_wm',
        status: 'PUBLISHED',
        is_free_preview: true,
        media: { id: 'med_wm' },
      });

      mockPrisma.student.findUnique.mockResolvedValue({
        id: 'stud_wm',
        telegram_user_id: BigInt(987654321),
        is_active: true,
      });
      mockPrisma.playbackSession.create.mockResolvedValue({});

      const session = await streamingService.createPlaybackSession('stud_wm', 'cnt_wm');
      expect(session.watermarkText).toContain('TG: 987***21');
      expect(session.watermarkText).toContain('SES:');
    });
  });
});
