import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { MediaType, ContentStatus, ContentVisibility } from '@prisma/client';

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);

  constructor(private prisma: PrismaService) {}

  async findAll(params: {
    mediaType?: MediaType;
    categoryId?: string;
    studentId?: string;
    all?: boolean;
  }) {
    const where: any = {};
    if (!params.all) {
      where.status = ContentStatus.PUBLISHED;
      where.visibility = ContentVisibility.VISIBLE;
    }
    if (params.mediaType) {
      where.media_type = params.mediaType;
    }
    if (params.categoryId) {
      where.category_id = params.categoryId;
    }

    return this.prisma.content.findMany({
      where,
      include: {
        category: true,
        tags: { include: { tag: true } },
        text_content: true,
        media: true,
      },
      orderBy: { created_at: 'desc' },
    });
  }

  async findOne(id: string, studentId?: string) {
    const where: any = { id };
    if (studentId) {
      where.status = 'PUBLISHED';
    }

    const content = await this.prisma.content.findFirst({
      where,
      include: {
        category: true,
        text_content: true,
        media: true,
      },
    });

    if (!content) {
      throw new NotFoundException('Content not found');
    }

    return content;
  }

  async getCategories() {
    return this.prisma.category.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async create(data: {
    title: string;
    media_type: MediaType;
    categoryId?: string;
    categoryName?: string;
    status?: ContentStatus;
    visibility?: ContentVisibility;
    body?: string;
    media_id?: string;
    duration?: number;
    userId?: string;
    published_at?: string;
  }) {
    let categoryId = data.categoryId;

    // Check if categoryId is valid in the database
    if (categoryId) {
      const exists = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!exists) {
        categoryId = undefined;
      }
    }

    if (!categoryId && data.categoryName) {
      const category = await this.prisma.category.upsert({
        where: { name: data.categoryName },
        update: {},
        create: { name: data.categoryName },
      });
      categoryId = category.id;
    }

    if (!categoryId) {
      const defaultCategory = await this.prisma.category.findFirst();
      categoryId = defaultCategory?.id || '';
    }

    const content = await this.prisma.content.create({
      data: {
        title: data.title,
        media_type: data.media_type,
        category_id: categoryId,
        media_id: data.media_id || undefined,
        duration: data.duration,
        status: data.status || ContentStatus.PUBLISHED,
        visibility: data.visibility || ContentVisibility.VISIBLE,
        published_at: data.published_at ? new Date(data.published_at) : null,
        created_by: data.userId || 'admin@admin.com',
        ...(data.body
          ? { text_content: { create: { body: data.body } } }
          : {}),
      },
      include: {
        category: true,
        text_content: true,
        media: true,
      },
    });

    return content;
  }

  async update(id: string, data: {
    title?: string;
    media_type?: MediaType;
    categoryId?: string;
    categoryName?: string;
    status?: ContentStatus;
    visibility?: ContentVisibility;
    body?: string;
    media_id?: string;
    duration?: number;
    published_at?: string;
  }) {
    let categoryId = data.categoryId;

    if (categoryId) {
      const exists = await this.prisma.category.findUnique({ where: { id: categoryId } });
      if (!exists) {
        categoryId = undefined;
      }
    }

    if (!categoryId && data.categoryName) {
      const category = await this.prisma.category.upsert({
        where: { name: data.categoryName },
        update: {},
        create: { name: data.categoryName },
      });
      categoryId = category.id;
    }

    const updateData: any = {};
    if (data.title !== undefined) updateData.title = data.title;
    if (data.media_type !== undefined) updateData.media_type = data.media_type;
    if (categoryId) updateData.category_id = categoryId;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.visibility !== undefined) updateData.visibility = data.visibility;
    if (data.media_id !== undefined) updateData.media_id = data.media_id;
    if (data.duration !== undefined) updateData.duration = data.duration;
    if (data.published_at !== undefined) updateData.published_at = data.published_at ? new Date(data.published_at) : null;

    if (data.body !== undefined) {
      updateData.text_content = {
        upsert: {
          create: { body: data.body },
          update: { body: data.body },
        },
      };
    }

    return this.prisma.content.update({
      where: { id },
      data: updateData,
      include: {
        category: true,
        text_content: true,
        media: true,
      },
    });
  }

  async delete(id: string) {
    await this.prisma.textContent.deleteMany({ where: { content_id: id } });
    await this.prisma.contentProgress.deleteMany({ where: { content_id: id } });
    await this.prisma.mediaAccessLog.deleteMany({ where: { content_id: id } });
    await this.prisma.contentTag.deleteMany({ where: { content_id: id } });

    return this.prisma.content.delete({
      where: { id },
    });
  }

  async search(query: string) {
    return this.prisma.content.findMany({
      where: {
        status: ContentStatus.PUBLISHED,
        visibility: ContentVisibility.VISIBLE,
        OR: [
          { title: { contains: query, mode: 'insensitive' } },
          { text_content: { body: { contains: query, mode: 'insensitive' } } },
        ],
      },
      include: {
        category: true,
      },
    });
  }

  @Cron(CronExpression.EVERY_HOUR)
  async notifyUpcomingContent() {
    try {
      this.logger.log('Running upcoming content notification check...');
      const now = new Date();
      const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
      const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);

      const upcomingContent = await this.prisma.content.findMany({
        where: {
          published_at: {
            gt: in23Hours,
            lte: in24Hours,
          },
        },
      });

      if (upcomingContent.length === 0) return;

      const token = process.env.TELEGRAM_BOT_TOKEN;
      if (!token) return;

      // Get all active students
      const activeSubscriptions = await this.prisma.subscription.findMany({
        where: { status: 'ACTIVE' },
        include: { student: true },
      });
      
      const activeChatIds = [...new Set(activeSubscriptions.map(sub => sub.student.telegram_user_id?.toString()).filter(id => !!id))];

      for (const content of upcomingContent) {
        const message = `🔔 *New Content Alert!*\n\n"${content.title}" will be published in exactly 24 hours. Get ready!`;
        
        for (const chatId of activeChatIds) {
          try {
            await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                chat_id: chatId,
                text: message,
                parse_mode: 'Markdown',
              }),
            });
          } catch (e) {
            this.logger.error(`Failed to send notification to ${chatId}`, e);
          }
        }
      }
    } catch (err) {
      this.logger.error('Error in upcoming content cron job', err);
    }
  }
}
