import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Connected to database');
    } catch (e: any) {
      this.logger.warn(`Failed to connect to DB on startup (Local testing without Postgres?): ${e.message}`);
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
