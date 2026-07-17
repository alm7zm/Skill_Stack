import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getDictionary } from '../../../dictionaries';
import { isLocale } from '@/lib/i18n';
import { getCertificationById } from '@/lib/data/certifications';
import { AdvisorChat } from '@/components/app/advisor-chat';

export default async function AdvisorPage({
  params,
}: {
  params: Promise<{ lang: string; certId: string }>;
}) {
  const { lang, certId } = await params;
  if (!isLocale(lang)) notFound();

  const cert = await getCertificationById(certId);
  if (!cert) notFound();

  const dict = await getDictionary(lang);
  const t = dict.advisor;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-3xl flex-col px-6 py-8">
      <header className="border-b border-rule pb-5">
        {/* Every page needs a way back — the old build dead-ended here. */}
        <Link
          href={`/${lang}/certification/${cert.id}`}
          className="text-xs text-ink-muted transition-colors hover:text-ink"
        >
          ← {cert.name}
        </Link>
        <h1 className="mt-2 font-display text-2xl font-semibold text-ink">{t.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">{t.subtitle}</p>
      </header>

      <div className="flex-1 pt-6">
        <AdvisorChat
          certId={cert.id}
          lang={lang}
          labels={{
            placeholder: t.placeholder,
            send: t.send,
            thinking: t.thinking,
            viewPlan: t.viewPlan,
            restart: t.restart,
            error: t.error,
            opening: t.opening,
            status: t.status,
            quota: t.quota,
          }}
        />
      </div>
    </div>
  );
}
