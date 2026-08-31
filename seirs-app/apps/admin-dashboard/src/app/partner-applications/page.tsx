'use client';

/**
 * Partner store applications: the approval queue.
 *
 * One job: decide whether a shop that has applied may start holding
 * other people's parcels. Everything needed for that decision (the
 * photos, the address, the phone number, how long they have waited) is
 * on the card, next to the two buttons, so nobody has to go and look
 * something up and come back.
 *
 * Spec V8 hybrid-account (2026-05-11). Approving flips the store to
 * APPROVED and sets the owner's capabilities.canPartner, which is what
 * turns the partner screens on in their app.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import {
  Phone, MapPin, Package, CheckCircle2, XCircle, Image as ImageIcon,
  AlertCircle, User, Clock,
} from 'lucide-react';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, usePrompt, useNotify } from '@/components/ConfirmDialog';

interface Application {
  id: string;
  userId: string;
  storeName: string;
  storeAddress: string;
  phone: string;
  maxCapacity: number;
  status: string;
  storefrontPhotoUrl: string | null;
  cacRegUrl: string | null;
  ownerIdUrl: string | null;
  reviewNote: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  createdAt: string;
}

/** How long this shop has been waiting on SEIRS, in words. */
function waitedFor(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (days <= 0) return 'today';
  if (days === 1) return '1 day ago';
  return `${days} days ago`;
}

export default function PartnerApplicationsPage() {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId,  setBusyId]  = useState<string | null>(null);
  const [error,   setError]   = useState<string | null>(null);
  const confirm = useConfirm();
  const prompt  = usePrompt();
  const notify  = useNotify();

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.partnerApplications()
      .then((list) => setApps(list))
      // A swallowed failure read as "no applications waiting", which is
      // the one thing this queue must never say when it is wrong.
      .catch((e: any) => { setApps([]); setError(e?.message ?? 'Could not load partner applications'); })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  /**
   * Approve used to be: browser prompt for an optional note, then
   * approve. Pressing Cancel on that prompt returned null, which the
   * code read as "no note" and approved the shop anyway. There was no
   * way to back out of the action once the button was pressed, on a
   * decision that lets a stranger start taking customers' parcels.
   */
  const approve = async (a: Application) => {
    const ok = await confirm({
      title:        `Let ${a.storeName} start holding parcels?`,
      message:      `From the moment you approve: customers can pick this shop as a collection point, drivers start being sent there, and the owner gets the partner screens in their SEIRS app. The shop is given a permanent shop code that goes on their shelf labels.\n\nCheck the shopfront photo against the address first. If it turns out badly, you can suspend the shop later from Partner stores.`,
      confirmLabel: 'Approve the shop',
    });
    if (!ok) return;

    const note = await prompt({
      title:       'Anything to say to them?',
      message:     `Optional. ${a.storeName}'s owner sees exactly these words in their app.`,
      label:       'Message to the applicant',
      placeholder: 'e.g. welcome aboard, keep the shelf clear of other stock',
      multiline:   true,
      confirmLabel:'Approve',
    });
    // Cancelling the note dialog now cancels the approval, which is what
    // pressing Cancel has always looked like it would do.
    if (note === null) return;

    setBusyId(a.id);
    try {
      await adminApi.approvePartnerStore(a.id, note.trim() || undefined);
      void notify({
        title:   'Shop approved',
        message: `${a.storeName} can now hold parcels, and its owner has the partner screens. It appears on the Partner stores page.`,
        tone:    'success',
      });
      load();
    } catch (e: any) {
      // The server refuses approval outright when the shop has no map
      // position or no shopfront photo. That message is the useful one,
      // so it is shown as written rather than replaced.
      setError(`${a.storeName} was NOT approved. ${e?.message ?? 'The server refused the request.'}`);
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (a: Application) => {
    const note = await prompt({
      title:       `Turn down ${a.storeName}?`,
      message:     'They keep their SEIRS account and can apply again with better photos or a corrected address. Nothing else about their account changes.',
      label:       'What do they need to fix',
      placeholder: 'e.g. the shopfront photo is too dark to read the sign, send one taken in daylight',
      minLength:   4,
      multiline:   true,
      helper:      'The applicant reads this word for word in their app, so write it to them, not about them.',
      confirmLabel:'Turn it down',
      danger:      true,
    });
    if (!note?.trim()) return;
    setBusyId(a.id);
    try {
      await adminApi.rejectPartnerStore(a.id, note.trim());
      void notify({
        title:   'Application turned down',
        message: `${a.storeName} has been told what to fix and can apply again.`,
        tone:    'success',
      });
      load();
    } catch (e: any) {
      setError(`${a.storeName} was NOT turned down: ${e?.message ?? 'the server refused the request'}.`);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <PageIntro
          title="Shops waiting to join"
          purpose="Look at what each shop sent in and decide whether they can start holding SEIRS parcels for customers to collect."
          storageKey="partner-applications"
          help={
            <>
              <p><b>Approve</b> makes the shop pickable by customers straight away and switches on the partner screens in the owner's app. It also mints their permanent shop code.</p>
              <p><b>Turn down</b> sends your words to the applicant, unchanged, in their app. They can fix the problem and apply again, so say what is wrong.</p>
              <p>A shop cannot be approved without a map position and a shopfront photo. The server refuses it, because a shop with no coordinates can never be dispatched to.</p>
              <p>Approved shops are then managed on <Link className="font-semibold text-[#3A7BD5] hover:underline" href="/partners">Partner stores</Link>.</p>
            </>
          }
          actions={
            <button
              onClick={load}
              className="px-4 py-2 text-sm font-medium text-[#3A7BD5] bg-[#3A7BD5]/5 rounded-lg hover:bg-[#3A7BD5]/10"
            >
              Refresh
            </button>
          }
        />

        {error && (
          <div className="mb-4 flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="shrink-0 mt-0.5" />
            <span className="flex-1">{error}</span>
            <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Try again</button>
          </div>
        )}

        {loading ? (
          <div className="text-gray-500 text-sm">Loading…</div>
        ) : error && apps.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white">
            <EmptyState
              icon={<AlertCircle size={20} />}
              title="The queue would not load"
              body="This is the dashboard failing to read, not an empty queue. Applications are safe and still waiting."
              action={{ label: 'Try again', onClick: load }}
            />
          </div>
        ) : apps.length === 0 ? (
          /* An empty approval queue is the best news of the day and was
             rendered in the same grey as a fault. */
          <div className="rounded-2xl border border-gray-200 bg-white">
            <EmptyState
              icon={<CheckCircle2 size={20} />}
              tone="good"
              title="Nobody is waiting"
              body="Every shop that applied has been dealt with. New applications land here as soon as a shop submits one."
              action={{ label: 'See the shops already on SEIRS', href: '/partners' }}
            />
          </div>
        ) : (
          <>
            {/* Oldest first is the server's order, and it is the right one
                here: it says who has been kept waiting longest. */}
            <p className="mb-3 text-sm text-gray-500">
              {apps.length} shop{apps.length === 1 ? '' : 's'} waiting, the one who applied first at the top.
            </p>
            <div className="space-y-5">
              {apps.map((a) => {
                // The list endpoint returns the whole store row, so the
                // coordinates are here even though the declared type omits
                // them. Only warn when the field is genuinely present and
                // empty, never when it was simply not sent.
                const raw = a as unknown as Record<string, unknown>;
                const coordsKnown = 'storeLat' in raw && 'storeLng' in raw;
                const missingCoords = coordsKnown && (raw.storeLat == null || raw.storeLng == null);
                const missingPhoto  = !a.storefrontPhotoUrl;
                const blocked = missingCoords || missingPhoto;
                return (
                  <div key={a.id} className="bg-white border border-gray-200 rounded-2xl p-6">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-5">
                      <div>
                        <h2 className="text-lg font-bold text-[#0F2B4C]">{a.storeName}</h2>
                        <p className="mt-0.5 flex items-center gap-1.5 text-xs text-gray-500">
                          <Clock size={11} />
                          Applied {waitedFor(a.createdAt)}, on {new Date(a.createdAt).toLocaleString('en-NG')}
                        </p>
                      </div>
                      <span className="px-3 py-1 text-xs font-semibold text-amber-700 bg-amber-100 rounded-full">
                        Waiting on you
                      </span>
                    </div>

                    {/*
                      The server refuses these two outright, and the admin
                      used to find that out only by pressing Approve and
                      reading a red error.
                    */}
                    {blocked && (
                      <div className="mb-5 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                        <AlertCircle size={14} className="mt-0.5 shrink-0" />
                        <span>
                          <b>This one cannot be approved yet.</b>{' '}
                          {missingCoords && 'It has no position on the map, so no driver could ever be sent to it: ask the owner to re-enter the address by picking one of the suggestions instead of typing it. '}
                          {missingPhoto && 'There is no shopfront photo, so nobody can recognise the shop on arrival and there is no evidence a real premises was checked.'}
                        </span>
                      </div>
                    )}

                    {/* Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                      <Field icon={MapPin}  label="Where it is"      value={a.storeAddress || 'No address given'} />
                      <Field icon={Phone}   label="Who to ring"      value={a.phone || 'No phone number given'} />
                      <Field icon={Package} label="How many a day they can take" value={a.maxCapacity == null ? 'Not stated' : `${a.maxCapacity} parcels`} />
                      {/*
                        This slot showed eight characters of the owner's
                        internal id, which told the reviewer nothing and
                        led nowhere. It is now the way into the account
                        behind the application: their other shops, their
                        verification, their history.
                      */}
                      <div className="flex items-start gap-2">
                        <User size={14} className="mt-0.5 flex-shrink-0 text-gray-400" strokeWidth={1.75} />
                        <div className="min-w-0">
                          <div className="text-xs text-gray-500">Who applied</div>
                          <Link href={`/users/${a.userId}`} className="text-sm font-medium text-[#3A7BD5] hover:underline">
                            Open the applicant&apos;s account
                          </Link>
                        </div>
                      </div>
                    </div>

                    {/* What they sent in */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-5">
                      <DocSlot label="Photo of the shopfront" url={a.storefrontPhotoUrl} required />
                      <DocSlot label="The owner's ID"         url={a.ownerIdUrl}         required />
                      <DocSlot label="CAC certificate"        url={a.cacRegUrl}          required={false} />
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3 pt-4 border-t border-gray-100">
                      <button
                        onClick={() => approve(a)}
                        disabled={busyId === a.id}
                        title="Lets customers pick this shop and switches on the owner's partner screens"
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                      >
                        <CheckCircle2 size={16} strokeWidth={2} />
                        {busyId === a.id ? 'Working…' : 'Approve this shop'}
                      </button>
                      <button
                        onClick={() => reject(a)}
                        disabled={busyId === a.id}
                        title="Sends your reason to the applicant. They can fix it and apply again."
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 disabled:opacity-50"
                      >
                        <XCircle size={16} strokeWidth={2} />
                        Turn it down
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Field({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={14} className="text-gray-400 mt-0.5 flex-shrink-0" strokeWidth={1.75} />
      <div className="min-w-0">
        <div className="text-xs text-gray-500">{label}</div>
        <div className="text-sm text-[#0F2B4C] font-medium truncate" title={value}>{value}</div>
      </div>
    </div>
  );
}

function DocSlot({ label, url, required }: { label: string; url: string | null; required: boolean }) {
  if (!url) {
    return (
      <div className="border border-dashed border-gray-200 rounded-xl p-4 text-center">
        <ImageIcon size={20} className="mx-auto text-gray-300 mb-2" strokeWidth={1.5} />
        <div className="text-xs font-medium text-gray-500">{label}</div>
        <div className={`text-[11px] mt-0.5 ${required ? 'font-semibold text-amber-700' : 'text-gray-400'}`}>
          {required ? 'Missing, and it is required' : 'Not sent, and that is allowed'}
        </div>
      </div>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      title="Opens the full-size picture in a new tab"
      className="block border border-gray-200 rounded-xl overflow-hidden hover:border-[#3A7BD5] transition"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={url} alt={label} className="w-full h-32 object-cover bg-gray-50" />
      <div className="px-3 py-2 text-xs font-medium text-[#0F2B4C] bg-white">
        {label}
        <span className="ml-1 text-gray-400">(click to enlarge)</span>
      </div>
    </a>
  );
}
