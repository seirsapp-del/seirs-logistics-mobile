'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Cookie, X } from 'lucide-react';

// Spec V8 — NDPR-compliant cookie banner. NDPR Article 25 requires
// explicit consent before non-essential cookies (analytics, ads) fire.
// We only read/persist a localStorage flag; no third-party trackers on
// the marketing site yet. When analytics ship, gate the script tag on
// `consentGiven === 'accepted'`.

const STORAGE_KEY = 'seirs.cookie_consent';
type Consent = 'accepted' | 'declined' | null;

export default function CookieBanner() {
  const [consent, setConsent] = useState<Consent>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const stored = (typeof window !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null) as Consent;
    setConsent(stored);
    setHydrated(true);
  }, []);

  const decide = (choice: 'accepted' | 'declined') => {
    localStorage.setItem(STORAGE_KEY, choice);
    setConsent(choice);
  };

  // Don't render until we know the persisted choice — prevents flash
  // on every page load for returning visitors.
  if (!hydrated || consent !== null) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-6 sm:bottom-6 sm:max-w-md z-40">
      <div className="bg-white rounded-xl shadow-2xl border border-gray-200 p-5">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-sky/10 flex items-center justify-center shrink-0">
            <Cookie size={20} className="text-sky" />
          </div>
          <div className="flex-1">
            <h2 className="font-bold text-navy text-sm">Cookies on seirs.app</h2>
            <p className="text-xs text-gray-600 mt-1 leading-relaxed">
              We use essential cookies to make this site work and optional cookies for analytics so we can improve it. You can change your mind anytime in the <Link href="/privacy-policy" className="text-sky underline">Privacy Policy</Link>.
            </p>
          </div>
          <button
            onClick={() => decide('declined')}
            aria-label="Dismiss"
            className="text-gray-300 hover:text-gray-600 -mr-1 -mt-1"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => decide('declined')}
            className="flex-1 px-3 py-2 text-xs font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            Essential only
          </button>
          <button
            onClick={() => decide('accepted')}
            className="flex-1 px-3 py-2 text-xs font-semibold text-white bg-navy hover:bg-sky rounded-lg transition-colors"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}
