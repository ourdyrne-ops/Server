import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class ProgressService {
  constructor(private prisma: PrismaService) {}

  async updateProgress(studentId: string, contentId: string, data: {
    last_position?: number;
    completed?: boolean;
    opened?: boolean;
  }) {
    return this.prisma.contentProgress.upsert({
      where: {
        student_id_content_id: {
          student_id: studentId,
          content_id: contentId,
        },
      },
      update: {
        ...data,
        last_accessed: new Date(),
      },
      create: {
        student_id: studentId,
        content_id: contentId,
        ...data,
      },
    });
  }

  async getProgress(studentId: string, contentId?: string) {
    if (contentId) {
      return this.prisma.contentProgress.findUnique({
        where: {
          student_id_content_id: {
            student_id: studentId,
            content_id: contentId,
          },
        },
      });
    }

    return this.prisma.contentProgress.findMany({
      where: { student_id: studentId },
    });
  }
}
