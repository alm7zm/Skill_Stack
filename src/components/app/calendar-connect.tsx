'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { Locale } from '@/lib/i18n';

/**
 * Calendar access is requested separately from sign-in, not bundled into it.
 * Asking for calendar write access on the signup screen makes the consent screen
 * scary and costs signups; asking when they choose to connect is honest.
 *
 * access_type=offline + prompt=consent are both required — without them Google
 * returns an access token but no refresh token, and background sync would break
 * the moment the access token expired an hour later.
 */
export function CalendarConnect({
  lang,
  connected,
  labels,
}: {
  lang: Locale;
  connected: boolean;
  labels: { connect: string; disconnect: string; connected: string };
}) {
  const [busy, setBusy] = useState(false);

  async function connect() {
    setBusy(true);
    const supabase = createClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        scopes: 'https://www.googleapis.com/auth/calendar.events',
        queryParams: { access_type: 'offline', prompt: 'consent' },
        redirectTo: `${location.origin}/auth/callback?next=${encodeURIComponent(
          `/${lang}/settings`
        )}&store_google=1`,
      },
    });
  }

  if (connected) {
    return (
      <div className="mt-4 flex items-center gap-3">
        <Badge tone="accent">{labels.connected}</Badge>
      </div>
    );
  }

  return (
    <Button variant="secondary" className="mt-4" onClick={connect} disabled={busy}>
      {labels.connect}
    </Button>
  );
}
