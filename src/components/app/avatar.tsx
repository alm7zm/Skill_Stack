import Image from 'next/image';
import { cn } from '@/lib/utils';

/**
 * Squircle, not a circle — circular avatars are the default everywhere.
 * Falls back to initials when there is no avatar_url.
 *
 * Replaces the old shell's hardcoded "U" in a gradient circle, which showed the
 * same letter for every user because no user was ever loaded.
 */
export function Avatar({
  name,
  email,
  src,
  size = 32,
  className,
}: {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const label = name || email || '?';
  const initials = (name ?? email ?? '?')
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');

  return src ? (
    /**
     * unoptimized, deliberately. Two reasons, and the first is a crash:
     *
     * 1. next/image rejects any remote host missing from images.remotePatterns
     *    — it throws "Invalid src prop", which the route error boundary catches,
     *    so the whole page dies. Google hands out avatars on
     *    lh3.googleusercontent.com, so signing in with Google broke every signed-in
     *    page. unoptimized skips the loader entirely (see generateImgAttrs), so
     *    there is no host to allow-list and no list to keep updating when another
     *    provider is added.
     * 2. There is nothing to optimize. Google already serves this at the exact
     *    size we asked for (the =s96-c suffix) and we draw it at 32px. Optimising
     *    it would proxy every user's avatar through our server and re-encode it,
     *    which costs latency and money to save nothing.
     *
     * width/height stay, so the box is reserved and the layout does not shift.
     */
    <Image
      src={src}
      alt={label}
      width={size}
      height={size}
      unoptimized
      className={cn('rounded-md object-cover', className)}
    />
  ) : (
    <span
      aria-label={label}
      role="img"
      className={cn(
        'inline-flex select-none items-center justify-center rounded-md',
        'bg-accent-wash text-accent font-medium',
        className
      )}
      style={{ width: size, height: size, fontSize: size * 0.4 }}
    >
      {initials || '?'}
    </span>
  );
}
