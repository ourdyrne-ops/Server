export type PaymentIntentStatus =
  | 'CREATED'
  | 'PENDING'
  | 'PAID'
  | 'FAILED'
  | 'REFUNDED'
  | 'EXPIRED';

export type InvoiceMode = 'sendInvoice' | 'createInvoiceLink';

export interface TelegramApiResponse<T = any> {
  ok: boolean;
  result?: T;
  error_code?: number;
  description?: string;
}

export interface TelegramUser {
  id: number | bigint;
  is_bot?: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface LabeledPrice {
  label: string;
  amount: number; // For XTR (Stars), integer amount of stars
}

export interface PreCheckoutQuery {
  id: string;
  from: TelegramUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
  shipping_option_id?: string;
  order_info?: any;
}

export interface SuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  telegram_payment_charge_id: string;
  provider_payment_charge_id?: string;
  shipping_option_id?: string;
  order_info?: any;
  subscription_expiration_date?: number;
  is_recurring?: boolean;
  is_first_recurring?: boolean;
}

export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from?: TelegramUser;
    chat: { id: number | bigint; type: string };
    date: number;
    text?: string;
    successful_payment?: SuccessfulPayment;
    [key: string]: any;
  };
  pre_checkout_query?: PreCheckoutQuery;
  callback_query?: {
    id: string;
    from: TelegramUser;
    message?: any;
    data?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

export interface CreatePaymentIntentParams {
  telegramUserId: bigint | number | string;
  studentId?: string;
  planId?: string;
  amount?: number;
  isRenewal?: boolean;
}

export interface PaymentIntentDto {
  id: string;
  telegramUserId: string;
  studentId?: string | null;
  planId: string;
  currency: 'XTR';
  amount: number;
  status: PaymentIntentStatus;
  payload: string;
  invoiceLink?: string | null;
  isRenewal: boolean;
  createdAt: Date;
  expiresAt: Date;
}

export interface StarsHealthStatus {
  telegramApi: 'OK' | 'ERROR';
  bot: 'OK' | 'ERROR';
  webhook: 'OK' | 'ERROR' | 'NOT_SET';
  database: 'OK' | 'ERROR';
  starsConfiguration: 'OK' | 'ERROR';
  mode: 'test' | 'production';
  invoiceMode: InvoiceMode;
  botUsername?: string;
  configuredStarsAmount: number;
  details?: Record<string, any>;
}

export interface StarsPaymentResult {
  success: boolean;
  reason?: string;
  paymentId?: string;
  subscriptionId?: string;
  validUntil?: Date;
  isRenewal?: boolean;
  isDuplicate?: boolean;
  error?: string;
}

export interface StarsRefundResult {
  success: boolean;
  refundId?: string;
  paymentId: string;
  telegramRefundOk?: boolean;
  amount: number;
  currency: string;
  reason?: string;
  error?: string;
}
