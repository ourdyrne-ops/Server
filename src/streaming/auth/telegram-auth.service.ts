import { Injectable, UnauthorizedException, ForbiddenException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import * as crypto from 'crypto';

export interface ValidatedTelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  language_code?: string;
  is_premium?: boolean;
}

export interface TelegramAuthResult {
  student: {
    id: string;
    telegram_user_id: bigint;
    username: string | null;
    first_name: string | null;
    last_name: string | null;
    is_active: boolean;
  };
  telegramUser: ValidatedTelegramUser;
  authDate: Date;
}

@Injectable()
export class TelegramAuthService {
  private readonly logger = new Logger(TelegramAuthService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates Telegram WebApp initData string using Telegram's documented cryptographic verification.
   * @param initData Raw query string from Telegram.WebApp.initData
   * @param overrideBotToken Optional bot token override (defaults to TELEGRAM_BOT_TOKEN)
   */
  async validateInitData(initData: string, overrideBotToken?: string): Promise<TelegramAuthResult> {
    if (!initData || typeof initData !== 'string') {
      throw new UnauthorizedException('Missing Telegram initData');
    }

    const botToken = overrideBotToken || process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      throw new UnauthorizedException('Telegram bot token is not configured on server');
    }

    // Parse parameters
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) {
      throw new UnauthorizedException('Telegram initData is missing signature hash');
    }

    // Collect and sort data keys excluding hash
    const keys: string[] = [];
    params.forEach((_, key) => {
      if (key !== 'hash') {
        keys.push(key);
      }
    });

    keys.sort();
    const dataCheckString = keys.map((key) => `${key}=${params.get(key)}`).join('\n');

    // Calculate HMAC-SHA256 according to Telegram specification:
    // secret_key = HMAC_SHA256("WebAppData", bot_token)
    // calculated_hash = HMAC_SHA256(data_check_string, secret_key)
    const secretKey = crypto
      .createHmac('sha256', 'WebAppData')
      .update(botToken)
      .digest();

    const calculatedHash = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Constant-time comparison to prevent timing attacks
    const calculatedBuffer = Buffer.from(calculatedHash, 'hex');
    const receivedBuffer = Buffer.from(hash, 'hex');

    if (
      calculatedBuffer.length !== receivedBuffer.length ||
      !crypto.timingSafeEqual(calculatedBuffer, receivedBuffer)
    ) {
      this.logger.warn('Failed Telegram initData signature check (tampered or invalid token)');
      throw new UnauthorizedException('Invalid Telegram initData signature');
    }

    // Check auth_date freshness (maximum 24 hours validity window, reject future timestamps)
    const authDateNum = parseInt(params.get('auth_date') || '0', 10);
    const nowSec = Math.floor(Date.now() / 1000);
    const maxAgeSec = 86400; // 24 hours

    if (!authDateNum || nowSec - authDateNum > maxAgeSec || authDateNum > nowSec + 300) {
      throw new UnauthorizedException('Telegram session expired or invalid auth_date timestamp');
    }

    // Parse user object
    const userRaw = params.get('user');
    if (!userRaw) {
      throw new UnauthorizedException('Missing user object in Telegram initData');
    }

    let telegramUser: ValidatedTelegramUser;
    try {
      telegramUser = JSON.parse(userRaw);
    } catch {
      throw new UnauthorizedException('Malformed user JSON in Telegram initData');
    }

    if (!telegramUser.id) {
      throw new UnauthorizedException('Telegram user object missing valid user ID');
    }

    // Resolve or provision Student in database
    const telegramUserIdBigInt = BigInt(telegramUser.id);
    let student = await this.prisma.student.findUnique({
      where: { telegram_user_id: telegramUserIdBigInt },
    });

    if (!student) {
      // First-time student access provisioning
      student = await this.prisma.student.create({
        data: {
          telegram_user_id: telegramUserIdBigInt,
          username: telegramUser.username || null,
          first_name: telegramUser.first_name || null,
          last_name: telegramUser.last_name || null,
          is_active: true,
        },
      });
      this.logger.log(`Provisioned new student from Telegram WebApp: id=${student.id}, tgId=${telegramUser.id}`);
    }

    if (!student.is_active) {
      throw new ForbiddenException('Student account is suspended or deactivated');
    }

    return {
      student,
      telegramUser,
      authDate: new Date(authDateNum * 1000),
    };
  }

  /**
   * Helper utility for testing to generate valid mock initData strings signed with a given bot token
   */
  static generateTestInitData(user: ValidatedTelegramUser, botToken: string, authDateOffsetSec: number = 0): string {
    const authDate = Math.floor(Date.now() / 1000) + authDateOffsetSec;
    const queryId = 'AAH123456';
    const userStr = JSON.stringify(user);

    const items: Record<string, string> = {
      auth_date: authDate.toString(),
      query_id: queryId,
      user: userStr,
    };

    const keys = Object.keys(items).sort();
    const dataCheckString = keys.map((k) => `${k}=${items[k]}`).join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const hash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const params = new URLSearchParams();
    for (const k of keys) {
      params.set(k, items[k]);
    }
    params.set('hash', hash);

    return params.toString();
  }
}
