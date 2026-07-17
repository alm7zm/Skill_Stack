'use client';

import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n';

export function SignOutButton({
  lang,
  label,
  className,
}: {
  lang: Locale;
  label: string;
  className?: string;
}) {
  const router = useRouter();

  return (
    <Button
      variant="secondary"
      className={className}
      onClick={async () => {
        // scope: 'local'. The default is 'global', which revokes every refresh
        // token on the account — so signing out here also signed you out on
        // your phone. This button says "sign out", not "sign out everywhere".
        await createClient().auth.signOut({ scope: 'local' });
        router.push(`/${lang}`);
        router.refresh(); // drop the server-rendered signed-in shell
      }}
    >
      {label}
    </Button>
  );
}
