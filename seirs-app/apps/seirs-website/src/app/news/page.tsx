import Link from 'next/link';
import { ArrowRight, Newspaper } from 'lucide-react';
import { listContent, fmtDate } from '@/lib/cms';

export const revalidate = 60;

export const metadata = {
  title: 'News & Updates · SEIRS',
  description: 'Product updates, company news, and stories from the SEIRS logistics platform.',
};

const CATEGORY_LABELS: Record<string, string> = {
  news:           'News',
  press:          'Press',
  product_update: 'Product',
  guide:          'Guide',
  story:          'Story',
};

export default async function NewsPage() {
  const articles = await listContent('article', { pageSize: 24 });

  return (
    <>
      <ContentHero title="News & Updates" subtitle="Product launches, company milestones, and stories from across the SEIRS network." />

      <section className="bg-cream py-16">
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
                  className="group bg-white rounded-xl border border-gray-200 overflow-hidden hover:shadow-lg transition-shadow"
                >
                  {a.coverImageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={a.coverImageUrl} alt={a.title} className="w-full h-48 object-cover bg-gray-100" />
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

// Lightweight hero for content-list pages — gradient matches PageHero
// but no required CTAs, icon, or eyebrow.
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
