import { Module } from '@nestjs/common';
import { SalesAgentController } from './sales-agent.controller.js';
import { SalesAgentService } from './sales-agent.service.js';
import { TriggerHandler } from './handlers/trigger.handler.js';
import { LanguageHandler } from './handlers/language.handler.js';
import { CustomerTypeHandler } from './handlers/customer-type.handler.js';
import { BundleDemoHandler } from './handlers/bundle-demo.handler.js';
import { FaqHandler } from './handlers/faq.handler.js';
import { PaymentHandler } from './handlers/payment.handler.js';
import { StarsPaymentService } from './payment/stars-payment.service.js';
import { ProvisioningService } from './provisioning/provisioning.service.js';
import { ServiceBotBridgeService } from './service-bridge/service-bot-bridge.service.js';
import { SalesAnalyticsService } from './analytics/sales-analytics.service.js';
import { SalesRetentionService } from './retention/sales-retention.service.js';

@Module({
  controllers: [SalesAgentController],
  providers: [
    SalesAgentService,
    TriggerHandler,
    LanguageHandler,
    CustomerTypeHandler,
    BundleDemoHandler,
    FaqHandler,
    PaymentHandler,
    StarsPaymentService,
    ProvisioningService,
    ServiceBotBridgeService,
    SalesAnalyticsService,
    SalesRetentionService,
  ],
  exports: [
    SalesAgentService,
    ServiceBotBridgeService,
    ProvisioningService,
    StarsPaymentService,
    SalesAnalyticsService,
  ],
})
export class SalesAgentModule {}
