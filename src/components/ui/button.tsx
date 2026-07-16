import Link from 'next/link';
import { cn } from '@/lib/utils';

type Variant = 'primary' | 'secondary' | 'ghost' | 'link';
type Size = 'sm' | 'md' | 'lg';

/**
 * Four variants, not the usual filled-plus-ghost pair — a tertiary text link
 * carries low-priority actions without adding another boxed button to the page.
 */
const variants: Record<Variant, string> = {
  primary:
    'bg-accent text-paper hover:bg-accent-hover shadow-raised hover:shadow-float',
  secondary:
    'bg-paper-raised text-ink border border-rule hover:border-rule-strong hover:bg-paper',
  ghost: 'text-ink-muted hover:text-ink hover:bg-paper-sunken',
  link: 'text-accent underline decoration-accent/30 underline-offset-4 hover:decoration-accent p-0',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm gap-1.5',
  md: 'h-10 px-4 text-sm gap-2',
  lg: 'h-12 px-6 text-base gap-2',
};

const base = cn(
  'inline-flex items-center justify-center rounded-md font-medium',
  'transition-[background-color,border-color,box-shadow,transform] duration-200',
  // Physical press feedback. Transform only — never width/height.
  'active:scale-[0.98]',
  'disabled:pointer-events-none disabled:opacity-50'
);

type Common = { variant?: Variant; size?: Size; className?: string; children: React.ReactNode };

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...props
}: Common & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(base, variants[variant], variant !== 'link' && sizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  children,
  href,
  ...props
}: Common & { href: string } & Omit<React.ComponentProps<typeof Link>, 'href' | 'className'>) {
  return (
    <Link
      href={href}
      className={cn(base, variants[variant], variant !== 'link' && sizes[size], className)}
      {...props}
    >
      {children}
    </Link>
  );
}
