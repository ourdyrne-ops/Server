import {
  Controller,
  Get,
  Post,
  Headers,
  Body,
  UnauthorizedException,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { TelegramService } from './telegram.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly telegramService: TelegramService,
    private readonly paymentsService: PaymentsService,
  ) {}

  @Public()
  @Get('status')
  async getStatus() {
    return this.telegramService.getBotStatus();
  }

  @Public()
  @Post('set-webhook')
  async setWebhook(@Body() body: { url: string; secretToken?: string }) {
    if (!body?.url) {
      throw new BadRequestException('Webhook URL is required');
    }
    return this.telegramService.setWebhook(body.url, body.secretToken);
  }

  @Public()
  @Post('delete-webhook')
  async deleteWebhook() {
    return this.telegramService.deleteWebhook();
  }

  @Public()
  @Post('send-message')
  async sendMessage(
    @Body() body: { chatId: string | number; text: string; parseMode?: string },
  ) {
    if (!body?.chatId || !body?.text) {
      throw new BadRequestException('chatId and text are required');
    }
    return this.telegramService.sendMessage(body.chatId, body.text, body.parseMode);
  }

  @Public()
  @Post('invite-link')
  async createInviteLink(
    @Body()
    body: {
      chatId: string | number;
      name?: string;
      expireDate?: number;
      memberLimit?: number;
    },
  ) {
    if (!body?.chatId) {
      throw new BadRequestException('chatId is required');
    }
    return this.telegramService.createInviteLink(
      body.chatId,
      body.name,
      body.expireDate,
      body.memberLimit,
    );
  }

  @Public()
  @Get('students')
  async getStudents() {
    return this.telegramService.getStudents();
  }

  @Public()
  @Post('students/:studentId/extend')
  async extendStudent(
    @Param('studentId') studentId: string,
    @Body() body: { days?: number },
  ) {
    return this.paymentsService.extendStudentSubscription(studentId, body?.days || 30);
  }

  @Public()
  @Post('students/:studentId/status')
  async updateStudentStatus(
    @Param('studentId') studentId: string,
    @Body() body: { isActive?: boolean; status?: 'ACTIVE' | 'INACTIVE' | 'SUSPENDED', reason?: string },
  ) {
    const statusVal = body.status !== undefined ? body.status : (body.isActive !== undefined ? body.isActive : true);
    const result = await this.paymentsService.updateStudentStatus(studentId, statusVal);
    
    if (statusVal === 'SUSPENDED') {
      await this.telegramService.sendSuspensionNotification(studentId, body.reason);
    }
    
    return result;
  }

  @Public()
  @Get('auto-delete')
  async getAutoDeleteConfig() {
    return this.telegramService.getAutoDeleteConfig();
  }

  @Public()
  @Post('auto-delete')
  async updateAutoDeleteConfig(
    @Body() body: { enabled?: boolean; inactivityMinutes?: number },
  ) {
    return this.telegramService.updateAutoDeleteConfig(body);
  }

  @Public()
  @Post('auto-delete/clean-now')
  async cleanIdleNow() {
    const cleaned = await this.telegramService.cleanIdleSessionsNow();
    return { success: true, cleanedCount: cleaned };
  }

  @Public()
  @Post('webhook')
  async handleWebhookDirect(
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
    @Body() update: any,
  ) {
    if (!this.telegramService.verifyWebhookSecret(secretToken)) {
      throw new UnauthorizedException('Invalid webhook secret token');
    }
    const result = await this.telegramService.handleUpdate(update);
    return { ok: true, result };
  }

  @Public()
  @Post('webhook/:secretPath')
  async handleWebhook(
    @Param('secretPath') secretPath: string,
    @Headers('x-telegram-bot-api-secret-token') secretToken: string,
    @Body() update: any,
  ) {
    // Double verification: path and header token
    const configuredSecretPath =
      process.env.TELEGRAM_WEBHOOK_PATH || process.env.TELEGRAM_WEBHOOK_SECRET;

    if (secretPath !== configuredSecretPath) {
      throw new UnauthorizedException();
    }

    if (!this.telegramService.verifyWebhookSecret(secretToken)) {
      throw new UnauthorizedException();
    }

    const result = await this.telegramService.handleUpdate(update);
    return { ok: true, result };
  }
}
