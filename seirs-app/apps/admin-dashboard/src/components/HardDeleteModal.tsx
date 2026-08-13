'use client';

import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

/**
 * Two-stage confirmation for an irreversible account purge.
 *
 * Stage 1 takes a reason (minimum 6 characters) which goes into the
 * legal audit log; stage 2 makes the admin type the account holder's
 * name. Both stages exist because this is the one action in the
 * dashboard with no undo: the account is archived with PII reduced and
 * removed from the live table immediately, skipping the 30-day grace
 * window.
 *
 * Lived inside users/[id]/page.tsx until 2026-08-13, when the recycle
 * bin needed the same guard. Copying it would have left two versions to
 * drift apart, and the weaker copy would be the one guarding the page
 * full of already-deleted accounts.
 */
export function HardDeleteModal({
  userName,
  onCancel,
  onConfirm,
}: {
  userName: string;
  onCancel: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
}) {
  const [stage,     setStage]     = useState<'reason' | 'confirm'>('reason');
  const [reason,    setReason]    = useState('');
  const [typedName, setTypedName] = useState('');
  const reasonOk = reason.trim().length >= 6;
  const nameOk   = typedName.trim() === userName;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle size={22} className="shrink-0 mt-0.5 text-red-500" />
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-[#0F2B4C] mb-1">
              NDPR hard-delete: {userName}
            </h3>
            <p className="text-xs text-gray-600 leading-relaxed">
              This bypasses the 30-day grace window. The account is archived (PII reduced) and
              purged from the live users table immediately. Cannot be undone.
            </p>
          </div>
        </div>

        {stage === 'reason' ? (
          <>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Reason for the legal audit log
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. NDPR erasure request received 2026-08-08 via support ticket #4821"
              className="w-full text-sm p-3 border border-gray-200 rounded-lg focus:outline-none focus:border-[#3A7BD5] min-h-[90px]"
              autoFocus
            />
            <p className={`text-xs mt-1 ${reasonOk ? 'text-gray-400' : 'text-red-500'}`}>
              {reasonOk ? `${reason.trim().length} characters` : `Minimum 6 characters (${reason.trim().length}/6)`}
            </p>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={onCancel}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#0F2B4C]/60 hover:bg-gray-100"
              >
                Cancel
              </button>
              <button
                disabled={!reasonOk}
                onClick={() => setStage('confirm')}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
              >
                Continue
              </button>
            </div>
          </>
        ) : (
          <>
            <label className="block text-xs font-semibold text-gray-700 mb-1">
              Type <span className="font-mono text-red-600">{userName}</span> to confirm
            </label>
            <input
              value={typedName}
              onChange={(e) => setTypedName(e.target.value)}
              placeholder={userName}
              className="w-full text-sm p-3 border border-gray-200 rounded-lg focus:outline-none focus:border-red-500 font-mono"
              autoFocus
            />
            <div className="mt-3 p-3 bg-gray-50 rounded-lg text-xs text-gray-600 leading-relaxed">
              <span className="font-semibold text-gray-700">Reason logged:</span> {reason.trim()}
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <button
                onClick={() => setStage('reason')}
                className="px-4 py-2 rounded-lg text-sm font-medium text-[#0F2B4C]/60 hover:bg-gray-100"
              >
                Back
              </button>
              <button
                disabled={!nameOk}
                onClick={() => onConfirm(reason)}
                className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-red-600 hover:bg-red-700 disabled:bg-red-300 disabled:cursor-not-allowed"
              >
                Purge account
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
