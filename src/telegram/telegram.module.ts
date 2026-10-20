import { Module } from '@nestjs/common';
import { TelegramController } from './telegram.controller.js';
import { TelegramService } from './telegram.service.js';

import { PaymentsModule } from '../payments/payments.module.js';
import { SalesAgentModule } from '../sales-agent/sales-agent.module.js';

// Navigation handlers
import { RouterService } from './navigation/router.service.js';
import { MainMenuHandler } from './navigation/main-menu.handler.js';
import { LatestCourseHandler } from './navigation/latest-course.handler.js';
import { CoursesHandler } from './navigation/courses.handler.js';
import { CategoriesHandler } from './navigation/categories.handler.js';
import { AccountHandler } from './navigation/account.handler.js';
import { HelpHandler } from './navigation/help.handler.js';
import { ContentDeliveryHandler } from './content/content-delivery.handler.js';

@Module({
  imports: [PaymentsModule, SalesAgentModule],
  controllers: [TelegramController],
  providers: [
    TelegramService,
    RouterService,
    MainMenuHandler,
    LatestCourseHandler,
    CoursesHandler,
    CategoriesHandler,
    AccountHandler,
    HelpHandler,
    ContentDeliveryHandler
  ]
})
export class TelegramModule {}
