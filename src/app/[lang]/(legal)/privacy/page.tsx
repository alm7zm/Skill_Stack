import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n';

/**
 * Placeholder with real structure, not lorem ipsum. The footer links here, and a
 * dead legal link is worse than an honest draft.
 *
 * ponytail: hand-written rather than a CMS or MDX pipeline for two static pages.
 * Replace the body with reviewed text before launch — the headings reflect what
 * the app actually collects, so they should not need rewriting.
 */
export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const ar = lang === 'ar';

  return (
    <article className="prose-measure mx-auto px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {ar ? 'سياسة الخصوصية' : 'Privacy'}
      </h1>
      <p className="mt-2 text-sm text-ink-faint">
        {ar ? 'مسودة — تحتاج مراجعة قانونية قبل الإطلاق.' : 'Draft — needs legal review before launch.'}
      </p>

      <Section title={ar ? 'ما نجمعه' : 'What we collect'}>
        {ar
          ? 'بريدك الإلكتروني واسمك وصورتك من مزوّد تسجيل الدخول، وما تكتبه في ملفك الشخصي، وخططك الدراسية وتقدُّمك فيها.'
          : 'Your email, name and avatar from your sign-in provider; whatever you enter in your profile; and your study plans and progress.'}
      </Section>

      <Section title={ar ? 'المستشار الذكي' : 'The advisor'}>
        {ar
          ? 'تُرسل رسائلك في المستشار إلى OpenAI لتوليد الرد والخطة. لا ترسل إليه ما لا ترغب في مشاركته.'
          : 'Messages you send to the advisor are sent to OpenAI to generate the reply and the plan. Do not send it anything you would not want shared.'}
      </Section>

      <Section title={ar ? 'تقويم Google' : 'Google Calendar'}>
        {ar
          ? 'إن ربطت تقويمك، نحتفظ برمز تحديث لكتابة جلسات المذاكرة فقط. يمكنك فصله في أي وقت من الإعدادات.'
          : 'If you connect your calendar we store a refresh token, used only to write study sessions. You can disconnect at any time in settings.'}
      </Section>

      <Section title={ar ? 'حذف بياناتك' : 'Deleting your data'}>
        {ar
          ? 'حذف حسابك يحذف ملفك وخططك وتقدُّمك ورموز الوصول المخزَّنة.'
          : 'Deleting your account removes your profile, plans, progress and any stored tokens.'}
      </Section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>
      <p className="mt-2 leading-relaxed text-ink-muted">{children}</p>
    </section>
  );
}
