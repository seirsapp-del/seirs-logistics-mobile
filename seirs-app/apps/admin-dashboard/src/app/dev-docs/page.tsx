'use client';

/**
 * Developer documentation: planned, not published.
 *
 * One job: answer the question somebody opens this page with, which is
 * "where do I send a developer who asks for the SEIRS documentation".
 * Today the honest answer is "nowhere yet, send them to engineering",
 * and the page says exactly that instead of describing a website that
 * does not exist as though it did.
 */
// Newer lucide-react dropped the `Github` icon - use `GitBranch` as
// the closest semantic equivalent.
import Link from 'next/link';
import { BookOpen, GitBranch as Github, FileText, Zap, Info } from 'lucide-react';
import { PageIntro } from '@/components/PageIntro';

export default function DevDocsPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <PageIntro
        title="Developer documentation"
        purpose="The website that will tell outside developers how to plug their software into SEIRS. It has not been published yet."
      />

      {/* Status card. The heading used to be the address of a site that
          does not resolve, presented like a live link. */}
      <div className="bg-gradient-to-br from-[#0F2B4C] to-[#1a3d6b] text-white rounded-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen size={20} />
          <p className="text-xl font-bold">Nothing is published yet</p>
        </div>
        <p className="text-sm opacity-80 mb-4">
          There is no documentation site for developers to read. If somebody asks you for it, tell them
          it is not available yet and pass the request to engineering. Do not give out the address below:
          it is a name we have reserved, not a working site.
        </p>
        <span className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 font-mono text-sm text-white/60">
          docs.seirs.app (reserved, does not open)
        </span>
      </div>

      <div>
        <h2 className="text-sm font-bold text-[#0F2B4C]">What the site will hold when it exists</h2>
        <p className="mb-3 text-xs text-gray-500">None of this is written yet. Nothing below is a link.</p>
        <div className="grid grid-cols-2 gap-4">
          <SectionCard
            title="How each request works"
            description="Every instruction a developer's software can send SEIRS, what it must include, and what comes back, including the errors."
            Icon={FileText}
          />
          <SectionCard
            title="Ready-made code"
            description="Small packages a developer drops into their own system so they do not have to write the plumbing themselves."
            Icon={Github}
          />
          <SectionCard
            title="First delivery in five minutes"
            description="A walkthrough: get a test key, book one delivery with it, and receive the updates SEIRS sends back."
            Icon={Zap}
          />
          <SectionCard
            title="What changed and when"
            description="A dated list of changes. Anything that would break a partner's software gets an email and 90 days' notice first."
            Icon={BookOpen}
          />
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-yellow-200 bg-yellow-50 p-4">
        <Info size={15} className="mt-0.5 shrink-0 text-yellow-700" />
        <p className="text-xs leading-relaxed text-yellow-800">
          Publishing it is engineering work, not something anybody can do from this dashboard: the site
          has to be built, filled with content and pointed at the address above, alongside opening the
          public API to outside traffic. Meanwhile, the businesses already connected to SEIRS are listed
          on <Link href="/dev-accounts" className="font-semibold underline">Businesses plugged into SEIRS</Link>.
        </p>
      </div>
    </div>
  );
}

function SectionCard({ title, description, Icon }: { title: string; description: string; Icon: any }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] p-5">
      <div className="w-9 h-9 rounded-lg bg-[#3A7BD5]/10 flex items-center justify-center mb-3">
        <Icon size={16} className="text-[#3A7BD5]" />
      </div>
      <h3 className="text-sm font-bold text-[#0F2B4C] mb-1">{title}</h3>
      <p className="text-xs text-gray-500 leading-relaxed">{description}</p>
    </div>
  );
}
