'use client';
import { useEffect, useState } from 'react';
import { Lock } from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';

// Sectioned detail row: a labeled card with a two-column key/value grid.
// Shared across /users/[id] and /drivers/[id] so both detail pages
// have identical visual rhythm.
export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
      <h3 className="text-sm font-bold text-[#0F2B4C] mb-3">{title}</h3>
      <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
        {children}
      </div>
    </div>
  );
}

// Key/value field. Renders "-" when value is null/undefined/empty string so
// missing data reads as intentional rather than broken.
export function Field({ label, value }: { label: string; value: any }) {
  const display = value === null || value === undefined || value === '' ? '-' : String(value);
  const isEmpty = display === '-';
  return (
    <div>
      <div className="text-xs text-gray-400">{label}</div>
      <div className={`text-sm ${isEmpty ? 'text-gray-300' : 'text-[#0F2B4C]'}`}>{display}</div>
    </div>
  );
}

// Thumbnail preview for uploaded identity documents. Opens the full image
// in a new tab. Used inside IdentityDocsReveal after explicit reveal.
export function IdThumb({ src, label }: { src: string; label: string }) {
  return (
    <a href={src} target="_blank" rel="noopener noreferrer" className="block">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <img src={src} alt={label} className="w-24 h-32 object-cover rounded border border-gray-200 hover:border-[#3A7BD5] transition-colors" />
    </a>
  );
}

// PII reveal for identity documents. Docs stay hidden until an admin taps
// "Reveal ID documents (audited)" → confirms → server verifies role +
// writes a pii_view audit row → returns URLs → images render for 60
// seconds then auto-blur again. Non-authorized roles see a 403.
export function IdentityDocsReveal({ userId }: { userId: string }) {
  const [state, setState] = useState<'hidden' | 'loading' | 'revealed' | 'blurred' | 'forbidden' | 'error'>('hidden');
  const [docs,  setDocs]  = useState<any>(null);
  const [err,   setErr]   = useState<string | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const confirm = useConfirm();

  useEffect(() => {
    if (state !== 'revealed' || secondsLeft <= 0) return;
    const id = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [state, secondsLeft]);

  useEffect(() => {
    if (state === 'revealed' && secondsLeft === 0) setState('blurred');
  }, [state, secondsLeft]);

  const doReveal = async () => {
    const ok = await confirm({
      title:        'Reveal identity documents?',
      message:      'This will show the user’s NIN/licence/passport photo + selfie for 60 seconds. Every reveal is logged with your name and IP for the compliance audit trail. Only reveal if you have a legitimate business reason.',
      confirmLabel: 'Reveal (audited)',
      danger:       true,
    });
    if (!ok) return;
    setState('loading');
    setErr(null);
    try {
      const data = await adminApi.identity.reveal(userId);
      setDocs(data);
      setSecondsLeft(60);
      setState('revealed');
    } catch (e: any) {
      const msg = e?.message ?? 'Reveal failed';
      if (msg.toLowerCase().includes('requires')) {
        setState('forbidden');
      } else {
        setState('error');
      }
      setErr(msg);
    }
  };

  if (state === 'forbidden') {
    return (
      <div className="p-4 border border-red-200 bg-red-50 rounded-lg text-sm text-red-800">
        <div className="font-semibold mb-1">Identity documents restricted</div>
        <div className="text-xs">{err}</div>
      </div>
    );
  }

  if (state === 'error') {
    return (
      <div className="p-4 border border-red-200 bg-red-50 rounded-lg text-sm text-red-800">
        <div className="font-semibold mb-1">Reveal failed</div>
        <div className="text-xs">{err}</div>
        <button onClick={() => { setState('hidden'); setErr(null); }} className="text-xs underline mt-2">Try again</button>
      </div>
    );
  }

  if (state === 'revealed' && docs) {
    return (
      <div>
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs text-emerald-700 font-semibold">
            ● Documents revealed. Auto-blur in {secondsLeft}s.
          </div>
          <button onClick={() => setState('blurred')} className="text-xs text-gray-500 hover:text-gray-700 underline">Hide now</button>
        </div>
        <div className="flex gap-3">
          {docs.documentPhotoUrl     && <IdThumb src={docs.documentPhotoUrl}     label="Front" />}
          {docs.documentBackPhotoUrl && <IdThumb src={docs.documentBackPhotoUrl} label="Back" />}
          {docs.selfiePhotoUrl       && <IdThumb src={docs.selfiePhotoUrl}       label="Selfie" />}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 border border-gray-200 bg-gray-50 rounded-lg">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-gray-200 flex items-center justify-center flex-shrink-0">
          <Lock size={16} className="text-gray-600" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-[#0F2B4C]">Identity documents</div>
          <div className="text-xs text-gray-600 mt-0.5">
            The user’s ID photos and selfie are hidden by default. Reveal only when needed.
            Every reveal is audit-logged.
          </div>
        </div>
        <button
          onClick={doReveal}
          disabled={state === 'loading'}
          className="shrink-0 text-xs px-3 py-1.5 rounded-lg font-semibold bg-[#0F2B4C] text-white hover:bg-[#0a1b30] disabled:opacity-50"
        >
          {state === 'loading' ? 'Revealing…' : state === 'blurred' ? 'Reveal again' : 'Reveal ID documents'}
        </button>
      </div>
    </div>
  );
}
