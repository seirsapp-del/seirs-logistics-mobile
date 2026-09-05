/**
 * Turn any document on the shelf into a real PDF, on the phone.
 *
 * WHY THIS EXISTS. The Documents shelf stores a document's body as plain
 * text and renders it in a `<Text>`. That was already an improvement: the
 * data export used to arrive as raw markup opening with `<!doctype html>`.
 * But the founder's point on 2026-09-05 stands and is simpler than the
 * fix we had been discussing: **this screen should be a PDF**. A person
 * asking for their own record under NDPR Article 24, or keeping a receipt,
 * wants a document, not a wall of text in a modal.
 *
 * WHY IT IS BUILT HERE RATHER THAN ON THE SERVER. Two reasons, and the
 * second is the one that decided it.
 *
 *   1. The server's own export letterhead exists but is not deployed, and
 *      this works today without waiting for that.
 *   2. More importantly, it works for EVERY document on the shelf, not
 *      just the data export. A statement, a receipt, a notice from
 *      support: they all become the same document with the same
 *      letterhead, from one function.
 *
 * The mark is INLINE SVG and that is forced rather than chosen. The phone
 * converts this HTML to a PDF locally through expo-print, so an external
 * image would be a network fetch during printing that fails silently and
 * leaves a blank box where the logo should be. The geometry comes from
 * shared/brand/mark.ts, the same numbers scripts/build-mark-assets.js
 * cuts the launcher icon from, so this is the sixth renderer of one mark
 * rather than a seventh drawing of it.
 */
import {
  MARK_SW, MARK_WHEEL_R, MARK_HUB_R, MARK_HEAD_R, MARK_HEAD,
  MARK_FRAME_D, MARK_WHEELS, MARK_LINES, MARK_VIEWBOX_ATTR,
} from '../brand/mark';

const NAVY  = '#0A1F38';
const CLOUD = '#F5F5F0';
const INK   = '#111827';
const MUTED = '#6B7280';

/** The okada, drawn white on the navy band. */
function markSvg(height = 30): string {
  const wheels = MARK_WHEELS
    .map(w => `<circle cx="${w.x}" cy="${w.y}" r="${MARK_WHEEL_R}" fill="#FFFFFF"/>`)
    .join('');
  const hubs = MARK_WHEELS
    .map(w => `<circle cx="${w.x}" cy="${w.y}" r="${MARK_HUB_R}" fill="${NAVY}"/>`)
    .join('');
  const lines = MARK_LINES
    .map(l => `<line x1="${l.x1}" y1="${l.y1}" x2="${l.x2}" y2="${l.y2}" stroke="#FFFFFF" stroke-width="${MARK_SW}" stroke-linecap="round"/>`)
    .join('');
  return `<svg height="${height}" viewBox="${MARK_VIEWBOX_ATTR}" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="${MARK_FRAME_D}" stroke="#FFFFFF" stroke-width="${MARK_SW}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    ${wheels}${lines}
    <circle cx="${MARK_HEAD.x}" cy="${MARK_HEAD.y}" r="${MARK_HEAD_R}" fill="#FFFFFF"/>
    ${hubs}
  </svg>`;
}

const esc = (s: any): string => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>
)[c]!);

export interface DocumentMeta {
  title:      string;
  /** "Statement", "Other", whatever the shelf calls it. */
  category?:  string | null;
  /** Who it came from, when the shelf knows. */
  sentByName?: string | null;
  createdAt?: string | null;
  /** Name and SEIRS ID of the person holding it, so the page says who it is FOR. */
  forName?:   string | null;
  forId?:     string | null;
}

/**
 * A document, as a page.
 *
 * The body arrives as plain text and is rendered in a monospace block on
 * purpose: these documents are records, and a record whose columns drift
 * when the font changes is harder to read, not easier. `white-space: pre-wrap`
 * keeps the server's own alignment without letting a long line run off
 * the paper.
 *
 * `print-color-adjust` is not decoration: without it most engines drop the
 * navy band to an outline, which reads as a document that failed to print
 * rather than one without a letterhead.
 */
export function documentToHtml(doc: DocumentMeta, body: string): string {
  const when = doc.createdAt
    ? new Date(doc.createdAt).toLocaleDateString('en-NG', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const sub = [doc.category, doc.sentByName ? `sent by ${doc.sentByName}` : '', when]
    .filter(Boolean).map(esc).join(' &middot; ');

  const forLine = (doc.forName || doc.forId)
    ? `<div class="for"><span>Prepared for</span><strong>${esc(doc.forName ?? '')}</strong>${
        doc.forId ? `<span class="id">${esc(doc.forId)}</span>` : ''
      }</div>`
    : '';

  return `<!doctype html>
<html><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(doc.title)}</title>
<style>
  @page { margin: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { margin: 0; font: 13px/1.55 -apple-system, "Segoe UI", Roboto, sans-serif; color: ${INK}; }
  .band { background: ${NAVY}; color: #fff; padding: 22px 32px; display: flex;
          align-items: center; gap: 14px; }
  .band .word { font-size: 22px; font-weight: 800; letter-spacing: 3px; }
  .page { padding: 28px 32px 40px; }
  h1 { font-size: 20px; margin: 0 0 4px; color: ${NAVY}; }
  .sub { color: ${MUTED}; font-size: 12px; margin: 0 0 20px; }
  .for { border: 1px solid #E5E7EB; background: ${CLOUD}; border-radius: 8px;
         padding: 12px 14px; margin-bottom: 22px; font-size: 12px; }
  .for span { color: ${MUTED}; text-transform: uppercase; letter-spacing: .06em;
              font-size: 10px; display: block; margin-bottom: 3px; }
  .for strong { font-size: 14px; color: ${INK}; }
  .for .id { display: inline; margin-left: 8px; letter-spacing: 1px; }
  pre { white-space: pre-wrap; word-wrap: break-word; font: 12px/1.6 "Courier New", monospace;
        margin: 0; color: ${INK}; }
  .foot { margin-top: 28px; padding-top: 12px; border-top: 1px solid #E5E7EB;
          color: ${MUTED}; font-size: 10px; }
</style></head>
<body>
  <div class="band">${markSvg(30)}<div class="word">SEIRS</div></div>
  <div class="page">
    <h1>${esc(doc.title)}</h1>
    ${sub ? `<p class="sub">${sub}</p>` : ''}
    ${forLine}
    <pre>${esc(body)}</pre>
    <div class="foot">
      Issued by SEIRS. Keep this for your records.
    </div>
  </div>
</body></html>`;
}
