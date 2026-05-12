'use client';
// Newer lucide-react dropped the `Github` icon — use `GitBranch` as
// the closest semantic equivalent. The button still opens the GitHub
// repo URL; only the icon glyph changed.
import { BookOpen, ExternalLink, GitBranch as Github, FileText, Zap } from 'lucide-react';

// Spec V8 Tier 3 — link card to the public docs site. The actual
// docs.seirs.app is a separate Vercel project (Mintlify or Nextra);
// this admin page surfaces it + its publish status + lets staff jump
// straight to the source repo.

export default function DevDocsPage() {
  return (
    <div className="p-6 space-y-6 max-w-3xl">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <BookOpen size={18} className="text-white" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-[#0F2B4C]">Developer Docs</h1>
          <p className="text-sm text-gray-500">
            Public documentation site for SEIRS Developer Platform integrators.
          </p>
        </div>
      </div>

      {/* Status card */}
      <div className="bg-gradient-to-br from-[#0F2B4C] to-[#1a3d6b] text-white rounded-xl p-6">
        <div className="flex items-center gap-3 mb-2">
          <BookOpen size={20} />
          <p className="text-xl font-bold">docs.seirs.app</p>
        </div>
        <p className="text-sm opacity-80 mb-4">
          Endpoints reference, SDKs, sample code, sandbox guide, changelog. Built with Mintlify (or Nextra) and deployed as a separate Vercel project.
        </p>
        <a
          href="https://docs.seirs.app"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 bg-white text-[#0F2B4C] px-4 py-2 rounded-lg text-sm font-semibold hover:bg-white/90"
        >
          <ExternalLink size={14} />
          Open docs.seirs.app
        </a>
      </div>

      {/* Sections */}
      <div className="grid grid-cols-2 gap-4">
        <SectionCard
          title="API Reference"
          description="Every endpoint under /v1/* with request/response schemas, error codes, rate limits."
          Icon={FileText}
        />
        <SectionCard
          title="SDKs"
          description="@seirs/node, @seirs/php, @seirs/js — install snippets, type defs, sample integrations."
          Icon={Github}
        />
        <SectionCard
          title="Quickstart"
          description="5-minute integration walkthrough: get a test key, create your first delivery, handle webhooks."
          Icon={Zap}
        />
        <SectionCard
          title="Changelog"
          description="Versioned release notes. Notify-only API changes; breaking changes go through email + 90-day deprecation."
          Icon={BookOpen}
        />
      </div>

      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
        <p className="text-xs text-yellow-800 leading-relaxed">
          <strong>Build status:</strong> The docs site is a planned standalone Vercel project. URL above is placeholder — pointing it to a real deployment requires (1) creating the Mintlify/Nextra repo, (2) pushing initial content, (3) configuring DNS for docs.seirs.app. Roadmap: target v1 ship alongside the public <code className="bg-yellow-100 px-1 rounded">/v1/*</code> API surface.
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
