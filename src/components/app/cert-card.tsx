import Link from 'next/link';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { DifficultyMeter } from '@/components/ui/difficulty-meter';
import { formatCurrency, formatStudyTime } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';
import type { Certification } from '@/lib/types';

/**
 * One card definition, used by home and search. The old build inlined this
 * markup separately in every page that listed certifications.
 *
 * Certification.color is deliberately ignored: the catalog carries a per-cert
 * brand hex, and honouring it would put 30+ accents on one grid.
 */
export function CertCard({
  cert,
  lang,
  labels,
}: {
  cert: Certification;
  lang: Locale;
  labels: {
    category: string;
    difficulty: string;
    free: string;
    // Plural form maps, not fixed words — see formatStudyTime.
    hours: Record<string, string>;
    weeks: Record<string, string>;
  };
}) {
  return (
    <Card as="article" interactive className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-3">
        <Badge>{labels.category}</Badge>
        {cert.free && <Badge tone="accent">{labels.free}</Badge>}
      </div>

      <h3 className="mt-3 font-display text-lg font-semibold leading-snug text-ink">
        {/* Stretched link: the whole card is the hit target, but only the title
            is announced as the link. */}
        <Link href={`/${lang}/certification/${cert.id}`} className="after:absolute after:inset-0">
          {cert.name}
        </Link>
      </h3>

      <p className="mt-1 text-xs text-ink-faint">{cert.provider}</p>

      <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-ink-muted">
        {cert.description}
      </p>

      {/* Pinned to the bottom so the meta row lines up across cards of
          different title lengths. */}
      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 pt-5">
        <DifficultyMeter difficulty={cert.difficulty} label={labels.difficulty} />
        <span className="tabular text-xs text-ink-muted">
          {formatStudyTime(cert.estimatedStudyHours, lang, {
            hours: labels.hours,
            weeks: labels.weeks,
          })}
        </span>
        <span className="tabular ms-auto text-xs font-medium text-ink">
          {cert.examCost === 0
            ? labels.free
            : formatCurrency(cert.examCost, lang, cert.examCostCurrency)}
        </span>
      </div>
    </Card>
  );
}
