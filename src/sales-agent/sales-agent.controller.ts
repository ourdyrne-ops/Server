import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Headers,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { SalesAgentService } from './sales-agent.service.js';
import { SalesAnalyticsService } from './analytics/sales-analytics.service.js';
import { ProvisioningService } from './provisioning/provisioning.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TelegramUpdate } from './interfaces/sales.interfaces.js';
import { Public } from '../auth/decorators/public.decorator.js';

@Controller('sales')
export class SalesAgentController {
  private readonly logger = new Logger(SalesAgentController.name);

  constructor(
    private readonly salesAgent: SalesAgentService,
    private readonly analytics: SalesAnalyticsService,
    private readonly provisioning: ProvisioningService,
    private readonly prisma: PrismaService,
  ) {}

  @Public()
  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  async handleWebhook(
    @Body() update: any,
    @Headers('x-telegram-bot-api-secret-token') secretToken?: string
  ) {
    const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (expectedSecret && secretToken !== expectedSecret) {
      throw new UnauthorizedException('Invalid Telegram secret token');
    }

    await this.salesAgent.processUpdate(update);
    return { ok: true };
  }

  @Public()
  @Get('metrics')
  async getMetrics() {
    return this.analytics.getFunnelMetrics();
  }

  @Public()
  @Get('orders')
  async getOrders() {
    const orders = await this.prisma.salesOrder.findMany({
      orderBy: { created_at: 'desc' },
      take: 100,
      include: {
        bundle: true,
        campaign: true,
        provisioning_job: true,
      },
    });

    // Mask sensitive identifiers if needed
    return orders.map((o) => ({
      id: o.id,
      orderNumber: o.order_number,
      telegramUserId: o.telegram_user_id.toString(),
      bundleName: o.bundle.name,
      amountStars: o.amount_stars,
      currency: o.currency,
      status: o.status,
      telegramChargeId: o.telegram_payment_charge_id,
      paidAt: o.paid_at,
      createdAt: o.created_at,
      activationStatus: o.provisioning_job?.status || 'NONE',
      isActivated: !!o.provisioning_job?.activated_at,
    }));
  }

  @Public()
  @Get('provisioning/failed')
  async getFailedJobs() {
    return this.prisma.provisioningJob.findMany({
      where: {
        status: { in: ['FAILED', 'RETRY_REQUIRED'] },
      },
      include: {
        order: {
          include: { bundle: true },
        },
      },
      orderBy: { updated_at: 'desc' },
    });
  }

  @Public()
  @Post('provisioning/:jobId/retry')
  async retryJob(@Param('jobId') jobId: string) {
    this.logger.log(`Admin requested retry for provisioning job ${jobId}`);
    return this.provisioning.retryFailedJob(jobId);
  }

  @Public()
  @Post('reconcile/:orderId')
  async reconcileOrder(@Param('orderId') orderId: string) {
    this.logger.log(`Admin requested manual reconciliation for order ${orderId}`);
    const order = await this.prisma.salesOrder.findUnique({
      where: { id: orderId },
      include: { bundle: true },
    });

    if (!order) {
      return { success: false, message: 'Order not found' };
    }

    const result = await this.provisioning.processProvisioning({
      orderId: order.id,
      orderNumber: order.order_number,
      telegramUserId: order.telegram_user_id,
      bundleId: order.bundle_id,
      bundleSlug: order.bundle.slug,
      bundleName: order.bundle.name,
      durationDays: order.bundle.duration_days,
      campaignId: order.campaign_id || undefined,
      sessionId: order.session_id || undefined,
    });

    return { success: true, result };
  }

  @Public()
  @Get('campaigns')
  async getCampaigns() {
    const campaigns = await this.prisma.salesCampaign.findMany({
      include: {
        bundle: true,
        _count: {
          select: {
            sessions: true,
            orders: true,
            funnel_events: true,
          },
        },
      },
    });

    return campaigns.map((c) => ({
      id: c.id,
      code: c.code,
      name: c.name,
      bundleName: c.bundle?.name || 'Default',
      isActive: c.is_active,
      leadsCount: c._count.sessions,
      ordersCount: c._count.orders,
      eventsCount: c._count.funnel_events,
    }));
  }
}
