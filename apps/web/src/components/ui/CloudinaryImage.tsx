import { useMemo, type ComponentProps, type ImgHTMLAttributes } from 'react';
import { AdvancedImage, lazyload, responsive, placeholder } from '@cloudinary/react';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { auto as autoFormat } from '@cloudinary/url-gen/qualifiers/format';
import { auto as autoQuality } from '@cloudinary/url-gen/qualifiers/quality';
import { buildCloudinaryImageUrl, cld } from '../../lib/cloudinary.js';

const DEFAULT_PLUGINS = [lazyload(), responsive(), placeholder({ mode: 'blur' })];

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  publicId: string;
  /** Appended as query `cb=` so updated assets at the same public ID are not stuck behind browser cache. */
  cacheBust?: string;
  /** Override the default plugin set. Pass `[]` for UI chrome (e.g. nav icons)
   *  so AdvancedImage sets src immediately from the cldImg URL — no deferred
   *  measurement, no placeholder, no layout collapse during animations. */
  plugins?: ComponentProps<typeof AdvancedImage>['plugins'];
};

export function CloudinaryImage({
  publicId,
  cacheBust,
  className,
  alt = '',
  width,
  height,
  plugins = DEFAULT_PLUGINS,
  ...rest
}: Props) {
  const img = useMemo(
    () =>
      cld
        .image(publicId)
        .delivery(format(autoFormat()))
        .delivery(quality(autoQuality())),
    [publicId],
  );

  if (cacheBust) {
    return (
      <img
        src={buildCloudinaryImageUrl(publicId, cacheBust)}
        className={className}
        alt={alt}
        width={width}
        height={height}
        loading="lazy"
        decoding="async"
        {...rest}
      />
    );
  }

  return (
    <AdvancedImage
      cldImg={img}
      plugins={plugins}
      className={className}
      alt={alt}
      width={width}
      height={height}
      {...rest}
    />
  );
}

export { responsive, lazyload, placeholder };
