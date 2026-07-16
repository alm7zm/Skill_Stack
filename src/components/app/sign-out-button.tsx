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
        await createClient().auth.signOut();
        router.push(`/${lang}`);
        router.refresh(); // drop the server-rendered signed-in shell
      }}
    >
      {label}
    </Button>
  );
}
