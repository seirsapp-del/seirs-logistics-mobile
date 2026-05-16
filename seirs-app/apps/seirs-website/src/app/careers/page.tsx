import Link from 'next/link';
import { Briefcase, MapPin, ArrowRight } from 'lucide-react';
import { listContent, fmtDate } from '@/lib/cms';

export const revalidate = 60;

export const metadata = {
  title: 'Careers · SEIRS',
  description: 'Open roles at SEIRS — building the logistics layer Nigeria has been waiting for.',
};

const DEFAULT_LOCATION = 'Lagos, Nigeria';

export default async function CareersPage() {
  const roles = await listContent('job_listing', { pageSize: 50 });

  return (
    <>
      <section className="bg-gradient-to-br from-navy via-[#1a3a5c] to-navy text-white pt-28 pb-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-4xl sm:text-5xl font-extrabold tracking-tight mb-4">Build SEIRS with us</h1>
          <p className="text-white/70 text-lg max-w-2xl mx-auto">
            We&apos;re building the logistics rail that every Nigerian e-commerce, restaurant, and trader plugs into. If that sounds like your kind of problem, take a look below.
          </p>
        </div>
      </section>

      <section className="bg-cream py-16">
        <div className="max-w-3xl mx-auto px-6">
          {roles.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Briefcase size={32} className="mx-auto mb-3 text-gray-300" />
              <p className="font-semibold text-navy">No open roles right now</p>
              <p className="text-sm text-gray-500 mt-1">
                We&apos;re always interested in great people. Email <a className="text-sky underline" href="mailto:careers@seirs.co">careers@seirs.co</a> with your CV and a short note on what you&apos;d build here.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {roles.map(r => (
                <Link
                  key={r.id}
                  href={`/careers/${r.slug}`}
                  className="group flex items-center gap-4 bg-white rounded-xl border border-gray-200 p-5 hover:shadow-md transition-shadow"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      {r.category && (
                        <span className="text-[10px] uppercase font-bold tracking-wider text-sky bg-sky/10 px-2 py-0.5 rounded">
                          {r.category}
                        </span>
                      )}
                      <h2 className="text-lg font-bold text-navy group-hover:text-sky transition-colors">{r.title}</h2>
                    </div>
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <MapPin size={11} />
                        {(r as any).meta?.location ?? DEFAULT_LOCATION}
                      </span>
                      <span>{fmtDate(r.publishedAt)}</span>
                    </div>
                  </div>
                  <ArrowRight size={16} className="text-sky group-hover:translate-x-1 transition-transform shrink-0" />
                </Link>
              ))}
            </div>
          )}

          <div className="mt-12 p-6 bg-white rounded-xl border border-gray-200">
            <h2 className="text-sm font-bold uppercase tracking-wider text-sky mb-2">How we hire</h2>
            <p className="text-sm text-gray-700 leading-relaxed">
              Apply by email with your CV and a one-paragraph note. We reply within a week. Process: phone screen → take-home or paired exercise → final round with the team. We don&apos;t do whiteboard trivia.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
