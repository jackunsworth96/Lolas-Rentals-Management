const formatter = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const numberOnlyPhp = new Intl.NumberFormat('en-PH', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** Numeric part only (no ₱) — pair with a Lato-wrapped ₱ span where Alegreya lacks the glyph. */
export function formatPhpNumber(amount: number): string {
  return numberOnlyPhp.format(amount);
}

export function formatCurrency(amount: number): string {
  return formatter.format(amount);
}

export function parseCurrency(value: string): number {
  return Number(value.replace(/[₱,\s]/g, '')) || 0;
}
