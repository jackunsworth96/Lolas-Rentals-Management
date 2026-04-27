import type { ComponentProps, ImgHTMLAttributes } from 'react';
import { AdvancedImage, lazyload, responsive, placeholder } from '@cloudinary/react';
import { format, quality } from '@cloudinary/url-gen/actions/delivery';
import { auto as autoFormat } from '@cloudinary/url-gen/qualifiers/format';
import { auto as autoQuality } from '@cloudinary/url-gen/qualifiers/quality';
import { cld } from '../../lib/cloudinary.js';

const DEFAULT_PLUGINS = [lazyload(), responsive(), placeholder({ mode: 'blur' })];

type Props = Omit<ImgHTMLAttributes<HTMLImageElement>, 'src'> & {
  publicId: string;
  /** Override the default plugin set. Pass `[]` for UI chrome (e.g. nav icons)
   *  so AdvancedImage sets src immediately from the cldImg URL — no deferred
   *  measurement, no placeholder, no layout collapse during animations. */
  plugins?: ComponentProps<typeof AdvancedImage>['plugins'];
};

export function CloudinaryImage({
  publicId,
  className,
  alt = '',
  width,
  height,
  plugins = DEFAULT_PLUGINS,
  ...rest
}: Props) {
  const img = cld
    .image(publicId)
    .delivery(format(autoFormat()))
    .delivery(quality(autoQuality()));

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
