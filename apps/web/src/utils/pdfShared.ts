import lolasLogoUrl from '../assets/Lolas Original Logo.svg';

const LOGO_ASPECT = 282.96 / 120.96;
export const LOGO_HEIGHT_MM = 16;
export const LOGO_WIDTH_MM = LOGO_HEIGHT_MM * LOGO_ASPECT;

export async function loadCompanyLogoPng(): Promise<string | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const w = img.naturalWidth || 378;
        const h = img.naturalHeight || 151;
        const scale = 3;
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/png'));
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = lolasLogoUrl;
  });
}

export function money(value: number): string {
  return `PHP ${value.toLocaleString('en-PH', { maximumFractionDigits: 2 })}`;
}

/** Always two decimals, for invoices and other financial documents. */
export function moneyExact(value: number): string {
  const sign = value < 0 ? '-' : '';
  return `${sign}PHP ${Math.abs(value).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
