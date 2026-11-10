import { demoStore, type PaymentEntry } from '../store/demoStore';
import { mockDelay } from './delay';

/** Block / capture / release. In the pilot this is a payment gateway with a UPI block. */
export interface PaymentService {
  /** Ask the passenger to approve a block (simulated approval screen in the demo). */
  requestBlock(amount: number): Promise<{ approved: boolean; reference: string }>;
  status(orderId: string): Promise<PaymentEntry | null>;
}

export class MockPaymentService implements PaymentService {
  async requestBlock(amount: number) {
    await mockDelay();
    return { approved: amount > 0, reference: `SIM-${Date.now().toString(36).toUpperCase()}` };
  }
  async status(orderId: string) {
    await mockDelay();
    return demoStore.getState().payments[orderId] ?? null;
  }
}

// shortcut: capture and release are settled inside the store's runMarket/cancel; move them here when a real gateway exists.
export const paymentService: PaymentService = new MockPaymentService();
