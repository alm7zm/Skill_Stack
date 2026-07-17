# Catalog automation (n8n)

Two workflows that keep the certification catalog honest without a person
re-reading 28 provider pages every month.

They talk to Supabase directly. There is no SkillStack API in the middle, and
there shouldn't be — n8n has a Supabase node, the tables already have CHECK
constraints, and a proxy route would be app code whose only job is forwarding.

| Workflow | Runs | Writes | Needs |
|---|---|---|---|
| `link-health.json` | Mondays 03:00 | Straight to the catalog | Supabase only |
| `discover-resources.json` | Sundays 04:00 | Review queue only | Supabase + Tavily + Anthropic (Claude) |

## The rule these follow

**A bot may state facts it cannot get wrong. It may only propose the rest.**

A URL returning 404 is objectively 404, so `link-health` writes that itself. Whether
a course is worth a learner's time, or what an exam costs today, is a judgement —
those go to `certification_reports` for a human.

The reason is `verified_at`. A bot that scrapes a price and writes it with
`verified_at = today` turns honestly-stale data into confidently-wrong data, and
makes `verified_by` a lie. Stale data is visible and recoverable. A bad fact
wearing a fresh timestamp is neither.

## Setup

### 1. Apply the migration

`supabase/migrations/20260718000001_resources_and_automation.sql`, via the SQL
editor. Nothing below works until `certification_resources` exists.

### 2. Supabase credential

n8n → Credentials → New → **Supabase API**.

- Host: your `NEXT_PUBLIC_SUPABASE_URL`
- Service Role Secret: your `SUPABASE_SERVICE_ROLE_KEY`

Service role because these tables deny writes to `anon` and `authenticated` by
design — RLS is the boundary, and the dashboard-and-bot path is the one that
bypasses it deliberately. **This key bypasses every RLS policy you have.** It is
a backend credential: it belongs in n8n's encrypted credential store and nowhere
a browser can reach. If you run n8n Cloud, you are handing that key to a third
party — self-host if that is not a trade you want.

### 3. Import

n8n → Workflows → Import from File. Both JSONs have
`"id": "REPLACE_WITH_YOUR_CREDENTIAL_ID"` on their Supabase nodes; open each node
once and pick your credential from the dropdown. n8n rewrites the id on save.

### 4. Keys for discovery only

`discover-resources` needs two **Header Auth** credentials (n8n → Credentials →
New → Header Auth). Generic header auth rather than `$vars`, which is an
enterprise feature, or `$env`, which needs `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`.

| Node | Header name | Header value |
|---|---|---|
| Search | `Authorization` | `Bearer tvly-...` from [tavily.com](https://tavily.com) |
| Rank and classify | `x-api-key` | an Anthropic API key from [console.anthropic.com](https://console.anthropic.com) |

The ranking step calls **Claude** (`claude-opus-4-8`) through the Messages API,
not Gemini. `output_config.format` constrains the reply to a JSON schema — the
model returns `{results: [...]}` matching it exactly, so there is nothing to
regex and no prose to mis-parse.

> **This is a separate, paid provider — deliberately.** It does *not* share the
> advisor's Gemini free tier, so a discovery sweep can no longer 429 real users
> out of the advisor for the rest of the day. It does cost money per run: the
> model is `claude-opus-4-8`. For a weekly classification of short search
> snippets, **`claude-haiku-4-5` is ~5× cheaper and more than capable** — change
> the `model` field in the Rank-and-classify node's body if you'd rather run it
> there. (Opus is the default only because downgrading for cost is your call to
> make, not one to bake in silently.)

### 5. Run once, by hand, before scheduling

Both workflows are set to a schedule but are inert until you activate them. Hit
**Execute Workflow** on `link-health` first and read what it did — it is the one
that writes to the catalog unattended.

## link-health

```
Every Monday 03:00
  └── Get live resources         (certification_resources where dead = false)
      └── Check each URL         (GET, 20s timeout, browser user-agent)
          └── Gone?              (404 or 410 only)
              ├── true  → Mark dead → Log it for a human
              └── false → Record healthy check
```

Decisions worth knowing about, because each one is a way this could have been
subtly wrong:

- **GET, not HEAD.** Plenty of course platforms answer 405 or 404 to a HEAD while
  serving the page fine on GET. A HEAD-based checker hides healthy links.
- **Only 404/410 count as gone.** 401 and 403 are *not* dead — paywalled and
  login-walled resources are still real, and many hosts refuse anything that
  looks like a bot. 5xx is the site having a bad day: retry next week rather than
  hide someone's course. A 0 (DNS/TLS/timeout) is as likely to be your network.
- **A browser user-agent.** Cloudflare serves 403 to obvious scripts, which would
  read as a dead link on a perfectly good page.
- **Rows are hidden, never deleted.** `study_plans.plan` references resources by
  id, so deleting one breaks every plan that already links to it. `dead = true`
  removes it from the catalog while existing plans keep resolving.
- **It un-deads too.** A 404 that turns into a 200 next week means the provider
  moved it back, and it returns on its own.

## discover-resources

```
Every Sunday 04:00
  └── Get certifications + Get existing resources
      └── Which certs need help?      (skip any with >= 4; build the query)
          └── Search                  (Tavily)
              └── Filter candidates   (drop known URLs and content farms)
                  └── Rank and classify        (Claude, output_config.format)
                      └── Check the model's homework
                          └── Propose it       (certification_reports)
```

- **It only helps the certifications that need it.** 16 of 28 have no resources
  at all; anything already at four is skipped. This exists to fill the gaps, not
  to pile a fifth Udemy course onto AWS SAA.
- **The model can only pick URLs it was handed.** `Check the model's homework`
  drops any URL that was not in the candidate list — the same defence the
  advisor's `resourceIds` use, for the same reason: a confident invented link is
  indistinguishable from a real one until someone clicks it.
- **Confidence below 0.6 is dropped** rather than queued. A queue nobody can face
  reading is the same as no queue.
- **It writes to `certification_reports` and nothing else.** `proposal` holds a
  ready-made `certification_resources` row, so accepting one is a copy-paste
  rather than a retyping exercise.

## Triage

Both bots and humans file into the same table, so there is one place to look:

```sql
select created_at, source, confidence, certification_id, field, message, proposal
from certification_reports
where status = 'open'
order by source, confidence desc nulls last, created_at desc;
```

Accept a proposed resource:

```sql
-- read it first
select proposal from certification_reports where id = '<id>';

insert into certification_resources (id, certification_id, title, provider, url, duration, free, type, ai_reason, verified_by)
select
  'r' || (select coalesce(max(substring(id from 2)::int), 0) + 1 from certification_resources),
  p->>'certification_id', p->>'title', p->>'provider', p->>'url',
  p->>'duration', (p->>'free')::boolean, p->>'type', p->>'ai_reason',
  'you, via n8n proposal'
from (select proposal as p from certification_reports where id = '<id>') s;

update certification_reports set status = 'accepted' where id = '<id>';
```

Reject: `update certification_reports set status = 'rejected' where id = '<id>';`

`verified_by` is the point of that flow. It should say who actually looked, which
is you — the bot found it, you vouched for it.

## Changing a workflow

The JSON is hand-written, and a workflow that fails to import gets you one
unhelpful line from n8n. `validate.mjs` checks every node type, typeVersion,
parameter name, credential and connection against n8n's own definitions:

```sh
mkdir -p /tmp/n8n-check && cd /tmp/n8n-check && npm init -y && npm i n8n-nodes-base
cd - && node n8n/validate.mjs /tmp/n8n-check/node_modules/n8n-nodes-base
```

Not wired into `npm test`: it needs a ~200MB dependency this app does not
otherwise use, and these files change about as often as n8n does.

## What is deliberately not here

- **No workflow that edits certification facts.** `discover-resources` finds
  resources; nothing scrapes `official_url` for a new exam price yet. It is the
  obvious next one, and it is the one most likely to be confidently wrong — exam
  prices vary by region and most provider pages render them in JavaScript. Worth
  doing against providers with a real pricing API first, not against all 28.
- **No `catalog_links` view.** It unioned certifications and resources into one
  shape and read well, but the two need different handling — a resource can be
  marked dead, a certification's `official_url` cannot — so it just moved the
  branch into the workflow and handed it a null id to trip over.
