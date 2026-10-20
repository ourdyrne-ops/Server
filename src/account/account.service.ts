import { Injectable, Logger, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TelegramStarsService } from '../integrations/telegram/telegram-stars.service.js';

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(
    private prisma: PrismaService,
    private telegramStarsService: TelegramStarsService,
  ) {}

  // -------------------------------------------------------------
  // 1. ACCOUNT OVERVIEW & METRICS
  // -------------------------------------------------------------
  async getOverview(range: string = '30days', customStart?: string, customEnd?: string) {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = new Date();

    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfYesterday = new Date(startOfToday.getTime() - 24 * 60 * 60 * 1000);
    const endOfYesterday = new Date(startOfToday.getTime() - 1);
    const startOfThisMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);

    switch (range) {
      case 'today':
        startDate = startOfToday;
        break;
      case 'yesterday':
        startDate = startOfYesterday;
        endDate = endOfYesterday;
        break;
      case '7days':
        startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30days':
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'this_month':
        startDate = startOfThisMonth;
        break;
      case 'last_month':
        startDate = startOfLastMonth;
        endDate = endOfLastMonth;
        break;
      case 'custom':
        startDate = customStart ? new Date(customStart) : new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        if (customEnd) endDate = new Date(customEnd);
        break;
      default:
        startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // 1. All-time settled payments
    const allSuccessfulPayments = await this.prisma.payment.findMany({
      where: {
        status: { in: ['SUCCESS', 'PAID'] },
      },
    });
    const allTimeRevenuePaise = allSuccessfulPayments.reduce((sum, p) => sum + p.amount, 0);

    // 2. Filtered Range Payments
    const rangeSuccessfulPayments = await this.prisma.payment.findMany({
      where: {
        status: { in: ['SUCCESS', 'PAID'] },
        created_at: { gte: startDate, lte: endDate },
      },
    });
    const grossRangePaise = rangeSuccessfulPayments.reduce((sum, p) => sum + p.amount, 0);

    // 3. Today's payments
    const todayPayments = await this.prisma.payment.findMany({
      where: {
        status: { in: ['SUCCESS', 'PAID'] },
        created_at: { gte: startOfToday },
      },
    });
    const todayRevenuePaise = todayPayments.reduce((sum, p) => sum + p.amount, 0);

    // 4. This Month's payments
    const thisMonthPayments = await this.prisma.payment.findMany({
      where: {
        status: { in: ['SUCCESS', 'PAID'] },
        created_at: { gte: startOfThisMonth },
      },
    });
    const thisMonthRevenuePaise = thisMonthPayments.reduce((sum, p) => sum + p.amount, 0);

    // 5. Refunds (Range & All Time)
    const rangeRefunds = await this.prisma.refund.findMany({
      where: {
        status: { in: ['COMPLETED', 'PROCESSED'] },
        created_at: { gte: startDate, lte: endDate },
      },
    });
    const rangeRefundsPaise = rangeRefunds.reduce((sum, r) => sum + r.amount, 0);

    const allRefunds = await this.prisma.refund.findMany({
      where: { status: { in: ['COMPLETED', 'PROCESSED'] } },
    });
    const allRefundsPaise = allRefunds.reduce((sum, r) => sum + r.amount, 0);

    // Net Collected = Gross - Refunds
    const netRangePaise = grossRangePaise - rangeRefundsPaise;
    const netAllTimePaise = allTimeRevenuePaise - allRefundsPaise;

    // 6. Subscriptions Counts
    const activeSubscribersCount = await this.prisma.subscription.count({
      where: {
        status: 'ACTIVE',
        current_period_end: { gt: now },
      },
    });

    const pendingPaymentsCount = await this.prisma.payment.count({
      where: { status: 'PENDING' },
    });

    const failedPaymentsCount = await this.prisma.payment.count({
      where: { status: 'FAILED' },
    });

    const in7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const expiringSoon7Days = await this.prisma.subscription.count({
      where: {
        status: 'ACTIVE',
        current_period_end: { gte: now, lte: in7Days },
      },
    });

    const expiringToday = await this.prisma.subscription.count({
      where: {
        status: 'ACTIVE',
        current_period_end: { gte: startOfToday, lte: endOfToday },
      },
    });

    const renewalsThisMonth = await this.prisma.subscriptionRenewal.count({
      where: {
        status: 'SUCCESS',
        attempted_at: { gte: startOfThisMonth },
      },
    });

    const cancelledSubsCount = await this.prisma.subscription.count({
      where: { status: 'CANCELLED' },
    });

    const expiredSubsCount = await this.prisma.subscription.count({
      where: {
        OR: [
          { status: 'EXPIRED' },
          { status: 'ACTIVE', current_period_end: { lte: now } },
        ],
      },
    });

    const processingRefundsCount = await this.prisma.refund.count({
      where: { status: { in: ['REQUESTED', 'PROCESSING'] } },
    });

    const failedRenewalsCount = await this.prisma.subscriptionRenewal.count({
      where: { status: 'FAILED' },
    });

    // 7. Revenue Trend (Daily points in the selected range)
    const trendDays = 14;
    const trendPoints: { date: string; gross: number; refunds: number; net: number }[] = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const dayStart = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1000 - 1);

      const dayPayments = await this.prisma.payment.findMany({
        where: {
          status: { in: ['SUCCESS', 'PAID'] },
          created_at: { gte: dayStart, lte: dayEnd },
        },
      });
      const dayRefunds = await this.prisma.refund.findMany({
        where: {
          status: { in: ['COMPLETED', 'PROCESSED'] },
          created_at: { gte: dayStart, lte: dayEnd },
        },
      });

      const dayGross = dayPayments.reduce((acc, p) => acc + p.amount / 100, 0);
      const dayRef = dayRefunds.reduce((acc, r) => acc + r.amount / 100, 0);
      const dayNet = dayGross - dayRef;

      trendPoints.push({
        date: dayStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        gross: dayGross,
        refunds: dayRef,
        net: Math.max(0, dayNet),
      });
    }

    return {
      kpis: {
        totalRevenue: Math.round(allTimeRevenuePaise / 100),
        rangeGrossRevenue: Math.round(grossRangePaise / 100),
        rangeRefunds: Math.round(rangeRefundsPaise / 100),
        rangeNetRevenue: Math.round(netRangePaise / 100),
        thisMonthRevenue: Math.round(thisMonthRevenuePaise / 100),
        todayRevenue: Math.round(todayRevenuePaise / 100),
        successfulPaymentsCount: rangeSuccessfulPayments.length,
        activeSubscribersCount,
        pendingPaymentsCount,
        failedPaymentsCount,
        expiringSoon7Days,
        expiringToday,
        renewalsThisMonth,
        cancelledSubsCount,
        expiredSubsCount,
      },
      alerts: {
        expiringToday,
        expiringSoon7Days,
        failedRenewalsCount,
        processingRefundsCount,
      },
      revenueTrend: trendPoints,
      range,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }

  // -------------------------------------------------------------
  // 2. PAYMENTS MODULE
  // -------------------------------------------------------------
  async getPayments(params: {
    status?: string;
    search?: string;
    provider?: string;
    page?: number;
    limit?: number;
  }) {
    const { status, search, provider, page = 1, limit = 50 } = params;
    const skip = (Math.max(1, page) - 1) * limit;

    const where: any = {};

    if (status && status !== 'ALL') {
      if (status === 'REFUNDED') {
        where.refund = { isNot: null };
      } else {
        where.status = status;
      }
    }

    if (provider && provider !== 'ALL') {
      where.provider = { equals: provider, mode: 'insensitive' };
    }

    if (search && search.trim()) {
      const q = search.trim();
      const numQuery = /^\d+$/.test(q) ? BigInt(q) : null;

      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { provider_order_id: { contains: q, mode: 'insensitive' } },
        { provider_payment_id: { contains: q, mode: 'insensitive' } },
        { student: { first_name: { contains: q, mode: 'insensitive' } } },
        { student: { last_name: { contains: q, mode: 'insensitive' } } },
        { student: { username: { contains: q, mode: 'insensitive' } } },
      ];

      if (numQuery !== null) {
        where.OR.push({ student: { telegram_user_id: numQuery } });
      }
    }

    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          student: true,
          subscription: { include: { plan: true } },
          refund: true,
          events: { take: 1, orderBy: { created_at: 'desc' } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const formatted = payments.map((p) => {
      const isSuccess = p.status === 'SUCCESS' || p.status === 'PAID';
      const paidTime = p.paid_at || p.created_at;
      const elapsedMs = Date.now() - new Date(paidTime).getTime();
      const isWithin5Min = isSuccess && elapsedMs <= 5 * 60 * 1000 && !p.refund;
      const remainingSeconds = isWithin5Min ? Math.max(0, Math.floor((5 * 60 * 1000 - elapsedMs) / 1000)) : 0;
      const isStars = p.currency === 'XTR' || p.provider === 'TelegramStars';
      const displayAmount = isStars ? p.amount : p.amount / 100;

      return {
        id: p.id,
        orderId: p.telegram_payment_charge_id || p.provider_order_id || `TXN_${p.id.slice(0, 8)}`,
        providerPaymentId: p.telegram_payment_charge_id || p.provider_payment_id || `TXN_${p.id.slice(0, 8)}`,
        telegramPaymentChargeId: p.telegram_payment_charge_id || p.provider_payment_id,
        provider: p.provider || 'TelegramStars',
        amount: displayAmount,
        currency: p.currency || 'XTR',
        status: p.refund ? 'REFUNDED' : p.status,
        paymentMethod: p.payment_method || 'Stars',
        createdAt: p.created_at,
        paidAt: p.paid_at || p.created_at,
        student: {
          id: p.student.id,
          name: [p.student.first_name, p.student.last_name].filter(Boolean).join(' ') || p.student.username || 'Student',
          username: p.student.username ? `@${p.student.username}` : 'N/A',
          telegramUserId: p.student.telegram_user_id.toString(),
        },
        subscription: p.subscription
          ? {
              id: p.subscription.id,
              planName: p.subscription.plan.name,
              status: p.subscription.status,
            }
          : null,
        refund: p.refund
          ? {
              id: p.refund.id,
              amount: isStars ? p.refund.amount : p.refund.amount / 100,
              status: p.refund.status,
              processedAt: p.refund.processed_at,
            }
          : null,
        isRefundEligible: isWithin5Min,
        refundCountdownSeconds: remainingSeconds,
      };
    });

    return { total, page, limit, payments: formatted };
  }

  async getPaymentById(id: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id },
      include: {
        student: true,
        subscription: { include: { plan: true } },
        refund: true,
        events: { orderBy: { created_at: 'desc' }, take: 10 },
      },
    });

    if (!payment) throw new NotFoundException('Payment record not found');

    const isSuccess = payment.status === 'SUCCESS' || payment.status === 'PAID';
    const paidTime = payment.paid_at || payment.created_at;
    const elapsedMs = Date.now() - new Date(paidTime).getTime();
    const isWithin5Min = isSuccess && elapsedMs <= 5 * 60 * 1000 && !payment.refund;
    const remainingSeconds = isWithin5Min ? Math.max(0, Math.floor((5 * 60 * 1000 - elapsedMs) / 1000)) : 0;
    const isStars = payment.currency === 'XTR' || payment.provider === 'TelegramStars';
    const displayAmount = isStars ? payment.amount : payment.amount / 100;

    return {
      id: payment.id,
      orderId: payment.telegram_payment_charge_id || payment.provider_order_id || `TXN_${payment.id.slice(0, 8)}`,
      providerPaymentId: payment.telegram_payment_charge_id || payment.provider_payment_id || `TXN_${payment.id.slice(0, 8)}`,
      telegramPaymentChargeId: payment.telegram_payment_charge_id || payment.provider_payment_id,
      provider: payment.provider || 'TelegramStars',
      amount: displayAmount,
      currency: payment.currency || 'XTR',
      status: payment.refund ? 'REFUNDED' : payment.status,
      paymentMethod: payment.payment_method || 'Stars',
      createdAt: payment.created_at,
      paidAt: payment.paid_at || payment.created_at,
      student: {
        id: payment.student.id,
        name: [payment.student.first_name, payment.student.last_name].filter(Boolean).join(' ') || payment.student.username || 'Student',
        username: payment.student.username ? `@${payment.student.username}` : 'N/A',
        telegramUserId: payment.student.telegram_user_id.toString(),
      },
      subscription: payment.subscription
        ? {
            id: payment.subscription.id,
            planName: payment.subscription.plan.name,
            status: payment.subscription.status,
            startAt: payment.subscription.current_period_start || payment.subscription.started_at,
            endAt: payment.subscription.current_period_end,
          }
        : null,
      refund: payment.refund
        ? {
            id: payment.refund.id,
            amount: isStars ? payment.refund.amount : payment.refund.amount / 100,
            retainedAmount: 0,
            percentage: payment.refund.percentage,
            status: payment.refund.status,
            reason: payment.refund.reason,
            processedAt: payment.refund.processed_at,
            providerRefundId: payment.refund.provider_refund_id,
          }
        : null,
      webhooks: payment.events.map((e) => ({
        id: e.id,
        provider: e.provider,
        providerEventId: e.provider_event_id,
        eventType: e.event_type,
        verificationStatus: e.verification_status,
        verifiedAt: e.verified_at,
        createdAt: e.created_at,
      })),
      isRefundEligible: isWithin5Min,
      refundCountdownSeconds: remainingSeconds,
      eligibleRefundAmount: isStars ? payment.amount : Math.floor(payment.amount * 0.95) / 100,
      retainedFeeAmount: 0,
    };
  }

  // -------------------------------------------------------------
  // 3. REFUND OPERATIONS
  // -------------------------------------------------------------
  async getRefunds(params: { status?: string; search?: string; page?: number; limit?: number }) {
    const { status, search, page = 1, limit = 50 } = params;
    const skip = (Math.max(1, page) - 1) * limit;

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { payment_id: { contains: q, mode: 'insensitive' } },
        { reason: { contains: q, mode: 'insensitive' } },
        { student: { first_name: { contains: q, mode: 'insensitive' } } },
        { student: { last_name: { contains: q, mode: 'insensitive' } } },
        { student: { username: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, refunds] = await Promise.all([
      this.prisma.refund.count({ where }),
      this.prisma.refund.findMany({
        where,
        include: {
          payment: true,
          student: true,
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const formatted = refunds.map((r) => {
      const isStars = r.payment?.currency === 'XTR' || r.payment?.provider === 'TelegramStars';
      const originalAmount = r.payment ? (isStars ? r.payment.amount : r.payment.amount / 100) : (isStars ? r.amount : r.amount / 100);
      const refundAmount = isStars ? r.amount : r.amount / 100;
      const retainedAmount = Math.max(0, Math.round((originalAmount - refundAmount) * 100) / 100);

      return {
        id: r.id,
        paymentId: r.payment_id,
        student: {
          id: r.student?.id || r.payment?.student_id,
          name: [r.student?.first_name, r.student?.last_name].filter(Boolean).join(' ') || r.student?.username || 'Student',
          telegramUserId: r.student?.telegram_user_id ? r.student.telegram_user_id.toString() : 'N/A',
        },
        originalAmount,
        refundAmount,
        retainedAmount,
        percentage: r.percentage || 100.0,
        reason: r.reason || 'Telegram Stars Refund',
        status: r.status,
        providerRefundId: r.provider_refund_id || `RFND_${r.id.slice(0, 8)}`,
        requestedAt: r.requested_at,
        processedAt: r.processed_at,
      };
    });

    return { total, page, limit, refunds: formatted };
  }

  async processRefund(paymentId: string, reason: string = 'Requested within 5 mins', adminEmail?: string) {
    const payment = await this.prisma.payment.findUnique({
      where: { id: paymentId },
      include: {
        student: true,
        subscription: true,
        refund: true,
      },
    });

    if (!payment) {
      throw new NotFoundException('Payment record not found');
    }

    // If Telegram Stars payment, delegate to dedicated TelegramStarsService
    if (payment.provider === 'TelegramStars' || payment.currency === 'XTR' || payment.telegram_payment_charge_id) {
      return this.telegramStarsService.refundPayment(paymentId, reason, adminEmail);
    }

    const isSuccess = payment.status === 'SUCCESS' || payment.status === 'PAID';
    if (!isSuccess) {
      throw new BadRequestException('Only successful payments can be refunded');
    }

    if (payment.refund) {
      throw new BadRequestException('Refund has already been processed for this payment');
    }

    // SERVER-SIDE 5-MINUTE RULE VERIFICATION
    const paidTime = payment.paid_at || payment.created_at;
    const elapsedMs = Date.now() - new Date(paidTime).getTime();
    const fiveMinutesMs = 5 * 60 * 1000;

    if (elapsedMs > fiveMinutesMs) {
      const elapsedMins = Math.round(elapsedMs / (60 * 1000) * 10) / 10;
      throw new BadRequestException(
        `Refund policy strictly allows refunds within first 5 minutes only. Elapsed time: ${elapsedMins} mins.`
      );
    }

    const originalPaise = payment.amount;
    const refundPaise = Math.floor(originalPaise * 0.95);
    const retainedPaise = originalPaise - refundPaise;
    const now = new Date();

    return await this.prisma.$transaction(async (tx) => {
      const refundRecord = await tx.refund.create({
        data: {
          payment_id: payment.id,
          student_id: payment.student_id,
          amount: refundPaise,
          percentage: 95.0,
          reason,
          status: 'COMPLETED',
          provider_refund_id: `RFND_${Date.now()}_${payment.id.slice(0, 6)}`,
          requested_at: now,
          processed_at: now,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { status: 'REFUNDED' },
      });

      if (payment.subscription_id) {
        await tx.subscription.update({
          where: { id: payment.subscription_id },
          data: {
            status: 'REFUNDED',
            cancelled_at: now,
          },
        });
      }

      await tx.accountAuditLog.create({
        data: {
          admin_email: adminEmail || 'admin@admin.com',
          action: 'ISSUE_REFUND',
          entity: 'PAYMENT',
          entity_id: payment.id,
          previous_value: { status: payment.status, amount: payment.amount },
          new_value: {
            status: 'REFUNDED',
            refundId: refundRecord.id,
            refundAmount: refundPaise / 100,
            retainedAmount: retainedPaise / 100,
          },
          reason: `5-minute window refund. ${reason}`,
        },
      });

      return {
        success: true,
        refundId: refundRecord.id,
        paymentId: payment.id,
        originalAmount: originalPaise / 100,
        refundAmount: refundPaise / 100,
        retainedAmount: retainedPaise / 100,
        status: 'COMPLETED',
        processedAt: now,
      };
    });
  }

  async getStarsHealth() {
    return this.telegramStarsService.getStarsHealth();
  }

  // -------------------------------------------------------------
  // 4. SUBSCRIPTION LIFECYCLE MANAGEMENT
  // -------------------------------------------------------------
  async getSubscriptions(params: {
    status?: string;
    search?: string;
    expiringInDays?: number;
    page?: number;
    limit?: number;
  }) {
    const { status, search, expiringInDays, page = 1, limit = 50 } = params;
    const skip = (Math.max(1, page) - 1) * limit;
    const now = new Date();

    const where: any = {};

    if (status && status !== 'ALL') {
      if (status === 'ACTIVE') {
        where.status = 'ACTIVE';
        where.current_period_end = { gt: now };
      } else if (status === 'EXPIRED') {
        where.OR = [
          { status: 'EXPIRED' },
          { status: 'ACTIVE', current_period_end: { lte: now } },
        ];
      } else if (status === 'EXPIRING_SOON') {
        const soon = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        where.status = 'ACTIVE';
        where.current_period_end = { gte: now, lte: soon };
      } else {
        where.status = status;
      }
    }

    if (expiringInDays !== undefined && expiringInDays !== null) {
      const targetDate = new Date(now.getTime() + Number(expiringInDays) * 24 * 60 * 60 * 1000);
      where.status = 'ACTIVE';
      where.current_period_end = { gte: now, lte: targetDate };
    }

    if (search && search.trim()) {
      const q = search.trim();
      const numQuery = /^\d+$/.test(q) ? BigInt(q) : null;

      where.OR = [
        { id: { contains: q, mode: 'insensitive' } },
        { student: { first_name: { contains: q, mode: 'insensitive' } } },
        { student: { last_name: { contains: q, mode: 'insensitive' } } },
        { student: { username: { contains: q, mode: 'insensitive' } } },
      ];

      if (numQuery !== null) {
        where.OR.push({ student: { telegram_user_id: numQuery } });
      }
    }

    const [total, subscriptions] = await Promise.all([
      this.prisma.subscription.count({ where }),
      this.prisma.subscription.findMany({
        where,
        include: {
          student: true,
          plan: true,
          payments: { orderBy: { created_at: 'desc' }, take: 1 },
          renewals: { orderBy: { attempted_at: 'desc' }, take: 1 },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const formatted = subscriptions.map((s) => {
      const endAt = s.current_period_end ? new Date(s.current_period_end) : null;
      const isExpiredByDate = endAt ? endAt <= now : false;
      const effectiveStatus = (s.status === 'ACTIVE' && isExpiredByDate) ? 'EXPIRED' : s.status;

      let daysRemaining = null;
      if (endAt && !isExpiredByDate) {
        daysRemaining = Math.ceil((endAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
      }

      const lastPayment = s.payments[0] || null;

      return {
        id: s.id,
        student: {
          id: s.student.id,
          name: [s.student.first_name, s.student.last_name].filter(Boolean).join(' ') || s.student.username || 'Student',
          username: s.student.username ? `@${s.student.username}` : 'N/A',
          telegramUserId: s.student.telegram_user_id.toString(),
          isActive: s.student.is_active,
        },
        planName: s.plan.name,
        amount: s.price ? s.price / 100 : s.plan.price / 100,
        status: effectiveStatus,
        startDate: s.current_period_start || s.started_at,
        endDate: s.current_period_end,
        daysRemaining,
        autoRenew: s.auto_renew,
        nextRenewalAt: s.next_renewal_at || s.current_period_end,
        lastPayment: lastPayment
          ? {
              id: lastPayment.id,
              amount: lastPayment.amount / 100,
              status: lastPayment.status,
              date: lastPayment.created_at,
            }
          : null,
        createdAt: s.created_at,
      };
    });

    return { total, page, limit, subscriptions: formatted };
  }

  async getSubscriptionById(id: string) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: {
        student: true,
        plan: true,
        payments: {
          orderBy: { created_at: 'desc' },
          include: { refund: true },
        },
        renewals: {
          orderBy: { attempted_at: 'desc' },
        },
      },
    });

    if (!sub) throw new NotFoundException('Subscription record not found');

    const now = new Date();
    const endAt = sub.current_period_end ? new Date(sub.current_period_end) : null;
    const isPeriodValid = endAt ? endAt > now : false;
    const isAccessAuthorized = sub.student.is_active && sub.status === 'ACTIVE' && isPeriodValid;

    return {
      id: sub.id,
      student: {
        id: sub.student.id,
        name: [sub.student.first_name, sub.student.last_name].filter(Boolean).join(' ') || sub.student.username || 'Student',
        username: sub.student.username ? `@${sub.student.username}` : 'N/A',
        telegramUserId: sub.student.telegram_user_id.toString(),
        isActive: sub.student.is_active,
      },
      plan: {
        id: sub.plan.id,
        name: sub.plan.name,
        price: sub.price ? sub.price / 100 : sub.plan.price / 100,
        interval: sub.plan.interval,
      },
      status: (sub.status === 'ACTIVE' && !isPeriodValid) ? 'EXPIRED' : sub.status,
      startDate: sub.current_period_start || sub.started_at,
      endDate: sub.current_period_end,
      autoRenew: sub.auto_renew,
      nextRenewalAt: sub.next_renewal_at || sub.current_period_end,
      accessStatus: {
        subscriptionStatus: sub.status,
        contentAccess: isAccessAuthorized ? 'AUTHORIZED' : 'REVOKED',
        expires: sub.current_period_end,
      },
      payments: sub.payments.map((p) => ({
        id: p.id,
        amount: p.amount / 100,
        status: p.refund ? 'REFUNDED' : p.status,
        method: p.payment_method || 'UPI',
        provider: p.provider || 'Cashfree',
        date: p.created_at,
        refund: p.refund ? { amount: p.refund.amount / 100, status: p.refund.status } : null,
      })),
      renewals: sub.renewals.map((r) => ({
        id: r.id,
        attemptedAt: r.attempted_at,
        amount: r.amount / 100,
        status: r.status,
        previousEndAt: r.previous_end_at,
        newEndAt: r.new_end_at,
      })),
      createdAt: sub.created_at,
    };
  }

  async executeSubscriptionAction(
    id: string,
    action: 'RENEW' | 'EXTEND' | 'CANCEL' | 'SUSPEND' | 'REACTIVATE',
    payload: { days?: number; reason?: string } = {},
    adminEmail?: string,
  ) {
    const sub = await this.prisma.subscription.findUnique({
      where: { id },
      include: { student: true, plan: true },
    });

    if (!sub) throw new NotFoundException('Subscription record not found');

    const now = new Date();
    const reason = payload.reason || `Administrative action: ${action}`;

    return await this.prisma.$transaction(async (tx) => {
      let updatedSub: any;
      let previousState = { status: sub.status, current_period_end: sub.current_period_end };

      switch (action) {
        case 'EXTEND': {
          const daysToAdd = payload.days || 30;
          const baseDate = sub.current_period_end && new Date(sub.current_period_end) > now
            ? new Date(sub.current_period_end)
            : now;
          const newEnd = new Date(baseDate.getTime() + daysToAdd * 24 * 60 * 60 * 1000);

          updatedSub = await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'ACTIVE',
              current_period_end: newEnd,
              cancelled_at: null,
              expired_at: null,
            },
          });

          await tx.student.update({
            where: { id: sub.student_id },
            data: { is_active: true },
          });

          // Record renewal entry
          await tx.subscriptionRenewal.create({
            data: {
              subscription_id: sub.id,
              student_id: sub.student_id,
              amount: 0,
              status: 'MANUAL',
              previous_end_at: sub.current_period_end,
              new_end_at: newEnd,
            },
          });
          break;
        }

        case 'RENEW': {
          // Manual 30-day paid renewal
          const baseDate = sub.current_period_end && new Date(sub.current_period_end) > now
            ? new Date(sub.current_period_end)
            : now;
          const newEnd = new Date(baseDate.getTime() + 30 * 24 * 60 * 60 * 1000);

          // Create payment record
          const payment = await tx.payment.create({
            data: {
              student_id: sub.student_id,
              subscription_id: sub.id,
              amount: sub.price || 99900,
              currency: 'INR',
              status: 'SUCCESS',
              provider: 'Cashfree',
              payment_method: 'MANUAL_ADMIN',
              paid_at: now,
            },
          });

          updatedSub = await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'ACTIVE',
              current_period_end: newEnd,
              cancelled_at: null,
              expired_at: null,
            },
          });

          await tx.student.update({
            where: { id: sub.student_id },
            data: { is_active: true },
          });

          await tx.subscriptionRenewal.create({
            data: {
              subscription_id: sub.id,
              student_id: sub.student_id,
              payment_id: payment.id,
              amount: sub.price || 99900,
              status: 'SUCCESS',
              previous_end_at: sub.current_period_end,
              new_end_at: newEnd,
            },
          });
          break;
        }

        case 'CANCEL': {
          updatedSub = await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'CANCELLED',
              cancelled_at: now,
            },
          });
          break;
        }

        case 'SUSPEND': {
          updatedSub = await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'CANCELLED',
              cancelled_at: now,
            },
          });

          await tx.student.update({
            where: { id: sub.student_id },
            data: { is_active: false },
          });
          break;
        }

        case 'REACTIVATE': {
          const newEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
          updatedSub = await tx.subscription.update({
            where: { id: sub.id },
            data: {
              status: 'ACTIVE',
              current_period_start: now,
              current_period_end: newEnd,
              cancelled_at: null,
              expired_at: null,
            },
          });

          await tx.student.update({
            where: { id: sub.student_id },
            data: { is_active: true },
          });
          break;
        }

        default:
          throw new BadRequestException(`Unsupported subscription action: ${action}`);
      }

      // Record audit log
      await tx.accountAuditLog.create({
        data: {
          admin_email: adminEmail || 'admin@admin.com',
          action: `SUBSCRIPTION_${action}`,
          entity: 'SUBSCRIPTION',
          entity_id: sub.id,
          previous_value: previousState,
          new_value: {
            status: updatedSub.status,
            current_period_end: updatedSub.current_period_end,
          },
          reason,
        },
      });

      return {
        success: true,
        action,
        subscriptionId: sub.id,
        status: updatedSub.status,
        currentPeriodEnd: updatedSub.current_period_end,
      };
    });
  }

  // -------------------------------------------------------------
  // 5. RENEWALS & FAILED PAYMENTS MONITORING
  // -------------------------------------------------------------
  async getRenewals(params: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 50 } = params;
    const skip = (Math.max(1, page) - 1) * limit;

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }

    const [total, renewals] = await Promise.all([
      this.prisma.subscriptionRenewal.count({ where }),
      this.prisma.subscriptionRenewal.findMany({
        where,
        include: {
          student: true,
          subscription: { include: { plan: true } },
          payment: true,
        },
        orderBy: { attempted_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    // Renewal Metrics
    const allAttempts = await this.prisma.subscriptionRenewal.count();
    const successfulAttempts = await this.prisma.subscriptionRenewal.count({
      where: { status: 'SUCCESS' },
    });
    const failedAttempts = await this.prisma.subscriptionRenewal.count({
      where: { status: 'FAILED' },
    });
    const successRate = allAttempts > 0 ? Math.round((successfulAttempts / allAttempts) * 100) : 100;

    const successfulRenewals = await this.prisma.subscriptionRenewal.findMany({
      where: { status: 'SUCCESS' },
    });
    const renewalRevenue = successfulRenewals.reduce((sum, r) => sum + r.amount / 100, 0);

    const formatted = renewals.map((r) => ({
      id: r.id,
      subscriptionId: r.subscription_id,
      student: {
        id: r.student?.id || r.subscription?.student_id,
        name: [r.student?.first_name, r.student?.last_name].filter(Boolean).join(' ') || r.student?.username || 'Student',
        telegramUserId: r.student?.telegram_user_id ? r.student.telegram_user_id.toString() : 'N/A',
      },
      amount: r.amount / 100,
      status: r.status,
      attemptedAt: r.attempted_at,
      previousEndAt: r.previous_end_at,
      newEndAt: r.new_end_at,
    }));

    return {
      metrics: {
        totalAttempts: allAttempts,
        successfulAttempts,
        failedAttempts,
        successRate,
        renewalRevenue,
      },
      renewals: formatted,
      total,
      page,
      limit,
    };
  }

  async getFailedPayments(params: { page?: number; limit?: number }) {
    const { page = 1, limit = 50 } = params;
    const skip = (Math.max(1, page) - 1) * limit;

    const where = { status: 'FAILED' };

    const [total, payments] = await Promise.all([
      this.prisma.payment.count({ where }),
      this.prisma.payment.findMany({
        where,
        include: {
          student: true,
          subscription: true,
          events: { take: 1, orderBy: { created_at: 'desc' } },
        },
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    const now = new Date();
    const formatted = payments.map((p) => {
      let subscriptionImpact = 'NO_IMPACT';
      if (p.subscription) {
        if (p.subscription.status === 'EXPIRED') {
          subscriptionImpact = 'SUBSCRIPTION_EXPIRED';
        } else if (p.subscription.current_period_end && new Date(p.subscription.current_period_end) <= now) {
          subscriptionImpact = 'SUBSCRIPTION_EXPIRED';
        } else if (p.subscription.current_period_end) {
          const daysLeft = Math.ceil((new Date(p.subscription.current_period_end).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
          subscriptionImpact = daysLeft <= 3 ? 'SUBSCRIPTION_AT_RISK' : 'PAYMENT_RETRY_REQUIRED';
        } else {
          subscriptionImpact = 'PAYMENT_RETRY_REQUIRED';
        }
      }

      const lastEvent = p.events[0];
      const failureReason = (lastEvent?.raw_data as any)?.error_description ||
        (lastEvent?.raw_data as any)?.data?.payment?.payment_message ||
        'Bank gateway timeout or user cancelled transaction';

      return {
        id: p.id,
        amount: p.amount / 100,
        provider: p.provider || 'Cashfree',
        failureStatus: 'FAILED',
        failureReason,
        date: p.created_at,
        subscriptionImpact,
        student: {
          id: p.student.id,
          name: [p.student.first_name, p.student.last_name].filter(Boolean).join(' ') || p.student.username || 'Student',
          telegramUserId: p.student.telegram_user_id.toString(),
        },
        subscriptionId: p.subscription_id,
      };
    });

    return { total, page, limit, failedPayments: formatted };
  }

  // -------------------------------------------------------------
  // 6. STUDENT BILLING VIEW
  // -------------------------------------------------------------
  async getStudentBilling(studentId: string) {
    const student = await this.prisma.student.findUnique({
      where: { id: studentId },
      include: {
        subscriptions: {
          include: { plan: true },
          orderBy: { created_at: 'desc' },
        },
        payments: {
          include: { refund: true },
          orderBy: { created_at: 'desc' },
        },
        refunds: {
          orderBy: { created_at: 'desc' },
        },
      },
    });

    if (!student) throw new NotFoundException(`Student ${studentId} not found`);

    const now = new Date();
    const activeSub = student.subscriptions.find((s) => s.status === 'ACTIVE' && s.current_period_end && new Date(s.current_period_end) > now);
    const latestSub = student.subscriptions[0] || null;
    const currentSub = activeSub || latestSub;

    const successfulPayments = student.payments.filter((p) => p.status === 'SUCCESS' || p.status === 'PAID');
    const totalPaid = successfulPayments.reduce((sum, p) => sum + p.amount / 100, 0);
    const totalRefunds = student.refunds.reduce((sum, r) => sum + r.amount / 100, 0);

    const isAccessAuthorized = student.is_active && Boolean(activeSub);

    return {
      student: {
        id: student.id,
        name: [student.first_name, student.last_name].filter(Boolean).join(' ') || student.username || 'Student',
        username: student.username ? `@${student.username}` : 'N/A',
        telegramUserId: student.telegram_user_id.toString(),
        isActive: student.is_active,
        contentAccess: isAccessAuthorized ? 'AUTHORIZED' : 'REVOKED',
      },
      financialSummary: {
        totalPaid,
        totalRefunds,
        netPaid: Math.max(0, totalPaid - totalRefunds),
        paymentCount: student.payments.length,
        successfulPaymentCount: successfulPayments.length,
        refundCount: student.refunds.length,
      },
      currentSubscription: currentSub
        ? {
            id: currentSub.id,
            planName: currentSub.plan.name,
            amount: currentSub.price ? currentSub.price / 100 : currentSub.plan.price / 100,
            status: activeSub ? 'ACTIVE' : currentSub.status,
            startDate: currentSub.current_period_start || currentSub.started_at,
            endDate: currentSub.current_period_end,
            autoRenew: currentSub.auto_renew,
            nextRenewalAt: currentSub.next_renewal_at || currentSub.current_period_end,
          }
        : null,
      payments: student.payments.map((p) => ({
        id: p.id,
        amount: p.amount / 100,
        status: p.refund ? 'REFUNDED' : p.status,
        provider: p.provider || 'Cashfree',
        method: p.payment_method || 'UPI',
        date: p.created_at,
        refund: p.refund ? { amount: p.refund.amount / 100, status: p.refund.status } : null,
      })),
      subscriptions: student.subscriptions.map((s) => ({
        id: s.id,
        planName: s.plan.name,
        amount: s.price ? s.price / 100 : s.plan.price / 100,
        status: s.status,
        startDate: s.current_period_start || s.started_at,
        endDate: s.current_period_end,
      })),
      refunds: student.refunds.map((r) => ({
        id: r.id,
        amount: r.amount / 100,
        percentage: r.percentage,
        reason: r.reason,
        status: r.status,
        date: r.created_at,
      })),
    };
  }

  // -------------------------------------------------------------
  // 7. AUDIT LOGS
  // -------------------------------------------------------------
  async getAuditLogs(params: { page?: number; limit?: number }) {
    const { page = 1, limit = 50 } = params;
    const skip = (Math.max(1, page) - 1) * limit;

    const [total, logs] = await Promise.all([
      this.prisma.accountAuditLog.count(),
      this.prisma.accountAuditLog.findMany({
        orderBy: { created_at: 'desc' },
        skip,
        take: limit,
      }),
    ]);

    return { total, page, limit, logs };
  }

  // -------------------------------------------------------------
  // 8. CSV EXPORTS
  // -------------------------------------------------------------
  async exportCsv(type: 'payments' | 'refunds' | 'subscriptions' | 'renewals') {
    switch (type) {
      case 'payments': {
        const payments = await this.prisma.payment.findMany({
          include: { student: true, subscription: { include: { plan: true } }, refund: true },
          orderBy: { created_at: 'desc' },
          take: 1000,
        });

        const header = 'Payment ID,Student Name,Telegram ID,Amount (INR),Status,Provider,Payment Method,Date,Refund Status\n';
        const rows = payments.map((p) => {
          const name = `"${([p.student.first_name, p.student.last_name].filter(Boolean).join(' ') || p.student.username || 'Student').replace(/"/g, '""')}"`;
          const refundStatus = p.refund ? 'Refunded' : 'None';
          return `${p.id},${name},${p.student.telegram_user_id},${p.amount / 100},${p.status},${p.provider || 'Cashfree'},${p.payment_method || 'UPI'},${p.created_at.toISOString()},${refundStatus}`;
        }).join('\n');

        return header + rows;
      }

      case 'refunds': {
        const refunds = await this.prisma.refund.findMany({
          include: { payment: true, student: true },
          orderBy: { created_at: 'desc' },
          take: 1000,
        });

        const header = 'Refund ID,Payment ID,Student Name,Original Amount,Refund Amount,Retained Amount,Reason,Status,Date\n';
        const rows = refunds.map((r) => {
          const name = `"${([r.student?.first_name, r.student?.last_name].filter(Boolean).join(' ') || r.student?.username || 'Student').replace(/"/g, '""')}"`;
          const orig = r.payment ? r.payment.amount / 100 : r.amount / 100;
          const ref = r.amount / 100;
          const ret = Math.max(0, Math.round((orig - ref) * 100) / 100);
          return `${r.id},${r.payment_id},${name},${orig},${ref},${ret},"${(r.reason || '').replace(/"/g, '""')}",${r.status},${r.created_at.toISOString()}`;
        }).join('\n');

        return header + rows;
      }

      case 'subscriptions': {
        const subs = await this.prisma.subscription.findMany({
          include: { student: true, plan: true },
          orderBy: { created_at: 'desc' },
          take: 1000,
        });

        const header = 'Subscription ID,Student Name,Telegram ID,Plan,Amount,Status,Start Date,End Date,Auto Renew\n';
        const rows = subs.map((s) => {
          const name = `"${([s.student.first_name, s.student.last_name].filter(Boolean).join(' ') || s.student.username || 'Student').replace(/"/g, '""')}"`;
          const amt = s.price ? s.price / 100 : s.plan.price / 100;
          return `${s.id},${name},${s.student.telegram_user_id},"${s.plan.name}",${amt},${s.status},${s.current_period_start?.toISOString() || ''},${s.current_period_end?.toISOString() || ''},${s.auto_renew}`;
        }).join('\n');

        return header + rows;
      }

      case 'renewals': {
        const renewals = await this.prisma.subscriptionRenewal.findMany({
          include: { student: true },
          orderBy: { attempted_at: 'desc' },
          take: 1000,
        });

        const header = 'Renewal ID,Subscription ID,Student Name,Amount,Status,Attempted Date,New Expiry Date\n';
        const rows = renewals.map((r) => {
          const name = `"${([r.student?.first_name, r.student?.last_name].filter(Boolean).join(' ') || r.student?.username || 'Student').replace(/"/g, '""')}"`;
          return `${r.id},${r.subscription_id},${name},${r.amount / 100},${r.status},${r.attempted_at.toISOString()},${r.new_end_at?.toISOString() || ''}`;
        }).join('\n');

        return header + rows;
      }
    }
  }
}
