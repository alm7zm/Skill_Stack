'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { interpolate } from '@/lib/utils';
import { normalizeWeeks } from '@/lib/plan/reconcile';
import { savePlan } from '@/app/[lang]/(app)/plan/actions';
import type { Locale } from '@/lib/i18n';
import type { LearningResource } from '@/lib/types';
import type { EditablePlan, EditableWeek, EditableTopic } from '@/lib/plan/types';

type Labels = {
  newTitle: string; editTitle: string; summary: string; summaryPlaceholder: string;
  targetDate: string; week: string; weekTitle: string; weekHours: string;
  reviewWeek: string; practiceExam: string; topicTitle: string; topicDescription: string;
  topicHours: string; addTopic: string; removeTopic: string; addWeek: string;
  removeWeek: string; moveUp: string; moveDown: string; duplicateTopic: string;
  resources: string; noResources: string; noTopics: string; save: string; saving: string;
  cancel: string;
  revise: { title: string; placeholder: string; button: string; revising: string; error: string; quota: string };
  unsaved: { title: string; body: string; discard: string; keep: string };
};

const emptyTopic = (): EditableTopic => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  estimatedHours: 1,
});

const emptyWeek = (n: number, title: string): EditableWeek => ({
  weekNumber: n,
  title,
  estimatedHours: 0,
  hasPracticeExam: false,
  isReviewWeek: false,
  resourceIds: [],
  topics: [emptyTopic()],
});

export function PlanEditor({
  lang,
  certId,
  planId,
  initialPlan,
  initialTargetDate,
  catalog,
  labels,
}: {
  lang: Locale;
  certId: string;
  planId?: string;
  initialPlan: EditablePlan;
  /** study_plans.target_date — a row field, not part of the plan jsonb. */
  initialTargetDate?: string;
  catalog: LearningResource[];
  labels: Labels;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<EditablePlan>(initialPlan);
  const [targetDate, setTargetDate] = useState(initialTargetDate ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [instruction, setInstruction] = useState('');
  const [revising, setRevising] = useState(false);
  const [reviseError, setReviseError] = useState<string>();
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  // The snapshot at mount; the draft is "dirty" when the plan or the target date
  // no longer matches what was loaded. Lazy state, not a ref: it is computed once
  // and read during render, which a ref may not be.
  const [initialJson] = useState(() => JSON.stringify(initialPlan));
  const dirty =
    JSON.stringify(plan) !== initialJson || targetDate !== (initialTargetDate ?? '');

  // Mutating helpers keep weekNumber sequential so display and save agree.
  const setWeeks = (weeks: EditableWeek[]) => setPlan((p) => ({ ...p, weeks: normalizeWeeks(weeks) }));
  const patchWeek = (i: number, patch: Partial<EditableWeek>) =>
    setWeeks(plan.weeks.map((w, wi) => (wi === i ? { ...w, ...patch } : w)));
  const patchTopic = (wi: number, ti: number, patch: Partial<EditableTopic>) =>
    patchWeek(wi, {
      topics: plan.weeks[wi].topics.map((t, i) => (i === ti ? { ...t, ...patch } : t)),
    });
  const move = <T,>(arr: T[], from: number, to: number): T[] => {
    if (to < 0 || to >= arr.length) return arr;
    const copy = [...arr];
    const [x] = copy.splice(from, 1);
    copy.splice(to, 0, x);
    return copy;
  };

  async function onSave() {
    setError(undefined);
    setSaving(true);
    // savePlan redirects on success; only failures return here.
    const res = await savePlan({
      lang,
      planId,
      certId,
      summary: plan.summary,
      recommended: plan.recommended,
      targetDate, // '' clears the date; the schema accepts '' or YYYY-MM-DD
      weeks: plan.weeks,
    });
    if (res && 'error' in res) {
      setError(res.error);
      setSaving(false);
    }
  }

  async function onRevise() {
    const text = instruction.trim();
    if (!text || revising) return;
    setReviseError(undefined);
    setRevising(true);
    try {
      const r = await fetch('/api/advisor/plan/edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ certId, locale: lang, instruction: text, plan }),
      });
      if (!r.ok) {
        if (r.status === 429) {
          const b = await r.json().catch(() => ({}));
          setReviseError(interpolate(labels.revise.quota, { seconds: String(Number(b?.retryAfter) || 0) }));
        } else {
          setReviseError(labels.revise.error);
        }
        return;
      }
      const { plan: revised } = (await r.json()) as { plan: EditablePlan };
      setPlan({ ...revised, weeks: normalizeWeeks(revised.weeks) });
      setInstruction('');
    } catch {
      setReviseError(labels.revise.error);
    } finally {
      setRevising(false);
    }
  }

  function onCancel() {
    if (dirty) setConfirmDiscard(true);
    else router.back();
  }

  return (
    <div className="mx-auto max-w-4xl px-6 py-10">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {planId ? labels.editTitle : labels.newTitle}
      </h1>

      {/* Summary + target date */}
      <div className="mt-6 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{labels.summary}</span>
          <textarea
            value={plan.summary ?? ''}
            onChange={(e) => setPlan((p) => ({ ...p, summary: e.target.value }))}
            placeholder={labels.summaryPlaceholder}
            rows={2}
            className="rounded-md border border-rule bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong"
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-ink">{labels.targetDate}</span>
          <input
            type="date"
            value={targetDate}
            onChange={(e) => setTargetDate(e.target.value)}
            className="h-10 w-56 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink hover:border-rule-strong"
          />
        </label>
      </div>

      {/* Weeks */}
      <div className="mt-8 flex flex-col gap-6">
        {plan.weeks.map((week, wi) => (
          <section key={wi} className="rounded-lg border border-rule bg-paper-raised p-5">
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule pb-3">
              <span className="tabular font-display text-sm font-semibold text-accent">
                {interpolate(labels.week, { n: String(week.weekNumber) })}
              </span>
              <div className="flex items-center gap-1">
                <IconBtn label={labels.moveUp} onClick={() => setWeeks(move(plan.weeks, wi, wi - 1))}>↑</IconBtn>
                <IconBtn label={labels.moveDown} onClick={() => setWeeks(move(plan.weeks, wi, wi + 1))}>↓</IconBtn>
                <IconBtn label={labels.removeWeek} onClick={() => setWeeks(plan.weeks.filter((_, i) => i !== wi))}>✕</IconBtn>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-3">
              <input
                aria-label={labels.weekTitle}
                value={week.title}
                onChange={(e) => patchWeek(wi, { title: e.target.value })}
                placeholder={labels.weekTitle}
                className="h-9 min-w-56 flex-1 rounded-md border border-rule bg-paper px-3 text-sm text-ink"
              />
              <input
                aria-label={labels.weekHours}
                type="number"
                min={0}
                value={week.estimatedHours}
                onChange={(e) => patchWeek(wi, { estimatedHours: Number(e.target.value) })}
                className="tabular h-9 w-20 rounded-md border border-rule bg-paper px-3 text-sm text-ink"
              />
              <label className="flex items-center gap-1.5 text-sm text-ink-muted">
                <input type="checkbox" checked={week.isReviewWeek} onChange={(e) => patchWeek(wi, { isReviewWeek: e.target.checked })} />
                {labels.reviewWeek}
              </label>
              <label className="flex items-center gap-1.5 text-sm text-ink-muted">
                <input type="checkbox" checked={week.hasPracticeExam} onChange={(e) => patchWeek(wi, { hasPracticeExam: e.target.checked })} />
                {labels.practiceExam}
              </label>
            </div>

            {/* Topics */}
            <ul className="mt-4 flex flex-col gap-3">
              {week.topics.length === 0 && <li className="text-xs text-ink-faint">{labels.noTopics}</li>}
              {week.topics.map((topic, ti) => (
                <li key={topic.id} className="rounded-md border border-rule/60 bg-paper p-3">
                  <div className="flex flex-wrap gap-2">
                    <input
                      aria-label={labels.topicTitle}
                      value={topic.title}
                      onChange={(e) => patchTopic(wi, ti, { title: e.target.value })}
                      placeholder={labels.topicTitle}
                      className="h-9 min-w-48 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink"
                    />
                    <input
                      aria-label={labels.topicHours}
                      type="number"
                      min={0}
                      value={topic.estimatedHours}
                      onChange={(e) => patchTopic(wi, ti, { estimatedHours: Number(e.target.value) })}
                      className="tabular h-9 w-20 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink"
                    />
                    <IconBtn label={labels.moveUp} onClick={() => patchWeek(wi, { topics: move(week.topics, ti, ti - 1) })}>↑</IconBtn>
                    <IconBtn label={labels.moveDown} onClick={() => patchWeek(wi, { topics: move(week.topics, ti, ti + 1) })}>↓</IconBtn>
                    <IconBtn
                      label={labels.duplicateTopic}
                      onClick={() =>
                        patchWeek(wi, {
                          topics: [
                            ...week.topics.slice(0, ti + 1),
                            { ...topic, id: crypto.randomUUID() },
                            ...week.topics.slice(ti + 1),
                          ],
                        })
                      }
                    >⧉</IconBtn>
                    <IconBtn label={labels.removeTopic} onClick={() => patchWeek(wi, { topics: week.topics.filter((_, i) => i !== ti) })}>✕</IconBtn>
                  </div>
                  <textarea
                    aria-label={labels.topicDescription}
                    value={topic.description}
                    onChange={(e) => patchTopic(wi, ti, { description: e.target.value })}
                    placeholder={labels.topicDescription}
                    rows={2}
                    className="mt-2 w-full rounded-md border border-rule bg-paper-raised px-3 py-2 text-sm text-ink placeholder:text-ink-faint"
                  />
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={() => patchWeek(wi, { topics: [...week.topics, emptyTopic()] })}
              className="mt-3 text-sm font-medium text-accent hover:underline"
            >
              + {labels.addTopic}
            </button>

            {/* Resource picker */}
            <ResourcePicker
              catalog={catalog}
              selected={week.resourceIds}
              onToggle={(id) =>
                patchWeek(wi, {
                  resourceIds: week.resourceIds.includes(id)
                    ? week.resourceIds.filter((x) => x !== id)
                    : [...week.resourceIds, id],
                })
              }
              labels={{ title: labels.resources, empty: labels.noResources }}
            />
          </section>
        ))}
      </div>

      <button
        type="button"
        onClick={() =>
          setWeeks([
            ...plan.weeks,
            emptyWeek(plan.weeks.length + 1, interpolate(labels.week, { n: String(plan.weeks.length + 1) })),
          ])
        }
        className="mt-6 rounded-md border border-rule bg-paper-raised px-4 py-2 text-sm font-medium text-ink hover:border-rule-strong"
      >
        + {labels.addWeek}
      </button>

      {/* Revise with advisor */}
      <section className="mt-10 rounded-lg border border-rule bg-paper-sunken p-5">
        <h2 className="text-sm font-semibold text-ink">{labels.revise.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={labels.revise.placeholder}
            disabled={revising}
            maxLength={2000}
            className="h-10 min-w-64 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint"
          />
          <Button type="button" variant="secondary" onClick={onRevise} disabled={revising || !instruction.trim()}>
            {revising ? labels.revise.revising : labels.revise.button}
          </Button>
        </div>
        {reviseError && <p role="alert" className="mt-2 text-sm text-danger">{reviseError}</p>}
      </section>

      {/* Save / cancel */}
      {error && <p role="alert" className="mt-6 rounded-sm bg-danger-wash px-3 py-2 text-sm text-danger">{error}</p>}
      <div className="mt-6 flex items-center gap-3">
        <Button type="button" onClick={() => void onSave()} disabled={saving}>
          {saving ? labels.saving : labels.save}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{labels.cancel}</Button>
      </div>

      {confirmDiscard && (
        <ConfirmDialog
          labels={labels.unsaved}
          onKeep={() => setConfirmDiscard(false)}
          onDiscard={() => router.back()}
        />
      )}
    </div>
  );
}

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-md border border-rule bg-paper text-ink-muted hover:border-rule-strong hover:text-ink"
    >
      {children}
    </button>
  );
}

function ResourcePicker({
  catalog,
  selected,
  onToggle,
  labels,
}: {
  catalog: { id: string; title: string; provider: string; free: boolean }[];
  selected: string[];
  onToggle: (id: string) => void;
  labels: { title: string; empty: string };
}) {
  return (
    <section className="mt-4 border-t border-rule pt-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-ink-faint">{labels.title}</h3>
      {catalog.length === 0 ? (
        <p className="mt-2 text-xs text-ink-faint">{labels.empty}</p>
      ) : (
        <ul className="mt-2 flex max-h-56 flex-col gap-1 overflow-y-auto">
          {catalog.map((r) => (
            <li key={r.id}>
              <label className="flex items-center gap-2 rounded-sm px-1 py-1 text-sm text-ink">
                <input type="checkbox" checked={selected.includes(r.id)} onChange={() => onToggle(r.id)} />
                <span className="truncate">{r.title}</span>
                <span className="ms-auto shrink-0 text-xs text-ink-faint">{r.provider}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ConfirmDialog({
  labels,
  onKeep,
  onDiscard,
}: {
  labels: { title: string; body: string; discard: string; keep: string };
  onKeep: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 px-6" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-lg border border-rule bg-paper-raised p-6 shadow-float">
        <h2 className="font-display text-lg font-semibold text-ink">{labels.title}</h2>
        <p className="mt-2 text-sm text-ink-muted">{labels.body}</p>
        <div className="mt-5 flex justify-end gap-3">
          <Button type="button" variant="ghost" onClick={onKeep}>{labels.keep}</Button>
          <Button type="button" onClick={onDiscard}>{labels.discard}</Button>
        </div>
      </div>
    </div>
  );
}
