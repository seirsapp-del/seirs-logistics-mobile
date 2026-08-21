'use client';
import { useState } from 'react';
import { adminApi } from '@/lib/api';

// Deliver an official document into a user's in-app Documents screen.
// Either pasted text (rendered in-app) or an uploaded file: the file
// goes to SEIRS's own R2 storage under /documents and the app opens
// the resulting URL. Users get an in-app notification automatically.
// Extracted from /users/[id] so /drivers/[id] and /partners/[id] can
// send documents too: drivers and partners are still customers.
export function SendDocumentModal({
  userName,
  userId,
  onClose,
}: {
  userName: string;
  userId: string;
  onClose: () => void;
}) {
  const [title,    setTitle]    = useState('');
  const [category, setCategory] = useState('letter');
  const [body,     setBody]     = useState('');
  const [file,     setFile]     = useState<File | null>(null);
  const [busy,     setBusy]     = useState(false);

  const canSend = title.trim().length >= 3 && (body.trim().length > 0 || !!file);

  const send = async () => {
    if (!canSend) return;
    setBusy(true);
    try {
      let fileUrl: string | undefined;
      if (file) {
        const up = await adminApi.upload.image(file, 'documents');
        fileUrl = up.url;
      }
      await adminApi.documents.send(userId, {
        title:    title.trim(),
        category,
        body:     body.trim() || undefined,
        fileUrl,
      });
      alert(`Document delivered to ${userName}. They see it in Documents and got a notification.`);
      onClose();
    } catch (e: any) {
      alert(e?.message ?? 'Send failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-bold text-gray-900">Send document to {userName}</h2>
        <p className="mt-1 text-xs text-gray-500">
          Paste the document text, or attach a PDF/image (stored in SEIRS cloud storage; the user's app opens it).
        </p>

        <label className="mt-4 block text-xs font-semibold text-gray-600">Title</label>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder='e.g. "Partner Store Agreement 2026"'
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />

        <label className="mt-3 block text-xs font-semibold text-gray-600">Category</label>
        <select
          value={category}
          onChange={e => setCategory(e.target.value)}
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm bg-white"
        >
          <option value="contract">Contract</option>
          <option value="letter">Letter</option>
          <option value="statement">Statement</option>
          <option value="policy">Policy</option>
          <option value="other">Other</option>
        </select>

        <label className="mt-3 block text-xs font-semibold text-gray-600">Document text (rendered in-app)</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={5}
          placeholder="Paste the document text here, or leave empty and attach a file below."
          className="mt-1 w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
        />

        <label className="mt-3 block text-xs font-semibold text-gray-600">Or attach a file (PDF, JPEG, PNG)</label>
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png"
          onChange={e => setFile(e.target.files?.[0] ?? null)}
          className="mt-1 w-full text-sm"
        />
        {file && <p className="mt-1 text-xs text-gray-500">{file.name} · {(file.size / 1024).toFixed(0)} KB</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-100">
            Cancel
          </button>
          <button
            onClick={send}
            disabled={!canSend || busy}
            className="rounded-lg bg-[#3A7BD5] px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Send document'}
          </button>
        </div>
      </div>
    </div>
  );
}
