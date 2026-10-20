import { Injectable } from '@nestjs/common';
import { NavigationResponse } from './router.service.js';

@Injectable()
export class HelpHandler {
  async handle(route: string, studentId: string): Promise<NavigationResponse> {
    if (route === 'nav:help') {
      return this.renderHelpMenu();
    }

    if (route === 'nav:help:release') {
      return this.renderHelpContent('🆕 New Course Release Date', 'Our next major course module is scheduled for release at the end of this month! Stay tuned.');
    }

    if (route === 'nav:help:refund') {
      return this.renderHelpContent('💰 Refund Policy', 'We offer a 5-minute automated refund window for accidental purchases. Please contact support for other inquiries.');
    }

    if (route === 'nav:help:terms') {
      return this.renderHelpContent('📜 Terms and Policy', 'By using Melcome University, you agree to our standard terms of service. Content is for personal use only.');
    }

    return this.renderHelpMenu();
  }

  private async renderHelpMenu(): Promise<NavigationResponse> {
    const text = `❓ <b>Help & FAQ</b>\n\nSelect a topic from the keyboard below:`;
    const replyMarkup = {
      keyboard: [
        [{ text: '🆕 New Course Release Date' }, { text: '💰 Refund' }],
        [{ text: '📜 Terms and Policy' }, { text: '🏠 Main Menu' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    };
    return { text, replyMarkup };
  }

  private async renderHelpContent(title: string, content: string): Promise<NavigationResponse> {
    const text = `<b>${title}</b>\n\n${content}`;
    const replyMarkup = {
      keyboard: [
        [{ text: '🆕 New Course Release Date' }, { text: '💰 Refund' }],
        [{ text: '📜 Terms and Policy' }, { text: '🏠 Main Menu' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    };
    return { text, replyMarkup };
  }
}
