import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Mail, MapPin } from 'lucide-react';
import { getContentBySlug, fmtDate, renderMarkdown } from '@/lib/cms';

export const revalidate = 60;

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const r = await getContentBySlug(slug);
  if (!r) return { title: 'Role not found · SEIRS' };
  return {
    title:       r.seoTitle ?? `${r.title} · SEIRS Careers`,
    description: r.seoDescription ?? r.excerpt ?? `${r.title} — open role at SEIRS Logistics.`,
  };
}

export default async function JobPage({ params }: Props) {
  const { slug } = await params;
  const role = await getContentBySlug(slug);
  if (!role || role.type !== 'job_listing') notFound();

  return (
    <article className="bg-cream">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <Link href="/careers" className="inline-flex items-center gap-1 text-sm text-sky hover:underline mb-6">
          <ArrowLeft size={14} /> All open roles
        </Link>

        <h1 className="text-3xl sm:text-4xl font-extrabold text-navy leading-tight mb-3">{role.title}</h1>

        <div className="flex items-center gap-4 text-sm text-gray-500 mb-8 flex-wrap">
          {role.category && (
            <span className="text-[10px] uppercase font-bold tracking-wider text-sky bg-sky/10 px-2 py-1 rounded">
              {role.category}
            </span>
          )}
          <span className="flex items-center gap-1.5">
            <MapPin size={14} />
            {(role as any).meta?.location ?? 'Lagos, Nigeria'}
          </span>
          <span>Posted {fmtDate(role.publishedAt)}</span>
        </div>

        {role.excerpt && (
          <p className="text-lg text-gray-700 leading-relaxed mb-8 italic border-l-2 border-sky pl-4">
            {role.excerpt}
          </p>
        )}

        <div
          className="prose prose-lg max-w-none prose-headings:text-navy prose-a:text-sky prose-strong:text-navy"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(role.body) }}
        />

        <div className="mt-12 p-6 bg-white rounded-xl border border-sky/30 flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-sky/10 flex items-center justify-center shrink-0">
            <Mail size={20} className="text-sky" />
          </div>
          <div className="flex-1">
            <p className="font-bold text-navy">Apply for this role</p>
            <p className="text-sm text-gray-600 mt-0.5">
              Email <a className="text-sky underline" href={`mailto:careers@seirs.co?subject=${encodeURIComponent(role.title)}`}>careers@seirs.co</a> with your CV + a short note. Mention the role title in the subject line.
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
