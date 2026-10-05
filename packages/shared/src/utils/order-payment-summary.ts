export interface OrderPaymentAmount {
  paymentType?: string | null;
  paymentMethodId?: string | null;
  settlementStatus?: string | null;
  amount?: number | string | null;
}

export interface OrderPaymentSummary {
  rentalPaid: number;
  depositCollected: number;
  depositRefunded: number;
  depositHeld: number;
  pendingExtensions: number;
}

export function summarizeOrderPayments(payments: readonly OrderPaymentAmount[]): OrderPaymentSummary {
  let rentalCents = 0;
  let collectedCents = 0;
  let refundedCents = 0;
  let pendingExtensionCents = 0;

  for (const payment of payments) {
    const amountCents = Math.round(Number(payment.amount ?? 0) * 100);
    if (!Number.isFinite(amountCents)) continue;
    const type = payment.paymentType ?? '';
    if (type === 'deposit' || type === 'security_deposit') {
      collectedCents += amountCents;
    } else if (type === 'deposit_refund') {
      refundedCents += amountCents;
    } else if (type === 'refund') {
      rentalCents -= amountCents;
    } else if (type === 'extension' && payment.settlementStatus === 'pending') {
      pendingExtensionCents += amountCents;
    } else if (type === 'extension' && payment.settlementStatus === 'absorbed') {
      continue;
    } else if (type === 'addon'
      && ['pending', 'xendit'].includes(payment.paymentMethodId ?? '')
      && ['pending', 'absorbed'].includes(payment.settlementStatus ?? '')) {
      continue;
    } else {
      rentalCents += amountCents;
    }
  }

  return {
    rentalPaid: rentalCents / 100,
    depositCollected: collectedCents / 100,
    depositRefunded: refundedCents / 100,
    depositHeld: Math.max(0, collectedCents - refundedCents) / 100,
    pendingExtensions: pendingExtensionCents / 100,
  };
}
