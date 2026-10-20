import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const PgBossModule = require('pg-boss');
const PgBoss = PgBossModule.PgBoss || PgBossModule.default || PgBossModule;
import { MediaProcessor } from '../media/media.processor.js';

@Injectable()
export class JobsService implements OnModuleInit {
  private boss: any;
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private prisma: PrismaService,
    private mediaProcessor: MediaProcessor
  ) {}

  async onModuleInit() {
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      this.logger.warn('DATABASE_URL not set, skipping pg-boss initialization');
      return;
    }

    try {
      this.boss = new PgBoss(dbUrl);
      this.boss.on('error', (error: any) => this.logger.error('pg-boss error', error));

      await this.boss.start();
      
      // Register queues and workers
      await this.boss.createQueue('process-media');
      await this.boss.createQueue('reconcile-payments');
      await this.boss.work('process-media', this.handleMediaProcessing.bind(this));
      await this.boss.work('reconcile-payments', this.handlePaymentReconciliation.bind(this));
      
      this.logger.log('pg-boss started and workers registered');
    } catch (e: any) {
      this.logger.warn('Could not start pg-boss (DB might be down): ' + e.message);
    }
  }

  async queueMediaProcessing(mediaId: string, storagePath: string) {
    if (this.boss) {
      await this.boss.send('process-media', { mediaId, storagePath });
    }
  }

  private async handleMediaProcessing(job: any) {
    const { mediaId, storagePath } = job.data as any;
    this.logger.log(`Processing media ${mediaId} from ${storagePath}`);
    
    try {
      const hlsPath = await this.mediaProcessor.processToHls(storagePath, mediaId);
      
      // Update database with the finalized HLS path
      await this.prisma.media.update({
        where: { id: mediaId },
        data: { hls_path: hlsPath }
      });
      
      this.logger.log(`Completed media processing for ${mediaId}`);
    } catch (error: any) {
      this.logger.error(`Media processing failed for ${mediaId}`, error);
      throw error; // Let pg-boss handle retries or dead-letter queue
    }
  }

  private async handlePaymentReconciliation(_job: any) {
    this.logger.log('Running payment reconciliation job');
    // Fetch pending/past due subscriptions and check with Cashfree API
  }
}
