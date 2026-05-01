import { Cloudinary } from '@cloudinary/url-gen';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { auto as autoFormat } from '@cloudinary/url-gen/qualifiers/format';
import { auto as autoQuality } from '@cloudinary/url-gen/qualifiers/quality';

export const cld = new Cloudinary({
  cloud: {
    cloudName: 'dk3c78pro',
  },
});

/**
 * Bump this when partner logos are replaced in Cloudinary (same public ID) so
 * browsers and intermediaries fetch the new file instead of a stale cache.
 */
export const PARTNER_LOGO_CACHE_BUST = '3';

export function buildCloudinaryImageUrl(publicId: string, cacheBust?: string): string {
  const base = cld
    .image(publicId)
    .delivery(format(autoFormat()))
    .delivery(quality(autoQuality()))
    .toURL();
  if (!cacheBust) return base;
  const u = new URL(base);
  u.searchParams.set('cb', cacheBust);
  return u.toString();
}

export function partnerMarqueeImageUrl(publicId: string): string {
  return buildCloudinaryImageUrl(publicId, PARTNER_LOGO_CACHE_BUST);
}
