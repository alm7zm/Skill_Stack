import { notFound } from 'next/navigation';
import { getDictionary } from '../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { certifications, searchCertifications } from '@/lib/data/certifications';
import { DIFFICULTY_ORDER, plural } from '@/lib/utils';
import { CertCard } from '@/components/app/cert-card';
import { EmptyState } from '@/components/ui/empty-state';
import { Button, ButtonLink } from '@/components/ui/button';
import type { CertCategory, Difficulty } from '@/lib/types';

/**
 * Server component. Filtering runs through a plain <form method="get">, so it
 * works with JS disabled, every filter state is a shareable URL, and the back
 * button behaves. No client state, no useEffect, no filter library.
 */

const CATEGORIES: CertCategory[] = [
  'cloud',
  'ai',
  'cybersecurity',
  'networking',
  'programming',
  'data',
  'project-management',
  'devops',
];

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: string }>;
  searchParams: Promise<{ q?: string; category?: string; difficulty?: string }>;
}) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const { q = '', category = '', difficulty = '' } = await searchParams;
  const dict = await getDictionary(lang);
  const t = dict.search;

  // Reuse the catalog's own search helper rather than re-implementing matching.
  let results = q.trim() ? searchCertifications(q) : certifications;
  if (category) results = results.filter((c) => c.category === category);
  if (difficulty) results = results.filter((c) => c.difficulty === difficulty);

  const hasFilters = Boolean(q || category || difficulty);

  return (
    <div className="mx-auto max-w-6xl px-6 py-10">
      <header>
        <h1 className="font-display text-3xl font-semibold text-ink">{t.title}</h1>
        <p className="prose-measure mt-2 text-ink-muted">{t.subtitle}</p>
      </header>

      <form method="get" className="mt-8 flex flex-wrap items-end gap-3">
        <div className="flex min-w-56 flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="text-xs font-medium uppercase tracking-wider text-ink-faint">
            {dict.common.search}
          </label>
          <input
            id="q"
            name="q"
            type="search"
            defaultValue={q}
            placeholder={t.placeholder}
            className="h-10 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
          />
        </div>

        <Select
          id="category"
          label={t.filters.category}
          defaultValue={category}
          allLabel={t.filters.all}
          options={CATEGORIES.map((c) => ({ value: c, label: dict.categories[c] }))}
        />

        <Select
          id="difficulty"
          label={t.filters.difficulty}
          defaultValue={difficulty}
          allLabel={t.filters.all}
          options={DIFFICULTY_ORDER.map((d) => ({
            value: d,
            label: dict.difficulty[d as Difficulty],
          }))}
        />

        <Button type="submit" size="md">
          {dict.common.search}
        </Button>

        {hasFilters && (
          <ButtonLink href={`/${lang}/search`} variant="ghost" size="md">
            {t.filters.clear}
          </ButtonLink>
        )}
      </form>

      <p className="tabular mt-6 border-t border-rule pt-4 text-sm text-ink-muted">
        {plural(t.results, results.length, lang)}
      </p>

      {results.length === 0 ? (
        <EmptyState
          className="mt-6"
          title={t.empty.title}
          body={t.empty.body}
          cta={{ label: t.empty.cta, href: `/${lang}/search` }}
        />
      ) : (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {results.map((cert) => (
            <li key={cert.id} className="flex">
              <CertCard
                cert={cert}
                lang={lang}
                labels={{
                  category: dict.categories[cert.category],
                  difficulty: dict.difficulty[cert.difficulty],
                  free: dict.common.free,
                  hours: dict.common.hours,
                  weeks: dict.common.weeks,
                }}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Select({
  id,
  label,
  defaultValue,
  allLabel,
  options,
}: {
  id: string;
  label: string;
  defaultValue: string;
  allLabel: string;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium uppercase tracking-wider text-ink-faint">
        {label}
      </label>
      {/* Native select: free keyboard support, free mobile pickers, free RTL. */}
      <select
        id={id}
        name={id}
        defaultValue={defaultValue}
        className="h-10 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink hover:border-rule-strong"
      >
        <option value="">{allLabel}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
