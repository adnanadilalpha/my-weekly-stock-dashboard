'use client';

import { cn } from '@/app/components/ui/utils';

type Props = {
  /** Square mark or full wordmark. */
  variant?: 'mark' | 'wordmark';
  /**
   * Use light-surface assets (default).
   * Set `false` on black/dark backgrounds (white mark / original wordmark).
   */
  onLight?: boolean;
  className?: string;
  alt?: string;
};

/**
 * MWS brand assets.
 * - mark: `/mws-mark.svg` on light, `/mws-mark-white.svg` on dark
 * - wordmark: `/logo-on-light.svg` on light, `/logo.svg` on dark
 *
 * Note: do not use `/icon.svg` as a public URL — `app/icon.svg` is reserved
 * for the Next.js favicon route and conflicts with `public/icon.svg`.
 */
export function MwsLogo({
  variant = 'mark',
  onLight = true,
  className,
  alt = 'My Weekly Stock',
}: Props) {
  const src =
    variant === 'wordmark'
      ? onLight
        ? '/logo-on-light.svg'
        : '/logo.svg'
      : onLight
        ? '/mws-mark.svg'
        : '/mws-mark-white.svg';

  return (
    // eslint-disable-next-line @next/next/no-img-element -- SVG brand assets; avoid next/image SVG quirks
    <img
      src={src}
      alt={alt}
      className={cn(
        variant === 'wordmark' ? 'h-8 w-auto object-contain' : 'h-8 w-8 object-contain',
        className,
      )}
      decoding="async"
    />
  );
}
