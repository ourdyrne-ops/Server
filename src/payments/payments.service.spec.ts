import { expect, describe, it, beforeEach, afterEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PaymentsService } from './payments.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { TelegramStarsService } from '../integrations/telegram/telegram-stars.service.js';
import { TelegramApiService } from '../integrations/telegram/telegram-api.service.js';

describe('PaymentsService - Telegram Stars (XTR)', () => {
  let service: PaymentsService;
  let prismaMock: any;
  let starsServiceMock: any;
  let telegramApiMock: any;

  beforeEach(async () => {
    process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token';

    prismaMock = {
      plan: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
      },
      student: {
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      payment: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
      subscription: {
        findFirst: vi.fn(),
        findUnique: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
    };

    starsServiceMock = {
      getStarsPlan: vi.fn().mockResolvedValue({
        id: 'plan_1',
        name: 'All-Access Subscription',
        price: 500,
        currency: 'XTR',
        interval: 'monthly',
      }),
      createPaymentIntent: vi.fn().mockResolvedValue({
        id: 'intent_1',
        amount: 500,
        currency: 'XTR',
        payload: 'sub_123',
      }),
      generateStarsInvoice: vi.fn().mockResolvedValue({
        ok: true,
        mode: 'sendInvoice',
        intentId: 'intent_1',
      }),
      validateAndAnswerPreCheckout: vi.fn().mockResolvedValue({ ok: true }),
      processSuccessfulPayment: vi.fn().mockResolvedValue({
        success: true,
        paymentId: 'pay_1',
        subscriptionId: 'sub_1',
        validUntil: new Date(),
        isRenewal: false,
      }),
      refundPayment: vi.fn().mockResolvedValue({
        success: true,
        paymentId: 'pay_1',
      }),
    };

    telegramApiMock = {
      getBotToken: vi.fn().mockReturnValue('test_bot_token'),
      answerPreCheckoutQuery: vi.fn().mockResolvedValue({ ok: true }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: TelegramStarsService,
          useValue: starsServiceMock,
        },
        {
          provide: TelegramApiService,
          useValue: telegramApiMock,
        },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  describe('getFixedPlan', () => {
    it('should return 500 Stars plan from TelegramStarsService', async () => {
      const plan = await service.getFixedPlan();
      expect(plan.price).toBe(500);
      expect(plan.currency).toBe('XTR');
      expect(starsServiceMock.getStarsPlan).toHaveBeenCalled();
    });
  });

  describe('handleSuccessfulPayment', () => {
    it('should delegate successful_payment handling to TelegramStarsService', async () => {
      const sp = {
        currency: 'XTR',
        total_amount: 500,
        invoice_payload: 'sub_payload',
        telegram_payment_charge_id: 'tg_charge_123',
      };

      const result = await service.handleSuccessfulPayment({
        telegramUserId: BigInt(123456),
        successfulPayment: sp,
      });

      expect(result.success).toBe(true);
      expect(starsServiceMock.processSuccessfulPayment).toHaveBeenCalledWith({
        telegramUserId: BigInt(123456),
        successfulPayment: sp,
      });
    });
  });

  describe('answerPreCheckoutQuery', () => {
    it('should validate query through TelegramStarsService when passed object', async () => {
      const query = {
        id: 'query_1',
        from: { id: 12345, first_name: 'John' },
        currency: 'XTR',
        total_amount: 500,
        invoice_payload: 'sub_payload',
      };

      const result = await service.answerPreCheckoutQuery(query as any);
      expect(result.ok).toBe(true);
      expect(starsServiceMock.validateAndAnswerPreCheckout).toHaveBeenCalledWith(query);
    });

    it('should call telegramApi.answerPreCheckoutQuery when passed query string', async () => {
      await service.answerPreCheckoutQuery('query_id_direct', true);
      expect(telegramApiMock.answerPreCheckoutQuery).toHaveBeenCalledWith('query_id_direct', true, undefined);
    });
  });

  describe('refundStarPayment', () => {
    it('should delegate refund to TelegramStarsService', async () => {
      const res = await service.refundStarPayment('pay_stars_1', 'Refund reason');
      expect(res.success).toBe(true);
      expect(starsServiceMock.refundPayment).toHaveBeenCalledWith('pay_stars_1', 'Refund reason', undefined);
    });
  });
});
