export function cashupPaymentCategory(paymentType: string, paymentMethodId: string): 'online' | 'cash' | 'card' | 'gcash' | 'bank' {
  if (paymentType.toLowerCase() === 'card_xendit') return 'online';
  const method = paymentMethodId.toLowerCase().replace(/[\s_-]/g, '');
  if (method === 'cash') return 'cash';
  if (method === 'card' || method === 'creditcard' || method === 'debitcard') return 'card';
  if (method === 'gcash' || method === 'paymaya') return 'gcash';
  return 'bank';
}

export function cashupCustomerName(customerName: string | null | undefined, rawBookingName: string | null | undefined): string | null {
  return customerName?.trim() || rawBookingName?.trim() || null;
}
