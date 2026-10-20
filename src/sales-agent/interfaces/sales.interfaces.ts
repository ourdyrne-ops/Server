export enum SalesConversationState {
  START = 'START',
  LANGUAGE_SELECTION = 'LANGUAGE_SELECTION',
  CUSTOMER_TYPE = 'CUSTOMER_TYPE',
  BUNDLE_OVERVIEW = 'BUNDLE_OVERVIEW',
  BUNDLE_DETAILS = 'BUNDLE_DETAILS',
  FAQ_MENU = 'FAQ_MENU',
  FAQ_ANSWER = 'FAQ_ANSWER',
  CHECKOUT_PENDING = 'CHECKOUT_PENDING',
  PAYMENT_PROCESSING = 'PAYMENT_PROCESSING',
  PROVISIONING = 'PROVISIONING',
  ACTIVATION_PENDING = 'ACTIVATION_PENDING',
  COMPLETED = 'COMPLETED',
  EXISTING_CUSTOMER_LINK = 'EXISTING_CUSTOMER_LINK',
}

export enum CustomerType {
  NEW_CUSTOMER = 'NEW_CUSTOMER',
  EXISTING_CUSTOMER = 'EXISTING_CUSTOMER',
}

export enum FunnelEventType {
  LEAD_TRIGGERED = 'LEAD_TRIGGERED',
  LANGUAGE_SELECTED = 'LANGUAGE_SELECTED',
  CUSTOMER_TYPE_SELECTED = 'CUSTOMER_TYPE_SELECTED',
  BUNDLE_VIEWED = 'BUNDLE_VIEWED',
  FAQ_VIEWED = 'FAQ_VIEWED',
  CHECKOUT_INITIATED = 'CHECKOUT_INITIATED',
  PRE_CHECKOUT_VALIDATED = 'PRE_CHECKOUT_VALIDATED',
  PAYMENT_SUCCESS = 'PAYMENT_SUCCESS',
  PROVISIONING_STARTED = 'PROVISIONING_STARTED',
  PROVISIONING_COMPLETED = 'PROVISIONING_COMPLETED',
  ACTIVATION_COMPLETED = 'ACTIVATION_COMPLETED',
  RENEWAL_CONVERTED = 'RENEWAL_CONVERTED',
  REFUND_REQUESTED = 'REFUND_REQUESTED',
}

export interface TelegramUser {
  id: number | bigint;
  is_bot: boolean;
  first_name: string;
  last_name?: string;
  username?: string;
  language_code?: string;
}

export interface TelegramChat {
  id: number | string;
  type: 'private' | 'group' | 'supergroup' | 'channel';
  title?: string;
  username?: string;
}

export interface TelegramMessage {
  message_id: number;
  from?: TelegramUser;
  chat: TelegramChat;
  date: number;
  text?: string;
  entities?: Array<{ type: string; offset: number; length: number }>;
  successful_payment?: TelegramSuccessfulPayment;
}

export interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message?: TelegramMessage;
  data?: string;
}

export interface TelegramPreCheckoutQuery {
  id: string;
  from: TelegramUser;
  currency: string;
  total_amount: number;
  invoice_payload: string;
  shipping_option_id?: string;
  order_info?: any;
}

export interface TelegramSuccessfulPayment {
  currency: string;
  total_amount: number;
  invoice_payload: string;
  shipping_option_id?: string;
  order_info?: any;
  telegram_payment_charge_id: string;
  provider_payment_charge_id: string;
}

export interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
  pre_checkout_query?: TelegramPreCheckoutQuery;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
  pay?: boolean;
}

export interface InlineKeyboardMarkup {
  inline_keyboard: InlineKeyboardButton[][];
}
