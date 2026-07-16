# SkillStack

Pick an IT certification, get a study plan paced to the hours you actually have, and put it in your calendar.

Bilingual (English / Arabic, LTR + RTL). Next.js 16 App Router, RSC-first. Supabase for auth and data, Gemini for the advisor, Google Calendar for scheduling.

## Setup

```bash
npm install
cp .env.example .env.local   # then fill it in — see below
npm run dev
```

### Environment

| Variable | Where to get it |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Project Settings → Data API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Same page. Public by design — RLS is the boundary, not this key |
| `SUPABASE_SERVICE_ROLE_KEY` | Same page. **Bypasses RLS. Server-only — never expose to a browser** |
| `GOOGLE_GENERATIVE_AI_API_KEY` | [AI Studio](https://aistudio.google.com/apikey). Free tier. Powers the advisor |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud Console → OAuth client. Calendar only — **not** the AI Studio key |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` in dev |

### Database

Run `supabase/schema.sql`, then everything in `supabase/migrations/` in filename order (Supabase → SQL Editor).

### Google OAuth

Authorized redirect URI: `https://<your-project>.supabase.co/auth/v1/callback`.
Enable the Google Calendar API in the same Cloud project, and turn the Google provider on in Supabase → Authentication → Providers.

## Commands

```bash
npm run dev     # Turbopack is the default in Next 16 — no flag needed
npm run build
npm test        # node --test, no framework
npm run lint    # `next lint` was removed in v16; this calls eslint directly
```

## Layout

```
src/
  proxy.ts              locale detection + auth guard (Next 16 renamed middleware.ts → proxy.ts)
  app/[lang]/           every page; dictionaries.ts is server-only, which keeps pages RSC
  app/api/              advisor (streaming), advisor/plan (structured), calendar
  components/{ui,app}/  ui = generic, app = knows about SkillStack
  lib/data/             certification catalog + queries
```

## Notes

- **RLS is the security boundary.** `user_integrations` has RLS on with *zero* policies — service-role only, by design. Google refresh tokens live there and must stay unreachable from any browser session.
- **The advisor model is pinned** (`gemini-3.5-flash`). An alias like `gemini-flash-latest` re-points underneath you, and this prompt is tuned to be blunt rather than flattering. Google's model listing endpoint also lies: retired models still appear in it while 404ing on every call, so probe a candidate with `:generateContent` before trusting it.
- **Spacing uses CSS logical properties** (`ms-`/`me-`/`ps-`/`pe-`/`text-start`). Arabic RTL then flips for free.
- **Arabic copy has not had a native review.** It is a translation, not a speaker's.
