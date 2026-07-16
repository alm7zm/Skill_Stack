'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
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
  };
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: labels.opening },
  ]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [building, setBuilding] = useState(false);
  const [error, setError] = useState<string>();
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages]);

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

    try {
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ certId, locale: lang, messages: next }),
      });

      if (!res.ok || !res.body) throw new Error(`advisor responded ${res.status}`);

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

      // A provider failure happens *after* the 200 and the open stream, so it
      // cannot surface as a bad status — the stream just ends empty. Without
      // this the user is left staring at a blank bubble and no explanation.
      if (!acc.trim()) throw new Error('advisor returned an empty stream');
    } catch {
      // Keep the user's message — losing what they typed on a network blip is
      // worse than the failure itself.
      setMessages(next);
      setError(labels.error);
    } finally {
      setStreaming(false);
    }
  }

  async function buildPlan() {
    setBuilding(true);
    setError(undefined);
    try {
      const res = await fetch('/api/advisor/plan', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ certId, locale: lang, messages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'failed');
      router.push(`/${lang}/plan/${data.planId}`);
    } catch {
      setError(labels.error);
      setBuilding(false);
    }
  }

  const canBuild = messages.filter((m) => m.role === 'user').length >= 3 && !streaming;

  return (
    <div className="flex flex-col">
      <div className="flex flex-col gap-5" role="log" aria-live="polite" aria-atomic="false">
        {messages.map((m, i) => (
          <div
            key={i}
            className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
          >
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
        </p>
      )}

      <form onSubmit={send} className="sticky bottom-0 mt-6 bg-paper/90 py-4 backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={labels.placeholder}
            disabled={streaming}
            aria-label={labels.placeholder}
            className="h-11 flex-1 rounded-md border border-rule bg-paper-raised px-3 text-sm text-ink placeholder:text-ink-faint hover:border-rule-strong disabled:opacity-60"
          />
          <Button type="submit" disabled={streaming || !input.trim()}>
            {labels.send}
          </Button>
        </div>

        {canBuild && (
          <Button
            type="button"
            variant="secondary"
            onClick={buildPlan}
            disabled={building}
            className="mt-3 w-full"
          >
            {building ? labels.thinking : labels.viewPlan}
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
