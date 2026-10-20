import { Injectable } from '@nestjs/common';
import { NavigationResponse } from './router.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

export const BOT_KEYBOARD_MENU = {
  keyboard: [
    [{ text: '🔥 Latest Course' }, { text: '📚 Courses' }],
    [{ text: '👤 Account' }, { text: '❓ Help' }],
    [{ text: '⭐ Clear Chat' }],
  ],
  resize_keyboard: true,
  is_persistent: true,
};

@Injectable()
export class MainMenuHandler {
  constructor(private prisma: PrismaService) {}

  async handle(studentId?: string): Promise<NavigationResponse> {
    const text = `🏠 <b>Welcome to Melcome University</b>\n\nPlease select an option from the menu below:`;

    const replyMarkup = JSON.parse(JSON.stringify(BOT_KEYBOARD_MENU));

    if (studentId) {
      const now = new Date();
      const currentActiveSub = await this.prisma.subscription.findFirst({
        where: {
          student_id: studentId,
          status: 'ACTIVE',
          current_period_start: { lte: now },
          current_period_end: { gt: now },
        },
        orderBy: { current_period_end: 'desc' },
      });

      if (currentActiveSub && currentActiveSub.current_period_end) {
        const diffMs = currentActiveSub.current_period_end.getTime() - now.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);

        if (diffDays <= 5 && diffDays >= 0) {
          replyMarkup.keyboard.push([{ text: '🔄 Renew Subscription' }]);
        }
      }
    }

    return {
      text,
      replyMarkup,
    };
  }
}
