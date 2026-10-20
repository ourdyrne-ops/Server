import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NavigationResponse } from '../navigation/router.service.js';

@Injectable()
export class ContentDeliveryHandler {
  constructor(private prisma: PrismaService) { }

  async handle(route: string, studentId: string): Promise<NavigationResponse> {
    const contentId = route.replace('content:', '');

    const content = await this.prisma.content.findUnique({
      where: { id: contentId },
      include: {
        text_content: true,
        category: true,
        media: true,
      },
    });

    if (!content) {
      return {
        text: `❌ Content not found.`,
        replyMarkup: {
          keyboard: [
            [{ text: '🏠 Main Menu' }],
          ],
          resize_keyboard: true,
          is_persistent: true,
        },
      };
    }

    // Record progress asynchronously without blocking
    this.prisma.contentProgress.upsert({
      where: {
        student_id_content_id: {
          student_id: studentId,
          content_id: content.id,
        },
      },
      update: {
        last_accessed: new Date(),
        completed: true,
        opened: true,
      },
      create: {
        student_id: studentId,
        content_id: content.id,
        completed: true,
        opened: true,
      },
    }).catch(() => { });

    const formatBadge =
      content.media_type === 'VIDEO' ? '🎬 VIDEO' : content.media_type === 'AUDIO' ? '🎧 AUDIO' : '📝 NOTES';

    let text =
      `📖 <b>${content.title}</b>\n` +
      `Format: <b>${formatBadge}</b>\n\n`;

    let mediaUrl: string | undefined;

    if (content.media_type === 'VIDEO') {
      mediaUrl =
        content.media?.storage_path ||
        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4';

      text +=
        `🎬 <b>Video Course Lesson:</b>\n` +
        `High-definition pre-recorded video stream is ready for playback.\n\n` +
        `📹 <b>Video URL:</b> <a href="${mediaUrl}">${mediaUrl}</a>\n\n` +
        `<i>▶️ Tap the link above to watch the stream, or play the video attached below.</i>`;
    } else if (content.media_type === 'AUDIO') {
      mediaUrl =
        content.media?.storage_path ||
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';

      text +=
        `🎙️ <b>Audio Masterclass Guide:</b>\n` +
        `High-quality recorded audio lesson is ready for playback.\n\n` +
        `🎧 <b>Audio URL:</b> <a href="${mediaUrl}">${mediaUrl}</a>\n\n` +
        `<i>▶️ Tap the link above to stream, or play the audio track attached below.</i>`;
    } else {
      const notesBody =
        content.text_content?.body ||
        `📌 <b>Overview & Objectives:</b>\n` +
        `In this masterclass module, you will learn the core foundations, architecture, and step-by-step execution for ${content.title}.\n\n` +
        `🔑 <b>Key Principles:</b>\n` +
        `1. <b>Core Architecture:</b> Configure triggers, secure webhooks, and routing pipelines.\n` +
        `2. <b>Execution Framework:</b> Deploy automated student sequences with zero manual friction.\n` +
        `3. <b>KPI Monitoring:</b> Track engagement, conversions, and retention metrics.\n\n` +
        `📋 <b>Action Checklist:</b>\n` +
        `• Step 1: Set up environment parameters and secure API keys.\n` +
        `• Step 2: Validate live event processing and HMAC webhooks.\n` +
        `• Step 3: Run end-to-end sandbox verification before scaling.\n\n` +
        `💡 <i>Self-study reference guide included with your All-Access membership.</i>`;

      text +=
        `📄 <b>Comprehensive Study Guide:</b>\n\n` +
        `${notesBody}`;
    }

    const replyMarkup = {
      keyboard: [
        [{ text: '◀️ Previous' }, { text: '🏠 Main Menu' }],
      ],
      resize_keyboard: true,
      is_persistent: true,
    };

    return {
      text,
      replyMarkup,
      mediaType: content.media_type,
      mediaUrl,
      title: content.title,
    };
  }
}
