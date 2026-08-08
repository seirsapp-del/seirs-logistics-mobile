'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Driver KYC review lives on /drivers?status=pending. This page used to
// duplicate that view with placeholder data. Kept as a redirect so any
// bookmarks or nav items resolve to the real queue instead of a stub.
export default function KycRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/drivers?status=pending');
  }, [router]);
  return (
    <div className="min-h-[60vh] flex items-center justify-center text-gray-400 text-sm">
      Redirecting to Driver KYC queue…
    </div>
  );
}
