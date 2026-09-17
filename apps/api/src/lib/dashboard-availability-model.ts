export interface DashboardAvailabilityModel {
  modelId: 'honda-beat' | 'tuktuk';
  modelName: 'Honda Beat' | 'TukTuk';
  isScooter: boolean;
}

/**
 * The operating fleet has two customer-facing vehicle types. Some fleet rows
 * still point at legacy/duplicate model records, so the dashboard must not use
 * the raw model ID as its display grouping key.
 */
export function getDashboardAvailabilityModel(modelName: string): DashboardAvailabilityModel {
  const normalizedName = modelName.toLowerCase();
  const isTuktuk =
    normalizedName.includes('tuktuk') ||
    normalizedName.includes('tuk-tuk') ||
    normalizedName.includes('tuk tuk') ||
    normalizedName.includes('bajaj') ||
    normalizedName.includes('tvs');

  if (isTuktuk) {
    return { modelId: 'tuktuk', modelName: 'TukTuk', isScooter: false };
  }

  return { modelId: 'honda-beat', modelName: 'Honda Beat', isScooter: true };
}
