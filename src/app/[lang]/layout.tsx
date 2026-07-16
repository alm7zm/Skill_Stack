import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Fraunces, Geist, IBM_Plex_Sans_Arabic } from 'next/font/google';
import '../globals.css';
import { getDictionary } from './dictionaries';
import { dirOf, isLocale, locales } from '@/lib/i18n';

/**
 * Fonts are self-hosted by next/font — no render-blocking @import, no CLS.
 * Fraunces has no Arabic subset (latin/latin-ext/vietnamese only), which is why
 * Plex Arabic covers both display and body in ar. See globals.css [dir="rtl"].
 */
const fraunces = Fraunces({
  subsets: ['latin'],
  variable: '--font-fraunces',
  display: 'swap',
});

const geist = Geist({
  subsets: ['latin'],
  variable: '--font-geist',
  display: 'swap',
});

const plexArabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-plex-arabic',
  display: 'swap',
});

export function generateStaticParams() {
  return locales.map((lang) => ({ lang }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>;
}): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);

  return {
    title: dict.meta.title,
    description: dict.meta.description,
    openGraph: {
      title: dict.meta.title,
      description: dict.meta.description,
      type: 'website',
      locale: lang,
    },
    alternates: {
      canonical: `/${lang}`,
      languages: Object.fromEntries(locales.map((l) => [l, `/${l}`])),
    },
  };
}

export default async function RootLayout({
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
    <html
      lang={lang}
      dir={dirOf(lang)}
      // Next 16 stopped overriding scroll-behavior during navigation. Without
      // this, our global `scroll-behavior: smooth` would make every route change
      // slow-scroll to the top instead of snapping.
      data-scroll-behavior="smooth"
      className={`${fraunces.variable} ${geist.variable} ${plexArabic.variable}`}
    >
      <body>
        <a href="#main" className="skip-link">
          {dict.a11y.skipToContent}
        </a>
        {children}
      </body>
    </html>
  );
}
