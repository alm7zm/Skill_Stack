import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '../dictionaries';
import { isLocale } from '@/lib/i18n';
import { Logo } from '@/components/app/logo';

/** Legal pages need a way back — otherwise the footer links are a dead end. */
export default async function LegalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo href={`/${lang}`} size="md" />
          <Link
            href={`/${lang}`}
            className="text-sm text-ink-muted transition-colors hover:text-ink"
          >
            {dict.common.back}
          </Link>
        </div>
      </header>

      <main id="main" className="flex-1">
        {children}
      </main>

      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-6xl items-center gap-6 px-6 py-6 text-sm text-ink-muted">
          <Link href={`/${lang}/privacy`} className="hover:text-ink transition-colors">
            {dict.footer.privacy}
          </Link>
          <Link href={`/${lang}/terms`} className="hover:text-ink transition-colors">
            {dict.footer.terms}
          </Link>
        </div>
      </footer>
    </div>
  );
}
