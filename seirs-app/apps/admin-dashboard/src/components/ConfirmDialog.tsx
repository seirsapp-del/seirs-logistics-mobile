'use client';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';

/**
 * In-app dialogs for the admin dashboard: confirm, prompt and notify.
 *
 * Why these exist at all (A-M22, sweep 2026-08-23): nine destructive or
 * audited actions still called the browser's prompt(), confirm() and
 * alert(). prompt() in particular is blocked outright in some browser
 * configurations, and Chrome suppresses repeat dialogs after a user
 * ticks "prevent this page from creating more dialogs". When that
 * happens prompt() returns null with no visible dialog, so the flow
 * looks like a dead button: the admin clicks Suspend, nothing appears,
 * nothing happens, and there is no error to report. Every one of those
 * actions writes to an audit log or is visible to a real user, so a
 * silently unusable flow is not acceptable. users/[id] documented the
 * decision to stop doing this; this module is the shared version.
 *
 * The other reason is validation. prompt() can only validate AFTER the
 * dialog closes, which is why the old code popped a second alert saying
 * "a real reason is required" and threw the admin's typed text away.
 * PromptDialog validates live and keeps the text.
 */

export interface ConfirmOptions {
  message:       string;
  title?:        string;
  confirmLabel?: string;
  cancelLabel?:  string;
  danger?:       boolean;
}

export interface PromptOptions {
  message:       string;
  title?:        string;
  /** Label above the field. Defaults to "Reason". */
  label?:        string;
  placeholder?:  string;
  initialValue?: string;
  confirmLabel?: string;
  cancelLabel?:  string;
  danger?:       boolean;
  multiline?:    boolean;
  /** Minimum trimmed length. 0 (the default) makes the field optional. */
  minLength?:    number;
  /** Small print under the field: who sees this text, what it is kept for. */
  helper?:       string;
  numeric?:      boolean;
}

export interface NotifyOptions {
  message:       string;
  title?:        string;
  tone?:         'info' | 'success' | 'error';
  confirmLabel?: string;
}

type Pending =
  | { kind: 'confirm'; opts: ConfirmOptions }
  | { kind: 'prompt';  opts: PromptOptions  }
  | { kind: 'notify';  opts: NotifyOptions  };

type Resolver = (v: any) => void;

interface DialogApi {
  confirm: (opts: ConfirmOptions | string) => Promise<boolean>;
  /** Resolves with the typed text, or null if the admin cancelled. */
  prompt:  (opts: PromptOptions  | string) => Promise<string | null>;
  notify:  (opts: NotifyOptions  | string) => Promise<void>;
}

const Ctx = createContext<DialogApi | null>(null);

function useDialogs(): DialogApi {
  const api = useContext(Ctx);
  if (!api) throw new Error('Dialog hooks must be used inside <ConfirmProvider>');
  return api;
}

export function useConfirm() { return useDialogs().confirm; }
export function usePrompt()  { return useDialogs().prompt;  }

/**
 * alert() replacement. Awaiting it is optional: fire-and-forget with
 * `void notify(...)` reads fine for a success toast, and awaiting it is
 * useful when the next step should not start until the admin has read
 * the message.
 */
export function useNotify()  { return useDialogs().notify;  }

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const resolverRef           = useRef<Resolver | null>(null);

  const open = useCallback((p: Pending) => {
    setPending(p);
    return new Promise<any>((res) => { resolverRef.current = res; });
  }, []);

  const close = (result: any) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setPending(null);
  };

  const api = useMemo<DialogApi>(() => ({
    confirm: (o) => open({ kind: 'confirm', opts: typeof o === 'string' ? { message: o } : o }),
    prompt:  (o) => open({ kind: 'prompt',  opts: typeof o === 'string' ? { message: o } : o }),
    notify:  (o) => open({ kind: 'notify',  opts: typeof o === 'string' ? { message: o } : o }),
  }), [open]);

  return (
    <Ctx.Provider value={api}>
      {children}
      {pending?.kind === 'confirm' && (
        <ConfirmDialog
          {...pending.opts}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
      {pending?.kind === 'prompt' && (
        <PromptDialog
          {...pending.opts}
          onSubmit={(v) => close(v)}
          onCancel={() => close(null)}
        />
      )}
      {pending?.kind === 'notify' && (
        <NotifyDialog {...pending.opts} onClose={() => close(undefined)} />
      )}
    </Ctx.Provider>
  );
}

/** Shared chrome so confirm, prompt and notify are visibly one family. */
function Shell({
  children,
  onDismiss,
  wide,
}: {
  children:  React.ReactNode;
  onDismiss: () => void;
  wide?:     boolean;
}) {
  // Escape has to work: an admin who opens the wrong dialog should not
  // have to aim at a Cancel button to get out of a destructive flow.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onDismiss(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onDismiss]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onDismiss}
    >
      <div
        className={`bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] p-6 w-full ${wide ? 'max-w-md' : 'max-w-sm'}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  message,
  title,
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  danger       = false,
  onConfirm,
  onCancel,
}: ConfirmOptions & { onConfirm: () => void; onCancel: () => void }) {
  return (
    <Shell onDismiss={onCancel}>
      <div className="flex items-start gap-3 mb-5">
        <AlertTriangle
          size={20}
          className={`shrink-0 mt-0.5 ${danger ? 'text-red-500' : 'text-amber-500'}`}
        />
        <div className="min-w-0">
          {title && <h3 className="text-sm font-bold text-[#0F2B4C] mb-1">{title}</h3>}
          <p className="text-sm text-[#0F2B4C] leading-relaxed whitespace-pre-wrap">{message}</p>
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-[#0F2B4C]/60 hover:bg-[#F5F5F0] transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          onClick={onConfirm}
          autoFocus
          className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#3A7BD5] hover:bg-[#2a6bc4]'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Shell>
  );
}

/**
 * The text-entry dialog. Styled after RejectDriverModal in drivers/[id],
 * which is where this pattern was first written by hand.
 */
export function PromptDialog({
  message,
  title,
  label        = 'Reason',
  placeholder,
  initialValue = '',
  confirmLabel = 'Submit',
  cancelLabel  = 'Cancel',
  danger       = false,
  multiline    = true,
  minLength    = 0,
  helper,
  numeric      = false,
  onSubmit,
  onCancel,
}: PromptOptions & { onSubmit: (value: string) => void; onCancel: () => void }) {
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  const tooShort = minLength > 0 && trimmed.length < minLength;

  const submit = () => { if (!tooShort) onSubmit(value); };

  const fieldClasses =
    'w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm text-[#0F2B4C] outline-none focus:border-[#3A7BD5] focus:ring-2 focus:ring-[#3A7BD5]/20';

  return (
    <Shell onDismiss={onCancel} wide>
      <div className="mb-4">
        {title && <h3 className="text-sm font-bold text-[#0F2B4C] mb-1">{title}</h3>}
        <p className="text-sm text-[#0F2B4C]/70 leading-relaxed whitespace-pre-wrap">{message}</p>
      </div>

      <label className="block text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
        {label}{minLength > 0 && <span className="text-red-500"> *</span>}
      </label>
      {multiline && !numeric ? (
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          rows={3}
          autoFocus
          className={`${fieldClasses} resize-y`}
        />
      ) : (
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          autoFocus
          inputMode={numeric ? 'numeric' : 'text'}
          onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
          className={fieldClasses}
        />
      )}

      <div className="mt-1.5 flex items-start justify-between gap-3">
        <p className="text-[11px] text-gray-500 leading-relaxed">{helper}</p>
        {minLength > 0 && (
          <p className={`text-[11px] shrink-0 tabular-nums ${tooShort ? 'text-red-500' : 'text-gray-400'}`}>
            {trimmed.length}/{minLength}
          </p>
        )}
      </div>

      <div className="flex justify-end gap-2 mt-5">
        <button
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-sm font-medium text-[#0F2B4C]/60 hover:bg-[#F5F5F0] transition-colors"
        >
          {cancelLabel}
        </button>
        <button
          onClick={submit}
          disabled={tooShort}
          className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
            danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#3A7BD5] hover:bg-[#2a6bc4]'
          }`}
        >
          {confirmLabel}
        </button>
      </div>
    </Shell>
  );
}

export function NotifyDialog({
  message,
  title,
  tone         = 'info',
  confirmLabel = 'OK',
  onClose,
}: NotifyOptions & { onClose: () => void }) {
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'error' ? XCircle : Info;
  const iconClass =
    tone === 'success' ? 'text-emerald-600' : tone === 'error' ? 'text-red-500' : 'text-[#3A7BD5]';

  return (
    <Shell onDismiss={onClose}>
      <div className="flex items-start gap-3 mb-5">
        <Icon size={20} className={`shrink-0 mt-0.5 ${iconClass}`} />
        <div className="min-w-0">
          {title && <h3 className="text-sm font-bold text-[#0F2B4C] mb-1">{title}</h3>}
          <p className="text-sm text-[#0F2B4C] leading-relaxed whitespace-pre-wrap break-words">{message}</p>
        </div>
      </div>
      <div className="flex justify-end">
        <button
          onClick={onClose}
          autoFocus
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white bg-[#3A7BD5] hover:bg-[#2a6bc4] transition-colors"
        >
          {confirmLabel}
        </button>
      </div>
    </Shell>
  );
}
