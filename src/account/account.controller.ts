import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { AccountService } from './account.service.js';
import { Public } from '../auth/decorators/public.decorator.js';
import type { Response } from 'express';

@Controller('account')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Public()
  @Get('overview')
  async getOverview(
    @Query('range') range?: string,
    @Query('customStart') customStart?: string,
    @Query('customEnd') customEnd?: string,
  ) {
    return this.accountService.getOverview(range, customStart, customEnd);
  }

  @Public()
  @Get('payments')
  async getPayments(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('provider') provider?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountService.getPayments({
      status,
      search,
      provider,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Public()
  @Get('payments/:id')
  async getPaymentById(@Param('id') id: string) {
    return this.accountService.getPaymentById(id);
  }

  @Public()
  @Get('refunds')
  async getRefunds(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountService.getRefunds({
      status,
      search,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Public()
  @Post('refunds/request')
  async requestRefund(
    @Body() body: { paymentId: string; reason?: string },
    @Req() req: any,
  ) {
    if (!body?.paymentId) {
      throw new BadRequestException('paymentId is required to issue refund');
    }
    const adminEmail = req.user?.email || 'admin@admin.com';
    return this.accountService.processRefund(body.paymentId, body.reason, adminEmail);
  }

  @Public()
  @Get('subscriptions')
  async getSubscriptions(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('expiringInDays') expiringInDays?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountService.getSubscriptions({
      status,
      search,
      expiringInDays: expiringInDays ? parseInt(expiringInDays, 10) : undefined,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Public()
  @Get('subscriptions/:id')
  async getSubscriptionById(@Param('id') id: string) {
    return this.accountService.getSubscriptionById(id);
  }

  @Public()
  @Post('subscriptions/:id/action')
  async executeSubscriptionAction(
    @Param('id') id: string,
    @Body() body: { action: 'RENEW' | 'EXTEND' | 'CANCEL' | 'SUSPEND' | 'REACTIVATE'; days?: number; reason?: string },
    @Req() req: any,
  ) {
    if (!body?.action) {
      throw new BadRequestException('action is required');
    }
    const adminEmail = req.user?.email || 'admin@admin.com';
    return this.accountService.executeSubscriptionAction(id, body.action, body, adminEmail);
  }

  @Public()
  @Get('renewals')
  async getRenewals(
    @Query('status') status?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountService.getRenewals({
      status,
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Public()
  @Get('failed-payments')
  async getFailedPayments(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountService.getFailedPayments({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Public()
  @Get('student-billing/:studentId')
  async getStudentBilling(@Param('studentId') studentId: string) {
    return this.accountService.getStudentBilling(studentId);
  }

  @Public()
  @Get('audit-logs')
  async getAuditLogs(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.accountService.getAuditLogs({
      page: page ? parseInt(page, 10) : 1,
      limit: limit ? parseInt(limit, 10) : 50,
    });
  }

  @Public()
  @Get('export/:type')
  async exportCsv(
    @Param('type') type: 'payments' | 'refunds' | 'subscriptions' | 'renewals',
    @Res() res: Response,
  ) {
    if (!['payments', 'refunds', 'subscriptions', 'renewals'].includes(type)) {
      throw new BadRequestException('Invalid export type. Supported: payments, refunds, subscriptions, renewals');
    }
    const csvContent = await this.accountService.exportCsv(type);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${type}_export_${Date.now()}.csv"`);
    res.send(csvContent);
  }
}
