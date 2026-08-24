// Spec V8 §3.13, public website CMS fetcher.
//
// Hits the backend's public /v1/website/* endpoints with Next.js ISR so
// edits in the admin website page land on the marketing site within
// ~1 minute. Falls back gracefully if the API is unreachable so a brief
// backend outage doesn't break the marketing pages.

const API_BASE =
  process.env.NEXT_PUBLIC_API_BASE_URL ??
  'https://seirs-logistics-mobile-production.up.railway.app/api/v1';

// Re-validate cached responses every 60 seconds.
const REVALIDATE = 60;

export type WebType = 'article' | 'changelog' | 'faq' | 'page_block' | 'job_listing';

export interface WebsiteContent {
  id:              string;
  type:            WebType;
  slug:            string;
  lang:            string;
  title:           string;
  excerpt:         string | null;
  body:            string;
  coverImageUrl:   string | null;
  // Article gallery + video, 2026-08-15. Up to 5 admin-uploaded images
  // interleaved through the story, and one optional video (YouTube or a
  // direct file) rendered near the top.
  galleryImages:   string[] | null;
  videoUrl:        string | null;
  seoTitle:        string | null;
  seoDescription:  string | null;
  category:        string | null;
  status:          string;
  publishedAt:     string | null;
  sortOrder:       number;
}

interface ListResponse {
  items:    WebsiteContent[];
  total:    number;
  page:     number;
  pageSize: number;
}

async function safeFetch<T>(path: string): Promise<T | null> {
  try {
    const r = await fetch(`${API_BASE}${path}`, { next: { revalidate: REVALIDATE } });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function listContent(type: WebType, opts: {
  category?: string; lang?: string; page?: number; pageSize?: number;
} = {}): Promise<WebsiteContent[]> {
  const params = new URLSearchParams({ type, lang: opts.lang ?? 'en' });
  if (opts.category) params.set('category', opts.category);
  if (opts.page)     params.set('page',     String(opts.page));
  if (opts.pageSize) params.set('pageSize', String(opts.pageSize));
  const res = await safeFetch<ListResponse>(`/website/content?${params}`);
  return res?.items ?? [];
}

export async function getContentBySlug(slug: string, lang = 'en'): Promise<WebsiteContent | null> {
  return safeFetch<WebsiteContent>(`/website/content/${encodeURIComponent(slug)}?lang=${lang}`);
}

export async function getPageBlock(slug: string, lang = 'en'): Promise<WebsiteContent | null> {
  return safeFetch<WebsiteContent>(`/website/page-block/${encodeURIComponent(slug)}?lang=${lang}`);
}

// Self-hosted placeholder per slot (founder 2026-08-11: show the full
// layout with stand-in photos now; real Midjourney images uploaded via
// Admin > Website > Page Blocks override these the moment they exist).
export const SLOT_PLACEHOLDERS: Record<string, string> = {
  img_hero_rider:       '/placeholders/hero-rider.jpg',
  img_step_book:        '/placeholders/step-book.jpg',
  img_step_pickup:      '/placeholders/step-pickup.jpg',
  img_step_delivered:   '/placeholders/step-delivered.jpg',
  img_business_owner:   '/placeholders/business-owner.jpg',
  img_driver_portrait:  '/placeholders/driver-portrait.jpg',
  img_night_rider:      '/placeholders/night-rider.jpg',
  img_partner_store:    '/placeholders/partner-store.jpg',
  img_interstate:       '/placeholders/interstate.jpg',
  img_handoff_hands:    '/placeholders/handoff-hands.jpg',
  img_lagos_dusk:       '/placeholders/lagos-dusk.jpg',
  img_business_csv:     '/placeholders/business-csv.jpg',
  img_business_team:    '/placeholders/business-team.jpg',
  img_driver_earnings:  '/placeholders/driver-earnings.jpg',
  img_driver_kyc:       '/placeholders/driver-kyc.jpg',
  img_store_counter:    '/placeholders/store-counter.jpg',
  img_store_shelf:      '/placeholders/store-shelf.jpg',
  img_careers_team:     '/placeholders/careers-team.jpg',
  img_contact_lagos:    '/placeholders/contact-lagos.jpg',
  img_testimonial_band: '/placeholders/testimonial-band.jpg',
  img_app_hand:         '/placeholders/app-hand.jpg',
  img_move_farm:        '/placeholders/move-farm.jpg',
  img_move_trader:      '/placeholders/move-trader.jpg',
  img_move_tailor:      '/placeholders/move-tailor.jpg',
  img_move_wood:        '/placeholders/move-wood.jpg',
  img_move_food:        '/placeholders/move-food.jpg',
  img_move_medical:     '/placeholders/move-medical.jpg',
  img_move_electronics: '/placeholders/move-electronics.jpg',
  img_move_documents:   '/placeholders/move-documents.jpg',
  img_move_building:    '/placeholders/move-building.jpg',
  img_move_animals:     '/placeholders/move-animals.jpg',
};

// Admin-managed image slots: { img_hero_rider: url, ... }. Placeholders
// fill every slot until the admin uploads the real image; an API outage
// therefore still renders a fully-imaged page.
export async function getImageSlots(): Promise<Record<string, string>> {
  const live = (await safeFetch<Record<string, string>>('/website/image-slots')) ?? {};
  return { ...SLOT_PLACEHOLDERS, ...live };
}

export interface PartnerLogo {
  name: string;
  url: string;
}

/**
 * Homepage "Trusted by" strip. Uncapped: the backend returns every published
 * page block whose slug starts img_partner_logo_, so adding a partner is one
 * row in the admin with no deploy. Each carries the company name, which the
 * strip shows beside the mark.
 *
 * Returns [] when the API is unreachable, and the strip renders its own
 * stand-in rather than an empty band.
 */
export async function getPartnerLogos(): Promise<PartnerLogo[]> {
  return (await safeFetch<PartnerLogo[]>('/website/partner-logos')) ?? [];
}

// ─── Markdown → HTML ───────────────────────────────────────────────────────
// Server-rendered subset matching the admin preview. Handles headers,
// bold, italic, links, ordered / unordered lists, paragraphs. Good
// enough for news posts + FAQ + changelog at launch; swap to react-
// markdown if marketing wants tables, footnotes, or images-in-body.

/**
 * Hardened 2026-08-23. The output of this function is handed straight to
 * dangerouslySetInnerHTML on /faq, /changelog, /news/[slug] and
 * /careers/[slug], so anything it emits executes.
 *
 * Two holes were open. `esc` escaped & < > but not quotes, so any value
 * interpolated into an attribute (an image src, a link href) could close the
 * attribute and add one of its own, e.g. onerror=. And `inline` built an
 * anchor href with no protocol check, so a body containing
 * [click](javascript:...) shipped a live javascript: link. Bodies are
 * admin-authored, which makes this stored admin-to-visitor XSS rather than an
 * open door, but the guard is two lines.
 */
const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

// Only these three shapes may reach an href or a src. Everything else,
// javascript:, data:, vbscript: and whatever the browser invents next, is
// rejected by not being on the list rather than by being blacklisted.
const SAFE_URL = /^(?:https?:\/\/|mailto:|\/)/i;

function safeUrl(raw: string): string | null {
  const url = raw.trim();
  return SAFE_URL.test(url) ? url : null;
}

export function renderMarkdown(md: string): string {
  if (!md) return '';
  const lines = esc(md).split('\n');
  const out: string[] = [];
  let inList = false;
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line) {
      if (inList) { out.push('</ul>'); inList = false; }
      continue;
    }
    if (/^### /.test(line)) { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h3>${inline(line.slice(4))}</h3>`); continue; }
    if (/^## /.test(line))  { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h2>${inline(line.slice(3))}</h2>`); continue; }
    if (/^# /.test(line))   { if (inList) { out.push('</ul>'); inList = false; } out.push(`<h1>${inline(line.slice(2))}</h1>`); continue; }
    // Block-level image: ![alt](url) on its own line (founder
    // 2026-08-11: images inside news articles; the admin editor's
    // "+ Insert image" emits exactly this shape).
    const img = line.match(/^!\[(.*?)\]\((.+?)\)$/);
    if (img) {
      if (inList) { out.push('</ul>'); inList = false; }
      const src = safeUrl(img[2]);
      // An image whose src is not on the allowlist is dropped rather than
      // rendered, and its alt text stands in so the story does not silently
      // lose the caption that went with it.
      out.push(src
        ? `<img src="${src}" alt="${img[1]}" class="w-full rounded-xl my-6" loading="lazy" />`
        : `<p>${img[1]}</p>`);
      continue;
    }
    if (/^- /.test(line)) {
      if (!inList) { out.push('<ul>'); inList = true; }
      out.push(`<li>${inline(line.slice(2))}</li>`);
      continue;
    }
    if (inList) { out.push('</ul>'); inList = false; }
    out.push(`<p>${inline(line)}</p>`);
  }
  if (inList) out.push('</ul>');
  return out.join('\n');
}

function inline(s: string): string {
  return s
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/\[(.+?)\]\((.+?)\)/g, (_m: string, label: string, target: string) => {
      const href = safeUrl(target);
      // A rejected href renders as plain label text. Dropping the anchor is
      // the safe failure: the reader loses a link, not the page.
      if (!href) return label;
      return `<a href="${href}" target="_blank" rel="noopener" class="text-sky underline">${label}</a>`;
    });
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
