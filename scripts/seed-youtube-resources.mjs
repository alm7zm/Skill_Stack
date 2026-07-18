/**
 * Seed real YouTube playlists into certification_resources via the YouTube Data
 * API v3. Fills each certification up to TARGET total resources (so it won't
 * bloat certs that already have some), inserting only genuine playlist URLs the
 * API returned — never invented ones.
 *
 * Setup:
 *   1. Google Cloud Console -> enable "YouTube Data API v3" -> create an API key.
 *   2. Add to .env.local:  YOUTUBE_API_KEY=AIza...
 *   3. node scripts/seed-youtube-resources.mjs
 *
 * Re-runnable: dedups by playlist id (PK) and by url, and only tops certs up to
 * TARGET, so a second run adds nothing new. Reads SUPABASE_SERVICE_ROLE_KEY, so
 * it bypasses RLS to write the shared catalog — never ship this key to a browser.
 */
import { readFileSync } from 'node:fs';

const TARGET = 20; // ensure each cert reaches at least this many resources
const YT_MAX = 50; // YouTube search page size (100 quota units/call)

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n')
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => { const i = l.indexOf('='); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);

const SUPA = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.SUPABASE_SERVICE_ROLE_KEY;
const YT = env.YOUTUBE_API_KEY;

if (!YT) {
  console.error(
    'YOUTUBE_API_KEY is not set in .env.local.\n' +
      'Get one: Google Cloud Console -> APIs & Services -> enable "YouTube Data API v3"\n' +
      '-> Credentials -> Create API key. Then add YOUTUBE_API_KEY=... to .env.local.'
  );
  process.exit(1);
}
if (!SUPA || !KEY) { console.error('Missing Supabase env.'); process.exit(1); }

const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, 'content-type': 'application/json' };
const rest = (p) => `${SUPA}/rest/v1/${p}`;

async function main() {
  const certs = await (await fetch(rest('certifications?select=id,name,short_name&order=id'), { headers: H })).json();
  const existing = await (await fetch(rest('certification_resources?select=id,url,certification_id&limit=5000'), { headers: H })).json();

  const knownUrls = new Set(existing.map((r) => r.url));
  const knownIds = new Set(existing.map((r) => r.id));
  const countByCert = {};
  for (const r of existing) countByCert[r.certification_id] = (countByCert[r.certification_id] ?? 0) + 1;

  let totalInserted = 0;

  for (const c of certs) {
    const need = TARGET - (countByCert[c.id] ?? 0);
    if (need <= 0) { console.log(`${c.id}: already has ${countByCert[c.id]} — skip`); continue; }

    const q = encodeURIComponent(`${c.name} ${c.short_name} full course tutorial`);
    const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=playlist&maxResults=${YT_MAX}&relevanceLanguage=en&q=${q}&key=${YT}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      // 403 with quotaExceeded means the daily 10k units is gone — stop cleanly.
      console.error(`${c.id}: YouTube API ${res.status} — ${body.slice(0, 160)}`);
      if (res.status === 403) { console.error('Stopping (quota or key problem).'); break; }
      continue;
    }
    const data = await res.json();

    const rows = [];
    for (const item of data.items ?? []) {
      const pid = item.id?.playlistId;
      if (!pid) continue;
      const id = `yt-${pid}`;
      const link = `https://www.youtube.com/playlist?list=${pid}`;
      if (knownIds.has(id) || knownUrls.has(link)) continue; // dedup across certs + reruns
      const channel = item.snippet?.channelTitle ?? 'YouTube';
      rows.push({
        id,
        certification_id: c.id,
        title: (item.snippet?.title ?? 'Playlist').slice(0, 300),
        provider: channel.slice(0, 120),
        url: link,
        duration: 'Playlist',
        free: true,
        type: 'video',
        ai_reason: `YouTube playlist by ${channel}`.slice(0, 300),
        verified_by: 'youtube-api',
      });
      knownIds.add(id);
      knownUrls.add(link);
      if (rows.length >= need) break;
    }

    if (rows.length === 0) { console.log(`${c.id}: no new playlists found`); continue; }

    const ins = await fetch(rest('certification_resources?on_conflict=id'), {
      method: 'POST',
      headers: { ...H, Prefer: 'resolution=ignore-duplicates,return=minimal' },
      body: JSON.stringify(rows),
    });
    if (!ins.ok) { console.error(`${c.id}: insert failed — ${(await ins.text()).slice(0, 200)}`); continue; }
    totalInserted += rows.length;
    console.log(`${c.id}: +${rows.length} playlists (now ~${(countByCert[c.id] ?? 0) + rows.length})`);
  }

  console.log(`\nDone. Inserted ${totalInserted} YouTube playlists.`);
}

main().catch((e) => { console.error(e); process.exit(1); });
