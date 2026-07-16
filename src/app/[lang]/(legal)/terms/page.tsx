import { notFound } from 'next/navigation';
import { isLocale } from '@/lib/i18n';

/** Draft — see the note in ../privacy/page.tsx. */
export default async function TermsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();

  const ar = lang === 'ar';

  return (
    <article className="prose-measure mx-auto px-6 py-16">
      <h1 className="font-display text-3xl font-semibold text-ink">
        {ar ? 'الشروط' : 'Terms'}
      </h1>
      <p className="mt-2 text-sm text-ink-faint">
        {ar ? 'مسودة — تحتاج مراجعة قانونية قبل الإطلاق.' : 'Draft — needs legal review before launch.'}
      </p>

      <Section title={ar ? 'ما هذه الخدمة' : 'What this is'}>
        {ar
          ? 'أداة تخطيط. نحن لا نصدر الشهادات ولا ننظّم الاختبارات، والتسجيل والدفع يتمّان لدى المزوّد نفسه.'
          : 'A planning tool. We do not issue certifications or run exams — registration and payment happen with the provider.'}
      </Section>

      <Section title={ar ? 'دقة المعلومات' : 'Accuracy'}>
        {ar
          ? 'تتغير تكاليف الاختبارات ومتطلباتها. تحقّق دائمًا من موقع المزوّد الرسمي قبل الدفع. الخطط التي يولّدها الذكاء الاصطناعي اقتراحات، لا ضمانات للنجاح.'
          : 'Exam costs and requirements change. Always check the provider\'s official site before paying. AI-generated plans are suggestions, not a guarantee of passing.'}
      </Section>

      <Section title={ar ? 'حسابك' : 'Your account'}>
        {ar
          ? 'أنت مسؤول عن الحفاظ على أمان حسابك. يمكنك حذفه في أي وقت.'
          : 'You are responsible for keeping your account secure. You can delete it at any time.'}
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
