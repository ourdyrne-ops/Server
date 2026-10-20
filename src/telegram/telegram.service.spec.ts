import { vi, expect } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { TelegramService } from './telegram.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaymentsService } from '../payments/payments.service.js';
import { RouterService } from './navigation/router.service.js';
import { ServiceBotBridgeService } from '../sales-agent/service-bridge/service-bot-bridge.service.js';

describe('TelegramService', () => {
  let service: TelegramService;
  let prismaMock: any;
  let paymentsMock: any;
  let routerMock: any;

  beforeEach(async () => {
    // Mock process.env
    process.env.TELEGRAM_WEBHOOK_SECRET = 'test_secret';
    process.env.TELEGRAM_BOT_TOKEN = 'test_bot_token';

    prismaMock = {
      student: {
        upsert: vi.fn().mockResolvedValue({ id: 'student_1', telegram_user_id: BigInt(12345), is_active: true }),
        findUnique: vi.fn(),
      },
      subscription: {
        findFirst: vi.fn(),
      },
      content: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      category: {
        findMany: vi.fn(),
        findFirst: vi.fn(),
      },
      contentProgress: {
        count: vi.fn(),
      },
    };

    paymentsMock = {
      getFixedPlan: vi.fn().mockResolvedValue({
        id: 'plan_1',
        name: 'All-Access Subscription',
        price: 500,
        currency: 'XTR',
      }),
      createSubscriptionPayment: vi.fn().mockResolvedValue({
        amount: 500,
        currency: 'XTR',
        planName: 'All-Access Subscription',
      }),
      sendStarInvoice: vi.fn().mockResolvedValue({ ok: true }),
      answerPreCheckoutQuery: vi.fn().mockResolvedValue({ ok: true }),
      handleSuccessfulPayment: vi.fn().mockResolvedValue({
        success: true,
        validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      }),
    };

    routerMock = {
      handleRoute: vi.fn().mockImplementation(async (route: string) => {
        if (route === '/start' || route === 'nav:main') {
          return {
            text: '🏠 <b>Welcome to Melcome University</b>\n\nPlease select an option from the menu below:',
            replyMarkup: {
              keyboard: [
                [{ text: '🔥 Latest Course' }, { text: '📚 Courses' }],
                [{ text: '👤 Account' }, { text: '❓ Help' }],
                [{ text: '⭐ Clear Chat' }],
              ],
              resize_keyboard: true,
              is_persistent: true,
            },
          };
        }
        return { text: `Navigated to ${route}`, replyMarkup: undefined };
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TelegramService,
        {
          provide: PrismaService,
          useValue: prismaMock,
        },
        {
          provide: PaymentsService,
          useValue: paymentsMock,
        },
        {
          provide: RouterService,
          useValue: routerMock,
        },
        {
          provide: ServiceBotBridgeService,
          useValue: {
            activateStudentFromToken: vi.fn().mockResolvedValue({
              success: true,
              bundleName: 'Test Bundle',
            }),
          },
        },
      ],
    }).compile();

    service = module.get<TelegramService>(TelegramService);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_WEBHOOK_SECRET;
    delete process.env.TELEGRAM_BOT_TOKEN;
  });

  describe('verifyWebhookSecret', () => {
    it('should reject when secret is missing from env', () => {
      delete process.env.TELEGRAM_WEBHOOK_SECRET;
      expect(service.verifyWebhookSecret('test_secret')).toBe(false);
    });

    it('should reject when token is missing', () => {
      expect(service.verifyWebhookSecret(undefined)).toBe(false);
    });

    it('should reject invalid token', () => {
      expect(service.verifyWebhookSecret('wrong_secre')).toBe(false); // same length as test_secret (11 bytes)
    });

    it('should accept valid token', () => {
      expect(service.verifyWebhookSecret('test_secret')).toBe(true);
    });
  });

  describe('handleUpdate', () => {
    it('should reject forged/missing telegram_user_id', async () => {
      const update = { message: { from: { username: 'test' } } }; // missing id
      const result = await service.handleUpdate(update);
      expect(result.status).toBe('ignored');
      expect(result.reason).toBe('no_user_id');
    });

    it('should process valid update', async () => {
      const update = { message: { from: { id: 12345, username: 'test' } } };
      const result = await service.handleUpdate(update);
      expect(result.status).toBe('processed');
    });

    it('should approve Telegram Stars pre_checkout_query update', async () => {
      const update = {
        pre_checkout_query: {
          id: 'pre_check_123',
          from: { id: 12345 },
          currency: 'XTR',
          total_amount: 500,
          invoice_payload: '{}',
        },
      };

      const result = await service.handleUpdate(update);
      expect(result.status).toBe('processed');
      expect(result.type).toBe('pre_checkout_query');
      expect(paymentsMock.answerPreCheckoutQuery).toHaveBeenCalledWith(update.pre_checkout_query);
    });

    it('should handle Telegram Stars successful_payment and grant access', async () => {
      const sendMessageSpy = vi.spyOn(service, 'sendMessage').mockResolvedValue({ ok: true });

      const update = {
        message: {
          from: { id: 12345, username: 'test_payer' },
          successful_payment: {
            currency: 'XTR',
            total_amount: 500,
            invoice_payload: JSON.stringify({ studentId: 'student_1' }),
            telegram_payment_charge_id: 'tg_charge_100',
          },
        },
      };

      const result = await service.handleUpdate(update);
      expect(result.status).toBe('processed');
      expect(result.type).toBe('successful_payment');
      expect(paymentsMock.handleSuccessfulPayment).toHaveBeenCalled();
      expect(sendMessageSpy).toHaveBeenCalledWith(
        BigInt(12345),
        expect.stringContaining('Payment Successful'),
        'HTML',
        expect.any(Object),
        'student_1',
      );
    });
  });

  describe('Student Bot Authorization & Main Menu Options', () => {
    it('should DENY access on /start if subscription is inactive and send Telegram Stars invoice', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue(null);
      const sendMessageSpy = vi.spyOn(service, 'sendMessage').mockResolvedValue({ ok: true });

      const update = {
        message: {
          from: { id: 12345, username: 'student_unpaid' },
          text: '/start',
        },
      };

      await service.handleUpdate(update);

      expect(sendMessageSpy).toHaveBeenCalledWith(
        BigInt(12345),
        expect.stringContaining('Access Denied'),
        'HTML',
        expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: expect.stringContaining('Pay 500 Stars') }),
            ]),
          ]),
        }),
        'student_1',
      );
      expect(paymentsMock.sendStarInvoice).toHaveBeenCalledWith(BigInt(12345), 'student_1', false, 'createInvoiceLink');
    });

    it('should GRANT access on /start if subscription is active and show menu in keyboard area (not in chat)', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue({
        id: 'sub_active_123',
        status: 'ACTIVE',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      const sendMessageSpy = vi.spyOn(service, 'sendMessage').mockResolvedValue({ ok: true });

      const update = {
        message: {
          from: { id: 12345, username: 'student_paid' },
          text: '/start',
        },
      };

      await service.handleUpdate(update);

      // Verify menu is set in the keyboard area (ReplyKeyboardMarkup)
      expect(sendMessageSpy).toHaveBeenCalledWith(
        BigInt(12345),
        expect.stringContaining('Welcome to Melcome University'),
        'HTML',
        expect.objectContaining({
          keyboard: [
            [{ text: '🔥 Latest Course' }, { text: '📚 Courses' }],
            [{ text: '👤 Account' }, { text: '❓ Help' }],
            [{ text: '⭐ Clear Chat' }],
          ],
          resize_keyboard: true,
          is_persistent: true,
        }),
        'student_1',
      );

      // Verify inline_keyboard is NOT present in the main menu message (not in chat)
      const markup = sendMessageSpy.mock.calls[0][3];
      expect(markup.inline_keyboard).toBeUndefined();
    });

    it('should route keyboard button presses correctly', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue({
        id: 'sub_active_123',
        status: 'ACTIVE',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      vi.spyOn(service, 'sendMessage').mockResolvedValue({ ok: true });

      const update = {
        message: {
          from: { id: 12345, username: 'student_paid' },
          text: '📚 Courses',
        },
      };

      await service.handleUpdate(update);
      expect(routerMock.handleRoute).toHaveBeenCalledWith('nav:courses', 'student_1');
    });

    it('should route format selection to sub-menu and content title to chat delivery', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue({
        id: 'sub_active_123',
        status: 'ACTIVE',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      prismaMock.content.findFirst.mockResolvedValue({
        id: 'content_b2b',
        title: 'Introduction to B2B Sales',
        media_type: 'VIDEO',
        status: 'PUBLISHED',
      });
      vi.spyOn(service, 'sendMessage').mockResolvedValue({ ok: true });

      // 1. Enter Latest Course
      await service.handleUpdate({
        message: { from: { id: 12345 }, text: '🔥 Latest Course' },
      });
      expect(routerMock.handleRoute).toHaveBeenCalledWith('nav:latest', 'student_1');

      // 2. Click Video format
      await service.handleUpdate({
        message: { from: { id: 12345 }, text: '🎬 Video' },
      });
      expect(routerMock.handleRoute).toHaveBeenCalledWith('nav:latest:video', 'student_1');

      // 3. Click content title -> routes directly to content delivery!
      await service.handleUpdate({
        message: { from: { id: 12345 }, text: 'Introduction to B2B Sales' },
      });
      expect(routerMock.handleRoute).toHaveBeenCalledWith('content:content_b2b', 'student_1');
    });

    it('should clear chat completely and leave screen empty', async () => {
      prismaMock.subscription.findFirst.mockResolvedValue({
        id: 'sub_active_123',
        status: 'ACTIVE',
        current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      });
      const deleteSpy = vi.spyOn(service, 'deleteMessage').mockResolvedValue({ ok: true });
      const sendSpy = vi.spyOn(service, 'sendMessage').mockResolvedValue({ ok: true, result: { message_id: 999 } });

      // Populate some session messages
      service.touchSession('student_1', BigInt(12345), '12345');
      service.trackSentMessage('12345', 101, 'student_1');
      service.trackSentMessage('12345', 102, 'student_1');

      // 1. User triggers Clear Chat
      await service.handleUpdate({
        message: { from: { id: 12345 }, text: '⭐ Clear Chat', message_id: 103 },
      });

      // Verifies session messages were deleted
      expect(deleteSpy).toHaveBeenCalled();

      // 2. User restarts using /start
      await service.handleUpdate({
        message: { from: { id: 12345 }, text: '/start', message_id: 104 },
      });

      // Verifies restarted from /start with full main menu keyboard
      expect(routerMock.handleRoute).toHaveBeenCalledWith('/start', 'student_1');
      expect(sendSpy).toHaveBeenCalledWith(
        BigInt(12345),
        expect.stringContaining('Welcome to Melcome University'),
        'HTML',
        expect.objectContaining({
          keyboard: expect.any(Array),
          resize_keyboard: true,
          is_persistent: true,
        }),
        'student_1',
      );
    });
  });

  describe('Auto-Delete & Inactivity Session Guard', () => {
    it('should NOT delete messages while student is actively interacting (continuous usage)', async () => {
      const deleteMessageSpy = vi.spyOn(service, 'deleteMessage').mockResolvedValue({ ok: true });

      // Student interacts
      const session = service.touchSession('student_1', BigInt(12345), '12345');
      service.trackSentMessage('12345', 101, 'student_1');
      service.trackSentMessage('12345', 102, 'student_1');

      // 30 minutes pass, but student interacts again (continuous usage)
      service.touchSession('student_1', BigInt(12345), '12345');
      service.trackSentMessage('12345', 103, 'student_1');

      // Cleaner checks: student is active (idle < 60 mins)
      const cleaned = await service.checkAndCleanIdleSessions();

      expect(cleaned).toBe(0);
      expect(deleteMessageSpy).not.toHaveBeenCalled();
      expect(session.messages.length).toBe(3);
    });

    it('should auto-delete session messages when student is idle past the threshold (60m)', async () => {
      const deleteMessageSpy = vi.spyOn(service, 'deleteMessage').mockResolvedValue({ ok: true });

      const session = service.touchSession('student_idle', BigInt(999), '999');
      service.trackSentMessage('999', 201, 'student_idle');
      service.trackSentMessage('999', 202, 'student_idle');

      // Simulate student being idle for 65 minutes (> 60m threshold)
      session.lastActiveAt = Date.now() - 65 * 60 * 1000;

      const cleaned = await service.checkAndCleanIdleSessions();

      expect(cleaned).toBe(2);
      expect(deleteMessageSpy).toHaveBeenCalledTimes(2);
      expect(deleteMessageSpy).toHaveBeenCalledWith('999', 201);
      expect(deleteMessageSpy).toHaveBeenCalledWith('999', 202);
      expect(session.messages.length).toBe(0);
    });

    it('should allow updating auto-delete configuration (e.g. 2 hours timeout)', () => {
      const updated = service.updateAutoDeleteConfig({
        enabled: true,
        inactivityMinutes: 120,
      });

      expect(updated.enabled).toBe(true);
      expect(updated.inactivityMinutes).toBe(120);
    });
  });
});

