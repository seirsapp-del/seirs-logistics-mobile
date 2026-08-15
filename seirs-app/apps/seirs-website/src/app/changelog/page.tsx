import { ScrollText } from 'lucide-react';
import { listContent, renderMarkdown, fmtDate, getImageSlots } from '@/lib/cms';
import { ContentHero } from '@/components/ContentHero';

export const revalidate = 60;

export const metadata = {
  title: 'Changelog · SEIRS',
  description: 'Every product update, feature launch, and improvement to the SEIRS logistics platform.',
};

export default async function ChangelogPage() {
  const img = await getImageSlots();
  const items = await listContent('changelog', { pageSize: 50 });

  return (
    <>
      <ContentHero imageUrl={img.img_hero_changelog} title="Changelog" subtitle="Every product update, feature launch, and improvement, newest first." />

      <section className="bg-cream py-section-sm lg:py-section-lg">
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

