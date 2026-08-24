'use client';
/**
 * The red line across every admin page while any SOS alert is open
 * (founder 2026-08-23: "explain how the SOS will act on the admin
 * dashboard"). Until today alerts landed in a table nobody watched;
 * now every admin sees the banner within 20 seconds of a trigger,
 * wherever they are in the dashboard. Not dismissible: an open
 * emergency has no close button.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Siren } from 'lucide-react';
import { adminApi } from '@/lib/api';

export default function SosBanner() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      adminApi.sos.active()
        .then((rows: any[]) => { if (alive) setCount(rows?.length ?? 0); })
        .catch(() => {});
    tick();
    const t = setInterval(tick, 20_000);
    return () => { alive = false; clearInterval(t); };
  }, []);

  if (count === 0) return null;

  return (
    <Link
      href="/sos"
      className="flex items-center justify-center gap-2 bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-700"
    >
      <Siren size={16} className="animate-pulse" />
      {count === 1 ? '1 ACTIVE SOS ALERT' : `${count} ACTIVE SOS ALERTS`}: open the SOS desk
    </Link>
  );
}
