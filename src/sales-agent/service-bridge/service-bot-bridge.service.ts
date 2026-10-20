import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SubscriptionStatus } from '@prisma/client';
import { SalesAnalyticsService } from '../analytics/sales-analytics.service.js';
import { FunnelEventType } from '../interfaces/sales.interfaces.js';

export interface StudentEntitlementResult {
  hasAccess: boolean;
  subscriptionId?: string;
  status?: string;
  expiresAt?: Date | null;
  daysRemaining?: number;
}

export interface ActivationResult {
  success: boolean;
  studentId?: string;
  bundleName?: string;
  expiresAt?: Date | null;
  message: string;
}

@Injectable()
export class ServiceBotBridgeService {
  private readonly logger = new Logger(ServiceBotBridgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: SalesAnalyticsService,
  ) {}

  getServiceBotUsername(): string {
    return process.env.SERVICE_BOT_USERNAME || 'melcome_university_bot';
  }

  generateActivationLink(token: string): string {
    const botUsername = this.getServiceBotUsername();
    return `https://t.me/${botUsername}?start=act_${token}`;
  }

  async findStudentByTelegramId(telegramUserId: bigint | number) {
    return this.prisma.student.findUnique({
      where: { telegram_user_id: BigInt(telegramUserId) },
      include: {
        subscriptions: {
          orderBy: { created_at: 'desc' },
          take: 1,
          include: { plan: true },
        },
      },
    });
  }

  async linkOrRegisterStudent(data: {
    telegramUserId: bigint | number;
    username?: string;
    firstName?: string;
    lastName?: string;
  }) {
    const tgId = BigInt(data.telegramUserId);
    return this.prisma.student.upsert({
      where: { telegram_user_id: tgId },
      update: {
        username: data.username,
        first_name: data.firstName,
        last_name: data.lastName,
        is_active: true,
      },
      create: {
        telegram_user_id: tgId,
        username: data.username,
        first_name: data.firstName,
        last_name: data.lastName,
        is_active: true,
      },
    });
  }

  async activateSubscription(data: {
    studentId: string;
    planId?: string | null;
    durationDays: number;
    orderNumber: string;
    bundlePriceStars?: number;
  }) {
    const { studentId, planId, durationDays, orderNumber, bundlePriceStars } = data;
    const now = new Date();
    const periodEnd = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);

    // Default to existing plan if none provided
    let targetPlanId = planId;
    if (!targetPlanId) {
      const defaultPlan = await this.prisma.plan.findFirst();
      targetPlanId = defaultPlan?.id || 'plan_all_access';
    }

    // Check if existing active subscription can be extended
    const existingSub = await this.prisma.subscription.findFirst({
      where: {
        student_id: studentId,
        status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PENDING] },
      },
      orderBy: { created_at: 'desc' },
    });

    let subscription;
    if (existingSub && existingSub.current_period_end && existingSub.current_period_end > now) {
      // Extend existing subscription
      const extendedEnd = new Date(
        existingSub.current_period_end.getTime() + durationDays * 24 * 60 * 60 * 1000,
      );
      subscription = await this.prisma.subscription.update({
        where: { id: existingSub.id },
        data: {
          status: SubscriptionStatus.ACTIVE,
          current_period_end: extendedEnd,
          updated_at: now,
        },
      });
      this.logger.log(`Extended subscription ${subscription.id} to ${extendedEnd.toISOString()}`);
    } else {
      // Create new active subscription
      subscription = await this.prisma.subscription.create({
        data: {
          student_id: studentId,
          plan_id: targetPlanId,
          status: SubscriptionStatus.ACTIVE,
          price: bundlePriceStars || 500,
          started_at: now,
          current_period_start: now,
          current_period_end: periodEnd,
        },
      });
      this.logger.log(`Created new active subscription ${subscription.id} for student ${studentId}`);
    }

    return subscription;
  }

  async revokeAccess(studentId: string, reason: string) {
    this.logger.warn(`Revoking access for student ${studentId}. Reason: ${reason}`);
    await this.prisma.subscription.updateMany({
      where: {
        student_id: studentId,
        status: SubscriptionStatus.ACTIVE,
      },
      data: {
        status: SubscriptionStatus.CANCELLED,
        cancelled_at: new Date(),
      },
    });
  }

  async checkEntitlement(telegramUserId: bigint | number): Promise<StudentEntitlementResult> {
    const student = await this.prisma.student.findUnique({
      where: { telegram_user_id: BigInt(telegramUserId) },
      include: {
        subscriptions: {
          where: { status: SubscriptionStatus.ACTIVE },
          orderBy: { current_period_end: 'desc' },
          take: 1,
        },
      },
    });

    if (!student || student.subscriptions.length === 0) {
      return { hasAccess: false };
    }

    const sub = student.subscriptions[0];
    const now = new Date();
    if (!sub.current_period_end || sub.current_period_end < now) {
      return { hasAccess: false, status: 'EXPIRED', expiresAt: sub.current_period_end };
    }

    const diffDays = Math.ceil(
      (sub.current_period_end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
    );

    return {
      hasAccess: true,
      subscriptionId: sub.id,
      status: sub.status,
      expiresAt: sub.current_period_end,
      daysRemaining: diffDays,
    };
  }

  async activateStudentFromToken(
    telegramUserId: bigint | number,
    token: string,
    userMeta?: { username?: string; firstName?: string; lastName?: string },
  ): Promise<ActivationResult> {
    const tgId = BigInt(telegramUserId);
    this.logger.log(`Processing student activation for TG user ${tgId} with token ${token}`);

    const job = await this.prisma.provisioningJob.findUnique({
      where: { activation_token: token },
      include: {
        order: {
          include: { bundle: true },
        },
      },
    });

    if (!job) {
      return {
        success: false,
        message: 'Invalid activation token. Please contact support.',
      };
    }

    if (job.activated_at) {
      return {
        success: true,
        studentId: job.student_id || undefined,
        bundleName: job.order.bundle.name,
        message: 'Account was already activated! You have full access to your courses.',
      };
    }

    const now = new Date();
    if (job.expires_at < now) {
      return {
        success: false,
        message: 'This activation link has expired. Please contact support at @melcome_admin.',
      };
    }

    // 1. Link or Register Student in database
    const student = await this.linkOrRegisterStudent({
      telegramUserId: tgId,
      username: userMeta?.username,
      firstName: userMeta?.firstName,
      lastName: userMeta?.lastName,
    });

    // 2. Activate Subscription
    const subscription = await this.activateSubscription({
      studentId: student.id,
      planId: job.order.bundle.plan_id,
      durationDays: job.order.bundle.duration_days,
      orderNumber: job.order.order_number,
      bundlePriceStars: job.order.amount_stars,
    });

    // 3. Mark ProvisioningJob completed and order activated
    await this.prisma.provisioningJob.update({
      where: { id: job.id },
      data: {
        status: 'COMPLETED',
        student_id: student.id,
        activated_at: now,
      },
    });

    await this.prisma.salesOrder.update({
      where: { id: job.order_id },
      data: {
        student_id: student.id,
        status: 'ACTIVATED',
      },
    });

    // 4. Schedule retention events
    await this.scheduleRetentionEvents(student.id, tgId, subscription.current_period_end);

    // 5. Track Funnel Event
    await this.analytics.trackEvent(FunnelEventType.ACTIVATION_COMPLETED, {
      telegramUserId: tgId,
      campaignId: job.order.campaign_id || undefined,
      sessionId: job.order.session_id || undefined,
      metadata: {
        orderNumber: job.order.order_number,
        bundleSlug: job.order.bundle.slug,
        subscriptionId: subscription.id,
      },
    });

    this.logger.log(`Activation succeeded for student ${student.id} (${job.order.bundle.name})`);

    return {
      success: true,
      studentId: student.id,
      bundleName: job.order.bundle.name,
      expiresAt: subscription.current_period_end,
      message: 'Account successfully activated!',
    };
  }

  private async scheduleRetentionEvents(
    studentId: string,
    telegramUserId: bigint,
    periodEnd: Date | null,
  ) {
    const now = new Date();
    const day = 24 * 60 * 60 * 1000;

    // 1. Onboarding follow-up: 24h after activation
    await this.prisma.retentionSchedule.create({
      data: {
        student_id: studentId,
        telegram_user_id: telegramUserId,
        event_type: 'ONBOARDING_WELCOME',
        scheduled_at: new Date(now.getTime() + 1 * day),
        status: 'SCHEDULED',
      },
    });

    // 2. Course start reminder: 3 days after activation
    await this.prisma.retentionSchedule.create({
      data: {
        student_id: studentId,
        telegram_user_id: telegramUserId,
        event_type: 'COURSE_START_REMINDER',
        scheduled_at: new Date(now.getTime() + 3 * day),
        status: 'SCHEDULED',
      },
    });

    // If subscription has expiry date, schedule expiry notices
    if (periodEnd) {
      const endMs = periodEnd.getTime();
      // 7 days before expiry
      if (endMs - 7 * day > now.getTime()) {
        await this.prisma.retentionSchedule.create({
          data: {
            student_id: studentId,
            telegram_user_id: telegramUserId,
            event_type: 'EXPIRY_REMINDER_7D',
            scheduled_at: new Date(endMs - 7 * day),
            status: 'SCHEDULED',
          },
        });
      }

      // 3 days before expiry
      if (endMs - 3 * day > now.getTime()) {
        await this.prisma.retentionSchedule.create({
          data: {
            student_id: studentId,
            telegram_user_id: telegramUserId,
            event_type: 'EXPIRY_REMINDER_3D',
            scheduled_at: new Date(endMs - 3 * day),
            status: 'SCHEDULED',
          },
        });
      }

      // 1 day before expiry
      if (endMs - 1 * day > now.getTime()) {
        await this.prisma.retentionSchedule.create({
          data: {
            student_id: studentId,
            telegram_user_id: telegramUserId,
            event_type: 'EXPIRY_REMINDER_1D',
            scheduled_at: new Date(endMs - 1 * day),
            status: 'SCHEDULED',
          },
        });
      }
    }
  }
}
