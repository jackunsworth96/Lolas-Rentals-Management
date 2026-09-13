import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-router-dom', () => ({
  Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
}));

import { OrderSummaryPanel } from '../src/components/basket/OrderSummaryPanel.js';

describe('OrderSummaryPanel', () => {
  it('renders the shared surcharge and grand total without surcharging the transfer', () => {
    const markup = renderToStaticMarkup(
      <OrderSummaryPanel
        basket={[{
          holdId: 'hold-1',
          vehicleModelId: 'model-1',
          modelName: 'Local Beat',
          dailyRate: 1000,
          securityDeposit: 500,
          expiresAt: '2026-10-01T09:15:00+08:00',
        }]}
        rentalDays={1}
        pricing={{
          vehicleSubtotal: 1000,
          addonsTotal: 0,
          pickupFee: 0,
          dropoffFee: 0,
          rentalDiscount: 0,
          deliveryDiscount: 0,
          surchargeAmount: 30,
          transferFee: 500,
          charityDonation: 0,
          deposit: 500,
          grandTotal: 1530,
          appliedPartnerBenefit: {
            applied: false,
            pendingReason: null,
            daysShort: 0,
            rentalDiscount: 0,
            freeDelivery: false,
            earlyBird: false,
          },
        }}
        paymentMethodId="xendit-card"
        onPaymentChange={() => {}}
        paymentMethods={[]}
        surchargePercent={3}
        onPlaceOrder={() => {}}
        submitting={false}
        isMdUp
      />,
    );

    expect(markup).toContain('Card Surcharge (3%)');
    expect(markup).toContain('>30.00</span>');
    expect(markup).toContain('Transfer Fee');
    expect(markup).toContain('>1,530.00</span>');
    expect(markup).not.toContain('>45.00</span>');
  });
});
