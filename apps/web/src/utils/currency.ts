const formatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatCurrency(amount: number): string {
  return formatter.format(amount);
}

export function parseCurrency(value: string): number {
  return Number(value.replace(/[₱,\s]/g, '')) || 0;
}
