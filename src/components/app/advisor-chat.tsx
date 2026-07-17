'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn, interpolate } from '@/lib/utils';
import type { Locale } from '@/lib/i18n';

type Message = { role: 'user' | 'assistant'; content: string };

/**
 * Reads the plain text stream from /api/advisor with fetch + TextDecoder.
 *
 * ponytail: no @ai-sdk/react. useChat would add a dependency to save ~20 lines
 * of stream reading, and the route returns a plain text stream precisely so this
 * stays trivial. Reach for it if this grows tool calls or message parts.
 */
export function AdvisorChat({
  certId,
  lang,
  labels,
}: {
  certId: string;
  lang: Locale;
  labels: {
    placeholder: string;
    send: string;
    thinking: string;
    viewPlan: string;
    restart: string;
    error: string;
    opening: string;
    status: { thinking: string; drafting: string; saving: string; done: string };
    quota: { message: string; retry: string };
  };
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: labels.opening },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  /** null when idle; otherwise what is happening in the background right now. */
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string>();
  /** Seconds left on a quota cooldown. Counts down so the wait is a fact, not a shrug. */
  const [retryIn, setRetryIn] = useState(0);
  const [restored, setRestored] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  // Keyed by certification only, deliberately not by language: switching language
  // is the case this exists for, and a key with `lang` in it would miss on the
  // other side of the switch — losing the conversation exactly when it is meant
  // to survive.
  const sharedKey = `skillstack:advisor:${certId}`;

  /**
   * Restore on mount.
   *
   * Switching language is a real navigation to /ar/... — the component unmounts
   * and useState starts over, so a conversation several answers deep was simply
   * gone. sessionStorage rather than the database: this is a draft, it is
   * per-tab, and it should not outlive the tab. The plan is what gets persisted.
   */
  useEffect(() => {
    // Reading an external store after mount is what an effect is for, and this
    // cannot move into a lazy useState initializer: that runs during SSR too,
    // where sessionStorage does not exist, and rendering different content on the
    // client than the server sent is a hydration mismatch. So render the opening
    // line, then replace it once mounted. Runs once per key — no cascade.
    /* eslint-disable react-hooks/set-state-in-effect */
    try {
      const saved = sessionStorage.getItem(sharedKey);
      if (saved) {
        const parsed: unknown = JSON.parse(saved);
        // The opening line is chrome, not conversation, so it is not stored —
        // otherwise switching to Arabic would restore the English one and sit it
        // above an Arabic page. Re-add it in whatever language is current.
        if (Array.isArray(parsed) && parsed.length > 0) {
          setMessages([{ role: 'assistant', content: labels.opening }, ...(parsed as Message[])]);
        }
      }
    } catch {
      // Private mode, quota, or corrupt JSON. A lost draft is not worth a crash.
    }
    setRestored(true);
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [sharedKey, labels.opening]);

  // Save after every change, but only once the restore has run — otherwise the
  // initial [opening] would overwrite the saved conversation on mount.
  useEffect(() => {
    if (!restored) return;
    try {
      const body = messages.slice(1); // drop the opening; see above
      if (body.length === 0) sessionStorage.removeItem(sharedKey);
      else sessionStorage.setItem(sharedKey, JSON.stringify(body));
    } catch {
      /* nothing to do; the conversation still works in memory */
    }
  }, [messages, sharedKey, restored]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

  // Tick the cooldown down to zero.
  useEffect(() => {
    if (retryIn <= 0) return;
    const t = setTimeout(() => setRetryIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [retryIn]);

  /**
   * Both routes answer with the same shape, so both failures read the same.
   * Returns the reason only — the countdown is rendered live from retryIn, so
   * the number is never baked into the string and cannot go stale mid-wait.
   */
  async function failureFrom(res: Response): Promise<string> {
    if (res.status === 429) {
      const body = await res.json().catch(() => ({}));
      const seconds = Number(body?.retryAfter) || 0;
      if (seconds > 0) setRetryIn(seconds);
      return labels.quota.message;
    }
    return labels.error;
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || streaming) return;

    setError(undefined);
    setInput('');

    const next = [...messages, { role: 'user' as const, content: text }];
    // Placeholder the stream fills in.
    setMessages([...next, { role: 'assistant', content: '' }]);
    setStreaming(true);
    setStatus(labels.status.thinking);

    try {
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ certId, locale: lang, messages: next }),
      });

      if (!res.ok || !res.body) {
        // Keep the user's message — losing what they typed on a failure is worse
        // than the failure itself.
        setMessages(next);
        setError(await failureFrom(res));
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        // Replace only the trailing placeholder, leaving history untouched.
        setMessages([...next, { role: 'assistant', content: acc }]);
      }

      // The route now answers 429/502 before streaming, so an empty body here
      // means the provider died mid-answer — after the 200, where it can no
      // longer be a status.
      if (!acc.trim()) {
        setMessages(next);
        setError(labels.error);
      }
    } catch {
      setMessages(next);
      setError(labels.error);
    } finally {
      setStreaming(false);
      setStatus(null);
    }
  }

  async function buildPlan() {
    setError(undefined);
    // Naming each step: this takes ten to twenty seconds and used to show a
    // button that said "Thinking" and nothing else, so a long wait was
    // indistinguishable from a hang.
    setStatus(labels.status.drafting);
    try {
      const res = await fetch('/api/advisor/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ certId, locale: lang, messages }),
      });

      if (!res.ok) {
        setError(await failureFrom(res));
        setStatus(null);
        return;
      }

      setStatus(labels.status.saving);
      const data = await res.json();
      setStatus(labels.status.done);
      // The conversation produced its plan; the draft has served its purpose.
      try {
        sessionStorage.removeItem(sharedKey);
      } catch {
        /* ignore */
      }
      router.push(`/${lang}/plan/${data.planId}`);
    } catch {
      setError(labels.error);
      setStatus(null);
    }
  }

  const busy = streaming || status !== null;
  const blocked = retryIn > 0;
  const canBuild = messages.filter((m) => m.role === 'user').length >= 3 && !busy;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-5" role="log" aria-live="polite" aria-atomic="false">
        {messages.map((m, i) => (
          <div key={i} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
            <div
              className={cn(
                'max-w-[42rem] whitespace-pre-wrap rounded-lg px-4 py-3 text-sm leading-relaxed',
                m.role === 'user'
                  ? 'bg-accent text-paper rounded-ee-xs'
                  : 'bg-paper-raised border border-rule text-ink rounded-es-xs'
              )}
            >
              {m.content || (
                <span className="inline-flex items-center gap-1 text-ink-faint">
                  {labels.thinking}
                  <Dots />
                </span>
              )}
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>

      {error && (
        <p role="alert" className="mt-4 rounded-sm bg-danger-wash px-3 py-2 text-sm text-danger">
          {error}
          {blocked && ` ${interpolate(labels.quota.retry, { seconds: String(retryIn) })}`}
        </p>
      )}

      <form onSubmit={send} className="sticky bottom-0 mt-6 bg-paper/90 py-4 backdrop-blur-sm">
        {/* Says what is happening rather than only that something is. Announced
            politely so it does not interrupt a screen reader mid-sentence. */}
        {status && (
          <p role="status" className="mb-2 flex items-center gap-1.5 text-xs text-ink-faint">
            {status}
            <Dots />
          </p>
        )}

        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={labels.placeholder}
            disabled={busy || blocked}
            aria-label={labels.placeholder}
            className="h-11 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong disabled:opacity-60"
          />
          <Button type="submit" disabled={busy || blocked || !input.trim()}>
            {blocked ? `${retryIn}s` : labels.send}
          </Button>
        </div>

        {canBuild && !blocked && (
          <Button
            type="button"
            variant="secondary"
            onClick={buildPlan}
            disabled={busy}
            className="mt-3 w-full"
          >
            {labels.viewPlan}
          </Button>
        )}
      </form>
    </div>
  );
}

function Dots() {
  return (
    <span className="inline-flex gap-0.5" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="h-1 w-1 animate-pulse rounded-full bg-current"
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
