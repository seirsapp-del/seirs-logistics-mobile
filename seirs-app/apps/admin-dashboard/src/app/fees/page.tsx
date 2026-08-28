'use client';
/**
 * The Fee Catalogue moved into Pricing (founder, 2026-08-28).
 *
 * It is the second half of /pricing now, because splitting the numbers
 * that decide what a customer pays across two menu entries was the cause
 * of every question he asked about pricing.
 *
 * This route survives as a redirect rather than being deleted: links to
 * /fees exist in commit messages, in the audit artifact, and in the
 * habits of anybody who has used this dashboard. A dead link is a worse
 * outcome than a redirect, and the anchor drops them at the right half
 * of the page rather than the top of it.
 */
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function FeesMoved() {
  const router = useRouter();
  useEffect(() => { router.replace('/pricing#fees'); }, [router]);

  return (
    <div className="p-8">
      <p className="text-sm font-semibold text-[#0F2B4C]">The Fee Catalogue is part of Pricing now.</p>
      <p className="mt-1 text-sm text-[#0F2B4C]/55">
        Taking you there. If nothing happens,{' '}
        <Link href="/pricing#fees" className="font-semibold text-[#3A7BD5] hover:underline">
          open Pricing
        </Link>.
      </p>
    </div>
  );
}
