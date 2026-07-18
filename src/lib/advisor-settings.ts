/**
 * How a user can tune the advisor. Shared by the settings form, the action that
 * saves it, and the advisor prompt — one definition, so the dropdowns, the
 * validation, and the prompt fragments can never fall out of step.
 *
 * Stored as one jsonb column (profiles.advisor_settings). Every knob has a
 * 'balanced' middle that is also the default, and 'balanced' emits no extra
 * prompt line — an untuned advisor reads exactly as it did before this existed.
 */

export const ADVISOR_KNOBS = {
  tone: ['direct', 'balanced', 'warm'],
  length: ['brief', 'balanced', 'detailed'],
  questions: ['few', 'balanced', 'thorough'],
  intensity: ['relaxed', 'balanced', 'intense'],
} as const;

export type AdvisorKnob = keyof typeof ADVISOR_KNOBS;
export type AdvisorSettings = { [K in AdvisorKnob]: (typeof ADVISOR_KNOBS)[K][number] };

export const ADVISOR_DEFAULTS: AdvisorSettings = {
  tone: 'balanced',
  length: 'balanced',
  questions: 'balanced',
  intensity: 'balanced',
};

/**
 * Coerce whatever is in the jsonb column into a full, valid settings object.
 * Anything missing or off-list falls back to the default, so a hand-edited row
 * or an old shape can never feed the prompt a value it doesn't understand.
 */
export function normalizeAdvisorSettings(raw: unknown): AdvisorSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  // Per-knob generic so each read stays typed as that knob's own union; a single
  // union-keyed write would narrow the target to the shared 'balanced' only.
  const pick = <K extends AdvisorKnob>(knob: K): AdvisorSettings[K] => {
    const v = r[knob];
    return typeof v === 'string' && (ADVISOR_KNOBS[knob] as readonly string[]).includes(v)
      ? (v as AdvisorSettings[K])
      : ADVISOR_DEFAULTS[knob];
  };
  return {
    tone: pick('tone'),
    length: pick('length'),
    questions: pick('questions'),
    intensity: pick('intensity'),
  };
}
