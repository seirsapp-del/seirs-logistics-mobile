'use client';
/**
 * The email gallery (founder spec, agreed 2026-08-27, built 2026-08-28).
 *
 * His words: "a gallery of real designs you can see in the dashboard
 * with colours and images, the ability to build new ones, seasonal cases
 * like Christmas and birthdays, a scheduler, and critically a
 * non-technical person editing text and seeing the actual email, not
 * markup."
 *
 * What this replaces: a sidebar of slugs beside a textarea of raw HTML,
 * with a preview its own code called "rough" because it dropped the body
 * into a div with no header, banner, colour, footer or table layout. The
 * person editing SEIRS's outgoing email was writing markup and approving
 * something they had never seen.
 *
 * Three decisions worth stating.
 *
 * THUMBNAILS ARE THE REAL EMAIL. Each card renders the server's
 * `renderedHtml` in a sandboxed iframe, scaled down. Not a mock, not an
 * approximation: the exact output of the baseTemplate() every send goes
 * through. A gallery of fake previews would be worse than a list.
 *
 * THE EDITOR IS TEXT, NOT HTML. You type paragraphs. The HTML is
 * generated. An "advanced" escape hatch exists for the templates whose
 * bodies contain markup a paragraph box cannot round-trip, and it is
 * entered deliberately rather than being the default anybody lands in.
 *
 * SYSTEM AND CUSTOM ARE SEPARATED. Automatic emails are sent by a code
 * path on an event: they can be reworded but not deleted, and never
 * chosen from a list. Seasonal and campaign templates are the ones a
 * person browses, picks and creates. Mixing them is how somebody deletes
 * the password-reset email.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Mail, Plus, Search, Send, Trash2, Save, X, Eye, Palette,
  Image as ImageIcon, Sparkles, Lock, Code2, RotateCcw, Loader2,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { useConfirm, usePrompt, useNotify } from '@/components/ConfirmDialog';

type Tpl = Awaited<ReturnType<typeof adminApi.emailTemplates.list>>[number];

const CATEGORY_LABEL: Record<string, string> = {
  seasonal:      'Seasonal',
  campaign:      'Campaign',
  transactional: 'Sent automatically',
  security:      'Security',
};

/** What a person picks and writes, versus what the app fires on an event. */
const BROWSABLE = new Set(['seasonal', 'campaign']);

/* ─────────────────────────────────────────────────────────────────────
   Text in, HTML out.

   The founder's hard requirement is that somebody non-technical edits
   TEXT. So the editor's unit is a paragraph and the markup is generated.
   These two functions are the round trip, and `isSimple` is the honest
   check on whether a given body survives it: anything with lists,
   tables, images or inline styles is left to the advanced box rather
   than being silently flattened.
   ──────────────────────────────────────────────────────────────────── */
function htmlToText(html: string): string {
  return String(html ?? '')
    .replace(/<\/p>\s*<p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?p>/gi, '')
    .replace(/<b>(.*?)<\/b>/gi, '**$1**')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/&nbsp;/g, ' ')
    .trim();
}

function textToHtml(text: string): string {
  const esc = (t: string) => t
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return String(text ?? '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean)
    .map(p => `<p>${esc(p).replace(/\n/g, '<br/>').replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')}</p>`)
    .join('');
}

/** Does this body survive the text round trip without losing anything? */
function isSimple(html: string): boolean {
  const h = String(html ?? '');
  if (/<(ul|ol|li|table|img|div|a|h[1-6]|span|style)\b/i.test(h)) return false;
  return htmlToText(textToHtml(htmlToText(h))) === htmlToText(h);
}

/* ─────────────────────────────────────────────────────────────────────
   A real email, drawn small.
   ──────────────────────────────────────────────────────────────────── */
function Thumb({ html, height = 190 }: { html: string; height?: number }) {
  return (
    <div
      className="relative w-full overflow-hidden rounded-lg border border-[#E5E7EB] bg-[#F3F4F6]"
      style={{ height }}
    >
      <iframe
        title="Email preview"
        /* sandbox with no allow-scripts: a template body is content, and
           content should never be able to run anything in the dashboard. */
        sandbox=""
        srcDoc={html}
        aria-hidden
        tabIndex={-1}
        className="pointer-events-none absolute left-0 top-0 origin-top-left border-0"
        style={{ width: 640, height: height / 0.44, transform: 'scale(0.44)' }}
      />
    </div>
  );
}

export default function EmailGallery() {
  const confirm = useConfirm();
  const prompt  = usePrompt();
  const notify  = useNotify();

  const [all, setAll]         = useState<Tpl[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [q, setQ]             = useState('');
  const [group, setGroup]     = useState<'browse' | 'auto'>('browse');
  const [openKey, setOpenKey] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    adminApi.emailTemplates.list()
      .then(rows => setAll(Array.isArray(rows) ? rows : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load the templates'))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return all
      .filter(t => (group === 'browse' ? BROWSABLE.has(t.category) : !BROWSABLE.has(t.category)))
      .filter(t => !term || [t.name, t.key, t.renderedSubject].some(v =>
        String(v ?? '').toLowerCase().includes(term)));
  }, [all, q, group]);

  const openTpl = all.find(t => t.key === openKey) ?? null;

  const create = async () => {
    const name = await prompt({
      title: 'What is this email called?',
      message: 'A name for you and the team, not something the customer sees. "December sale" or "Birthday note".',
      placeholder: 'December sale',
      confirmLabel: 'Create it',
    });
    if (!name || !name.trim()) return;
    try {
      const row: any = await adminApi.emailTemplates.create({ name: name.trim(), category: 'campaign' });
      notify({ title: 'Created', message: `"${name.trim()}" is a draft. Nothing is sent until you send it.` });
      load();
      setOpenKey(row?.key ?? null);
    } catch (e: any) {
      notify({ title: 'Not created', message: e?.message ?? 'Something went wrong.', tone: 'error' });
    }
  };

  return (
    <div className="min-h-screen">
      <main className="p-8">
        <PageIntro
          title="Emails"
          purpose="Every email SEIRS sends, shown as it actually arrives. Reword the automatic ones, and write your own for a season or a campaign."
          storageKey="email-gallery"
          help={
            <>
              <p><strong>What you see is the real email.</strong> Each card is the finished
              message rendered exactly as the app sends it, with its colours, banner and footer.</p>
              <p><strong>Sent automatically</strong> are fired by the app when something happens,
              like a password reset. You can reword them, and you cannot delete them, because the
              app would still try to send them.</p>
              <p><strong>Seasonal and campaign</strong> are yours. Create them, edit them, delete them.
              Writing one does not send it to anybody.</p>
              <p>Names like {'{{firstName}}'} are filled in per person when the email goes out. In
              previews they show a sample customer.</p>
            </>
          }
          actions={
            <button
              onClick={create}
              className="inline-flex items-center gap-2 rounded-lg bg-[#3A7BD5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f66b3]"
            >
              <Plus size={15} /> New email
            </button>
          }
        />

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-lg border border-[#E5E7EB]">
            {([['browse', 'Seasonal and campaigns'], ['auto', 'Sent automatically']] as const).map(([g, label]) => (
              <button
                key={g}
                onClick={() => setGroup(g)}
                className={`px-3 py-2 text-sm font-medium ${
                  group === g ? 'bg-[#0F2B4C] text-white' : 'bg-white text-[#0F2B4C]/60 hover:bg-gray-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[240px] flex-1 max-w-md">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#0F2B4C]/30" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Find an email by name or subject"
              className="w-full rounded-lg border border-[#E5E7EB] bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-[#3A7BD5]"
            />
          </div>
          <span className="text-xs text-[#0F2B4C]/50">
            {shown.length} of {all.length}
          </span>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-[#0F2B4C]/40">
            <Loader2 size={16} className="animate-spin" /> Loading the emails
          </div>
        ) : shown.length === 0 ? (
          <div className="rounded-xl border border-[#E5E7EB] bg-white">
            <EmptyState
              icon={<Mail size={20} />}
              title={
                error ? 'The emails did not load'
                  : q.trim() ? `Nothing matches "${q.trim()}"`
                  : group === 'browse' ? 'No seasonal or campaign emails yet'
                  : 'No automatic emails'
              }
              body={
                error ? 'This does not mean there are none. Try again.'
                  : group === 'browse'
                    ? 'These are the ones you write yourself, for a season or a promotion. Creating one does not send it.'
                    : undefined
              }
              action={
                error ? { label: 'Try again', onClick: load }
                  : q.trim() ? { label: 'Clear the search', onClick: () => setQ('') }
                  : group === 'browse' ? { label: 'Write one', onClick: create }
                  : undefined
              }
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {shown.map(t => (
              <button
                key={t.key}
                onClick={() => setOpenKey(t.key)}
                className="group rounded-xl border border-[#E5E7EB] bg-white p-3 text-left transition-shadow hover:shadow-md"
              >
                <Thumb html={t.renderedHtml} />
                <div className="mt-3 flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-[#0F2B4C]">{t.name}</p>
                    <p className="mt-0.5 truncate text-xs text-[#0F2B4C]/50">{t.renderedSubject}</p>
                  </div>
                  {t.isCustom
                    ? <Sparkles size={13} className="mt-0.5 shrink-0 text-amber-500" aria-label="You made this" />
                    : <Lock size={13} className="mt-0.5 shrink-0 text-[#0F2B4C]/25" aria-label="Sent automatically by the app" />}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="rounded bg-[#F5F5F0] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#0F2B4C]/50">
                    {CATEGORY_LABEL[t.category] ?? t.category}
                  </span>
                  {t.override && (
                    <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                      Edited
                    </span>
                  )}
                  {t.override && t.override.active === false && (
                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
                      Switched off
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </main>

      {openTpl && (
        <Editor
          tpl={openTpl}
          onClose={() => setOpenKey(null)}
          onSaved={() => { load(); }}
          onDeleted={() => { setOpenKey(null); load(); }}
          confirm={confirm}
          notify={notify}
        />
      )}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   The editor. Text on the left, the real email on the right.
   ──────────────────────────────────────────────────────────────────── */
function Editor({
  tpl, onClose, onSaved, onDeleted, confirm, notify,
}: {
  tpl: Tpl;
  onClose: () => void;
  onSaved: () => void;
  onDeleted: () => void;
  confirm: ReturnType<typeof useConfirm>;
  notify: ReturnType<typeof useNotify>;
}) {
  const startHtml = tpl.override?.bodyHtml ?? tpl.defaults.bodyHtml;
  const simple    = isSimple(startHtml);

  const [subject, setSubject]         = useState(tpl.override?.subject ?? tpl.defaults.subject);
  const [previewText, setPreviewText] = useState(tpl.override?.previewText ?? tpl.previewText ?? '');
  const [text, setText]               = useState(() => htmlToText(startHtml));
  const [rawHtml, setRawHtml]         = useState(startHtml);
  const [advanced, setAdvanced]       = useState(!simple);
  const [accent, setAccent]           = useState(tpl.override?.accentColor ?? '#0F2B4C');
  const [banner, setBanner]           = useState(tpl.override?.bannerImageUrl ?? '');
  const [html, setHtml]               = useState(tpl.renderedHtml);
  const [busy, setBusy]               = useState(false);
  const [rendering, setRendering]     = useState(false);

  const bodyHtml = advanced ? rawHtml : textToHtml(text);

  /* Live true preview. Debounced, because it is a request per keystroke
     otherwise, and it renders through the same function the real send
     uses rather than guessing in the browser. */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    setRendering(true);
    timer.current = setTimeout(() => {
      adminApi.emailTemplates
        .preview({ bodyHtml, bannerImageUrl: banner || null, accentColor: accent || null })
        .then(r => setHtml(r.html))
        .catch(() => { /* keep the last good render rather than blanking it */ })
        .finally(() => setRendering(false));
    }, 400);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [bodyHtml, banner, accent]);

  const save = async () => {
    setBusy(true);
    try {
      await adminApi.emailTemplates.update(tpl.key, {
        subject,
        bodyHtml,
        previewText: previewText || null,
        bannerImageUrl: banner || null,
        accentColor: accent || null,
      });
      notify({ title: 'Saved', message: `"${tpl.name}" is updated. It applies to emails sent from now on.` });
      onSaved();
    } catch (e: any) {
      notify({ title: 'Not saved', message: e?.message ?? 'Something went wrong.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const testSend = async () => {
    setBusy(true);
    try {
      const r = await adminApi.emailTemplates.testSend(tpl.key);
      notify({
        title: r.delivered ? 'Sent to you' : 'Not delivered',
        message: r.delivered
          ? 'Check your own inbox. That is the real thing, not a preview.'
          : 'The server accepted it but reported no delivery. Check the mail settings.',
        tone: r.delivered ? 'success' : 'error',
      });
    } catch (e: any) {
      notify({ title: 'Test send failed', message: e?.message ?? 'Something went wrong.', tone: 'error' });
    } finally { setBusy(false); }
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete "${tpl.name}"?`,
      message: 'It disappears from the gallery and cannot be recovered. Anybody who already received it keeps their copy.',
      confirmLabel: 'Delete it',
      danger: true,
    });
    if (!ok) return;
    setBusy(true);
    try {
      await adminApi.emailTemplates.remove(tpl.key);
      notify({ title: 'Deleted', message: `"${tpl.name}" is gone.` });
      onDeleted();
    } catch (e: any) {
      notify({ title: 'Not deleted', message: e?.message ?? 'Something went wrong.', tone: 'error' });
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40 backdrop-blur-sm" onClick={onClose}>
      <div
        className="ml-auto flex h-full w-full max-w-5xl flex-col bg-white shadow-2xl"
        onClick={e => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#E5E7EB] px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-[#0F2B4C]">{tpl.name}</h2>
            <p className="mt-0.5 text-xs text-[#0F2B4C]/50">
              {tpl.isCustom
                ? 'You made this one. Editing it changes nothing until you send it.'
                : 'The app sends this automatically. Your wording applies to every one sent from now on.'}
            </p>
          </div>
          <button onClick={onClose} className="rounded p-1 text-[#0F2B4C]/40 hover:bg-gray-100 hover:text-[#0F2B4C]">
            <X size={18} />
          </button>
        </header>

        <div className="grid flex-1 grid-cols-1 gap-0 overflow-hidden lg:grid-cols-2">
          {/* ── write ── */}
          <div className="overflow-y-auto border-r border-[#E5E7EB] p-6">
            <label className="text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/50">Subject</label>
            <input
              value={subject}
              onChange={e => setSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#3A7BD5]"
            />

            <label className="mt-4 block text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/50">
              Preview line
            </label>
            <input
              value={previewText}
              onChange={e => setPreviewText(e.target.value)}
              placeholder="The grey line most inboxes show under the subject"
              className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm outline-none focus:border-[#3A7BD5]"
            />

            <div className="mt-4 flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/50">Message</label>
              <button
                onClick={() => setAdvanced(a => !a)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#3A7BD5] hover:underline"
              >
                <Code2 size={11} /> {advanced ? 'Back to plain writing' : 'Edit the HTML instead'}
              </button>
            </div>

            {advanced ? (
              <>
                <textarea
                  value={rawHtml}
                  onChange={e => setRawHtml(e.target.value)}
                  rows={14}
                  spellCheck={false}
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 font-mono text-xs outline-none focus:border-[#3A7BD5]"
                />
                <p className="mt-1 text-[11px] text-amber-700">
                  You are editing the markup directly. Most people should use plain writing.
                </p>
              </>
            ) : (
              <>
                <textarea
                  value={text}
                  onChange={e => setText(e.target.value)}
                  rows={14}
                  placeholder={'Hi {{firstName}},\n\nWrite what you want to say. Leave a blank line between paragraphs.\n\nWrap a phrase in **stars** to make it bold.'}
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm leading-relaxed outline-none focus:border-[#3A7BD5]"
                />
                <p className="mt-1 text-[11px] text-[#0F2B4C]/45">
                  Blank line starts a new paragraph. **Stars** make bold. The layout, colours and
                  footer are added for you.
                </p>
              </>
            )}

            {tpl.vars?.length > 0 && (
              <div className="mt-3 rounded-lg bg-[#F5F5F0] px-3 py-2">
                <p className="text-[11px] font-semibold text-[#0F2B4C]/60">
                  Names you can drop in, filled per person when it sends:
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {tpl.vars.map(v => (
                    <code key={v} className="rounded bg-white px-1.5 py-0.5 text-[11px] text-[#0F2B4C]">
                      {`{{${v}}}`}
                    </code>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/50">
                  <Palette size={11} /> Header colour
                </label>
                <div className="mt-1 flex items-center gap-2">
                  <input
                    type="color"
                    value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : '#0F2B4C'}
                    onChange={e => setAccent(e.target.value)}
                    className="h-9 w-12 cursor-pointer rounded border border-[#E5E7EB]"
                  />
                  <input
                    value={accent}
                    onChange={e => setAccent(e.target.value)}
                    className="w-full rounded-lg border border-[#E5E7EB] px-2 py-2 font-mono text-xs outline-none focus:border-[#3A7BD5]"
                  />
                </div>
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/50">
                  <ImageIcon size={11} /> Banner image
                </label>
                <input
                  value={banner}
                  onChange={e => setBanner(e.target.value)}
                  placeholder="https://... (optional)"
                  className="mt-1 w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-xs outline-none focus:border-[#3A7BD5]"
                />
              </div>
            </div>

            <button
              onClick={() => { setText(htmlToText(tpl.defaults.bodyHtml)); setRawHtml(tpl.defaults.bodyHtml); setSubject(tpl.defaults.subject); }}
              className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-[#0F2B4C]/50 hover:text-[#0F2B4C]"
            >
              <RotateCcw size={11} /> Put the original wording back
            </button>
          </div>

          {/* ── see ── */}
          <div className="flex flex-col overflow-hidden bg-[#F3F4F6]">
            <div className="flex items-center gap-2 border-b border-[#E5E7EB] bg-white px-4 py-2 text-xs text-[#0F2B4C]/50">
              <Eye size={12} />
              This is the email as it will arrive
              {rendering && <Loader2 size={11} className="animate-spin" />}
            </div>
            <iframe
              title="Live email preview"
              sandbox=""
              srcDoc={html}
              className="flex-1 border-0 bg-[#F3F4F6]"
            />
          </div>
        </div>

        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-[#E5E7EB] bg-[#FAFAF7] px-6 py-3">
          <div className="flex items-center gap-2">
            <button
              onClick={testSend}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-semibold text-[#0F2B4C] hover:bg-gray-50 disabled:opacity-50"
            >
              <Send size={14} /> Send it to me
            </button>
            {tpl.isCustom && (
              <button
                onClick={remove}
                disabled={busy}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 disabled:opacity-50"
              >
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-2 text-sm text-[#0F2B4C]/60 hover:text-[#0F2B4C]">
              Close
            </button>
            <button
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#3A7BD5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f66b3] disabled:opacity-50"
            >
              <Save size={14} /> {busy ? 'Saving' : 'Save'}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
