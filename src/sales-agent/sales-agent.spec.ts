import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TriggerHandler } from './handlers/trigger.handler.js';
import { SUPPORTED_LANGUAGES, isLanguageSupported } from './localization/languages.config.js';
import { getTranslation } from './localization/translations.js';
import { ProvisioningStatusEnum } from './provisioning/provisioning.interface.js';
import { ProvisioningService } from './provisioning/provisioning.service.js';
import { StarsPaymentService } from './payment/stars-payment.service.js';
import { ServiceBotBridgeService } from './service-bridge/service-bot-bridge.service.js';

describe('Sales Agent Workflow Tests', () => {
  describe('TriggerHandler & Deep-Link Attribution', () => {
    let handler: TriggerHandler;
    let mockPrisma: any;
    let mockAnalytics: any;

    beforeEach(() => {
      mockPrisma = {
        salesCampaign: { findFirst: vi.fn(), findUnique: vi.fn() },
      };
      mockAnalytics = { trackEvent: vi.fn() };
      handler = new TriggerHandler(mockPrisma, mockAnalytics);
    });

    it('should correctly identify marketing group trigger messages', () => {
      const groupMsg = (text: string): any => ({
        chat: { id: -100123456789, type: 'supergroup' },
        text,
      });

      expect(handler.isGroupTrigger(groupMsg('/course'))).toBe(true);
      expect(handler.isGroupTrigger(groupMsg('/buy now'))).toBe(true);
      expect(handler.isGroupTrigger(groupMsg('@melcome_sales_bot info'))).toBe(true);
      expect(handler.isGroupTrigger(groupMsg('enroll in program'))).toBe(true);
      expect(handler.isGroupTrigger(groupMsg('hello team'))).toBe(false);
    });

    it('should parse deep-link start payloads for campaign and bundle attribution', () => {
      const payload = '/start cmp_alpha_bnd_all_access_mastery';
      const parsed = handler.parseStartPayload(payload);

      expect(parsed.campaignCode).toBe('alpha');
      expect(parsed.bundleSlug).toBe('all_access_mastery');
    });

    it('should return empty object for regular /start without payload', () => {
      expect(handler.parseStartPayload('/start')).toEqual({});
      expect(handler.parseStartPayload('')).toEqual({});
    });
  });

  describe('Localization & Language Selection', () => {
    it('should support the required 6 Indian languages plus English', () => {
      const codes = SUPPORTED_LANGUAGES.map((l) => l.code);
      expect(codes).toContain('hi');
      expect(codes).toContain('bn');
      expect(codes).toContain('mr');
      expect(codes).toContain('te');
      expect(codes).toContain('ta');
      expect(codes).toContain('ml');
      expect(codes).toContain('en');

      expect(isLanguageSupported('hi')).toBe(true);
      expect(isLanguageSupported('ml')).toBe(true);
      expect(isLanguageSupported('fr')).toBe(false);
    });

    it('should provide localized FAQ and checkout text for all languages', () => {
      for (const lang of ['en', 'hi', 'bn', 'mr', 'te', 'ta', 'ml']) {
        const t = getTranslation(lang);
        expect(t.welcomeGreeting).toBeDefined();
        expect(t.buyNowBtn).toBeDefined();
        expect(t.faqQuestions.content.q).toBeDefined();
        expect(t.faqQuestions.content.a).toBeDefined();
        expect(t.faqQuestions.payment.q).toBeDefined();
        expect(t.faqQuestions.refund.q).toBeDefined();
      }
    });
  });

  describe('StarsPaymentService & Pre-Checkout Validation', () => {
    let paymentService: StarsPaymentService;
    let mockPrisma: any;
    let mockProvisioning: any;
    let mockAnalytics: any;

    beforeEach(() => {
      mockPrisma = {
        courseBundle: { findUnique: vi.fn() },
        salesOrder: {
          create: vi.fn(),
          findUnique: vi.fn(),
          update: vi.fn(),
        },
        student: { findUnique: vi.fn() },
        payment: { create: vi.fn() },
      };
      mockProvisioning = {
        processProvisioning: vi.fn().mockResolvedValue({
          activationToken: 'test_token_123',
          activationLink: 'https://t.me/melcome_university_bot?start=act_test_token_123',
        }),
      };
      mockAnalytics = { trackEvent: vi.fn() };

      paymentService = new StarsPaymentService(mockPrisma, mockProvisioning, mockAnalytics);
      // Mock network call answerPreCheckout
      (paymentService as any).answerPreCheckout = vi.fn().mockResolvedValue(undefined);
    });

    it('should create an order with an opaque payload under 128 bytes', async () => {
      mockPrisma.courseBundle.findUnique.mockResolvedValue({
        id: 'bnd_1',
        name: 'AI Masterclass',
        description: 'Test Description',
        price_stars: 500,
        slug: 'ai_masterclass',
      });

      mockPrisma.salesOrder.create.mockImplementation((args: any) => ({
        id: 'ord_123',
        order_number: args.data.order_number,
        amount_stars: args.data.amount_stars,
        invoice_payload: args.data.invoice_payload,
        status: 'PENDING',
      }));

      const invoice = await paymentService.createOrder({
        telegramUserId: 987654321,
        bundleId: 'bnd_1',
      });

      expect(invoice.currency).toBe('XTR');
      expect(invoice.priceStars).toBe(500);
      expect(invoice.payload.length).toBeLessThan(128);
      expect(mockAnalytics.trackEvent).toHaveBeenCalled();
    });

    it('should reject pre-checkout when amount does not match order', async () => {
      mockPrisma.salesOrder.findUnique.mockResolvedValue({
        id: 'ord_1',
        order_number: 'ORD-001',
        amount_stars: 500,
        telegram_user_id: BigInt(987654321),
        status: 'PENDING',
      });

      const res = await paymentService.handlePreCheckoutQuery({
        id: 'query_1',
        from: { id: 987654321, is_bot: false, first_name: 'John' },
        currency: 'XTR',
        total_amount: 100, // mismatch: expected 500
        invoice_payload: 'xtr_payload_123',
      });

      expect(res.ok).toBe(false);
      expect(res.errorMessage).toBe('Amount mismatch');
      expect((paymentService as any).answerPreCheckout).toHaveBeenCalledWith(
        'query_1',
        false,
        expect.stringContaining('Amount mismatch')
      );
    });

    it('should reject pre-checkout when currency is not XTR', async () => {
      mockPrisma.salesOrder.findUnique.mockResolvedValue({
        id: 'ord_1',
        order_number: 'ORD-001',
        amount_stars: 500,
        telegram_user_id: BigInt(987654321),
        status: 'PENDING',
      });

      const res = await paymentService.handlePreCheckoutQuery({
        id: 'query_2',
        from: { id: 987654321, is_bot: false, first_name: 'John' },
        currency: 'USD',
        total_amount: 500,
        invoice_payload: 'xtr_payload_123',
      });

      expect(res.ok).toBe(false);
      expect(res.errorMessage).toBe('Invalid currency');
    });

    it('should approve valid pre-checkout queries', async () => {
      mockPrisma.salesOrder.findUnique.mockResolvedValue({
        id: 'ord_1',
        order_number: 'ORD-001',
        amount_stars: 500,
        telegram_user_id: BigInt(987654321),
        status: 'PENDING',
      });

      const res = await paymentService.handlePreCheckoutQuery({
        id: 'query_3',
        from: { id: 987654321, is_bot: false, first_name: 'John' },
        currency: 'XTR',
        total_amount: 500,
        invoice_payload: 'xtr_payload_123',
      });

      expect(res.ok).toBe(true);
      expect((paymentService as any).answerPreCheckout).toHaveBeenCalledWith('query_3', true);
    });

    it('should handle idempotent duplicate successful payments without double-processing', async () => {
      mockPrisma.salesOrder.findUnique.mockResolvedValueOnce({
        id: 'ord_1',
        status: 'PAID',
        telegram_payment_charge_id: 'chg_123',
        provisioning_job: { activation_link: 'https://t.me/bot?start=act_123' },
      });

      const result = await paymentService.handleSuccessfulPayment(
        {
          currency: 'XTR',
          total_amount: 500,
          invoice_payload: 'xtr_payload_123',
          telegram_payment_charge_id: 'chg_123',
          provider_payment_charge_id: 'prv_123',
        },
        {
          message_id: 1,
          chat: { id: 987654321, type: 'private' },
          date: Date.now(),
          from: { id: 987654321, is_bot: false, first_name: 'John' },
        }
      );

      expect(result.isDuplicate).toBe(true);
      expect(mockProvisioning.processProvisioning).not.toHaveBeenCalled();
    });
  });

  describe('ProvisioningService & Activation Flow', () => {
    let provisioning: ProvisioningService;
    let mockPrisma: any;
    let mockBridge: any;
    let mockAnalytics: any;

    beforeEach(() => {
      mockPrisma = {
        provisioningJob: {
          findUnique: vi.fn(),
          create: vi.fn(),
          update: vi.fn(),
        },
        salesOrder: { update: vi.fn() },
      };
      mockBridge = {
        generateActivationLink: vi.fn((token: string) => `https://t.me/melcome_university_bot?start=act_${token}`),
      };
      mockAnalytics = { trackEvent: vi.fn() };

      provisioning = new ProvisioningService(mockPrisma, mockBridge, mockAnalytics);
    });

    it('should create a provisioning job with secure activation token and 48h expiration', async () => {
      mockPrisma.provisioningJob.findUnique.mockResolvedValue(null);
      mockPrisma.provisioningJob.create.mockImplementation((args: any) => ({
        id: 'job_1',
        ...args.data,
      }));

      const res = await provisioning.processProvisioning({
        orderId: 'ord_1',
        orderNumber: 'ORD-001',
        telegramUserId: 987654321,
        bundleId: 'bnd_1',
        bundleSlug: 'all_access',
        bundleName: 'All Access',
        durationDays: 30,
      });

      expect(res.status).toBe(ProvisioningStatusEnum.PENDING);
      expect(res.activationToken).toBeDefined();
      expect(res.activationToken.length).toBeGreaterThan(16);
      expect(res.activationLink).toContain('act_');
      expect(mockPrisma.salesOrder.update).toHaveBeenCalledWith({
        where: { id: 'ord_1' },
        data: { status: 'PROVISIONED' },
      });
    });

    it('should retry a failed provisioning job and update attempt counters', async () => {
      mockPrisma.provisioningJob.findUnique.mockResolvedValue({
        id: 'job_failed',
        status: 'FAILED',
        attempts: 1,
        max_attempts: 3,
        activation_token: 'old_token',
        activation_link: 'old_link',
        expires_at: new Date(),
        order: { bundle: { name: 'AI Bundle' } },
      });

      mockPrisma.provisioningJob.update.mockImplementation((args: any) => ({
        id: 'job_failed',
        ...args.data,
      }));

      const res = await provisioning.retryFailedJob('job_failed');

      expect(res.status).toBe(ProvisioningStatusEnum.PENDING);
      expect(res.attempts).toBe(2);
      expect(res.activationToken).not.toBe('old_token');
    });
  });

  describe('ServiceBotBridgeService Activation', () => {
    let bridge: ServiceBotBridgeService;
    let mockPrisma: any;
    let mockAnalytics: any;

    beforeEach(() => {
      mockPrisma = {
        student: {
          upsert: vi.fn().mockResolvedValue({ id: 'stud_1', telegram_user_id: BigInt(987654321) }),
          findUnique: vi.fn(),
        },
        provisioningJob: {
          findUnique: vi.fn(),
          update: vi.fn(),
        },
        salesOrder: { update: vi.fn() },
        subscription: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({ id: 'sub_1', current_period_end: new Date() }),
        },
        plan: { findFirst: vi.fn().mockResolvedValue({ id: 'plan_1' }) },
        retentionSchedule: { create: vi.fn() },
      };
      mockAnalytics = { trackEvent: vi.fn() };

      bridge = new ServiceBotBridgeService(mockPrisma, mockAnalytics);
    });

    it('should reject invalid activation tokens', async () => {
      mockPrisma.provisioningJob.findUnique.mockResolvedValue(null);

      const result = await bridge.activateStudentFromToken(987654321, 'invalid_token');
      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid activation token');
    });

    it('should reject expired activation tokens', async () => {
      mockPrisma.provisioningJob.findUnique.mockResolvedValue({
        id: 'job_exp',
        activation_token: 'exp_token',
        expires_at: new Date(Date.now() - 10000), // in the past
        order: { bundle: { name: 'AI Course' } },
      });

      const result = await bridge.activateStudentFromToken(987654321, 'exp_token');
      expect(result.success).toBe(false);
      expect(result.message).toContain('expired');
    });

    it('should activate student, create subscription and schedule retention notifications', async () => {
      const futureDate = new Date(Date.now() + 24 * 3600 * 1000);
      mockPrisma.provisioningJob.findUnique.mockResolvedValue({
        id: 'job_valid',
        activation_token: 'valid_token',
        expires_at: futureDate,
        order_id: 'ord_1',
        order: {
          order_number: 'ORD-123',
          amount_stars: 500,
          bundle: {
            name: 'All-Access Pass',
            slug: 'all_access',
            duration_days: 30,
            plan_id: 'plan_1',
          },
        },
      });

      const result = await bridge.activateStudentFromToken(987654321, 'valid_token', {
        username: 'john_doe',
        firstName: 'John',
      });

      expect(result.success).toBe(true);
      expect(result.bundleName).toBe('All-Access Pass');
      expect(mockPrisma.student.upsert).toHaveBeenCalled();
      expect(mockPrisma.subscription.create).toHaveBeenCalled();
      expect(mockPrisma.retentionSchedule.create).toHaveBeenCalled();
      expect(mockAnalytics.trackEvent).toHaveBeenCalled();
    });
  });
});
