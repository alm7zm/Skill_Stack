'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { interpolate } from '@/lib/utils';
import { normalizeWeeks, weekHours } from '@/lib/plan/reconcile';
import { MAX_INSTRUCTION_CHARS } from '@/lib/plan/schema';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ScheduleGrid, type ScheduleWindows } from '@/components/app/schedule-grid';
import { savePlan } from '@/app/[lang]/(app)/plan/actions';
import type { Locale } from '@/lib/i18n';
import type { LearningResource } from '@/lib/types';
import type { StudySchedule } from '@/lib/calendar/schedule';
import type { EditablePlan, EditableWeek, EditableTopic } from '@/lib/plan/types';

type ScheduleLabels = { title: string; body: string; from: string; to: string; timezoneNote: string };

type Labels = {
  newTitle: string; editTitle: string; intro: string; summary: string; summaryPlaceholder: string;
  targetDate: string; week: string; weekTitle: string; weekTitlePlaceholder: string; weekHours: string;
  reviewWeek: string; practiceExam: string; topics: string; topicTitle: string;
  topicTitlePlaceholder: string; topicDescription: string;
  topicHours: string; addTopic: string; removeTopic: string; addWeek: string;
  removeWeek: string; moveUp: string; moveDown: string; duplicateTopic: string;
  resources: string; noResources: string; noTopics: string; save: string; saving: string;
  cancel: string;
  revise: { title: string; placeholder: string; button: string; revising: string; error: string; quota: string; charCount: string };
  unsaved: { title: string; body: string; discard: string; keep: string };
};

const emptyTopic = (): EditableTopic => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  estimatedHours: 1,
});

const emptyWeek = (n: number): EditableWeek => ({
  weekNumber: n,
  title: '',
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
  initialSchedule,
  scheduleLabels,
  catalog,
  labels,
}: {
  lang: Locale;
  certId: string;
  planId?: string;
  initialPlan: EditablePlan;
  /** study_plans.target_date — a row field, not part of the plan jsonb. */
  initialTargetDate?: string;
  /** This plan's schedule (its own override, or the profile default prefill). */
  initialSchedule?: StudySchedule | null;
  /** When set (edit mode), the schedule section renders and saves with the plan. */
  scheduleLabels?: ScheduleLabels;
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

  // Schedule for this plan (edit mode only). weekday -> window; empty means "use
  // the profile default". Timezone is the browser's, detected once.
  const [scheduleWindows, setScheduleWindows] = useState<ScheduleWindows>(() =>
    Object.fromEntries((initialSchedule?.windows ?? []).map((w) => [w.day, { start: w.start, end: w.end }]))
  );
  const [scheduleTimezone] = useState(
    () => initialSchedule?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
  );
  const scheduleEntries = Object.entries(scheduleWindows)
    .map(([d, w]) => ({ day: Number(d), ...w }))
    .sort((a, b) => a.day - b.day);

  // The snapshot at mount; the draft is "dirty" when the plan, the target date, or
  // the schedule no longer matches what was loaded. Lazy state, not a ref: it is
  // computed once and read during render, which a ref may not be.
  const [initialJson] = useState(() => JSON.stringify(initialPlan));
  const [initialScheduleJson] = useState(() =>
    JSON.stringify((initialSchedule?.windows ?? []).map((w) => ({ day: w.day, start: w.start, end: w.end })))
  );
  const dirty =
    JSON.stringify(plan) !== initialJson ||
    targetDate !== (initialTargetDate ?? '') ||
    (!!scheduleLabels && JSON.stringify(scheduleEntries) !== initialScheduleJson);

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
      // Only in edit mode: an empty grid clears the override → profile default.
      ...(scheduleLabels ? { studySchedule: { windows: scheduleEntries, timezone: scheduleTimezone } } : {}),
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
      <p className="prose-measure mt-2 text-sm text-ink-muted">{labels.intro}</p>

      {/* Save / cancel at the top — delete lives on the plan view page, next to Edit. */}
      <div className="mt-6 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={() => void onSave()} disabled={saving}>
          {saving ? labels.saving : labels.save}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>{labels.cancel}</Button>
      </div>
      {error && (
        <p role="alert" className="mt-3 rounded-sm bg-danger-wash px-3 py-2 text-sm text-danger">
          {error}
        </p>
      )}

      {/* Revise with advisor — above the summary, so the fastest way to reshape a
          plan is the first thing offered. */}
      <section className="mt-6 rounded-lg border border-rule bg-paper-sunken p-5">
        <h2 className="text-sm font-semibold text-ink">{labels.revise.title}</h2>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder={labels.revise.placeholder}
            disabled={revising}
            maxLength={MAX_INSTRUCTION_CHARS}
            className="h-10 min-w-64 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint"
          />
          <Button type="button" variant="secondary" onClick={onRevise} disabled={revising || !instruction.trim()}>
            {revising ? labels.revise.revising : labels.revise.button}
          </Button>
        </div>
        <span
          title={labels.revise.charCount}
          className={`tabular mt-2 block text-end text-xs ${
            instruction.length >= MAX_INSTRUCTION_CHARS ? 'text-danger' : 'text-ink-faint'
          }`}
        >
          {instruction.length}/{MAX_INSTRUCTION_CHARS}
        </span>
        {reviseError && <p role="alert" className="mt-2 text-sm text-danger">{reviseError}</p>}
      </section>

      {/* Summary + target date */}
      <div className="mt-8 flex flex-col gap-4">
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

      {/* Study schedule for this plan — directly under the target date, above the
          weeks. Edit mode only; saved with the plan's single Save above. */}
      {scheduleLabels && planId && (
        <section className="mt-8" aria-labelledby="plan-schedule-heading">
          <h2 id="plan-schedule-heading" className="text-sm font-semibold text-ink">
            {scheduleLabels.title}
          </h2>
          <p className="prose-measure mt-1 text-xs leading-relaxed text-ink-faint">
            {scheduleLabels.body}
          </p>
          <div className="mt-3">
            <ScheduleGrid
              lang={lang}
              windows={scheduleWindows}
              onChange={setScheduleWindows}
              timezone={scheduleTimezone}
              labels={{
                from: scheduleLabels.from,
                to: scheduleLabels.to,
                timezoneNote: scheduleLabels.timezoneNote,
              }}
            />
          </div>
        </section>
      )}

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
                <button
                  type="button"
                  onClick={() => setWeeks(plan.weeks.filter((_, i) => i !== wi))}
                  className="ms-1 rounded-md px-2 py-1.5 text-xs font-medium text-danger hover:bg-danger-wash"
                >
                  {labels.removeWeek}
                </button>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-4">
              <label className="flex min-w-56 flex-1 flex-col gap-1">
                <span className="text-xs font-medium text-ink-faint">{labels.weekTitle}</span>
                <input
                  value={week.title}
                  onChange={(e) => patchWeek(wi, { title: e.target.value })}
                  placeholder={labels.weekTitlePlaceholder}
                  className="h-9 rounded-md border border-rule bg-paper px-3 text-sm text-ink placeholder:text-ink-faint"
                />
              </label>
              {/* Read-only: a week's hours are the sum of its topics' hours, not
                  entered by hand. It updates as topic hours change. */}
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-ink-faint">{labels.weekHours}</span>
                <div
                  dir="ltr"
                  aria-live="polite"
                  className="tabular flex h-9 w-24 items-center rounded-md border border-rule bg-paper-sunken px-3 text-sm text-ink-muted"
                >
                  {weekHours(week.topics)}
                </div>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
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
            <p className="mt-5 text-xs font-medium uppercase tracking-wider text-ink-faint">{labels.topics}</p>
            <ul className="mt-2 flex flex-col gap-3">
              {week.topics.length === 0 && <li className="text-xs text-ink-faint">{labels.noTopics}</li>}
              {week.topics.map((topic, ti) => (
                <li key={topic.id} className="rounded-md border border-rule/60 bg-paper p-3">
                  <div className="flex flex-wrap items-end gap-2">
                    <label className="flex min-w-48 flex-1 flex-col gap-1">
                      <span className="text-xs font-medium text-ink-faint">{labels.topicTitle}</span>
                      <input
                        value={topic.title}
                        onChange={(e) => patchTopic(wi, ti, { title: e.target.value })}
                        placeholder={labels.topicTitlePlaceholder}
                        className="h-9 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint"
                      />
                    </label>
                    <label className="flex flex-col gap-1">
                      <span className="text-xs font-medium text-ink-faint">{labels.topicHours}</span>
                      <input
                        type="number"
                        min={0}
                        dir="ltr"
                        value={topic.estimatedHours}
                        onChange={(e) => patchTopic(wi, ti, { estimatedHours: Number(e.target.value) })}
                        className="tabular h-9 w-24 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink"
                      />
                    </label>
                    <div className="flex items-center gap-1 pb-0.5">
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
        onClick={() => setWeeks([...plan.weeks, emptyWeek(plan.weeks.length + 1)])}
        className="mt-6 rounded-md border border-rule bg-paper-raised px-4 py-2 text-sm font-medium text-ink hover:border-rule-strong"
      >
        + {labels.addWeek}
      </button>

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
