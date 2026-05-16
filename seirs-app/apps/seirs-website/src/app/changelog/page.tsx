import { ScrollText } from 'lucide-react';
import { listContent, renderMarkdown, fmtDate } from '@/lib/cms';

export const revalidate = 60;

export const metadata = {
  title: 'Changelog · SEIRS',
  description: 'Every product update, feature launch, and improvement to the SEIRS logistics platform.',
};

export default async function ChangelogPage() {
  const items = await listContent('changelog', { pageSize: 50 });

  return (
    <>
      <ContentHero title="Changelog" subtitle="Every product update, feature launch, and improvement, newest first." />

      <section className="bg-cream py-16">
        <div className="max-w-3xl mx-auto px-6 space-y-8">
          {items.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <ScrollText size={32} className="mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No changelog entries yet</p>
              <p className="text-sm mt-1">Check back soon.</p>
            </div>
          ) : items.map(entry => (
            <div key={entry.id} className="bg-white rounded-xl border border-gray-200 p-6">
              <div className="flex items-baseline justify-between flex-wrap gap-2 mb-3">
                <h2 className="text-xl font-bold text-navy">{entry.title}</h2>
                <span className="text-xs text-gray-500 font-mono">{fmtDate(entry.publishedAt)}</span>
              </div>
              {entry.excerpt && (
                <p className="text-sm text-gray-600 italic mb-4">{entry.excerpt}</p>
              )}
              <div
                className="text-sm text-gray-700 leading-relaxed prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: renderMarkdown(entry.body) }}
              />
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
