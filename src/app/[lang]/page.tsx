import Image from 'next/image';
import { notFound } from 'next/navigation';
import { getDictionary } from './dictionaries';
import { isLocale } from '@/lib/i18n';
import { ButtonLink } from '@/components/ui/button';
import { Logo } from '@/components/app/logo';
import { LanguageSwitcher } from '@/components/app/language-switcher';

/**
 * Server component — no "use client", no JS shipped. Reveals are CSS
 * scroll-driven animations (see globals.css).
 */

const PROVIDERS = ['AWS', 'Microsoft', 'Google Cloud', 'CompTIA', 'Cisco', 'PMI', 'CNCF', 'HashiCorp'];

export default async function LandingPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);
  const t = dict.landing;

  const features = [
    t.features.advisor,
    t.features.plans,
    t.features.resources,
    t.features.calendar,
    t.features.progress,
    t.features.catalog,
  ];

  const steps = [t.how.step1, t.how.step2, t.how.step3];

  return (
    <>
      {/* ================= NAV ================= */}
      <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Logo href={`/${lang}`} size="md" />
          <div className="flex items-center gap-2">
            <LanguageSwitcher current={lang} label={dict.a11y.switchLanguage} />
            <span className="mx-1 h-4 w-px bg-rule" aria-hidden="true" />
            <ButtonLink href={`/${lang}/auth`} variant="ghost" size="sm">
              {dict.nav.signIn}
            </ButtonLink>
            <ButtonLink href={`/${lang}/auth`} variant="primary" size="sm">
              {dict.nav.getStarted}
            </ButtonLink>
          </div>
        </div>
      </header>

      <main id="main">
        {/* ================= HERO =================
            Left-aligned and asymmetric: the mark bleeds off the right edge and
            overlaps the grid. Centred hero + centred subhead + centred button
            row is the most recognisable AI landing layout. */}
        <section className="relative overflow-hidden border-b border-rule">
          <div className="paper-grid paper-grid-fade absolute inset-0" aria-hidden="true" />

          <div className="relative mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 pb-20 pt-16 md:grid-cols-12 md:pb-28 md:pt-24">
            <div className="md:col-span-7">
              <p className="text-xs font-medium uppercase tracking-[0.14em] text-accent">
                {t.hero.eyebrow}
              </p>

              <h1 className="mt-5 font-display text-[2.75rem] font-semibold leading-[1.03] tracking-[-0.03em] text-ink sm:text-6xl lg:text-7xl">
                {t.hero.title}
              </h1>

              <p className="prose-measure mt-6 text-lg leading-relaxed text-ink-muted">
                {t.hero.body}
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-4">
                <ButtonLink href={`/${lang}/auth`} size="lg">
                  {t.hero.cta}
                </ButtonLink>
                <ButtonLink href={`/${lang}/search`} variant="link">
                  {t.hero.secondary}
                </ButtonLink>
              </div>
            </div>

            {/* Overlaps the text column and runs past the grid edge. */}
            <div className="pointer-events-none relative hidden md:col-span-5 md:block">
              <Image
                src="/logo-mark.png"
                alt=""
                width={528}
                height={316}
                priority
                className="absolute -end-16 top-2 w-[130%] max-w-none opacity-[0.07]"
              />
            </div>
          </div>

          {/* Providers: plain ruled labels. The old build gave each one a
              coloured dot — eight extra accents for decoration. */}
          <div className="relative border-t border-rule bg-paper-raised/60">
            <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-5">
              <span className="text-xs uppercase tracking-[0.12em] text-ink-faint">
                {t.hero.providers}
              </span>
              {PROVIDERS.map((p) => (
                <span key={p} className="font-display text-sm font-medium text-ink-muted">
                  {p}
                </span>
              ))}
            </div>
          </div>
        </section>

        {/* ================= FEATURES =================
            An editorial index — ruled rows, big serif numerals, text offset into
            an asymmetric 12-col grid. Deliberately not three equal cards. */}
        <section className="mx-auto max-w-6xl px-6 py-20 md:py-28">
          <h2 className="font-display text-3xl font-semibold text-ink md:text-4xl">
            {t.features.title}
          </h2>

          <ul className="mt-10 border-t border-rule">
            {features.map((feature, i) => (
              <li
                key={feature.title}
                className="reveal grid grid-cols-1 gap-x-8 gap-y-2 border-b border-rule py-8 md:grid-cols-12 md:py-10"
              >
                <div className="md:col-span-1">
                  <span className="tabular font-display text-sm font-semibold text-accent">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                </div>
                <div className="md:col-span-4">
                  <h3 className="font-display text-xl font-semibold text-ink">{feature.title}</h3>
                </div>
                <div className="md:col-span-6 md:col-start-7">
                  <p className="text-ink-muted leading-relaxed">{feature.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* ================= HOW IT WORKS ================= */}
        <section className="border-y border-rule bg-paper-raised/50">
          <div className="mx-auto max-w-6xl px-6 py-20 md:py-28">
            <h2 className="font-display text-3xl font-semibold text-ink md:text-4xl">
              {t.how.title}
            </h2>

            <ol className="mt-12 grid gap-12 md:grid-cols-3 md:gap-8">
              {steps.map((step, i) => (
                <li key={step.title} className="reveal relative">
                  <span
                    aria-hidden="true"
                    className="tabular block font-display text-6xl font-semibold leading-none text-rule-strong"
                  >
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <h3 className="mt-4 font-display text-xl font-semibold text-ink">{step.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ================= CTA ================= */}
        <section className="relative overflow-hidden">
          <div className="paper-grid absolute inset-0 opacity-60" aria-hidden="true" />
          <div className="relative mx-auto max-w-6xl px-6 py-20 md:py-28">
            <div className="md:max-w-2xl">
              <h2 className="font-display text-3xl font-semibold text-ink md:text-4xl">
                {t.cta.title}
              </h2>
              <p className="mt-3 text-lg text-ink-muted">{t.cta.body}</p>
              <ButtonLink href={`/${lang}/auth`} size="lg" className="mt-8">
                {t.cta.button}
              </ButtonLink>
            </div>
          </div>
        </section>
      </main>

      {/* ================= FOOTER =================
          Legal links were missing entirely from the old build. */}
      <footer className="border-t border-rule bg-paper-raised">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-10 md:flex-row md:items-center md:justify-between">
          <div>
            <Logo size="sm" />
            <p className="mt-2 text-xs text-ink-faint">{dict.footer.tagline}</p>
          </div>

          <nav className="flex items-center gap-6 text-sm text-ink-muted">
            <a href={`/${lang}/privacy`} className="hover:text-ink transition-colors">
              {dict.footer.privacy}
            </a>
            <a href={`/${lang}/terms`} className="hover:text-ink transition-colors">
              {dict.footer.terms}
            </a>
            <span className="text-xs text-ink-faint">
              © {new Date().getFullYear()} SkillStack. {dict.footer.rights}
            </span>
          </nav>
        </div>
      </footer>
    </>
  );
}
