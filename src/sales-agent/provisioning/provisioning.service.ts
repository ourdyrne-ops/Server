import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import * as crypto from 'crypto';
import {
  IProvisioningEngine,
  ProvisioningRequest,
  ProvisioningResult,
  ProvisioningStatusEnum,
} from './provisioning.interface.js';
import { ServiceBotBridgeService } from '../service-bridge/service-bot-bridge.service.js';
import { SalesAnalyticsService } from '../analytics/sales-analytics.service.js';
import { FunnelEventType } from '../interfaces/sales.interfaces.js';

@Injectable()
export class ProvisioningService implements IProvisioningEngine {
  private readonly logger = new Logger(ProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly serviceBridge: ServiceBotBridgeService,
    private readonly analytics: SalesAnalyticsService,
  ) {}

  async processProvisioning(req: ProvisioningRequest): Promise<ProvisioningResult> {
    this.logger.log(`Initiating provisioning for Order ${req.orderNumber} (TG: ${req.telegramUserId})`);

    await this.analytics.trackEvent(FunnelEventType.PROVISIONING_STARTED, {
      telegramUserId: req.telegramUserId,
      campaignId: req.campaignId,
      sessionId: req.sessionId,
      metadata: { orderNumber: req.orderNumber, bundleSlug: req.bundleSlug },
    });

    try {
      // Check if job already exists for this order
      const existing = await this.prisma.provisioningJob.findUnique({
        where: { order_id: req.orderId },
      });

      if (existing) {
        this.logger.log(`Provisioning job ${existing.id} already exists for order ${req.orderId}`);
        return {
          jobId: existing.id,
          status: existing.status as ProvisioningStatusEnum,
          activationToken: existing.activation_token,
          activationLink: existing.activation_link,
          expiresAt: existing.expires_at,
          attempts: existing.attempts,
        };
      }

      // Generate cryptographically secure one-time activation token
      const rawToken = crypto.randomBytes(24).toString('hex');
      const activationLink = this.serviceBridge.generateActivationLink(rawToken);

      // Activation link valid for 48 hours
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const job = await this.prisma.provisioningJob.create({
        data: {
          order_id: req.orderId,
          status: 'PENDING',
          activation_token: rawToken,
          activation_link: activationLink,
          expires_at: expiresAt,
          attempts: 1,
        },
      });

      await this.prisma.salesOrder.update({
        where: { id: req.orderId },
        data: { status: 'PROVISIONED' },
      });

      await this.analytics.trackEvent(FunnelEventType.PROVISIONING_COMPLETED, {
        telegramUserId: req.telegramUserId,
        campaignId: req.campaignId,
        sessionId: req.sessionId,
        metadata: { jobId: job.id, orderNumber: req.orderNumber },
      });

      this.logger.log(
        `Provisioning successfully prepared: Job ${job.id} for Order ${req.orderNumber}. Activation link generated.`
      );

      return {
        jobId: job.id,
        status: ProvisioningStatusEnum.PENDING,
        activationToken: rawToken,
        activationLink: activationLink,
        expiresAt: expiresAt,
        attempts: job.attempts,
      };
    } catch (error: any) {
      this.logger.error(`Error during provisioning for Order ${req.orderNumber}: ${error.message}`, error.stack);
      return {
        jobId: '',
        status: ProvisioningStatusEnum.FAILED,
        activationToken: '',
        activationLink: '',
        expiresAt: new Date(),
        attempts: 1,
        error: error.message,
      };
    }
  }

  async retryFailedJob(jobId: string): Promise<ProvisioningResult> {
    const job = await this.prisma.provisioningJob.findUnique({
      where: { id: jobId },
      include: { order: { include: { bundle: true } } },
    });

    if (!job) {
      throw new Error(`Provisioning job ${jobId} not found`);
    }

    if (job.status === 'COMPLETED' || job.activated_at) {
      return {
        jobId: job.id,
        status: ProvisioningStatusEnum.COMPLETED,
        activationToken: job.activation_token,
        activationLink: job.activation_link,
        expiresAt: job.expires_at,
        attempts: job.attempts,
      };
    }

    try {
      const nextAttempts = job.attempts + 1;
      const rawToken = crypto.randomBytes(24).toString('hex');
      const activationLink = this.serviceBridge.generateActivationLink(rawToken);
      const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

      const updated = await this.prisma.provisioningJob.update({
        where: { id: jobId },
        data: {
          activation_token: rawToken,
          activation_link: activationLink,
          expires_at: expiresAt,
          attempts: nextAttempts,
          status: 'PENDING',
          last_error: null,
        },
      });

      this.logger.log(`Retry succeeded for job ${jobId}. Attempt: ${nextAttempts}`);

      return {
        jobId: updated.id,
        status: ProvisioningStatusEnum.PENDING,
        activationToken: updated.activation_token,
        activationLink: updated.activation_link,
        expiresAt: updated.expires_at,
        attempts: updated.attempts,
      };
    } catch (err: any) {
      const isExhausted = job.attempts >= job.max_attempts;
      const nextStatus = isExhausted ? 'FAILED' : 'RETRY_REQUIRED';

      await this.prisma.provisioningJob.update({
        where: { id: jobId },
        data: {
          attempts: job.attempts + 1,
          status: nextStatus,
          last_error: err.message,
        },
      });

      return {
        jobId: job.id,
        status: nextStatus as ProvisioningStatusEnum,
        activationToken: job.activation_token,
        activationLink: job.activation_link,
        expiresAt: job.expires_at,
        attempts: job.attempts + 1,
        error: err.message,
      };
    }
  }

  async getJobStatus(orderId: string): Promise<ProvisioningResult | null> {
    const job = await this.prisma.provisioningJob.findUnique({
      where: { order_id: orderId },
    });

    if (!job) return null;

    return {
      jobId: job.id,
      status: job.status as ProvisioningStatusEnum,
      activationToken: job.activation_token,
      activationLink: job.activation_link,
      expiresAt: job.expires_at,
      attempts: job.attempts,
      error: job.last_error || undefined,
    };
  }
}
