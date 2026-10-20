import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NavigationResponse } from './router.service.js';

@Injectable()
export class LatestCourseHandler {
  constructor(private prisma: PrismaService) {}

  async handle(route: string, studentId: string): Promise<NavigationResponse> {
    if (route === 'nav:latest') {
      return this.renderFormatMenu();
    }

    const formatMatch = route.match(/^nav:latest:(video|audio|text)$/);
    if (formatMatch) {
      const format = formatMatch[1].toUpperCase() as 'VIDEO' | 'AUDIO' | 'TEXT';
      return this.renderItemsMenu(format);
    }

    return this.renderFormatMenu();
  }

  private async renderFormatMenu(): Promise<NavigationResponse> {
    const text = `🔥 <b>Latest Courses</b>\n\nChoose a format from the keyboard below:`;
    const replyMarkup = {
      keyboard: [
        [{ text: '🎬 Video' }, { text: '🎧 Audio' }],
        [{ text: '📄 Text' }, { text: '🏠 Main Menu' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    };
    return { text, replyMarkup };
  }

  private async renderItemsMenu(format: 'VIDEO' | 'AUDIO' | 'TEXT'): Promise<NavigationResponse> {
    const items = await this.prisma.content.findMany({
      where: { status: 'PUBLISHED', media_type: format },
      orderBy: { created_at: 'desc' },
      take: 10,
    });

    const formatNames = { VIDEO: 'Video', AUDIO: 'Audio', TEXT: 'Text' };

    if (items.length === 0) {
      return {
        text: `🔥 <b>Latest Courses - ${formatNames[format]}</b>\n\nNo courses currently available in this format.`,
        replyMarkup: {
          keyboard: [
            [{ text: '◀️ Previous' }, { text: '🏠 Main Menu' }],
          ],
          resize_keyboard: true,
          is_persistent: true,
        },
      };
    }

    const keyboard: any[][] = items.map((item) => [{ text: item.title }]);
    keyboard.push([{ text: '◀️ Previous' }, { text: '🏠 Main Menu' }]);

    const text = `🔥 <b>Latest Courses - ${formatNames[format]}</b>\n\nSelect a course from the keyboard below:`;
    return {
      text,
      replyMarkup: {
        keyboard,
        resize_keyboard: true,
        is_persistent: true,
      },
    };
  }
}
