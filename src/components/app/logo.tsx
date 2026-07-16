import Image from 'next/image';
import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Lockup: the books mark from the original artwork + the wordmark set live in
 * Fraunces.
 *
 * public/logo.png is a 825x496 vertical stack whose wordmark would render ~5px
 * tall in a nav bar, and it is opaque — its cream background only disappears on
 * an exactly matching surface. public/logo-mark.png is that same artwork cropped
 * to the mark and alpha-masked, so it sits on any surface and the wordmark can
 * be real text: selectable, translatable, sharp, and it inherits the type scale.
 */
export function Logo({
  href,
  size = 'md',
  showWordmark = true,
  className,
}: {
  href?: string;
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  className?: string;
}) {
  const marks = { sm: 'h-5', md: 'h-7', lg: 'h-10' };
  const words = { sm: 'text-sm', md: 'text-base', lg: 'text-xl' };

  const inner = (
    <>
      <Image
        src="/logo-mark.png"
        alt=""
        width={528}
        height={316}
        priority
        className={cn('w-auto', marks[size])}
      />
      {showWordmark && (
        <span
          className={cn(
            'font-display font-semibold tracking-tight text-ink',
            words[size]
          )}
        >
          SkillStack
        </span>
      )}
    </>
  );

  const classes = cn('inline-flex items-center gap-2', className);

  // The mark is decorative (alt="") because the wordmark next to it already
  // names the brand. With the wordmark hidden, the link needs its own label.
  return href ? (
    <Link href={href} className={classes} aria-label={showWordmark ? undefined : 'SkillStack'}>
      {inner}
    </Link>
  ) : (
    <span className={classes}>{inner}</span>
  );
}
