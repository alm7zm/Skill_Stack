import Link from 'next/link';
import { Logo } from '@/components/app/logo';

/**
 * The old build had no custom 404 — a bad link landed on the Next.js default.
 *
 * This file cannot read [lang]: not-found renders for unmatched routes, where
 * params are unavailable. It is bilingual by showing both languages rather than
 * guessing wrong.
 */
export default function NotFound() {
  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <div className="paper-grid paper-grid-fade absolute inset-0" aria-hidden="true" />

      <div className="relative">
        <Logo size="lg" showWordmark={false} className="mb-8 justify-center opacity-40" />

        <p className="tabular font-display text-6xl font-semibold text-rule-strong">404</p>

        <h1 className="mt-4 font-display text-2xl font-semibold text-ink">
          That page isn&rsquo;t here
        </h1>
        <p className="mt-2 text-sm text-ink-muted">The link may be old, or the page may have moved.</p>

        <p className="mt-6 font-display text-2xl font-semibold text-ink" lang="ar" dir="rtl">
          هذه الصفحة غير موجودة
        </p>
        <p className="mt-2 text-sm text-ink-muted" lang="ar" dir="rtl">
          قد يكون الرابط قديمًا، أو نُقلت الصفحة.
        </p>

        <div className="mt-8 flex items-center justify-center gap-3">
          <Link
            href="/en"
            className="rounded-md border border-rule bg-paper-raised px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-rule-strong"
          >
            Go home
          </Link>
          <Link
            href="/ar"
            lang="ar"
            className="rounded-md border border-rule bg-paper-raised px-4 py-2 text-sm font-medium text-ink transition-colors hover:border-rule-strong"
          >
            إلى الرئيسية
          </Link>
        </div>
      </div>
    </div>
  );
}
