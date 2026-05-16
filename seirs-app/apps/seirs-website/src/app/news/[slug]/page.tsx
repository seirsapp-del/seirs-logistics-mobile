import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar } from 'lucide-react';
import { getContentBySlug, fmtDate, renderMarkdown } from '@/lib/cms';

export const revalidate = 60;

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const a = await getContentBySlug(slug);
  if (!a) return { title: 'Not found · SEIRS' };
  return {
    title:       a.seoTitle ?? `${a.title} · SEIRS`,
    description: a.seoDescription ?? a.excerpt ?? undefined,
    openGraph: a.coverImageUrl ? { images: [a.coverImageUrl] } : undefined,
  };
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = await getContentBySlug(slug);
  if (!article) notFound();

  return (
    <article className="bg-cream">
      {article.coverImageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={article.coverImageUrl}
          alt={article.title}
          className="w-full h-64 sm:h-96 object-cover"
        />
      )}

      <div className="max-w-3xl mx-auto px-6 py-12">
        <Link href="/news" className="inline-flex items-center gap-1 text-sm text-sky hover:underline mb-6">
          <ArrowLeft size={14} /> All articles
        </Link>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-navy leading-tight mb-4">{article.title}</h1>

        <div className="flex items-center gap-4 text-sm text-gray-500 mb-8">
          {article.category && (
            <span className="text-[10px] uppercase font-bold tracking-wider text-sky bg-sky/10 px-2 py-1 rounded">
              {article.category}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <Calendar size={14} />
            {fmtDate(article.publishedAt)}
          </span>
        </div>

        {article.excerpt && (
          <p className="text-lg text-gray-600 leading-relaxed mb-8 italic border-l-2 border-sky pl-4">
            {article.excerpt}
          </p>
        )}

        <div
          className="prose prose-lg max-w-none prose-headings:text-navy prose-a:text-sky prose-strong:text-navy"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
        />

        <div className="mt-12 pt-8 border-t border-gray-200">
          <Link href="/news" className="inline-flex items-center gap-2 text-sm font-semibold text-navy hover:text-sky">
            <ArrowLeft size={14} /> Back to all articles
          </Link>
        </div>
      </div>
    </article>
  );
}
