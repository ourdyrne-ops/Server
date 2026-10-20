import { Injectable, Logger } from '@nestjs/common';
import type { TelegramApiResponse } from './telegram-stars.types.js';

@Injectable()
export class TelegramApiService {
  private readonly logger = new Logger(TelegramApiService.name);

  getBotToken(): string {
    return process.env.TELEGRAM_BOT_TOKEN || '';
  }

  isTestMode(): boolean {
    const mode = process.env.TELEGRAM_STARS_MODE || process.env.TELEGRAM_MODE;
    return mode?.toLowerCase() === 'test';
  }

  getBaseUrl(): string {
    const token = this.getBotToken();
    if (!token) return '';
    // Telegram Bot API standard test environment vs production
    const isTest = this.isTestMode();
    return isTest
      ? `https://api.telegram.org/bot${token}/test`
      : `https://api.telegram.org/bot${token}`;
  }

  /**
   * Generic centralized Telegram API wrapper.
   * Normalizes errors and never leaks secrets in logs.
   */
  async call<T = any>(
    method: string,
    payload?: Record<string, any>,
  ): Promise<TelegramApiResponse<T>> {
    const token = this.getBotToken();
    if (!token) {
      this.logger.warn(`[TELEGRAM_API] Suppression: TELEGRAM_BOT_TOKEN not configured. Method: ${method}`);
      return {
        ok: false,
        error_code: 401,
        description: 'TELEGRAM_BOT_TOKEN is not configured in .env',
      };
    }

    const baseUrl = this.getBaseUrl();
    const url = `${baseUrl}/${method}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: payload ? JSON.stringify(payload) : undefined,
      });

      const data = (await response.json()) as TelegramApiResponse<T>;

      if (!data.ok) {
        this.logger.error(
          `[TELEGRAM_API] Error calling ${method}: code=${data.error_code}, desc="${data.description}"`,
        );
      }

      return data;
    } catch (err: any) {
      this.logger.error(`[TELEGRAM_API] Network failure calling ${method}: ${err.message}`);
      return {
        ok: false,
        error_code: 500,
        description: err.message || 'Network error communicating with Telegram API',
      };
    }
  }

  async getMe() {
    return this.call('getMe');
  }

  async getWebhookInfo() {
    return this.call('getWebhookInfo');
  }

  async setWebhook(url: string, secretToken?: string, allowedUpdates?: string[]) {
    const payload: Record<string, any> = { url };
    if (secretToken) {
      payload.secret_token = secretToken;
    }
    if (allowedUpdates && allowedUpdates.length > 0) {
      payload.allowed_updates = allowedUpdates;
    }
    return this.call('setWebhook', payload);
  }

  async deleteWebhook() {
    return this.call('deleteWebhook');
  }

  async sendMessage(
    chatId: string | number | bigint,
    text: string,
    parseMode: string = 'HTML',
    replyMarkup?: any,
  ) {
    const payload: Record<string, any> = {
      chat_id: chatId.toString(),
      text,
      parse_mode: parseMode,
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    return this.call('sendMessage', payload);
  }

  /**
   * Creates an invoice link via Telegram Bot API createInvoiceLink.
   * Returns a direct Telegram invoice URL (e.g., https://t.me/$...)
   */
  async createInvoiceLink(params: {
    title: string;
    description: string;
    payload: string;
    currency: string;
    prices: Array<{ label: string; amount: number }>;
    subscription_period?: number;
    start_parameter?: string;
  }): Promise<TelegramApiResponse<string>> {
    const body: Record<string, any> = {
      title: params.title.slice(0, 32),
      description: params.description.slice(0, 255),
      payload: params.payload,
      provider_token: '', // Mandatory empty string for Telegram Stars (XTR)
      currency: params.currency || 'XTR',
      prices: params.prices,
    };

    if (params.subscription_period) {
      body.subscription_period = params.subscription_period;
    }
    if (params.start_parameter) {
      body.start_parameter = params.start_parameter;
    }

    return this.call<string>('createInvoiceLink', body);
  }

  /**
   * Sends an invoice directly to the chat using Telegram Bot API sendInvoice.
   */
  async sendInvoice(params: {
    chat_id: string | number | bigint;
    title: string;
    description: string;
    payload: string;
    currency: string;
    prices: Array<{ label: string; amount: number }>;
    subscription_period?: number;
    start_parameter?: string;
    reply_markup?: any;
  }) {
    const body: Record<string, any> = {
      chat_id: params.chat_id.toString(),
      title: params.title.slice(0, 32),
      description: params.description.slice(0, 255),
      payload: params.payload,
      provider_token: '', // Mandatory empty string for Telegram Stars (XTR)
      currency: params.currency || 'XTR',
      prices: params.prices,
    };

    if (params.subscription_period) {
      body.subscription_period = params.subscription_period;
    }
    if (params.start_parameter) {
      body.start_parameter = params.start_parameter;
    }
    if (params.reply_markup) {
      body.reply_markup = params.reply_markup;
    }

    return this.call('sendInvoice', body);
  }

  /**
   * Answers a Telegram Stars pre_checkout_query.
   * If ok is true, Telegram allows the user to complete payment.
   * If ok is false, Telegram displays error_message to the user.
   */
  async answerPreCheckoutQuery(
    preCheckoutQueryId: string,
    ok: boolean = true,
    errorMessage?: string,
  ) {
    const body: Record<string, any> = {
      pre_checkout_query_id: preCheckoutQueryId,
      ok,
    };
    if (!ok && errorMessage) {
      body.error_message = errorMessage;
    }
    return this.call('answerPreCheckoutQuery', body);
  }

  /**
   * Refunds a Telegram Stars payment using official refundStarPayment API.
   * Requires Telegram user_id and telegram_payment_charge_id.
   */
  async refundStarPayment(userId: number | bigint, telegramPaymentChargeId: string) {
    return this.call('refundStarPayment', {
      user_id: Number(userId),
      telegram_payment_charge_id: telegramPaymentChargeId,
    });
  }
}
