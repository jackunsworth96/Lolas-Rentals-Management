export const CATEGORY_MAP: Record<string, string> = {
  // slugs (legacy)
  food: 'Food & Drink',
  food_drink: 'Food & Drink',
  cafe: 'Food & Drink',
  activity: 'Activities',
  activities: 'Activities',
  service: 'Services',
  services: 'Services',
  shopping: 'Shopping',
  // display labels as stored in DB
  'Food & Drink': 'Food & Drink',
  'Activities': 'Activities',
  'Services': 'Services',
  'Shopping': 'Shopping',
};

export const FILTER_TABS = ['All', 'Food & Drink', 'Activities', 'Services', 'Shopping'] as const;
export type FilterTab = (typeof FILTER_TABS)[number];

export function getInitials(name: string | null | undefined): string {
  const words = (name ?? '').trim().split(/\s+/);
  if (words.length === 1) return (words[0]?.[0] ?? '?').toUpperCase();
  return ((words[0]?.[0] ?? '') + (words[1]?.[0] ?? '')).toUpperCase();
}
