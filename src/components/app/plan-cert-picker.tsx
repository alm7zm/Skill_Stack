'use client';

import { useState } from 'react';
import Link from 'next/link';
import type { Locale } from '@/lib/i18n';

/**
 * Searchable certification list for starting a plan. Instant client-side filter
 * over the ~30 certs — no round-trip per keystroke. A cert that already has a plan
 * links to that plan (one plan per cert) and is tagged, rather than opening a
 * second blank editor.
 */
export function PlanCertPicker({
  lang,
  certs,
  planByCert,
  labels,
}: {
  lang: Locale;
  certs: { id: string; name: string; provider: string }[];
  planByCert: Record<string, string>;
  labels: { search: string; planned: string; noMatch: string };
}) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const filtered = needle
    ? certs.filter(
        (c) => c.name.toLowerCase().includes(needle) || c.provider.toLowerCase().includes(needle)
      )
    : certs;

  return (
    <div className="mt-6">
      <input
        type="search"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={labels.search}
        aria-label={labels.search}
        className="h-10 w-full rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
      />

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-ink-faint">{labels.noMatch}</p>
      ) : (
        <ul className="mt-4 flex flex-col divide-y divide-rule border-y border-rule">
          {filtered.map((c) => {
            const planId = planByCert[c.id];
            const href = planId ? `/${lang}/plan/${planId}` : `/${lang}/plan/new/${c.id}`;
            return (
              <li key={c.id}>
                <Link
                  href={href}
                  className="flex items-center justify-between gap-4 py-3 text-sm transition-colors hover:text-accent"
                >
                  <span className="font-medium text-ink">{c.name}</span>
                  <span className="flex items-center gap-3">
                    {planId && (
                      <span className="rounded-xs bg-accent-wash px-1.5 py-0.5 text-xs font-medium text-accent">
                        {labels.planned}
                      </span>
                    )}
                    <span className="text-xs text-ink-faint">{c.provider}</span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
