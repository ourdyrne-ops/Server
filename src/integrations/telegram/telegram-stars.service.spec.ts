import { expect, describe, it, beforeEach, afterEach, vi } from 'vitest';
import { TelegramStarsService } from './telegram-stars.service.js';
import { TelegramApiService } from './telegram-api.service.js';
import { PrismaService } from '../../prisma/prisma.service.js';

describe('TelegramStarsService - Acceptance Tests (A to H)', () => {
  let starsService: TelegramStarsService;
  let telegramApiMock: any;
  let prismaMock: any;

  beforeEach(() => {
    process.env.TELEGRAM_BOT_TOKEN = 'mock_bot_token_123';
    process.env.TELEGRAM_STARS_MONTHLY_AMOUNT = '500';
    process.env.PAYMENT_INVOICE_MODE = 'sendInvoice';

    telegramApiMock = {
      getBotToken: vi.fn().mockReturnValue('mock_bot_token_123'),
      getMe: vi.fn().mockResolvedValue({ ok: true, result: { id: 12345, username: 'test_bot' } }),
      getWebhookInfo: vi.fn().mockResolvedValue({ ok: true, result: { url: 'https://example.com/webhook' } }),
      createInvoiceLink: vi.fn().mockResolvedValue({ ok: true, result: 'https://t.me/$invoice_link_123' }),
      sendInvoice: vi.fn().mockResolvedValue({ ok: true, result: { message_id: 999 } }),
      answerPreCheckoutQuery: vi.fn().mockResolvedValue({ ok: true, result: true }),
      refundStarPayment: vi.fn().mockResolvedValue({ ok: true, result: true }),
    };

    prismaMock = {
      plan: {
        findFirst: vi.fn().mockResolvedValue({ id: 'plan_stars_1', name: 'All-Access Subscription', price: 500, currency: 'XTR' }),
        findUnique: vi.fn().mockResolvedValue({ id: 'plan_stars_1', name: 'All-Access Subscription', price: 500, currency: 'XTR' }),
        create: vi.fn(),
        update: vi.fn(),
      },
      student: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      paymentIntent: {
        create: vi.fn(),
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      payment: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      paymentEvent: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      subscription: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      subscriptionRenewal: {
        create: vi.fn(),
      },
      refund: {
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      accountAuditLog: {
        create: vi.fn(),
      },
      $transaction: vi.fn(async (cb: any) => cb(prismaMock)),
    };

    starsService = new TelegramStarsService(prismaMock as PrismaService, telegramApiMock as TelegramApiService);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_STARS_MONTHLY_AMOUNT;
    delete process.env.PAYMENT_INVOICE_MODE;
  });

  // --------------------------------------------------------------------------
  // TEST A — Invoice Generation (sendInvoice & createInvoiceLink with valid payload <128 bytes)
  // --------------------------------------------------------------------------
  describe('Test A — Invoice Generation', () => {
    it('should generate a valid invoice with payload under 128 bytes in sendInvoice mode', async () => {
      prismaMock.student.findUnique.mockResolvedValue({ id: 'student_1', telegram_user_id: BigInt(987654) });
      prismaMock.paymentIntent.create.mockImplementation((args: any) => ({
        id: args.data.id,
        telegram_user_id: args.data.telegram_user_id,
        plan_id: args.data.plan_id,
        amount: args.data.amount,
        currency: 'XTR',
        status: 'CREATED',
        payload: args.data.payload,
        is_renewal: false,
        created_at: new Date(),
        expires_at: args.data.expires_at,
      }));

      const res = await starsService.generateStarsInvoice({
        chatId: 987654,
        telegramUserId: 987654,
        studentId: 'student_1',
        forceMode: 'sendInvoice',
      });

      expect(res.ok).toBe(true);
      expect(res.mode).toBe('sendInvoice');
      expect(telegramApiMock.sendInvoice).toHaveBeenCalled();

      const sendArgs = telegramApiMock.sendInvoice.mock.calls[0][0];
      expect(sendArgs.currency).toBe('XTR');
      expect(sendArgs.prices[0].amount).toBe(500);
      expect(sendArgs.payload.length).toBeLessThanOrEqual(128);
      expect(sendArgs.payload).toMatch(/^sub_/);
    });

    it('should generate a valid invoice link via createInvoiceLink mode', async () => {
      prismaMock.student.findUnique.mockResolvedValue({ id: 'student_1', telegram_user_id: BigInt(987654) });
      prismaMock.paymentIntent.create.mockImplementation((args: any) => ({
        id: args.data.id,
        telegram_user_id: args.data.telegram_user_id,
        plan_id: args.data.plan_id,
        amount: args.data.amount,
        currency: 'XTR',
        status: 'CREATED',
        payload: args.data.payload,
        is_renewal: false,
        created_at: new Date(),
        expires_at: args.data.expires_at,
      }));

      const res = await starsService.generateStarsInvoice({
        chatId: 987654,
        telegramUserId: 987654,
        studentId: 'student_1',
        forceMode: 'createInvoiceLink',
      });

      expect(res.ok).toBe(true);
      expect(res.mode).toBe('createInvoiceLink');
      expect(res.invoiceLink).toBe('https://t.me/$invoice_link_123');
      expect(telegramApiMock.createInvoiceLink).toHaveBeenCalled();

      const linkArgs = telegramApiMock.createInvoiceLink.mock.calls[0][0];
      expect(linkArgs.currency).toBe('XTR');
      expect(linkArgs.payload.length).toBeLessThanOrEqual(128);
    });
  });

  // --------------------------------------------------------------------------
  // TEST B — Invalid Amount in PreCheckoutQuery
  // --------------------------------------------------------------------------
  describe('Test B — Invalid Amount in PreCheckoutQuery', () => {
    it('should reject pre_checkout_query when total_amount does not match PaymentIntent', async () => {
      prismaMock.paymentIntent.findUnique.mockResolvedValue({
        id: 'intent_1',
        telegram_user_id: BigInt(987654),
        amount: 500,
        currency: 'XTR',
        status: 'PENDING',
        payload: 'sub_test_payload',
        expires_at: new Date(Date.now() + 60000),
      });

      const res = await starsService.validateAndAnswerPreCheckout({
        id: 'query_tampered_amount',
        from: { id: 987654, first_name: 'Test' },
        currency: 'XTR',
        total_amount: 100, // Mismatched! Expected 500
        invoice_payload: 'sub_test_payload',
      });

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('AMOUNT_MISMATCH');
      expect(telegramApiMock.answerPreCheckoutQuery).toHaveBeenCalledWith(
        'query_tampered_amount',
        false,
        expect.stringContaining('amount mismatch'),
      );
    });
  });

  // --------------------------------------------------------------------------
  // TEST C — Invalid Payload in PreCheckoutQuery
  // --------------------------------------------------------------------------
  describe('Test C — Invalid Payload', () => {
    it('should reject pre_checkout_query when payload is unknown / not found in DB', async () => {
      prismaMock.paymentIntent.findUnique.mockResolvedValue(null);

      const res = await starsService.validateAndAnswerPreCheckout({
        id: 'query_unknown_payload',
        from: { id: 987654, first_name: 'Test' },
        currency: 'XTR',
        total_amount: 500,
        invoice_payload: 'invalid_payload_xyz',
      });

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('INTENT_NOT_FOUND');
      expect(telegramApiMock.answerPreCheckoutQuery).toHaveBeenCalledWith(
        'query_unknown_payload',
        false,
        expect.stringContaining('Payment intent not found'),
      );
    });

    it('should reject pre_checkout_query when user ID does not match the payment intent', async () => {
      prismaMock.paymentIntent.findUnique.mockResolvedValue({
        id: 'intent_1',
        telegram_user_id: BigInt(111111), // Created by another user
        amount: 500,
        currency: 'XTR',
        status: 'PENDING',
        payload: 'sub_test_payload',
        expires_at: new Date(Date.now() + 60000),
      });

      const res = await starsService.validateAndAnswerPreCheckout({
        id: 'query_different_user',
        from: { id: 999999, first_name: 'Imposter' },
        currency: 'XTR',
        total_amount: 500,
        invoice_payload: 'sub_test_payload',
      });

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('USER_MISMATCH');
      expect(telegramApiMock.answerPreCheckoutQuery).toHaveBeenCalledWith(
        'query_different_user',
        false,
        expect.stringContaining('does not match'),
      );
    });
  });

  // --------------------------------------------------------------------------
  // TEST D — Successful Payment
  // --------------------------------------------------------------------------
  describe('Test D — Successful Payment Processing', () => {
    it('should atomically record payment, mark intent PAID, and activate subscription for 30 days', async () => {
      const tgUserId = BigInt(987654);
      prismaMock.payment.findUnique.mockResolvedValue(null); // Not duplicate
      prismaMock.paymentIntent.findUnique.mockResolvedValue({
        id: 'intent_100',
        telegram_user_id: tgUserId,
        amount: 500,
        currency: 'XTR',
        status: 'PENDING',
        payload: 'sub_valid_payload',
        plan: { id: 'plan_stars_1', price: 500, currency: 'XTR' },
      });

      prismaMock.student.findUnique.mockResolvedValue({ id: 'student_1', telegram_user_id: tgUserId, is_active: true });
      prismaMock.subscription.findFirst.mockResolvedValue(null); // New subscriber
      prismaMock.subscription.create.mockResolvedValue({ id: 'sub_new_1', student_id: 'student_1', status: 'ACTIVE' });
      prismaMock.payment.create.mockResolvedValue({ id: 'pay_stars_1', amount: 500, currency: 'XTR', status: 'SUCCESS' });
      prismaMock.paymentIntent.update.mockResolvedValue({ id: 'intent_100', status: 'PAID' });
      prismaMock.paymentEvent.create.mockResolvedValue({ id: 'pe_1' });
      prismaMock.accountAuditLog.create.mockResolvedValue({ id: 'log_1' });

      const result = await starsService.processSuccessfulPayment({
        telegramUserId: tgUserId,
        successfulPayment: {
          currency: 'XTR',
          total_amount: 500,
          invoice_payload: 'sub_valid_payload',
          telegram_payment_charge_id: 'tg_charge_xyz_100',
        },
      });

      expect(result.success).toBe(true);
      expect(result.paymentId).toBe('pay_stars_1');
      expect(result.subscriptionId).toBe('sub_new_1');
      expect(result.validUntil).toBeDefined();

      expect(prismaMock.payment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            amount: 500,
            currency: 'XTR',
            provider: 'TelegramStars',
            payment_method: 'Stars',
            telegram_payment_charge_id: 'tg_charge_xyz_100',
            status: 'SUCCESS',
          }),
        }),
      );

      expect(prismaMock.paymentIntent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'intent_100' },
          data: expect.objectContaining({ status: 'PAID' }),
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // TEST E — Duplicate Webhook Update (Idempotency)
  // --------------------------------------------------------------------------
  describe('Test E — Duplicate Webhook Update (Idempotency)', () => {
    it('should detect duplicate telegram_payment_charge_id and not double extend subscription', async () => {
      const existingDate = new Date(Date.now() + 15 * 86400000);
      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'existing_pay_1',
        telegram_payment_charge_id: 'tg_charge_duplicate',
        subscription_id: 'sub_existing',
        subscription: { current_period_end: existingDate },
      });

      const result = await starsService.processSuccessfulPayment({
        telegramUserId: BigInt(987654),
        successfulPayment: {
          currency: 'XTR',
          total_amount: 500,
          invoice_payload: 'sub_payload',
          telegram_payment_charge_id: 'tg_charge_duplicate',
        },
      });

      expect(result.success).toBe(true);
      expect(result.isDuplicate).toBe(true);
      expect(result.paymentId).toBe('existing_pay_1');
      expect(prismaMock.payment.create).not.toHaveBeenCalled();
      expect(prismaMock.subscription.create).not.toHaveBeenCalled();
      expect(prismaMock.subscription.update).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // TEST F — Expiry Check
  // --------------------------------------------------------------------------
  describe('Test F — Expired PaymentIntent', () => {
    it('should reject pre_checkout_query if payment intent is past its expires_at timestamp', async () => {
      prismaMock.paymentIntent.findUnique.mockResolvedValue({
        id: 'intent_expired',
        telegram_user_id: BigInt(987654),
        amount: 500,
        currency: 'XTR',
        status: 'PENDING',
        payload: 'sub_expired_payload',
        expires_at: new Date(Date.now() - 10000), // In the past!
        plan: { price: 500 },
      });

      const res = await starsService.validateAndAnswerPreCheckout({
        id: 'query_expired',
        from: { id: 987654, first_name: 'Test' },
        currency: 'XTR',
        total_amount: 500,
        invoice_payload: 'sub_expired_payload',
      });

      expect(res.ok).toBe(false);
      expect(res.reason).toBe('INTENT_EXPIRED');
      expect(prismaMock.paymentIntent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'intent_expired' },
          data: { status: 'EXPIRED' },
        }),
      );
    });
  });

  // --------------------------------------------------------------------------
  // TEST G — Refund Workflow
  // --------------------------------------------------------------------------
  describe('Test G — Refund Workflow', () => {
    it('should call refundStarPayment on Telegram API and update payment & subscription to REFUNDED', async () => {
      const tgUserId = BigInt(987654);
      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'pay_to_refund',
        student_id: 'student_1',
        subscription_id: 'sub_1',
        payment_intent_id: 'intent_1',
        telegram_payment_charge_id: 'tg_charge_refund_target',
        amount: 500,
        currency: 'XTR',
        status: 'SUCCESS',
        paid_at: new Date(Date.now() - 60000), // 1 minute ago (within 5 min)
        student: { id: 'student_1', telegram_user_id: tgUserId },
        subscription: { id: 'sub_1', status: 'ACTIVE' },
        refund: null,
      });

      prismaMock.refund.create.mockResolvedValue({ id: 'refund_rec_1' });
      prismaMock.payment.update.mockResolvedValue({ id: 'pay_to_refund', status: 'REFUNDED' });
      prismaMock.paymentIntent.update.mockResolvedValue({ id: 'intent_1', status: 'REFUNDED' });
      prismaMock.subscription.update.mockResolvedValue({ id: 'sub_1', status: 'REFUNDED' });
      prismaMock.accountAuditLog.create.mockResolvedValue({ id: 'log_refund' });

      const refundResult = await starsService.refundPayment('pay_to_refund', 'Requested refund within 5 mins');

      expect(refundResult.success).toBe(true);
      expect(telegramApiMock.refundStarPayment).toHaveBeenCalledWith(tgUserId, 'tg_charge_refund_target');
      expect(prismaMock.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay_to_refund' },
          data: { status: 'REFUNDED' },
        }),
      );
      expect(prismaMock.subscription.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'sub_1' },
          data: expect.objectContaining({ status: 'REFUNDED' }),
        }),
      );
    });

    it('should reject refund request after 5 minutes by default', async () => {
      prismaMock.payment.findUnique.mockResolvedValue({
        id: 'pay_too_old',
        student_id: 'student_1',
        amount: 500,
        currency: 'XTR',
        status: 'SUCCESS',
        paid_at: new Date(Date.now() - 10 * 60 * 1000), // 10 minutes ago
        student: { id: 'student_1', telegram_user_id: BigInt(987654) },
        refund: null,
      });

      await expect(
        starsService.refundPayment('pay_too_old', 'Late refund request'),
      ).rejects.toThrow(/Refund policy strictly allows student refunds within the first 5 minutes/);
    });
  });

  // --------------------------------------------------------------------------
  // TEST H — Telegram API Failure & Health Check
  // --------------------------------------------------------------------------
  describe('Test H — Telegram API Failure & Health Check', () => {
    it('should return health status reflecting Telegram API, bot identity, and database state', async () => {
      const health = await starsService.getStarsHealth();

      expect(health.telegramApi).toBe('OK');
      expect(health.bot).toBe('OK');
      expect(health.botUsername).toBe('test_bot');
      expect(health.webhook).toBe('OK');
      expect(health.database).toBe('OK');
      expect(health.starsConfiguration).toBe('OK');
      expect(health.configuredStarsAmount).toBe(500);
    });

    it('should handle Telegram API network failure gracefully during invoice generation', async () => {
      telegramApiMock.sendInvoice.mockResolvedValue({
        ok: false,
        error_code: 500,
        description: 'Internal Telegram Server Error',
      });

      prismaMock.paymentIntent.create.mockResolvedValue({
        id: 'intent_fail_test',
        telegram_user_id: BigInt(987654),
        amount: 500,
        currency: 'XTR',
        status: 'CREATED',
        payload: 'sub_payload_fail',
        expires_at: new Date(Date.now() + 60000),
      });

      const res = await starsService.generateStarsInvoice({
        chatId: 987654,
        telegramUserId: 987654,
        forceMode: 'sendInvoice',
      });

      expect(res.ok).toBe(false);
      expect(res.error).toBe('Internal Telegram Server Error');
      expect(prismaMock.paymentIntent.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'intent_fail_test' },
          data: { status: 'FAILED' },
        }),
      );
    });
  });
});
