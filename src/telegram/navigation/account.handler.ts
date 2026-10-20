import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { PaymentsService } from '../../payments/payments.service.js';
import { NavigationResponse } from './router.service.js';

@Injectable()
export class AccountHandler {
  constructor(
    private prisma: PrismaService,
    private paymentsService: PaymentsService
  ) {}

  async handle(route: string, studentId: string): Promise<NavigationResponse> {
    if (route === 'nav:account') {
      return this.renderAccountMenu();
    }

    if (route === 'nav:account:subscription') {
      return this.renderSubscriptionMenu(studentId);
    }

    if (route === 'nav:account:validity') {
      return this.renderValidityMenu(studentId);
    }

    return this.renderAccountMenu();
  }

  private async renderAccountMenu(): Promise<NavigationResponse> {
    const text = `👤 <b>Account</b>\n\nManage your membership and validity from the keyboard below:`;
    const replyMarkup = {
      keyboard: [
        [{ text: '📅 Validity' }],
        [{ text: '🏠 Main Menu' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    };
    return { text, replyMarkup };
  }

  private async renderSubscriptionMenu(studentId: string): Promise<NavigationResponse> {
    const plan = await this.paymentsService.getFixedPlan();
    
    const now = new Date();
    const currentSub = await this.prisma.subscription.findFirst({
      where: {
        student_id: studentId,
        status: 'ACTIVE',
        current_period_end: { gt: now },
      },
      orderBy: { current_period_end: 'desc' },
    });

    let currentStatusText = '';
    if (currentSub && currentSub.current_period_end) {
      const currentEndDateStr = new Date(currentSub.current_period_end).toLocaleDateString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      currentStatusText = `Status: <b>Active until ${currentEndDateStr}</b> ✅\n` +
        `<i>Renewing will add +30 days directly onto ${currentEndDateStr}!</i>\n\n`;
    }

    const text = `⭐ <b>All-Access Subscription</b>\n\n` +
      currentStatusText +
      `Price: <b>⭐ ${plan.price} Stars</b> (Includes all videos, audios, and text notes)\n\n` +
      `<i>Pay natively using Telegram Stars in this chat for instant 1-tap activation!</i>`;

    const replyMarkup = {
      keyboard: [
        [{ text: '💳 Renew Subscription' }],
        [{ text: '📅 Validity' }],
        [{ text: '🏠 Main Menu' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    };
    return { text, replyMarkup };
  }

  private async renderValidityMenu(studentId: string): Promise<NavigationResponse> {
    const now = new Date();
    const sub = await this.prisma.subscription.findFirst({
      where: {
        student_id: studentId,
        status: 'ACTIVE',
        OR: [
          { current_period_end: { gt: now } },
          { current_period_end: null },
        ],
      },
      orderBy: { created_at: 'desc' },
    });

    let text = `📅 <b>Validity</b>\n\n`;

    if (sub) {
      const validUntil = sub.current_period_end
        ? new Date(sub.current_period_end)
        : new Date(now.getTime() + 30 * 86400000);
      
      const validUntilDateStr = validUntil.toLocaleDateString('en-IN', {
        day: '2-digit', month: '2-digit', year: 'numeric',
      });
      const diffMs = validUntil.getTime() - now.getTime();
      const remainingDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));

      text += `Status: <b>Active</b> ✅\n`;
      text += `Valid Until: <b>${validUntilDateStr}</b>\n`;
      text += `Remaining Days: <b>${remainingDays} days</b>\n\n`;
      text += `<i>Your Melcome University All-Access membership is active.</i>`;
    } else {
      text += `Status: <b>Inactive</b> ❌\n`;
      text += `You do not have an active subscription.\n`;
    }

    const replyMarkup = {
      keyboard: [
        [{ text: '📅 Validity' }],
        [{ text: '🏠 Main Menu' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    };
    return { text, replyMarkup };
  }
}
