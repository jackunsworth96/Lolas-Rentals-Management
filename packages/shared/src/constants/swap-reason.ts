export const SWAP_REASON_CATEGORIES = [
  'vehicle_fault',
  'damage',
  'customer_request',
  'admin_correction',
  'other',
] as const;

export type SwapReasonCategory = (typeof SWAP_REASON_CATEGORIES)[number];

export const SWAP_REASON_CATEGORY_LABELS: Record<SwapReasonCategory, string> = {
  vehicle_fault: 'Vehicle fault (breakdown, won\u2019t start, flat, brakes)',
  damage: 'Damage (mirror, crash guard, rack)',
  customer_request: 'Customer request',
  admin_correction: 'Wrong vehicle picked / data correction',
  other: 'Other',
};
