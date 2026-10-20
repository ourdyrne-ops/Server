import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IS_PUBLIC_KEY } from '../../auth/decorators/public.decorator.js';

@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    // If it's an admin user, bypass subscription check
    if (user?.role === 'SUPER_ADMIN' || user?.role === 'ADMIN') {
      return true;
    }

    if (!user || !user.id) {
      throw new ForbiddenException('SUBSCRIPTION_REQUIRED');
    }

    // Check if the user is a test subscriber or has an active subscription
    const activeSub = await this.prisma.subscription.findFirst({
      where: {
        student_id: user.id,
        status: {
          in: ['ACTIVE', 'GRACE_PERIOD'],
        },
      },
    });

    if (activeSub || user.is_test_subscriber) { // is_test_subscriber logic can be implemented if added to DB
      return true;
    }

    throw new ForbiddenException('SUBSCRIPTION_REQUIRED');
  }
}
