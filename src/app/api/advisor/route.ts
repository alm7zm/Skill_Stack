import { streamText } from 'ai';
import { getUser } from '@/lib/supabase/server';
import { getAllCertifications, getCertificationById } from '@/lib/data/certifications';
import { advisorModel, chatRequestSchema, systemPrompt } from '@/lib/ai/advisor';

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
  const [cert, catalog] = await Promise.all([
    getCertificationById(certId),
    getAllCertifications(),
  ]);

  const result = streamText({
    model: advisorModel,
    system: systemPrompt(cert, locale, catalog),
    messages,
    // The response has already been sent with a 200 by the time the provider can
    // fail, so a mid-stream error cannot become an HTTP status. Without this it
    // is swallowed entirely and the user just gets an empty reply. The client
    // treats an empty stream as a failure — see components/app/advisor-chat.tsx.
    onError({ error }) {
      console.error('advisor stream failed:', error);
    },
  });

  return result.toTextStreamResponse();
}
