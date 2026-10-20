export enum ProvisioningStatusEnum {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  RETRY_REQUIRED = 'RETRY_REQUIRED',
  FAILED = 'FAILED',
}

export interface ProvisioningRequest {
  orderId: string;
  orderNumber: string;
  telegramUserId: bigint | number;
  bundleId: string;
  bundleSlug: string;
  bundleName: string;
  durationDays: number;
  campaignId?: string;
  sessionId?: string;
}

export interface ProvisioningResult {
  jobId: string;
  status: ProvisioningStatusEnum;
  activationToken: string;
  activationLink: string;
  expiresAt: Date;
  attempts: number;
  error?: string;
}

export interface IProvisioningEngine {
  processProvisioning(req: ProvisioningRequest): Promise<ProvisioningResult>;
  retryFailedJob(jobId: string): Promise<ProvisioningResult>;
  getJobStatus(orderId: string): Promise<ProvisioningResult | null>;
}
