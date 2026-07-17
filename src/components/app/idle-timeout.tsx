'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { IDLE_COOKIE, IDLE_MS, IDLE_WRITE_THROTTLE_MS, isIdle } from '@/lib/idle';
import type { Locale } from '@/lib/i18n';

/**
 * Signs you out after IDLE_MS with no input, and clears the screen with you.
 *
 * The proxy enforces the same timeout on the next request, which is what makes
 * it real (this half can be disabled by turning off JS). This half exists
 * because "logged out on your next click" still leaves your dashboard sitting on
 * the screen of a machine you walked away from — which is the whole scenario.
 *
 * Both halves read one cookie, so they cannot disagree, and neither can two
 * tabs: activity in any tab is activity for all of them.
 */
export function IdleTimeout({ lang }: { lang: Locale }) {
  const router = useRouter();

  useEffect(() => {
    // Scoped to "/" so every route sees the same value, and lax so it survives
    // the redirect back from an OAuth provider.
    const write = (at: number) => {
      document.cookie = `${IDLE_COOKIE}=${at}; path=/; max-age=${Math.floor(
        IDLE_MS / 1000
      )}; samesite=lax`;
    };

    const read = () =>
      document.cookie
        .split('; ')
        .find((c) => c.startsWith(`${IDLE_COOKIE}=`))
        ?.split('=')[1];

    let last = Number(read());
    if (!Number.isFinite(last)) {
      last = Date.now();
      write(last);
    }

    function onActivity() {
      const now = Date.now();
      // Throttled: this runs on every pointer move, and document.cookie is a
      // synchronous parse-and-serialise of the whole cookie jar.
      if (now - last < IDLE_WRITE_THROTTLE_MS) return;
      last = now;
      write(now);
    }

    const events = ['pointerdown', 'keydown', 'scroll', 'pointermove'] as const;
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    // Poll rather than one long setTimeout: a laptop that sleeps for an hour
    // does not fire a timer that was due mid-sleep on time, and the cookie may
    // have been refreshed by another tab in the meantime. Reading the shared
    // clock every 30s answers both.
    const tick = setInterval(async () => {
      if (!isIdle(read())) return;
      clearInterval(tick);
      // Local scope: an idle laptop must not sign this account out on its phone.
      await createClient().auth.signOut({ scope: 'local' });
      router.replace(`/${lang}/auth?reason=idle`);
      router.refresh();
    }, 30_000);

    return () => {
      clearInterval(tick);
      events.forEach((e) => window.removeEventListener(e, onActivity));
    };
  }, [lang, router]);

  return null;
}
