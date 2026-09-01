'use client';

/**
 * The bare /verify path, with a box to type a reference into.
 *
 * The printed URL carries the code, so most readers never see this. It
 * exists because the people who do are the ones most likely to be
 * treated badly by a 404: somebody typing the address off paper who
 * stops at the slash, or whose code is smudged. Landing them on "page
 * not found" while they are checking whether a document is genuine
 * answers the question in exactly the wrong direction, which is the
 * same failure the /verify/[code] route was built to fix.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ShieldCheck } from 'lucide-react';

export default function VerifyIndexPage() {
  const router = useRouter();
  const [code, setCode] = useState('');

  const clean = code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (clean) router.push(`/verify/${encodeURIComponent(clean)}`);
  };

  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <div className="rounded-2xl bg-white p-8 shadow-sm">
        <ShieldCheck className="mb-3 text-slate-400" size={30} />
        <h1 className="mb-1 text-lg font-bold text-slate-900">Verify a SEIRS statement</h1>
        <p className="mb-5 text-sm text-slate-600">
          Enter the reference printed at the foot of the document to see the figures
          SEIRS issued. No account needed.
        </p>

        <form onSubmit={submit} className="flex gap-2">
          <input
            value={code}
            onChange={e => setCode(e.target.value)}
            placeholder="STM-XXXXXXXX"
            autoCapitalize="characters"
            spellCheck={false}
            className="min-w-0 flex-1 rounded-lg border border-slate-200 px-3 py-2 font-mono text-sm text-slate-900 outline-none focus:border-slate-400"
          />
          <button
            type="submit"
            disabled={!clean}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40"
          >
            Check
          </button>
        </form>
      </div>
    </main>
  );
}
