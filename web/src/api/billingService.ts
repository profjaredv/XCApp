import { axiosInstance } from './axios';

export interface BillingStatus {
  plan: 'pending' | 'active' | 'past_due' | 'canceled';
  checkoutCompletedAt: string | null;
}

export const billingService = {
  /** The webhook (not the browser tab) flips plan — poll this after returning from Stripe. */
  async getStatus(): Promise<BillingStatus> {
    const response = await axiosInstance.get<BillingStatus>('/billing/status');
    return response.data;
  },
};
