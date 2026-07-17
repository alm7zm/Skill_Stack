import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '../dictionaries';
import { isLocale } from '@/lib/i18n';
import { Logo } from '@/components/app/logo';
import { LanguageSwitcher } from '@/components/app/language-switcher';

/**
 * Chrome shared by /auth and /auth/update.
 *
 * Auth deliberately sits outside the (app) group — the signed-in nav would be
 * wrong here. But that also meant it inherited no language switcher, so the one
 * page you can reach before choosing anything was the one page you could not
 * switch language on. This puts it back without pulling in the rest of the nav.
 */
export default async function AuthLayout({
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
    <div className="relative flex min-h-dvh flex-col">
      <div className="paper-grid paper-grid-fade absolute inset-0" aria-hidden="true" />

      <header className="relative mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6">
        <Logo href={`/${lang}`} size="md" />
        <LanguageSwitcher current={lang} label={dict.a11y.switchLanguage} />
      </header>

      <main id="main" className="relative flex flex-1 items-center justify-center px-6 pb-20">
        <div className="w-full max-w-sm">
          {children}

          <p className="mt-8 text-center text-xs text-ink-faint">
            <Link href={`/${lang}`} className="transition-colors hover:text-ink">
              {dict.common.back}
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
