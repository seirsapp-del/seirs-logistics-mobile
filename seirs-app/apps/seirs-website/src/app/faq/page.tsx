import { HelpCircle } from 'lucide-react';
import { listContent, renderMarkdown } from '@/lib/cms';

export const revalidate = 60;

export const metadata = {
  title: 'FAQ · SEIRS',
  description: 'Frequently asked questions about the SEIRS logistics platform.',
};

const CATEGORY_LABELS: Record<string, string> = {
  getting_started: 'Getting started',
  payments:        'Payments',
  pickup:          'Pickup & delivery',
  drivers:         'For drivers',
  partner:         'Partner stores',
};

export default async function FaqPage() {
  const items = await listContent('faq', { pageSize: 50 });

  // Group by category. Uncategorised items fall under "General".
  const grouped: Record<string, typeof items> = {};
  for (const it of items) {
    const k = it.category ?? 'general';
    (grouped[k] ??= []).push(it);
  }
  const order = Object.keys(grouped);

  return (
    <>
      <ContentHero title="Frequently Asked Questions" subtitle="Quick answers to the questions we hear most often." />

      <section className="bg-cream py-16">
        <div className="max-w-3xl mx-auto px-6 space-y-10">
          {items.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <HelpCircle size={32} className="mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No FAQ entries yet</p>
              <p className="text-sm mt-1">Check back soon.</p>
            </div>
          ) : order.map(cat => (
            <div key={cat}>
              <h2 className="text-sm font-bold uppercase tracking-wider text-sky mb-4">
                {CATEGORY_LABELS[cat] ?? 'General'}
              </h2>
              <div className="space-y-3">
                {grouped[cat].map(item => (
                  <details key={item.id} className="group bg-white rounded-xl border border-gray-200 p-5 open:shadow-md transition-shadow">
                    <summary className="cursor-pointer list-none flex items-center justify-between text-navy font-semibold">
                      <span>{item.title}</span>
                      <span className="text-sky group-open:rotate-45 transition-transform text-xl leading-none">+</span>
                    </summary>
                    <div
                      className="mt-4 text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: renderMarkdown(item.body) }}
                    />
                  </details>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}

function ContentHero({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <section className="bg-gradient-to-br from-navy via-[#1a3a5c] to-navy text-white pt-28 pb-16">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">{title}</h1>
        <p className="text-white/70 text-lg max-w-2xl mx-auto">{subtitle}</p>
      </div>
    </section>
  );
}
