'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Globe, Plus, Search, Loader2, AlertCircle, RefreshCw, X, Trash2,
  ImageIcon, Eye, Save, Calendar, Smartphone,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';
import { isSuperAdminFromUser } from '@/lib/rbac';
import { getUser } from '@/lib/auth';

// Spec V8 §3.13. admin editor for the public marketing website.
// Manages four content types under tabs: articles (news/blog/press),
// page blocks (inline-editable homepage chunks), FAQ, changelog.

type WebType = 'article' | 'page_block' | 'faq' | 'changelog' | 'job_listing';

interface Row {
  id:              string;
  type:            WebType;
  slug:            string;
  lang:            string;
  title:           string;
  excerpt:         string | null;
  body:            string;
  coverImageUrl:   string | null;
  galleryImages?:  string[] | null;
  videoUrl?:       string | null;
  featureInApp?:   boolean;
  featureBadge?:   string | null;
  featureFrom?:    string | null;
  featureUntil?:   string | null;
  seoTitle:        string | null;
  seoDescription:  string | null;
  category:        string | null;
  // pending_approval: submitted by an editor, waiting on a super admin.
  status:          'draft' | 'pending_approval' | 'scheduled' | 'published' | 'archived';
  publishAt:       string | null;
  publishedAt:     string | null;
  sortOrder:       number;
  updatedAt:       string;
}

const TABS: Array<{ key: WebType; label: string; sub: string }> = [
  { key: 'article',     label: 'Articles',     sub: 'News, blog posts, press releases' },
  { key: 'page_block',  label: 'Page Blocks',  sub: 'Inline-editable copy on home/how-it-works' },
  { key: 'faq',         label: 'FAQ',          sub: 'Frequently asked questions' },
  { key: 'changelog',   label: 'Changelog',    sub: 'Product release notes' },
  { key: 'job_listing', label: 'Careers',      sub: 'Open roles at /careers' },
];

const STATUS_STYLES: Record<string, string> = {
  draft:            'bg-gray-100 text-gray-600',
  pending_approval: 'bg-[#C2410C]/10 text-[#C2410C]',
  scheduled:        'bg-amber-100 text-amber-700',
  published:        'bg-emerald-100 text-emerald-700',
  archived:         'bg-red-100 text-red-600',
};

const STATUS_LABEL: Record<string, string> = {
  pending_approval: 'awaiting approval',
};

export default function WebsiteCmsPage() {
  const [tab,      setTab]      = useState<WebType>('article');
  const [rows,     setRows]     = useState<Row[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [search,   setSearch]   = useState('');
  const [editing,  setEditing]  = useState<Row | 'new' | null>(null);

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.websiteContent.list(tab)
      .then((data: any) => setRows(Array.isArray(data) ? data : []))
      .catch((e: any) => setError(e?.message ?? 'Could not load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tab]);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.title.toLowerCase().includes(q) || r.slug.includes(q));
  }, [rows, search]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
          <Globe size={18} className="text-white" />
        </div>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-[#0F2B4C]">Website Content</h1>
          <p className="text-sm text-gray-500">Manage the public marketing site at seirs.app. Changes go live within 1 minute (ISR cached).</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] rounded-lg hover:bg-gray-50"
        >
          <RefreshCw size={14} /> Refresh
        </button>
        <button
          onClick={() => setEditing('new')}
          className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-[#2f6cc0]"
        >
          <Plus size={15} /> New {TABS.find(t => t.key === tab)?.label.replace(/s$/, '') ?? 'Item'}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white p-1 rounded-xl border border-[#E5E7EB] w-fit">
        {TABS.map(t => {
          const on = tab === t.key;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
                on ? 'bg-[#0F2B4C] text-white' : 'text-gray-500 hover:text-[#0F2B4C]'
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[10px] opacity-60">({rows.filter(r => r.type === t.key).length || rows.length})</span>
            </button>
          );
        })}
      </div>
      <p className="text-xs text-gray-500 -mt-3">{TABS.find(t => t.key === tab)?.sub}</p>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-2.5 text-gray-400" />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by title or slug…"
          className="w-full pl-9 pr-3 py-2 text-sm border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]"
        />
      </div>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} /> {error}
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          Loading…
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border border-[#E5E7EB] text-gray-400">
          <Globe size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-semibold">No {tab.replace('_', ' ')}s yet</p>
          <p className="text-xs mt-1">Tap &ldquo;New&rdquo; above to create one.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
          {filtered.map(r => (
            <button
              key={r.id}
              onClick={() => setEditing(r)}
              className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            >
              {r.coverImageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={r.coverImageUrl} alt="" className="w-12 h-12 rounded object-cover bg-gray-100" />
              ) : (
                <div className="w-12 h-12 rounded bg-gray-100 flex items-center justify-center text-gray-400">
                  <ImageIcon size={18} />
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold text-[#0F2B4C] truncate">{r.title}</p>
                  <span className={`text-[10px] uppercase px-1.5 py-0.5 rounded font-bold ${STATUS_STYLES[r.status] ?? 'bg-gray-100'}`}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                  {r.category && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#3A7BD5]/10 text-[#3A7BD5] font-medium">{r.category}</span>
                  )}
                  {r.featureInApp && (
                    <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#C2410C]/10 text-[#C2410C] font-bold flex items-center gap-1">
                      <Smartphone size={10} /> In app
                    </span>
                  )}
                </div>
                <p className="text-xs font-mono text-gray-400 mt-0.5">/{r.slug}</p>
              </div>
              <span className="text-xs text-gray-400 shrink-0">
                {new Date(r.updatedAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}
              </span>
            </button>
          ))}
        </div>
      )}

      {editing && (
        <EditorModal
          row={editing === 'new' ? null : editing}
          defaultType={tab}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

// ─── Editor ─────────────────────────────────────────────────────────────────

function EditorModal({ row, defaultType, onClose, onSaved }: {
  row: Row | null;
  defaultType: WebType;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isNew = !row;
  const [type,      setType]      = useState<WebType>(row?.type ?? defaultType);
  const [slug,      setSlug]      = useState(row?.slug ?? '');
  const [title,     setTitle]     = useState(row?.title ?? '');
  const [excerpt,   setExcerpt]   = useState(row?.excerpt ?? '');
  const [body,      setBody]      = useState(row?.body ?? '');
  const [cover,     setCover]     = useState(row?.coverImageUrl ?? '');
  // Founder 2026-08-15: a success story should carry more than one picture,
  // and possibly an interview video. Up to 5 gallery images beyond the
  // cover; the backend enforces the same cap.
  const [gallery,   setGallery]   = useState<string[]>(row?.galleryImages ?? []);
  const [videoUrl,  setVideoUrl]  = useState(row?.videoUrl ?? '');
  const [galleryUploading, setGalleryUploading] = useState(false);
  const [seoTitle,  setSeoTitle]  = useState(row?.seoTitle ?? '');
  const [seoDesc,   setSeoDesc]   = useState(row?.seoDescription ?? '');
  const [category,  setCategory]  = useState(row?.category ?? (defaultType === 'article' ? 'news' : ''));
  const [sortOrder, setSortOrder] = useState(String(row?.sortOrder ?? 0));
  const [featureInApp, setFeatureInApp] = useState(row?.featureInApp ?? false);
  const [featureBadge, setFeatureBadge] = useState(row?.featureBadge ?? '');
  const [featureFrom,  setFeatureFrom]  = useState(row?.featureFrom  ? toLocalInput(row.featureFrom)  : '');
  const [featureUntil, setFeatureUntil] = useState(row?.featureUntil ? toLocalInput(row.featureUntil) : '');
  const [status,    setStatus]    = useState(row?.status ?? 'draft');
  const [publishAt, setPublishAt] = useState(row?.publishAt ? toLocalInput(row.publishAt) : '');
  const [uploading, setUploading] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [err,       setErr]       = useState<string | null>(null);
  const [showPrev,  setShowPrev]  = useState(false);
  const confirm                   = useConfirm();
  // Only a super admin can turn website content live. Everyone else
  // submits for review; the button label changes to say so.
  const superAdmin                = isSuperAdminFromUser(getUser());

  const autoSlug = () => {
    if (!title) return;
    const s = title.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    setSlug(s);
  };

  const uploadCover = async (file: File) => {
    setUploading(true); setErr(null);
    try {
      const { url } = await adminApi.upload.image(file);
      setCover(url);
    } catch (e: any) { setErr(e?.message ?? 'Upload failed'); }
    finally { setUploading(false); }
  };

  const uploadGalleryImage = async (file: File) => {
    if (gallery.length >= 5) { setErr('Maximum of 5 gallery images per article.'); return; }
    setGalleryUploading(true); setErr(null);
    try {
      const { url } = await adminApi.upload.image(file);
      setGallery(prev => [...prev, url]);
    } catch (e: any) { setErr(e?.message ?? 'Upload failed'); }
    finally { setGalleryUploading(false); }
  };

  // Founder 2026-08-11: images INSIDE articles. Uploads to R2 and
  // appends the markdown image tag to the body; move it wherever the
  // story needs it.
  const [bodyUploading, setBodyUploading] = useState(false);
  const uploadBodyImage = async (file: File) => {
    setBodyUploading(true); setErr(null);
    try {
      const { url } = await adminApi.upload.image(file);
      setBody(prev => `${prev.trimEnd()}\n\n![image](${url})\n`);
    } catch (e: any) { setErr(e?.message ?? 'Upload failed'); }
    finally { setBodyUploading(false); }
  };

  const save = async () => {
    setSaving(true); setErr(null);
    try {
      const payload = {
        type, slug, title,
        excerpt:        excerpt        || null,
        body,
        coverImageUrl:  cover          || null,
        galleryImages:  gallery,
        videoUrl:       videoUrl.trim() || null,
        seoTitle:       seoTitle       || null,
        seoDescription: seoDesc        || null,
        category:       category       || null,
        sortOrder:      Number(sortOrder) || 0,
        featureInApp,
        featureBadge:   featureBadge.trim() || null,
        featureFrom:    featureFrom  ? new Date(featureFrom).toISOString()  : null,
        featureUntil:   featureUntil ? new Date(featureUntil).toISOString() : null,
        status,
        publishAt:      publishAt ? new Date(publishAt).toISOString() : null,
      };
      if (isNew) await adminApi.websiteContent.create(payload);
      else       await adminApi.websiteContent.update(row!.id, payload);
      onSaved();
    } catch (e: any) { setErr(e?.message ?? 'Save failed'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!row) return;
    const ok = await confirm({
      title:        `Delete "${row.title}"?`,
      message:      'Permanently removes this content from the public website. If it was published, existing SEO links and social shares will start returning 404. Consider setting status to Draft instead if you might want it back.',
      confirmLabel: 'Delete',
      danger:       true,
    });
    if (!ok) return;
    setSaving(true);
    try { await adminApi.websiteContent.remove(row.id); onSaved(); }
    catch (e: any) { setErr(e?.message ?? 'Delete failed'); setSaving(false); }
  };

  // Super-admin decision on a submitted page.
  const review = async (approve: boolean) => {
    if (!row) return;
    setSaving(true); setErr(null);
    try { await adminApi.websiteContent.review(row.id, approve); onSaved(); }
    catch (e: any) { setErr(e?.message ?? 'Review failed'); setSaving(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl w-full max-w-3xl shadow-xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-bold text-[#0F2B4C]">{isNew ? 'New' : 'Edit'} {type.replace('_', ' ')}</h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-700"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto p-5 space-y-4 text-sm">
          {err && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded px-3 py-2 text-xs text-red-700">
              <AlertCircle size={14} /> {err}
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Type</label>
              <select value={type} onChange={e => setType(e.target.value as WebType)} disabled={!isNew}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg disabled:bg-gray-50 focus:outline-none focus:border-[#3A7BD5]">
                {TABS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)} onBlur={() => { if (!slug) autoSlug(); }}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            </div>
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Slug</label>
            <div className="flex gap-2 mt-1">
              <input value={slug} onChange={e => setSlug(e.target.value.toLowerCase())}
                placeholder="lowercase-with-hyphens"
                className="flex-1 px-3 py-2 border border-[#E5E7EB] rounded-lg font-mono text-xs focus:outline-none focus:border-[#3A7BD5]" />
              <button onClick={autoSlug} className="px-3 py-2 text-xs font-semibold bg-gray-100 hover:bg-gray-200 rounded-lg">Auto</button>
            </div>
            {type === 'page_block' && (
              <div className="mt-2 text-[11px] text-gray-500 leading-relaxed">
                Reserved slugs that render on the marketing site:{' '}
                <code className="bg-gray-100 px-1 rounded">home_hero</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">hero_for_business</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">hero_for_drivers</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">hero_for_partner_stores</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">hero_how_it_works</code>.
                Upload a hero image on any of these to change the corresponding page&apos;s hero backdrop.
                <span className="block mt-1">
                  Rows starting with <code className="bg-gray-100 px-1 rounded">img_</code> are the site&apos;s
                  IMAGE SLOTS: each one&apos;s description tells you exactly what goes where (section, aspect
                  ratio, and the matching Midjourney file name). Upload the image on the slot and the site
                  updates within a minute; leave a slot empty and the site shows its built-in artwork.
                </span>
              </div>
            )}
          </div>

          {(type === 'article' || type === 'changelog') && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Excerpt</label>
              <input value={excerpt} onChange={e => setExcerpt(e.target.value)} placeholder="One-line teaser for cards + SEO description"
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Body (Markdown)</label>
              <div className="flex items-center gap-3">
                <label className="text-xs text-[#3A7BD5] font-semibold cursor-pointer hover:underline">
                  {bodyUploading ? 'Uploading…' : '+ Insert image'}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadBodyImage(f); e.target.value = ''; }} />
                </label>
                <button onClick={() => setShowPrev(p => !p)} className="text-xs text-[#3A7BD5] font-semibold flex items-center gap-1">
                  <Eye size={12} /> {showPrev ? 'Hide preview' : 'Preview'}
                </button>
              </div>
            </div>
            <textarea value={body} onChange={e => setBody(e.target.value)} rows={10}
              placeholder="# Header&#10;&#10;Paragraph copy. **Bold**, *italic*, [link](https://...).&#10;&#10;- bullet&#10;- bullet"
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg font-mono text-xs focus:outline-none focus:border-[#3A7BD5]" />
            {showPrev && (
              <div className="mt-2 p-3 border border-[#E5E7EB] rounded-lg bg-gray-50 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: simpleMarkdown(body) }} />
            )}
          </div>

          {type !== 'faq' && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {type === 'page_block' ? 'Hero image (optional)' : 'Cover image'}
              </label>
              <div className="mt-1 flex items-start gap-3">
                {cover && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="cover" className="w-32 h-20 object-cover rounded border border-[#E5E7EB]" />
                )}
                <label className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-dashed border-[#E5E7EB] rounded-lg cursor-pointer hover:bg-gray-50">
                  <ImageIcon size={14} />
                  {uploading ? 'Uploading…' : cover ? 'Replace image' : 'Upload image'}
                  <input type="file" accept="image/jpeg,image/png" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) uploadCover(f); }} />
                </label>
                {cover && (
                  <button onClick={() => setCover('')} className="text-xs text-red-500 font-semibold">Remove</button>
                )}
              </div>
            </div>
          )}

          {type === 'article' && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
                Gallery images ({gallery.length}/5)
              </label>
              <p className="text-[11px] text-gray-400 mt-0.5">
                Extra photos shown through the story, after the cover. They
                flow automatically every few paragraphs, or type{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{img1}}'}</code>{' '}
                to <code className="bg-gray-100 px-1 rounded">{'{{img5}}'}</code>{' '}
                in the body to pin one after a specific paragraph. Click a
                token on a thumbnail to copy it. Removing an image renumbers
                the ones after it, so re-check any typed tokens after a
                removal. Images without a token flow automatically; the video
                without a token shows at the top.
              </p>
              <div className="mt-2 flex flex-wrap items-start gap-3">
                {gallery.map((url, i) => (
                  <div key={url} className="relative">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={url} alt={`gallery ${i + 1}`} className="w-24 h-16 object-cover rounded border border-[#E5E7EB]" />
                    {/* Each thumbnail wears its own token, because "type
                        {{img2}}" is useless if nothing says which image is
                        number 2. Clicking copies the token to paste into the
                        body. */}
                    <button
                      onClick={() => navigator.clipboard?.writeText(`{{img${i + 1}}}`)}
                      className="absolute bottom-0 left-0 right-0 bg-black/60 text-white text-[10px] font-mono py-0.5 rounded-b hover:bg-[#3A7BD5]"
                      title="Click to copy, then paste in the body where this image should appear"
                    >
                      {`{{img${i + 1}}}`}
                    </button>
                    <button
                      onClick={() => setGallery(prev => prev.filter((_, j) => j !== i))}
                      className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] font-bold leading-none"
                      title="Remove"
                    >
                      ×
                    </button>
                  </div>
                ))}
                {gallery.length < 5 && (
                  <label className="flex items-center gap-2 px-3 py-2 text-xs font-semibold bg-white border border-dashed border-[#E5E7EB] rounded-lg cursor-pointer hover:bg-gray-50">
                    <ImageIcon size={14} />
                    {galleryUploading ? 'Uploading…' : '+ Add image'}
                    <input type="file" accept="image/jpeg,image/png" className="hidden"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadGalleryImage(f); e.target.value = ''; }} />
                  </label>
                )}
              </div>
            </div>
          )}

          {type === 'article' && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Video (optional)</label>
              <p className="text-[11px] text-gray-400 mt-0.5">
                A YouTube link or a direct .mp4 URL, e.g. an interview. Shows
                at the top of the story, or type{' '}
                <code className="bg-gray-100 px-1 rounded">{'{{video}}'}</code>{' '}
                in the body to place it after a specific paragraph.
              </p>
              <input
                value={videoUrl}
                onChange={e => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=... or https://.../interview.mp4"
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5] text-xs font-mono"
              />
            </div>
          )}

          {type === 'article' && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Category</label>
              <select value={category ?? ''} onChange={e => setCategory(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]">
                <option value="news">News</option>
                <option value="press">Press release</option>
                <option value="product_update">Product update</option>
                <option value="guide">Guide / how-to</option>
                <option value="story">Customer story</option>
              </select>
            </div>
          )}

          {(type === 'article') && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500">SEO title</label>
                <input value={seoTitle} onChange={e => setSeoTitle(e.target.value)} placeholder="Falls back to title"
                  className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
              </div>
              <div>
                <label className="text-xs font-bold uppercase tracking-wide text-gray-500">SEO description</label>
                <input value={seoDesc} onChange={e => setSeoDesc(e.target.value)} placeholder="Falls back to excerpt"
                  className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
              </div>
            </div>
          )}

          {(type === 'faq' || type === 'changelog' || type === 'page_block') && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Sort order (lower shows first)</label>
              <input value={sortOrder} onChange={e => setSortOrder(e.target.value)} type="number"
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            </div>
          )}

          {/* Home-carousel curation. Publishing puts a story on the
              website; this puts it on the slides every customer sees
              when they open the app, so it is a separate deliberate
              tick rather than an automatic consequence. */}
          {type === 'article' && (
            <div className="border border-[#E5E7EB] rounded-lg p-3 bg-[#F9FAFB]">
              <label className="flex items-start gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={featureInApp}
                  onChange={e => setFeatureInApp(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-[#3A7BD5]"
                />
                <span>
                  <span className="block text-sm font-bold text-[#0F2B4C]">Feature on the app home carousel</span>
                  <span className="block text-xs text-gray-500 mt-0.5">
                    Shows as a slide in the customer app, after the SEIRS okada card. Newest four featured
                    stories appear. Needs a cover image, and the story must be published.
                  </span>
                </span>
              </label>

              {featureInApp && (
                <div className="mt-3 pl-6">
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Card label (optional)</label>
                  <input
                    value={featureBadge}
                    onChange={e => setFeatureBadge(e.target.value.slice(0, 24))}
                    placeholder="e.g. NEW OUTLET, PROMO. Blank uses the category."
                    className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]"
                  />
                  {!cover && (
                    <p className="text-xs text-[#B45309] mt-2">
                      No cover image yet. Featured cards without one render as a plain navy slide.
                    </p>
                  )}

                  {/* Special-offer window. A promo that ends on Sunday
                      should leave the carousel on Sunday, not whenever
                      somebody remembers to come back and untick it. */}
                  <div className="grid grid-cols-2 gap-3 mt-3">
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Show from</label>
                      <input
                        type="datetime-local"
                        value={featureFrom}
                        onChange={e => setFeatureFrom(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Stop showing</label>
                      <input
                        type="datetime-local"
                        value={featureUntil}
                        onChange={e => setFeatureUntil(e.target.value)}
                        className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]"
                      />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mt-1.5">
                    Leave both blank to feature it until you untick the box. The article stays readable on the
                    website either way: these dates only control the app carousel slot.
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Status</label>
              <select value={status} onChange={e => setStatus(e.target.value as any)}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]">
                <option value="draft">Draft</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published</option>
                <option value="archived">Archived</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1">
                <Calendar size={11} /> Publish at (optional)
              </label>
              <input type="datetime-local" value={publishAt} onChange={e => setPublishAt(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            </div>
          </div>
        </div>

        <div className="flex justify-between gap-2 px-5 py-3 border-t border-gray-100 bg-gray-50">
          <div>
            {!isNew && (
              <button onClick={remove} disabled={saving}
                className="flex items-center gap-2 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 rounded-lg">
                <Trash2 size={14} /> Delete
              </button>
            )}
          </div>
          <div className="flex gap-2">
            {/* Super-admin review controls, only on a submitted page.
                Reject returns it to draft so the editor keeps the work. */}
            {!isNew && row?.status === 'pending_approval' && superAdmin && (
              <>
                <button
                  onClick={() => review(false)}
                  disabled={saving}
                  className="px-3 py-2 text-sm font-semibold text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-50"
                >
                  Send back to draft
                </button>
                <button
                  onClick={() => review(true)}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-semibold bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                >
                  Approve and publish
                </button>
              </>
            )}
            <button onClick={onClose} className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900">Cancel</button>
            <button onClick={save} disabled={saving || !title || !slug || !body}
              className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-[#0F2B4C] text-white rounded-lg hover:bg-[#3A7BD5] disabled:opacity-50">
              <Save size={14} />
              {saving ? 'Saving…' : superAdmin ? 'Save' : 'Save and submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Cheap markdown → HTML for the preview pane. Handles headers, bold,
// italic, links, lists, paragraphs. The public website uses
// react-markdown for full fidelity; this preview is just admin-side
// situational awareness.
function simpleMarkdown(md: string): string {
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
    .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
