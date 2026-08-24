import Link from 'next/link';
import { ArrowRight, Newspaper } from 'lucide-react';
import { listContent, fmtDate, getImageSlots } from '@/lib/cms';
import { ContentHero } from '@/components/ContentHero';

export const revalidate = 60;

export const metadata = {
  // Suffix dropped: the root layout template supplies "| SEIRS Logistics".
  title: 'News & Updates',
  description: 'Product updates, company news, and stories from the SEIRS logistics platform.',
};

const CATEGORY_LABELS: Record<string, string> = {
  news:           'News',
  press:          'Press',
  product_update: 'Product',
  guide:          'Guide',
  story:          'Story',
  impact:         'Impact',
};

export default async function NewsPage() {
  const img = await getImageSlots();
  const articles = await listContent('article', { pageSize: 24 });

  return (
    <>
      <ContentHero imageUrl={img.img_hero_news} title="News & Updates" subtitle="Product launches, company milestones, and stories from across the SEIRS network." />

      <section className="bg-cream py-section-sm lg:py-section-lg">
        <div className="max-w-6xl mx-auto px-6">
          {articles.length === 0 ? (
            <div className="text-center py-16 text-gray-500">
              <Newspaper size={32} className="mx-auto mb-3 opacity-40" />
              <p className="font-semibold">No articles yet</p>
              <p className="text-sm mt-1">Check back soon.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {articles.map(a => (
                <Link
                  key={a.id}
                  href={`/news/${a.slug}`}
                  className="group bg-white rounded-xl border border-gray-200 overflow-hidden transition-all duration-300 hover:-translate-y-2 hover:shadow-2xl"
                >
                  {a.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.coverImageUrl} alt={a.title} className="w-full h-48 object-cover bg-gray-100 transition-transform duration-500 group-hover:scale-105" />
                  ) : (
                    <div className="w-full h-48 bg-gradient-to-br from-navy to-sky" />
                  )}
                  <div className="p-5">
                    {a.category && (
                      <span className="text-[10px] uppercase font-bold tracking-wider text-sky">
                        {CATEGORY_LABELS[a.category] ?? a.category}
                      </span>
                    )}
                    <h3 className="text-lg font-bold text-navy mt-1 mb-2 group-hover:text-sky transition-colors">{a.title}</h3>
                    {a.excerpt && <p className="text-sm text-gray-600 line-clamp-3">{a.excerpt}</p>}
                    <div className="flex items-center justify-between mt-4 text-xs text-gray-500">
                      <span>{fmtDate(a.publishedAt)}</span>
                      <ArrowRight size={14} className="text-sky group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

// Lightweight hero for content-list pages, gradient matches PageHero
// but no required CTAs, icon, or eyebrow.
