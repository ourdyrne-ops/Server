import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NavigationResponse } from './router.service.js';

@Injectable()
export class CategoriesHandler {
  constructor(private prisma: PrismaService) {}

  async handle(route: string, studentId: string): Promise<NavigationResponse> {
    if (route === 'nav:categories') {
      return this.renderFormatMenu();
    }

    const formatMatch = route.match(/^nav:categories:(video|audio|text)$/);
    if (formatMatch) {
      const format = formatMatch[1].toUpperCase() as 'VIDEO' | 'AUDIO' | 'TEXT';
      return this.renderCategoriesMenu(format);
    }
    
    const catFormatMatch = route.match(/^nav:categories:(video|audio|text):([a-zA-Z0-9\-]+)$/);
    if (catFormatMatch) {
      const format = catFormatMatch[1].toUpperCase() as 'VIDEO' | 'AUDIO' | 'TEXT';
      const categoryId = catFormatMatch[2];
      return this.renderItemsMenu(format, categoryId);
    }

    return this.renderFormatMenu();
  }

  private async renderFormatMenu(): Promise<NavigationResponse> {
    const text = `🏷 <b>Categories</b>\n\nChoose a format from the keyboard below:`;
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

  private async renderCategoriesMenu(format: 'VIDEO' | 'AUDIO' | 'TEXT'): Promise<NavigationResponse> {
    const categories = await this.prisma.category.findMany({
      where: {
        content: {
          some: {
            status: 'PUBLISHED',
            media_type: format,
          },
        },
      },
    });

    const formatNames = { VIDEO: 'Video', AUDIO: 'Audio', TEXT: 'Text' };

    if (categories.length === 0) {
      return {
        text: `🏷 <b>Categories - ${formatNames[format]}</b>\n\nNo categories found for this format.`,
        replyMarkup: {
          keyboard: [
            [{ text: '◀️ Previous' }, { text: '🏠 Main Menu' }],
          ],
          resize_keyboard: true,
          is_persistent: true,
        },
      };
    }

    const keyboard: any[][] = [];
    for (let i = 0; i < categories.length; i += 2) {
      const row = [{ text: categories[i].name }];
      if (i + 1 < categories.length) {
        row.push({ text: categories[i + 1].name });
      }
      keyboard.push(row);
    }
    keyboard.push([{ text: '◀️ Previous' }, { text: '🏠 Main Menu' }]);

    const text = `🏷 <b>Categories - ${formatNames[format]}</b>\n\nSelect a category from the keyboard below:`;
    return {
      text,
      replyMarkup: {
        keyboard,
        resize_keyboard: true,
        is_persistent: true,
      },
    };
  }

  private async renderItemsMenu(format: 'VIDEO' | 'AUDIO' | 'TEXT', categoryId: string): Promise<NavigationResponse> {
    const items = await this.prisma.content.findMany({
      where: { 
        status: 'PUBLISHED', 
        media_type: format,
        category_id: categoryId,
      },
      orderBy: { created_at: 'desc' },
    });

    const category = await this.prisma.category.findUnique({ where: { id: categoryId } });
    const catName = category ? category.name : 'Category';
    const formatNames = { VIDEO: 'Video', AUDIO: 'Audio', TEXT: 'Text' };

    if (items.length === 0) {
      return {
        text: `📂 <b>${catName} - ${formatNames[format]}</b>\n\nNo courses found in this category.`,
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

    const text = `📂 <b>${catName} - ${formatNames[format]}</b>\n\nSelect a course from the keyboard below:`;
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
