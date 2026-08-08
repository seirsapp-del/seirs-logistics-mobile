'use client';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export interface ConfirmOptions {
  message:       string;
  title?:        string;
  confirmLabel?: string;
  cancelLabel?:  string;
  danger?:       boolean;
}

type Resolver = (v: boolean) => void;

const Ctx = createContext<((opts: ConfirmOptions | string) => Promise<boolean>) | null>(null);

export function useConfirm() {
  const fn = useContext(Ctx);
  if (!fn) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return fn;
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [opts, setOpts]   = useState<ConfirmOptions | null>(null);
  const resolverRef       = useRef<Resolver | null>(null);

  const confirm = useCallback((o: ConfirmOptions | string) => {
    const options: ConfirmOptions = typeof o === 'string' ? { message: o } : o;
    setOpts(options);
    return new Promise<boolean>((res) => { resolverRef.current = res; });
  }, []);

  const close = (result: boolean) => {
    resolverRef.current?.(result);
    resolverRef.current = null;
    setOpts(null);
  };

  const value = useMemo(() => confirm, [confirm]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {opts && (
        <ConfirmDialog
          {...opts}
          onConfirm={() => close(true)}
          onCancel={() => close(false)}
        />
      )}
    </Ctx.Provider>
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] p-6 max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
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
      </div>
    </div>
  );
}
