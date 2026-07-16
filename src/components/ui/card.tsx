import { cn } from '@/lib/utils';

/**
 * Cards lift by getting *lighter* than the page, not by stacking a border and a
 * grey shadow on white — that combination is the generic card look. The border
 * here is darkened paper, and the shadow carries the paper hue.
 *
 * `interactive` is opt-in: elevation should mean something, so a static
 * container does not get hover motion.
 */
export function Card({
  interactive = false,
  as: Tag = 'div',
  className,
  children,
  ...props
}: {
  interactive?: boolean;
  as?: 'div' | 'article' | 'section' | 'li';
  className?: string;
  children: React.ReactNode;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag
      className={cn(
        // `relative` so children can use a stretched link (after:absolute inset-0).
        'relative bg-paper-raised border border-rule rounded-lg',
        interactive && [
          'transition-[transform,box-shadow,border-color] duration-200',
          'hover:-translate-y-0.5 hover:shadow-float hover:border-rule-strong',
          'focus-within:-translate-y-0.5 focus-within:shadow-float',
        ],
        className
      )}
      {...props}
    >
      {children}
    </Tag>
  );
}

/** Inner elements sit tighter than their container — radius varies by depth. */
export function CardWell({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('bg-paper-sunken rounded-sm border border-rule/60', className)}>
      {children}
    </div>
  );
}
