import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AccountService } from './account.service.js';
import { BadRequestException } from '@nestjs/common';

describe('AccountService', () => {
  let service: AccountService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      payment: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        create: vi.fn(),
      },
      refund: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      subscription: {
        findMany: vi.fn(),
        findUnique: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
      },
      subscriptionRenewal: {
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      accountAuditLog: {
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
      },
      student: {
        findUnique: vi.fn(),
        update: vi.fn(),
      },
      $transaction: vi.fn((callback) => callback(mockPrisma)),
    };

    service = new AccountService(mockPrisma);
  });

  describe('Refunds 5-Minute 95% Business Rule', () => {
    it('should reject refund if payment is older than 5 minutes', async () => {
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
      mockPrisma.payment.findUnique.mockResolvedValue({
        id: 'pay-1',
        amount: 99900,
        status: 'SUCCESS',
        paid_at: tenMinutesAgo,
        refund: null,
      });

      await expect(
        service.processRefund('pay-1', 'User changed mind')
      ).rejects.toThrow(BadRequestException);
    });

    it('should calculate exact 95% refund and 5% retention for payment within 5 minutes', async () => {
      const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
      const mockPayment = {
        id: 'pay-recent',
        student_id: 'student-1',
        subscription_id: 'sub-1',
        amount: 99900, // ₹999 stored as paise
        status: 'SUCCESS',
        paid_at: twoMinutesAgo,
        refund: null,
      };

      mockPrisma.payment.findUnique.mockResolvedValue(mockPayment);
      mockPrisma.refund.create.mockResolvedValue({
        id: 'refund-1',
        amount: 94905, // 95% of 99900
      });
      mockPrisma.payment.update.mockResolvedValue({});
      mockPrisma.subscription.update.mockResolvedValue({});
      mockPrisma.accountAuditLog.create.mockResolvedValue({});

      const result = await service.processRefund('pay-recent', 'Requested in 2 mins');

      expect(result.success).toBe(true);
      expect(result.originalAmount).toBe(999);
      expect(result.refundAmount).toBe(949.05);
      expect(result.retainedAmount).toBe(49.95);

      // Verify refund record created with exact 95% in paise (94905)
      expect(mockPrisma.refund.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            payment_id: 'pay-recent',
            amount: 94905,
            percentage: 95.0,
            status: 'COMPLETED',
          }),
        })
      );

      // Verify payment marked as REFUNDED
      expect(mockPrisma.payment.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'pay-recent' },
          data: { status: 'REFUNDED' },
        })
      );

      // Verify audit log created
      expect(mockPrisma.accountAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            action: 'ISSUE_REFUND',
            entity: 'PAYMENT',
            entity_id: 'pay-recent',
          }),
        })
      );
    });
  });

  describe('Controlled Subscription Actions', () => {
    it('should extend subscription validity and record renewal entry and audit log', async () => {
      const now = new Date();
      const futureDate = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000);

      mockPrisma.subscription.findUnique.mockResolvedValue({
        id: 'sub-123',
        student_id: 'student-abc',
        status: 'ACTIVE',
        current_period_end: futureDate,
        student: { id: 'student-abc', name: 'Test Student' },
        plan: { id: 'plan-1', name: 'All-Access' },
      });

      mockPrisma.subscription.update.mockResolvedValue({
        id: 'sub-123',
        status: 'ACTIVE',
        current_period_end: new Date(futureDate.getTime() + 15 * 24 * 60 * 60 * 1000),
      });

      mockPrisma.student.update.mockResolvedValue({});
      mockPrisma.subscriptionRenewal.create.mockResolvedValue({});
      mockPrisma.accountAuditLog.create.mockResolvedValue({});

      const result = await service.executeSubscriptionAction('sub-123', 'EXTEND', { days: 15 });

      expect(result.success).toBe(true);
      expect(result.action).toBe('EXTEND');
      expect(mockPrisma.subscriptionRenewal.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            subscription_id: 'sub-123',
            status: 'MANUAL',
          }),
        })
      );
      expect(mockPrisma.accountAuditLog.create).toHaveBeenCalled();
    });
  });
});
