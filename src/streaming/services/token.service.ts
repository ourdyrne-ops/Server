import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import * as crypto from 'crypto';

export interface PlaybackTokenClaims {
  sessionId: string;
  studentId: string;
  contentId: string;
  mediaId: string;
  expiresAt: number; // Unix timestamp in seconds
  version: number;
}

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  private getSigningSecret(): string {
    const secret = process.env.MEDIA_SIGNING_SECRET || process.env.JWT_SECRET;
    if (!secret) {
      throw new Error('MEDIA_SIGNING_SECRET is not configured on server');
    }
    return secret;
  }

  /**
   * Generates a short-lived, tamper-proof HMAC-SHA256 signed playback token.
   * @param claims Token payload
   */
  generateToken(claims: PlaybackTokenClaims): string {
    const secret = this.getSigningSecret();
    const payloadBuffer = Buffer.from(JSON.stringify(claims), 'utf-8');
    const encodedPayload = payloadBuffer.toString('base64url');

    const signature = crypto
      .createHmac('sha256', secret)
      .update(encodedPayload)
      .digest('base64url');

    return `${encodedPayload}.${signature}`;
  }

  /**
   * Validates a signed playback token, checking HMAC signature and expiration time.
   * @param token Full token string
   */
  verifyToken(token: string): PlaybackTokenClaims {
    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Missing playback authorization token');
    }

    const parts = token.split('.');
    if (parts.length !== 2) {
      throw new UnauthorizedException('Malformed playback token structure');
    }

    const [encodedPayload, receivedSignature] = parts;
    const secret = this.getSigningSecret();

    // Verify HMAC-SHA256 signature
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(encodedPayload)
      .digest('base64url');

    const expectedBuffer = Buffer.from(expectedSignature, 'utf-8');
    const receivedBuffer = Buffer.from(receivedSignature, 'utf-8');

    if (
      expectedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
    ) {
      this.logger.warn('Playback token signature mismatch (tampered token)');
      throw new ForbiddenException('Invalid or tampered playback token signature');
    }

    // Decode payload
    let claims: PlaybackTokenClaims;
    try {
      const jsonStr = Buffer.from(encodedPayload, 'base64url').toString('utf-8');
      claims = JSON.parse(jsonStr);
    } catch {
      throw new UnauthorizedException('Corrupted playback token payload');
    }

    // Check expiration against authoritative server time
    const nowSec = Math.floor(Date.now() / 1000);
    if (!claims.expiresAt || claims.expiresAt < nowSec) {
      throw new ForbiddenException('Playback authorization token has expired');
    }

    return claims;
  }

  /**
   * Generates a SHA-256 hash of the token for database session storage
   */
  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
