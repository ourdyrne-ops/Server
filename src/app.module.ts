import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { StudentsModule } from './students/students.module.js';
import { TelegramModule } from './telegram/telegram.module.js';
import { SubscriptionsModule } from './subscriptions/subscriptions.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { RefundsModule } from './refunds/refunds.module.js';
import { ContentModule } from './content/content.module.js';
import { SearchModule } from './search/search.module.js';
import { MediaModule } from './media/media.module.js';
import { ProgressModule } from './progress/progress.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { AdminModule } from './admin/admin.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { AuditModule } from './audit/audit.module.js';
import { AccountModule } from './account/account.module.js';
import { APP_GUARD } from '@nestjs/core';
import { AuthGuard } from './auth/guards/auth.guard.js';
import { SubscriptionGuard } from './subscriptions/guards/subscription.guard.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { JobsService } from './jobs/jobs.service.js';
import { SalesAgentModule } from './sales-agent/sales-agent.module.js';
import { StreamingModule } from './streaming/streaming.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    AuthModule,
    StudentsModule,
    TelegramModule,
    SubscriptionsModule,
    PaymentsModule,
    RefundsModule,
    ContentModule,
    SearchModule,
    MediaModule,
    ProgressModule,
    NotificationsModule,
    AdminModule,
    AnalyticsModule,
    AuditModule,
    AccountModule,
    PrismaModule,
    SalesAgentModule,
    StreamingModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: AuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SubscriptionGuard,
    },
    JobsService
  ],
})
export class AppModule {}
