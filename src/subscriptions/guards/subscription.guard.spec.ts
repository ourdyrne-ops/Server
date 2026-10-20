import { vi } from 'vitest';
import { SubscriptionGuard } from './subscription.guard.js';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

describe('SubscriptionGuard', () => {
  let guard: SubscriptionGuard;
  let reflectorMock: any;
  let prismaMock: any;
  let contextMock: any;

  beforeEach(() => {
    reflectorMock = {
      getAllAndOverride: vi.fn(),
    };
    
    prismaMock = {
      subscription: {
        findFirst: vi.fn(),
      },
    };

    contextMock = {
      getHandler: vi.fn(),
      getClass: vi.fn(),
      switchToHttp: vi.fn().mockReturnValue({
        getRequest: vi.fn().mockReturnValue({}),
      }),
    };

    guard = new SubscriptionGuard(reflectorMock as Reflector, prismaMock);
  });

  it('should allow if route is @Public', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(true);
    const result = await guard.canActivate(contextMock as ExecutionContext);
    expect(result).toBe(true);
  });

  it('should allow if user is SUPER_ADMIN or ADMIN', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    contextMock.switchToHttp().getRequest.mockReturnValue({ user: { role: 'ADMIN' } });
    
    const result = await guard.canActivate(contextMock as ExecutionContext);
    expect(result).toBe(true);
  });

  it('should throw ForbiddenException if user has no subscription', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    contextMock.switchToHttp().getRequest.mockReturnValue({ user: { id: 'student_1' } });
    prismaMock.subscription.findFirst.mockResolvedValue(null); // No active sub

    await expect(guard.canActivate(contextMock as ExecutionContext)).rejects.toThrow(ForbiddenException);
  });

  it('should allow if user has active subscription', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    contextMock.switchToHttp().getRequest.mockReturnValue({ user: { id: 'student_1' } });
    prismaMock.subscription.findFirst.mockResolvedValue({ status: 'ACTIVE' });

    const result = await guard.canActivate(contextMock as ExecutionContext);
    expect(result).toBe(true);
  });

  it('should allow if user has grace period subscription', async () => {
    reflectorMock.getAllAndOverride.mockReturnValue(false);
    contextMock.switchToHttp().getRequest.mockReturnValue({ user: { id: 'student_1' } });
    prismaMock.subscription.findFirst.mockResolvedValue({ status: 'GRACE_PERIOD' });

    const result = await guard.canActivate(contextMock as ExecutionContext);
    expect(result).toBe(true);
  });
});
