export const VEHICLE_PUBLIC_IDS: Record<string, string> = {
  'honda-beat': 'Honda_Beat_Image_bzjlmh',
  'honda beat': 'Honda_Beat_Image_bzjlmh',
  tuktuk: 'TukTuk_Image_ddycxe',
  'tuk-tuk': 'TukTuk_Image_ddycxe',
  'tuk tuk': 'TukTuk_Image_ddycxe',
};

export function resolvePublicId(modelName: string): string | null {
  const lower = modelName.toLowerCase();
  for (const [key, id] of Object.entries(VEHICLE_PUBLIC_IDS)) {
    if (lower.includes(key)) return id;
  }
  return null;
}
