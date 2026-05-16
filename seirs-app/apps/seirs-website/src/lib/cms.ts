// Spec V8 §3.13 — public website CMS fetcher.
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

// ─── Markdown → HTML ───────────────────────────────────────────────────────
// Server-rendered subset matching the admin preview. Handles headers,
// bold, italic, links, ordered / unordered lists, paragraphs. Good
// enough for news posts + FAQ + changelog at launch; swap to react-
// markdown if marketing wants tables, footnotes, or images-in-body.

export function renderMarkdown(md: string): string {
  if (!md) return '';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
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
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-sky underline">$1</a>');
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
