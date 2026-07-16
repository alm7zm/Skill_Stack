/**
 * Google Calendar via plain fetch.
 *
 * ponytail: the plan called for the `googleapis` package. It is ~100MB and
 * generates clients for every Google API in existence; we need exactly two HTTP
 * calls — refresh an access token, and upsert an event. Two fetches beat a
 * hundred megabytes. Reach for the SDK if this grows batching, push channels or
 * incremental sync.
 *
 * Never import this from a client component: it handles refresh tokens.
 */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const EVENTS_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** Needed to create and update events. Requested separately from sign-in. */
export const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events';

export type CalendarEventInput = {
  summary: string;
  description?: string;
  start: Date;
  end: Date;
};

/**
 * Exchange a long-lived refresh token for a short-lived access token.
 * Google only issues a refresh token when the consent used
 * access_type=offline&prompt=consent — see settings/actions.ts.
 */
export async function getAccessToken(refreshToken: string): Promise<string> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) {
    // A revoked or expired refresh token lands here. The caller should clear the
    // stored integration and ask the user to reconnect.
    throw new CalendarAuthError(`token refresh failed (${res.status})`);
  }

  const data = (await res.json()) as { access_token?: string };
  if (!data.access_token) throw new CalendarAuthError('no access_token in response');
  return data.access_token;
}

export class CalendarAuthError extends Error {}

function toEventBody(input: CalendarEventInput) {
  return {
    summary: input.summary,
    description: input.description,
    // Google requires an IANA timezone alongside the timestamp. UTC keeps this
    // unambiguous; the user's calendar renders it in their own zone.
    start: { dateTime: input.start.toISOString(), timeZone: 'UTC' },
    end: { dateTime: input.end.toISOString(), timeZone: 'UTC' },
  };
}

/**
 * Create an event, or update it in place when we already have its id.
 * This is what makes re-syncing update rather than duplicate — the id is kept in
 * study_plan_topics.calendar_event_id.
 */
export async function upsertEvent(
  accessToken: string,
  input: CalendarEventInput,
  existingEventId?: string | null
): Promise<string> {
  const url = existingEventId ? `${EVENTS_URL}/${encodeURIComponent(existingEventId)}` : EVENTS_URL;

  const res = await fetch(url, {
    method: existingEventId ? 'PATCH' : 'POST',
    headers: {
      authorization: `Bearer ${accessToken}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(toEventBody(input)),
  });

  // The event was deleted from Google's side but we still hold its id — fall
  // back to creating a fresh one rather than failing the whole sync.
  if (res.status === 404 && existingEventId) {
    return upsertEvent(accessToken, input, null);
  }

  if (!res.ok) {
    throw new Error(`calendar write failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}
