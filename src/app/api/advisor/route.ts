import { streamText } from 'ai';
import { getUser } from '@/lib/supabase/server';
import { getAllCertifications, getCertificationById } from '@/lib/data/certifications';
import { getProfile } from '@/lib/data/queries';
import { rateLimit } from '@/lib/rate-limit';
import { normalizeAdvisorSettings } from '@/lib/advisor-settings';
import {
  advisorModel,
  chatRequestSchema,
  knownFacts,
  providerErrorResponse,
  systemPrompt,
} from '@/lib/ai/advisor';

/**
 * A real streaming completion, replacing the scripted advisor that faked typing
 * with setTimeout and replied from a hardcoded array.
 *
 * API surface checked against the installed ai@7 rather than assumed: v7 exposes
 * toUIMessageStreamResponse/toTextStreamResponse — the v4-era toDataStreamResponse
 * no longer exists. We use the plain text stream so the client can read it with
 * fetch + a TextDecoder and we avoid pulling in @ai-sdk/react.
 */
export async function POST(req: Request) {
  // Auth first: this endpoint spends money on every call.
  const user = await getUser();
  if (!user) {
    return Response.json({ error: 'unauthorized' }, { status: 401 });
  }

  // Then a per-user cap, so one account can't run up the bill. 429 + retryAfter
  // is the shape the chat client already renders as the quota notice. The
  // X-RateLimit-* headers feed the "messages left" indicator.
  const rl = await rateLimit(user.id, 'advisor', 15);
  const rlHeaders = {
    'X-RateLimit-Limit': String(rl.limit),
    'X-RateLimit-Remaining': String(rl.remaining),
  };
  if (!rl.ok) {
    return Response.json(
      { error: 'rate_limited', retryAfter: rl.retryAfter },
      { status: 429, headers: { ...rlHeaders, 'Retry-After': String(rl.retryAfter) } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'invalid json' }, { status: 400 });
  }

  const parsed = chatRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'invalid request', issues: parsed.error.issues.map((i) => i.path.join('.')) },
      { status: 400 }
    );
  }

  const { certId, locale, messages } = parsed.data;
  // The profile is read here, not sent by the client: it decides what the
  // advisor stops asking about, so a browser must not be able to claim
  // "experience_level: expert" and skip the question. RLS scopes it to the
  // caller anyway.
  const [cert, catalog, { profile, skills, languages }] = await Promise.all([
    getCertificationById(certId),
    getAllCertifications(),
    getProfile(),
  ]);

  // streamText does not throw and reading its stream does not reject: when the
  // provider fails, onError fires and the stream simply ends empty. Measured,
  // not assumed — a 429 gives `onError: RetryError` and then `read() -> {done:
  // true}`. So the failure has to be captured here or it is lost, and the client
  // cannot tell "out of quota" from "the model had nothing to say".
  let failure: unknown;
  const result = streamText({
    model: advisorModel,
    system: systemPrompt(
      cert,
      locale,
      catalog,
      knownFacts(profile, skills, languages),
      normalizeAdvisorSettings(profile?.advisor_settings)
    ),
    messages,
    onError({ error }) {
      failure = error;
      console.error('advisor stream failed:', error);
    },
  });

  // Pull the first chunk before answering. The provider fails before emitting a
  // token in the case that matters (quota), so waiting for it turns a silent
  // empty 200 into a real status the client can explain.
  const reader = result.textStream.getReader();
  const first = await reader.read();

  if (first.done) {
    reader.releaseLock();
    if (failure) return providerErrorResponse(failure);
    // Genuinely nothing to say, and no error: still a failure from here.
    return Response.json({ error: 'provider' }, { status: 502 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      controller.enqueue(encoder.encode(first.value));
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        controller.enqueue(encoder.encode(value));
      }
      // A failure after the first token cannot become a status — the 200 is
      // already sent. The client keeps the partial answer; onError logged why.
      controller.close();
    },
    cancel() {
      // The user navigated away or hit stop; stop generating rather than
      // finishing a reply nobody will read.
      void reader.cancel();
    },
  });

  return new Response(stream, {
    headers: { 'content-type': 'text/plain; charset=utf-8', ...rlHeaders },
  });
}
