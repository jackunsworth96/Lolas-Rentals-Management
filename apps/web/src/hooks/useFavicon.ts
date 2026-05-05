import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const CLOUDINARY_BASE = 'https://res.cloudinary.com/dk3c78pro/image/upload';
const CUSTOMER_IMAGE_PATH = 'v1777723254/Lola_s_Style_Guide_Creative_7_slfvlj.png';
const BACKOFFICE_IMAGE_PATH = 'v1777724927/Lola_s_Style_Guide_Creative_8_j1sv1c.png';

const CUSTOMER_THEME_COLOR = '#f1e6d6';
const BACKOFFICE_THEME_COLOR = '#14506e';

const CUSTOMER_PATH_PREFIXES = [
  '/book',
  '/waiver',
  '/refund-policy',
  '/peace-of-mind',
  '/unsubscribe',
  '/paw-card',
  '/affiliates',
];

function isBackOfficePath(pathname: string): boolean {
  if (pathname === '/') return false;
  return !CUSTOMER_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

const FAVICON_LINKS: Array<{ rel: string; size: number }> = [
  { rel: 'icon', size: 32 },
  { rel: 'icon', size: 16 },
  { rel: 'apple-touch-icon', size: 180 },
  { rel: 'icon', size: 192 },
  { rel: 'icon', size: 512 },
];

/** Mascot / tab sizes: modest inset so the 16×16 / 32×32 tabs stay legible. */
const TAB_ICON_INSET_RATIO = 0.62;
/**
 * Apple touch + 192/512: smaller art so circular “add to home screen” masks
 * do not clip (maskable safe zone).
 */
const LAUNCHER_ICON_INSET_RATIO = 0.48;

function cornerRadiusPx(size: number): number {
  return Math.max(2, Math.round(size * 0.12));
}

function customerFaviconTransform(size: number, insetRatio: number): string {
  const inner = Math.max(1, Math.round(size * insetRatio));
  const r = cornerRadiusPx(size);
  return `c_fit,w_${inner},h_${inner}/c_pad,w_${size},h_${size},b_rgb:ffffff,g_center,r_${r}`;
}

function backofficeFaviconTransform(size: number, insetRatio: number): string {
  const r = cornerRadiusPx(size);
  const inner = Math.max(1, Math.round(size * insetRatio));
  return `c_fit,w_${inner},h_${inner}/c_pad,w_${size},h_${size},b_rgb:14506e,g_center,r_${r}`;
}

function faviconTransforms(size: number, mode: 'customer' | 'backoffice'): string {
  const large = size >= 180;
  const insetRatio = large ? LAUNCHER_ICON_INSET_RATIO : TAB_ICON_INSET_RATIO;
  if (mode === 'customer') {
    return customerFaviconTransform(size, insetRatio);
  }
  if (large) {
    return backofficeFaviconTransform(size, insetRatio);
  }
  return `c_fill,w_${size},h_${size},r_${cornerRadiusPx(size)}`;
}

function injectPngFavicons(
  head: HTMLHeadElement,
  imagePath: string,
  mode: 'customer' | 'backoffice',
) {
  FAVICON_LINKS.forEach(({ rel, size }) => {
    const link = document.createElement('link');
    link.rel = rel;
    link.type = 'image/png';
    link.setAttribute('sizes', `${size}x${size}`);
    link.href = `${CLOUDINARY_BASE}/${faviconTransforms(size, mode)}/${imagePath}`;
    head.appendChild(link);
  });
}

function setManifest(isBackOffice: boolean) {
  const head = document.head;
  let link = head.querySelector<HTMLLinkElement>('link[rel="manifest"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'manifest';
    head.appendChild(link);
  }
  link.href = isBackOffice ? '/manifest-backoffice.json' : '/manifest.json';
}

function setThemeColor(isBackOffice: boolean) {
  let meta = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = isBackOffice ? BACKOFFICE_THEME_COLOR : CUSTOMER_THEME_COLOR;
}

function setFaviconLinks(isBackOffice: boolean) {
  const head = document.head;

  const existing = head.querySelectorAll(
    'link[rel="icon"], link[rel="apple-touch-icon"]',
  );
  existing.forEach((el) => el.remove());

  injectPngFavicons(
    head,
    isBackOffice ? BACKOFFICE_IMAGE_PATH : CUSTOMER_IMAGE_PATH,
    isBackOffice ? 'backoffice' : 'customer',
  );
}

/**
 * Swaps favicon icons, Web App Manifest, and theme-color based on whether
 * the current route is customer-facing or back-office. This ensures Android
 * Chrome reads the correct manifest (and therefore the correct home screen
 * icon) when the user adds either shortcut to their home screen.
 */
export function useFavicon() {
  const { pathname } = useLocation();

  useEffect(() => {
    const backOffice = isBackOfficePath(pathname);
    setFaviconLinks(backOffice);
    setManifest(backOffice);
    setThemeColor(backOffice);
  }, [pathname]);
}
