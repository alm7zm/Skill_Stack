import { cn } from '@/lib/utils';

/**
 * Skeletons match the shape of what is loading. A centred spinner tells the user
 * nothing about what is coming; a skeleton that matches the layout also stops
 * the page shifting when content lands.
 *
 * The shimmer is a background-position animation (compositor-friendly) and is
 * disabled by the prefers-reduced-motion block in globals.css.
 */
export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn('rounded-sm bg-paper-sunken animate-pulse', className)}
    />
  );
}

/** Mirrors CertCard's layout so nothing jumps on load. */
export function CertCardSkeleton() {
  return (
    <div className="rounded-lg border border-rule bg-paper-raised p-5">
      <Skeleton className="h-4 w-20" />
      <Skeleton className="mt-3 h-5 w-4/5" />
      <Skeleton className="mt-2 h-5 w-3/5" />
      <div className="mt-5 flex gap-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-3 w-16" />
      </div>
    </div>
  );
}

export function CertGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }, (_, i) => (
        <CertCardSkeleton key={i} />
      ))}
    </div>
  );
}
