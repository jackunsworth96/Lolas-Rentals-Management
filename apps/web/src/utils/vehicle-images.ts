import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client.js';

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

interface UploadedVehicleImages {
  modelId: string;
  modelName: string;
  urls: string[];
}

export function useUploadedVehicleImages() {
  return useQuery<UploadedVehicleImages[]>({
    queryKey: ['public-vehicle-images'],
    queryFn: () => api.get<UploadedVehicleImages[]>('/public/booking/vehicle-images'),
    staleTime: 10 * 60_000,
  });
}

/**
 * Main picture for a vehicle model: the first picture uploaded in Settings,
 * otherwise the built-in Cloudinary image. Usable as CloudinaryImage's publicId.
 */
export function useVehiclePublicId(modelName: string | null | undefined): string | null {
  const { data } = useUploadedVehicleImages();
  if (!modelName) return null;
  const lower = modelName.toLowerCase();
  const uploaded = data?.find((m) => m.modelName.toLowerCase() === lower || m.modelId.toLowerCase() === lower);
  return uploaded?.urls[0] ?? resolvePublicId(modelName);
}
