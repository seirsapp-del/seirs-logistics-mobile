'use client';
import { useEffect, useMemo, useState } from 'react';
import {
  Globe, Plus, Search, Loader2, AlertCircle, RefreshCw, X, Trash2,
  ImageIcon, Eye, Save, Calendar, Smartphone, EyeOff, Info,
} from 'lucide-react';
import { adminApi } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmDialog';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import { isSuperAdminFromUser } from '@/lib/rbac';
import { getUser } from '@/lib/auth';
import { HeroCardPreview, heroCardWarnings } from '@/components/HeroCardPreview';

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

/**
 * Every status was rendered raw except one, so the list said "draft"
 * and "archived" at somebody whose question is "can customers see it".
 * These answer that question instead.
 */
const STATUS_LABEL: Record<string, string> = {
  draft:            'nobody can see it',
  pending_approval: 'awaiting approval',
  scheduled:        'goes live later',
  published:        'live now',
  archived:         'retired',
};

/** The category pill was the stored key, e.g. "product_update". */
const CATEGORY_LABEL: Record<string, string> = {
  news:            'News',
  press:           'Press release',
  product_update:  'Product update',
  guide:           'Guide',
  story:           'Customer story',
  impact:          'Impact',
  getting_started: 'Getting started',
  payments:        'Payments',
  pickup:          'Pickup and delivery',
  drivers:         'For drivers',
  partner:         'Partner stores',
};

const categoryWords = (c: string) =>
  CATEGORY_LABEL[c] ?? c.replace(/[_-]+/g, ' ');

/** The admin list is capped server-side and sends no total with it. */
const SERVER_CAP = 200;

export default function WebsiteCmsPage() {
  const [tab,      setTab]      = useState<WebType>('article');
  const [rows,     setRows]     = useState<Row[]>([]);
  /* The server sends a real count now, so the screen can stop guessing
     from the rows it happens to be holding. */
  const [total, setTotal] = useState(0);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [search,   setSearch]   = useState('');
  const [editing,  setEditing]  = useState<Row | 'new' | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [offliningId, setOffliningId] = useState<string | null>(null);
  const confirmSweep            = useConfirm();
  const confirmOffline          = useConfirm();
  const superAdmin              = isSuperAdminFromUser(getUser());

  // Founder 2026-08-15: removing an image from an article only removed the
  // reference; the file stayed in R2 forever. This sweeps cms/ files nothing
  // references. Dry-run first, so the confirm dialog shows real numbers
  // before anything is destroyed.
  const sweepUnusedMedia = async () => {
    setSweeping(true);
    try {
      const probe = await adminApi.websiteContent.cleanupMedia(true);
      if (probe.unused === 0) {
        await confirmSweep({
          title:        'Nothing to clean up',
          message:      `All ${probe.totalObjects} stored files are still referenced by an article, a page block or a draft${probe.skippedRecent ? `, and ${probe.skippedRecent} recent upload(s) were left alone in case they belong to unsaved work` : ''}.`,
          confirmLabel: 'OK',
        });
        return;
      }
      const mb = (probe.freedBytes / (1024 * 1024)).toFixed(1);
      const ok = await confirmSweep({
        title:        `Delete ${probe.unused} unused file(s)?`,
        message:      `These ${probe.unused} images/files (${mb} MB) are no longer used by any article, gallery, page block or draft. Uploads from the last 48 hours are never touched, in case they belong to unsaved work. This cannot be undone.`,
        confirmLabel: `Delete ${probe.unused} file(s)`,
        danger:       true,
      });
      if (!ok) return;
      await adminApi.websiteContent.cleanupMedia(false);
    } catch (e: any) {
      setError(e?.message ?? 'Cleanup failed');
    } finally {
      setSweeping(false);
    }
  };

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.websiteContent.list(tab)
      .then((data: any) => {
        /* The endpoint returns { items, total } now. The array fallback
           stays so a stale deploy of either side degrades to a list
           rather than an empty board, which on a queue reads as
           "nothing to do" rather than "not loaded". */
          setRows(Array.isArray(data) ? data : (data?.items ?? []));
        setTotal(Number(data?.total ?? (Array.isArray(data) ? data.length : 0)));
      })
      .catch((e: any) => setError(e?.message ?? 'Could not load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [tab]);

  /**
   * Take a live item down without deleting it (founder 2026-08-26).
   *
   * Status goes back to DRAFT, not ARCHIVED: draft is the state the
   * editor can save over and re-publish, which is what "I need to fix
   * this" means. Archived reads as retired.
   *
   * One action covers both surfaces on purpose. listFeaturedCards
   * filters on status = published, so dropping to draft empties the
   * carousel slot at the same moment it pulls the web page, and the
   * apps fall back to their built-in cards. No second step to forget.
   */
  const takeOffline = async (r: Row) => {
    const ok = await confirmOffline({
      title:   `Take "${r.title}" offline?`,
      message: r.featureInApp
        ? 'Returns it to Draft. It comes off the public website and off the app home carousel straight away, and customers see the built-in slides instead. Nothing is deleted: edit it and publish again when it is ready.'
        : 'Returns it to Draft. The public page starts returning 404 within about a minute (the website caches for 60 seconds). Nothing is deleted: edit it and publish again when it is ready.',
      confirmLabel: 'Take offline',
    });
    if (!ok) return;
    setOffliningId(r.id);
    setError(null);
    try {
      await adminApi.websiteContent.update(r.id, { status: 'draft' });
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not take this item offline');
    } finally {
      setOffliningId(null);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter(r => r.title.toLowerCase().includes(q) || r.slug.includes(q));
  }, [rows, search]);

  return (
    <div className="space-y-6 p-8">
      {/* The old subtitle said "the public marketing site" and nothing
          else, so nobody reading it would guess this is also the only
          editor that reaches a phone. Founder 2026-08-26. */}
      <PageIntro
        title="App &amp; Website Content"
        purpose="Write the stories, page copy and answers that customers read. One story feeds three places: the app home carousel, the in-app Stories list, and seirs.app."
        storageKey="website"
        help={
          <>
            <p><strong>Published</strong> is the only status customers ever see. Draft and Archived both take something offline.</p>
            <p>The website updates within a minute. The apps pick up new carousel cards the next time somebody opens them.</p>
            <p><strong>Take offline</strong> pulls an item straight back to draft, off the website and off the app carousel at once. Use it before correcting something that is live.</p>
            <p>Anybody who already read a story keeps what they read. Taking it down stops new people seeing it, it does not unsend it.</p>
          </>
        }
        actions={
          <>
            <button
              onClick={load}
              disabled={loading}
              className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
            </button>
            {superAdmin && (
              <button
                onClick={sweepUnusedMedia}
                disabled={sweeping}
                title="Delete stored images that no article, gallery or page block uses any more"
                className="flex items-center gap-2 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-xs font-semibold hover:bg-gray-50 disabled:opacity-50"
              >
                <Trash2 size={14} /> {sweeping ? 'Checking' : 'Clean up unused images'}
              </button>
            )}
            <button
              onClick={() => setEditing('new')}
              className="flex items-center gap-2 rounded-lg bg-[#3A7BD5] px-4 py-2 text-sm font-medium text-white hover:bg-[#2f6cc0]"
            >
              <Plus size={15} /> New {TABS.find(t => t.key === tab)?.label.replace(/s$/, '') ?? 'item'}
            </button>
          </>
        }
      />

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
              {/* The count was `rows.filter(type === t.key).length ||
                  rows.length`, and rows only ever holds the open tab.
                  So every inactive tab fell through to the same number,
                  and all five tabs claimed the same total. Only the tab
                  actually loaded can honestly show a count. */}
              {on && <span className="ml-1.5 text-[10px] opacity-60">({rows.length})</span>}
            </button>
          );
        })}
      </div>
      <p className="-mt-3 text-xs text-gray-500">{TABS.find(t => t.key === tab)?.sub}</p>

      {!loading && rows.length >= SERVER_CAP && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          This list stops at {SERVER_CAP} items and there may be more behind it. Use the search box to find something older.
        </div>
      )}

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
        <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={20} className="mr-2 animate-spin" />
          Loading
        </div>
      ) : error ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white">
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="This list could not be loaded"
            body="A connection or permission problem, not an empty section. Nothing published has changed."
            action={{ label: 'Try again', onClick: load }}
          />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white">
          {search.trim() ? (
            <EmptyState
              icon={<Search size={20} />}
              title={`Nothing here matches "${search.trim()}"`}
              body="This searches the titles and web addresses in this tab only. Try another tab, or clear the search."
              action={{ label: 'Clear the search', onClick: () => setSearch('') }}
            />
          ) : (
            <EmptyState
              icon={<Globe size={20} />}
              title={`Nothing has been written under ${TABS.find(t => t.key === tab)?.label.toLowerCase() ?? 'this tab'}`}
              body={TABS.find(t => t.key === tab)?.sub}
              action={{ label: 'Write the first one', onClick: () => setEditing('new') }}
            />
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
          {filtered.map(r => (
            // Was a single full-row <button>. It now has to carry the
            // Take offline action, and a button inside a button is
            // invalid HTML that React will not render, so the row is a
            // div and only the identifying part of it is the button.
            <div
              key={r.id}
              className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-colors"
            >
              <button
                onClick={() => setEditing(r)}
                className="flex-1 min-w-0 text-left flex items-center gap-3"
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
                      <span className="rounded bg-[#3A7BD5]/10 px-1.5 py-0.5 text-[10px] font-medium text-[#3A7BD5]">{categoryWords(r.category)}</span>
                    )}
                    {r.featureInApp && (
                      <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-[#C2410C]/10 text-[#C2410C] font-bold flex items-center gap-1">
                        <Smartphone size={10} /> In app
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-gray-400 mt-0.5">/{r.slug}</p>
                </div>
              </button>
              <span className="text-xs text-gray-400 shrink-0">
                {new Date(r.updatedAt).toLocaleDateString('en-NG', { day: '2-digit', month: 'short' })}
              </span>
              {/* Founder 2026-08-26: "we cant turn it offline when we
                  edit". Correcting a live banner meant editing it in
                  front of every customer, or opening the editor and
                  hunting for a status dropdown. One click pulls it back
                  to draft: off the website AND off the app carousel,
                  since listFeaturedCards only serves published rows. */}
              {(r.status === 'published' || r.status === 'scheduled') && (
                <button
                  onClick={() => takeOffline(r)}
                  disabled={offliningId === r.id}
                  title="Pull this back to draft: removes it from the public website and from the app carousel"
                  className="shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#B45309] border border-[#B45309]/25 bg-[#B45309]/5 rounded-lg hover:bg-[#B45309]/10 disabled:opacity-50"
                >
                  <EyeOff size={13} />
                  {offliningId === r.id ? 'Taking offline…' : 'Take offline'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {editing && (
        <EditorModal
          row={editing === 'new' ? null : editing}
          defaultType={tab}
          // Reload on plain close too. The editor can now change status
          // without going through Save (Take offline patches straight
          // away, on purpose: pulling a wrong banner is urgent). Without
          // this the list would still say "published" behind the modal.
          onClose={() => { setEditing(null); load(); }}
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
  // Only send galleryImages when this editor actually changed it. On the
  // backend, null means "never curated" (seeded stories keep their built-in
  // illustrations) while [] means "deliberately emptied" (no images at
  // all). Sending [] on every save would flip null to [] the first time
  // anyone fixed a typo, silently killing a story's illustrations.
  const [galleryTouched, setGalleryTouched] = useState(false);
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
  const [notice,    setNotice]    = useState<string | null>(null);
  const [showPrev,  setShowPrev]  = useState(false);
  const confirm                   = useConfirm();
  // Only a super admin can turn website content live. Everyone else
  // submits for review; the button label changes to say so.
  const superAdmin                = isSuperAdminFromUser(getUser());

  // Everything that would stop this exact card reaching a phone, worked
  // out from the same rules the server query applies. Recomputed as the
  // fields change so the answer is never stale.
  const cardWarnings = useMemo(
    () => heroCardWarnings({
      coverImageUrl: cover,
      title,
      excerpt,
      status,
      featureFrom,
      featureUntil,
    }),
    [cover, title, excerpt, status, featureFrom, featureUntil],
  );

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
      setGalleryTouched(true);
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
    /**
     * Publishing put words in front of every customer in the country on
     * one unconfirmed click, and ticking the carousel box put a card on
     * the home screen of every app. Neither said so. The confirmation
     * only appears when this save actually reaches somebody: saving a
     * draft stays a single click, because a draft is private.
     */
    if (status === 'published' && superAdmin) {
      const blockers = featureInApp ? cardWarnings : [];
      const ok = await confirm({
        title: featureInApp
          ? 'Put this on every customer’s home screen?'
          : 'Publish this to the website?',
        message:
          `"${title || 'Untitled'}" goes live on seirs.app within about a minute.\n\n` +
          (featureInApp
            ? 'It also becomes a slide on the home carousel in the customer and business apps, which everybody sees the next time they open the app.\n\n'
            : '') +
          (blockers.length
            ? `WARNING before it reaches a phone:\n${blockers.map(b => `  - ${b}`).join('\n')}\n\n`
            : '') +
          'You can take it offline again from this screen, but anybody who has already read it keeps what they read.',
        confirmLabel: featureInApp ? 'Publish and feature it' : 'Publish it',
        danger:       blockers.length > 0,
      });
      if (!ok) return;
    }

    setSaving(true); setErr(null);
    try {
      const payload = {
        type, slug, title,
        excerpt:        excerpt        || null,
        body,
        coverImageUrl:  cover          || null,
        ...(galleryTouched ? { galleryImages: gallery } : {}),
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

  /**
   * Pull a live item down to draft from inside its own editor.
   *
   * Patches only `status`, and does NOT send the rest of the form: the
   * admin may have half-finished edits typed in, and taking a wrong
   * banner off the carousel must not publish those by accident. The
   * modal stays open with the local status switched to draft, so the
   * correction can carry on in private and then be saved normally.
   */
  const takeOffline = async () => {
    if (!row) return;
    setSaving(true); setErr(null); setNotice(null);
    try {
      await adminApi.websiteContent.update(row.id, { status: 'draft' });
      setStatus('draft');
      setNotice(
        featureInApp
          ? 'Taken offline. It is off the app carousel and off the website now. Fix it here, then set Status back to Published.'
          : 'Taken offline. The public page stops serving within about a minute. Fix it here, then set Status back to Published.',
      );
    } catch (e: any) { setErr(e?.message ?? 'Could not take this offline'); }
    finally { setSaving(false); }
  };

  /**
   * Free the carousel slot while leaving the article published and
   * readable on the website. This is the promo-is-over case: the story
   * is still true, it just should not occupy one of six slides in front
   * of every customer any more.
   */
  const removeFromCarousel = async () => {
    if (!row) return;
    setSaving(true); setErr(null); setNotice(null);
    try {
      await adminApi.websiteContent.update(row.id, { featureInApp: false });
      setFeatureInApp(false);
      setNotice('Removed from the app carousel. The story stays published and readable on the website.');
    } catch (e: any) { setErr(e?.message ?? 'Could not remove this from the carousel'); }
    finally { setSaving(false); }
  };

  const remove = async () => {
    if (!row) return;
    const ok = await confirm({
      title:        `Delete "${row.title}" for good?`,
      message:
        'It is gone from the website and from the apps, and this cannot be undone.\n\n'
        + 'Anyone who bookmarked or shared the link, and any search result pointing at it, will land on a "page not found" from now on.\n\n'
        + 'If there is any chance you will want it back, set the status to Draft instead: that takes it offline and keeps the work.',
      confirmLabel: 'Delete it for good',
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
    // Approving publishes it outright, so it gets the same warning the
    // Save path gives. Sending it back to draft harms nobody.
    if (approve) {
      const ok = await confirm({
        title:   `Publish "${row.title}"?`,
        message:
          'It goes live on seirs.app within about a minute'
          + (row.featureInApp ? ', and becomes a slide on the home carousel in every customer app.' : '.')
          + '\n\nThe person who wrote it is not told either way. You can take it offline again from here.',
        confirmLabel: 'Publish it',
      });
      if (!ok) return;
    }
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

          {notice && (
            <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded px-3 py-2 text-xs text-emerald-800">
              <EyeOff size={14} /> {notice}
            </div>
          )}

          {/* Founder 2026-08-26: "we cant turn it offline when we edit".
              A live item now says so at the top of its own editor, with
              the two ways down: all the way to draft, or just out of the
              carousel while the web page stays readable. Both patch
              immediately rather than waiting for Save, because the
              reason you are here is that something wrong is showing. */}
          {!isNew && status === 'published' && (
            <div className="rounded-lg border border-[#B45309]/25 bg-[#B45309]/5 px-3 py-3">
              <p className="text-xs font-bold text-[#B45309] uppercase tracking-wide">This is live right now</p>
              <p className="text-xs text-gray-600 mt-1">
                Every edit you save below changes what customers see on their next app open. Take it down
                first if you would rather correct it in private.
              </p>
              <div className="flex flex-wrap gap-2 mt-2.5">
                <button
                  onClick={takeOffline}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-[#B45309]/30 text-[#B45309] rounded-lg hover:bg-[#B45309]/10 disabled:opacity-50"
                >
                  <EyeOff size={13} /> Take offline (back to draft)
                </button>
                {featureInApp && (
                  <button
                    onClick={removeFromCarousel}
                    disabled={saving}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-white border border-[#E5E7EB] text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                  >
                    <Smartphone size={13} /> Remove from app carousel only
                  </button>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-1">
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Type</label>
              {/* Changing type has to reset the category. The three
                  types that use this column use completely different
                  vocabularies (news/press vs getting_started/payments vs
                  Engineering/Operations), so a category carried over
                  from the previous type is stored against a row whose
                  surface never asked for it: it survives the save,
                  matches no <option>, and renders the select blank. */}
              <select
                value={type}
                onChange={e => {
                  const next = e.target.value as WebType;
                  setType(next);
                  setCategory(next === 'article' ? 'news' : '');
                }}
                disabled={!isNew}
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
                Save needs something in the Body box even on an image-only slot, because the API requires
                it. No page-block renderer displays body, so a word like &ldquo;image slot&rdquo; is enough.
                <span className="block mt-1">
                Reserved slugs that render on the marketing site:{' '}
                <code className="bg-gray-100 px-1 rounded">home_hero</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">hero_for_business</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">hero_for_drivers</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">hero_for_partner_stores</code>,{' '}
                <code className="bg-gray-100 px-1 rounded">hero_how_it_works</code>.
                Upload a hero image on any of these to change the corresponding page&apos;s hero backdrop.
                </span>
                <span className="block mt-1">
                  Rows starting with <code className="bg-gray-100 px-1 rounded">img_</code> are the site&apos;s
                  IMAGE SLOTS: each one&apos;s description tells you exactly what goes where (section, aspect
                  ratio, and the matching Midjourney file name). Upload the image on the slot and the site
                  updates within a minute; leave a slot empty and the site shows its built-in artwork.
                </span>
              </div>
            )}
          </div>

          {/* job_listing added 2026-08-26: careers/[slug] falls back to
              the excerpt for its meta description, so a role posted
              without one shipped with no description at all and there
              was no box in which to write one. */}
          {/* page_block joins the list because the homepage hero renders
              this block's excerpt as its subheading (app/page.tsx reads
              hero?.excerpt on the home_hero block). It had no input, so
              that line could only ever be the hardcoded fallback. */}
          {type !== 'faq' && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {type === 'page_block' ? 'Sub-heading' : 'Excerpt'}
              </label>
              <input value={excerpt} onChange={e => setExcerpt(e.target.value)}
                placeholder={type === 'page_block'
                  ? 'The line under the heading. Blank keeps the built-in copy.'
                  : 'One-line teaser for cards + SEO description'}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
              {type === 'article' && (
                <p className="mt-1 text-[11px] text-gray-400">
                  This is also the description under the title on the app carousel card. Around 110
                  characters before it is clipped to two lines.
                </p>
              )}
              {type === 'page_block' && (
                <p className="mt-1 text-[11px] text-gray-400">
                  Only the <code className="bg-gray-100 px-1 rounded">home_hero</code> block renders a
                  heading and sub-heading. The other hero blocks use their image alone.
                </p>
              )}
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
                      onClick={() => { setGallery(prev => prev.filter((_, j) => j !== i)); setGalleryTouched(true); }}
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

          {/* Category, per type (2026-08-26).
              article: filter chip on /news, and the colour of the pill on
                       the app carousel card. "impact" was missing here
                       even though both the website labels and the app
                       badge colours already knew it.
              faq:     the website groups the FAQ page by this column.
                       With no input, every question landed under
                       "General" and the grouping looked broken.
              job_listing: printed as the department chip on /careers.
              changelog and page_block genuinely do not use it. */}
          {(type === 'article' || type === 'faq' || type === 'job_listing') && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
                {type === 'faq' ? 'Section' : type === 'job_listing' ? 'Team' : 'Category'}
              </label>
              <select value={category ?? ''} onChange={e => setCategory(e.target.value)}
                className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]">
                {type === 'article' && (
                  <>
                    <option value="news">News</option>
                    <option value="press">Press release</option>
                    <option value="product_update">Product update</option>
                    <option value="guide">Guide / how-to</option>
                    <option value="story">Customer story</option>
                    <option value="impact">Impact</option>
                  </>
                )}
                {/* These five keys are the ones the FAQ page has labels
                    for. Anything else shows up under "General". */}
                {type === 'faq' && (
                  <>
                    <option value="">General</option>
                    <option value="getting_started">Getting started</option>
                    <option value="payments">Payments</option>
                    <option value="pickup">Pickup and delivery</option>
                    <option value="drivers">For drivers</option>
                    <option value="partner">Partner stores</option>
                  </>
                )}
                {type === 'job_listing' && (
                  <>
                    <option value="">No team</option>
                    <option value="Engineering">Engineering</option>
                    <option value="Operations">Operations</option>
                    <option value="Growth">Growth</option>
                    <option value="Support">Support</option>
                    <option value="Finance">Finance</option>
                  </>
                )}
              </select>
              {type === 'faq' && (
                <p className="mt-1 text-[11px] text-gray-400">
                  The FAQ page puts each question under this heading. Leave it on General and it sits in the
                  ungrouped section at the top.
                </p>
              )}
            </div>
          )}

          {(type === 'article' || type === 'job_listing') && (
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

          {/* Articles were the one type without this control, yet
              sortOrder is load-bearing for them twice over: listPublished
              orders /news by sortOrder ASC then publishedAt DESC, and
              listFeaturedCards picks the carousel stories the same way.
              Every article therefore sat on the default 0 with no way to
              change it. Founder 2026-08-26. */}
          <div>
            <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Sort order (lower shows first)</label>
            <input value={sortOrder} onChange={e => setSortOrder(e.target.value)} type="number"
              className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]" />
            {type === 'article' && (
              <p className="mt-1 text-[11px] text-gray-400">
                Orders the news list on the website, and decides which stories make the six sent to the app
                carousel. It does not fix the slide order inside the app: the apps shuffle what they receive.
                Leave at 0 unless a story must come ahead of the others.
              </p>
            )}
          </div>

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
                  {/* THE PREVIEW (founder 2026-08-26: "i will like to see
                      a full preview before publishing, not just text
                      preview"). Drawn at the phone's true 328x200 from
                      the real HeroCardImage numbers, so a title that
                      will be cut off after two lines is cut off here
                      too. It updates as the fields above change. */}
                  <div className="mb-4">
                    <label className="text-xs font-bold uppercase tracking-wide text-gray-500">
                      How this looks in the app
                    </label>
                    <div className="mt-2 flex flex-wrap items-start gap-4">
                      <div className="rounded-2xl bg-[#F3F4F6] p-3 border border-[#E5E7EB]">
                        <HeroCardPreview
                          coverImageUrl={cover || null}
                          featureBadge={featureBadge}
                          category={category}
                          title={title}
                          excerpt={excerpt}
                        />
                        <p className="mt-2 text-center text-[10px] text-gray-400">
                          Actual size on a 360dp phone. Customer app and business app draw the same card.
                        </p>
                      </div>
                      <div className="flex-1 min-w-[210px] space-y-2">
                        {cardWarnings.length === 0 ? (
                          <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                            Nothing looks wrong with this card. It will go to the carousel once saved.
                          </p>
                        ) : (
                          cardWarnings.map(w => (
                            <p key={w} className="flex items-start gap-1.5 text-xs text-[#B45309] bg-[#B45309]/5 border border-[#B45309]/20 rounded-lg px-3 py-2">
                              <AlertCircle size={13} className="mt-px shrink-0" /> <span>{w}</span>
                            </p>
                          ))
                        )}
                        {/* Said out loud because the preview cannot show
                            it: the apps shuffle the featured stories on
                            every launch, so nobody should promise a
                            client their story is "the first slide". */}
                        <p className="flex items-start gap-1.5 text-xs text-gray-500 bg-gray-50 border border-[#E5E7EB] rounded-lg px-3 py-2">
                          <Info size={13} className="mt-px shrink-0" />
                          <span>
                            The apps shuffle the featured stories on every launch, so this card will not
                            always be the first slide. The animated SEIRS okada is always slide one.
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>

                  <label className="text-xs font-bold uppercase tracking-wide text-gray-500">Card label (optional)</label>
                  <input
                    value={featureBadge}
                    onChange={e => setFeatureBadge(e.target.value.slice(0, 24))}
                    placeholder="e.g. NEW OUTLET, PROMO. Blank uses the category."
                    className="w-full mt-1 px-3 py-2 border border-[#E5E7EB] rounded-lg focus:outline-none focus:border-[#3A7BD5]"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    {featureBadge.length}/24 characters. The pill colour comes from the Category above, not
                    from this text.
                  </p>

                  {/* Not a second input. One sortOrder field above does
                      both jobs; duplicating it here would be two controls
                      writing one column, which is its own kind of lie. */}
                  <p className="mt-2 text-[11px] text-gray-400">
                    Only six featured stories are sent to each app. If more than six are ticked, the ones
                    with the lowest <span className="font-semibold">Sort order</span> above win, then the
                    most recently published.
                  </p>

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
                <option value="draft">Draft (offline, nobody sees it)</option>
                <option value="scheduled">Scheduled</option>
                <option value="published">Published (live)</option>
                <option value="archived">Archived (offline, retired)</option>
                {/* Set by the review workflow, never chosen by hand. Kept
                    as a disabled option so a submitted item does not
                    render this select blank, which read as "no status". */}
                {status === 'pending_approval' && (
                  <option value="pending_approval" disabled>Awaiting approval</option>
                )}
              </select>
              <p className="mt-1 text-[11px] text-gray-400">
                Only Published reaches the public website and the app carousel. Draft and Archived both take
                it offline; Draft is the one to use when you plan to publish it again.
              </p>
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
