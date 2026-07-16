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
    <Image
      src={src}
      alt={label}
      width={size}
      height={size}
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
