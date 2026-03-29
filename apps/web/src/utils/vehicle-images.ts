import hondaBeatImg from '../assets/Honda Beat Image.png';
import tukTukImg from '../assets/TukTuk Image.png';

export const MODEL_IMAGES: Record<string, string> = {
  'honda-beat': hondaBeatImg,
  'honda beat': hondaBeatImg,
  tuktuk: tukTukImg,
  'tuk-tuk': tukTukImg,
  'tuk tuk': tukTukImg,
};

export function resolveImage(modelName: string): string | null {
  const lower = modelName.toLowerCase();
  for (const [key, src] of Object.entries(MODEL_IMAGES)) {
    if (lower.includes(key)) return src;
  }
  return null;
}
