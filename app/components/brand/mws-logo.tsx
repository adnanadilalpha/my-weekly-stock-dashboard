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
 * - mark: `/app_icon.svg` on light, `/mws-mark-white.svg` on dark (white + gold)
 * - wordmark: `/logo-on-light.svg` on light, `/logo.svg` on dark
 *
 * Favicon: `app/icon.svg` and metadata icons both mirror `/app_icon.svg`.
 * Do not put a conflicting `public/icon.svg` next to the App Router icon route.
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
        ? '/app_icon.svg'
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
