import { axiosInstance } from './axios';

export interface BillingStatus {
  plan: 'pending' | 'active' | 'past_due' | 'canceled';
  checkoutCompletedAt: string | null;
}

export const billingService = {
  /** HEAD_COACH-only. Redirects to Stripe's hosted Checkout page, promo code field included. */
  async createCheckoutSession(): Promise<{ url: string }> {
    const response = await axiosInstance.post<{ url: string }>('/billing/checkout-session');
    return response.data;
  },

  /** The webhook (not the browser tab) flips plan — poll this after returning from Stripe. */
  async getStatus(): Promise<BillingStatus> {
    const response = await axiosInstance.get<BillingStatus>('/billing/status');
    return response.data;
  },
};
