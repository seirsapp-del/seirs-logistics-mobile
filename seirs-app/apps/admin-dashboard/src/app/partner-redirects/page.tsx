'use client';

/**
 * Partner redirects: planned, not built.
 *
 * The idea is that a shop which printed an old web address on a flyer
 * keeps working after SEIRS changes its page. There is no backend for
 * it, so this page has exactly one job: tell whoever opened it that
 * there is nothing to do here, and where to go instead. It stays in the
 * navigation so partner managers know it is coming rather than
 * wondering whether they have lost a permission.
 */
import Link from 'next/link';
import { ArrowRightLeft, Info } from 'lucide-react';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';

const PREVIEW_ROWS = [
  { source: 'seirs.ng/shop/lagos-mart',  destination: 'Lagos Fresh Market', type: 'Moved for good',  hits: '-', status: 'On'  },
  { source: 'seirs.ng/shop/abuja-hub',   destination: 'Abuja Superstore',   type: 'Moved for now',   hits: '-', status: 'On'  },
  { source: 'seirs.ng/shop/ph-depot',    destination: 'PH Depot Express',   type: 'Moved for good',  hits: '-', status: 'Off' },
];

const STATUS_STYLES: Record<string, string> = {
  On:  'bg-green-100 text-green-700',
  Off: 'bg-gray-100 text-gray-600',
};

export default function PartnerRedirectsPage() {
  return (
    <div className="p-6 space-y-6">
      {/* The old header promised "map short or legacy URLs to active
          partner pages" on a page where nothing can be mapped, and the
          explanation of what these will do was written in 301/302, which
          is a status code, not a sentence. */}
      <PageIntro
        title="Old shop links"
        purpose="A place to keep an old web address working after a shop's page moves, so a flyer printed last year still sends people somewhere useful. Not built yet."
      />

      <div className="rounded-xl border border-gray-200 bg-white">
        <EmptyState
          icon={<ArrowRightLeft size={20} />}
          title="There is nothing to do on this page yet"
          body="Nothing is broken and nothing is waiting for you. When this is built, you will be able to point an old address at a shop's current page, and choose whether the move is permanent. Until then, send people the shop's page from Partner stores."
          action={{ label: 'Go to Partner stores', href: '/partners' }}
        />
      </div>

      {/* Design preview */}
      <div className="bg-white rounded-xl border border-dashed border-gray-200 relative overflow-hidden">
        <div className="absolute top-2 right-2 z-10 text-xs bg-white/95 border border-gray-200 rounded-full px-2 py-0.5 font-medium text-gray-500">
          Example only, not real
        </div>
        <div className="flex items-center gap-2 border-b border-gray-100 px-4 py-3 text-xs text-gray-500">
          <Info size={13} className="shrink-0 text-gray-400" />
          This is what the screen will look like once it works. None of the rows below exist.
        </div>
        <div className="overflow-x-auto opacity-40 pointer-events-none select-none">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-xs text-gray-500 font-semibold uppercase tracking-wide">
                <th className="text-left px-4 py-3">Old address</th>
                <th className="text-left px-4 py-3">Where it will send people</th>
                <th className="text-left px-4 py-3">Kind of move</th>
                <th className="text-left px-4 py-3">Times used</th>
                <th className="text-left px-4 py-3">Working</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {PREVIEW_ROWS.map((r) => (
                <tr key={r.source}>
                  <td className="px-4 py-3 font-mono text-xs text-[#3A7BD5]">{r.source}</td>
                  <td className="px-4 py-3 text-xs text-gray-500">{r.destination}</td>
                  <td className="px-4 py-3 text-gray-600">{r.type}</td>
                  <td className="px-4 py-3 text-gray-600">{r.hits}</td>
                  <td className="px-4 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_STYLES[r.status]}`}>{r.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-xs text-gray-400">
        Looking for a shop? Every partner shop and its current page is on{' '}
        <Link href="/partners" className="font-semibold text-[#3A7BD5] hover:underline">Partner stores</Link>.
      </p>
    </div>
  );
}
