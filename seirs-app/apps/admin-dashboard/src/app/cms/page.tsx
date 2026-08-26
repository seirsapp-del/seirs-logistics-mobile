'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { getUser } from '@/lib/auth';
import { isSuperAdminFromUser } from '@/lib/rbac';
import { useConfirm } from '@/components/ConfirmDialog';
import {
  Plus, EyeOff, CheckCircle, Send, Trash2, ImageIcon, Megaphone, Star, Filter, AlertCircle, Pencil,
} from 'lucide-react';

type ContentType = 'banner' | 'story' | 'promotion';
type ContentStatus = 'draft' | 'pending' | 'published' | 'archived';

interface CmsItem {
  id:         string;
  type:       ContentType;
  title:      string;
  body?:      string;
  imageUrl?:  string;
  status:     ContentStatus;
  createdAt:  string;
  updatedAt:  string;
  publishedAt?: string;
}

const TYPE_TABS: { key: ContentType | 'all'; label: string; Icon: React.ComponentType<any> }[] = [
  { key: 'all',       label: 'All',        Icon: Filter },
  { key: 'banner',    label: 'Banners',    Icon: ImageIcon },
  { key: 'story',     label: 'Stories',    Icon: Star },
  { key: 'promotion', label: 'Promotions', Icon: Megaphone },
];

const STATUS_COLORS: Record<ContentStatus, string> = {
  draft:     'bg-gray-100 text-gray-600',
  pending:   'bg-amber-100 text-amber-700',
  published: 'bg-emerald-100 text-emerald-700',
  archived:  'bg-red-100 text-red-600',
};

const STATUS_LABEL: Record<ContentStatus, string> = {
  draft:     'Draft',
  pending:   'Pending Approval',
  published: 'Published',
  archived:  'Archived',
};

export default function CmsPage() {
  const [items,        setItems]        = useState<CmsItem[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [activeType,   setActiveType]   = useState<ContentType | 'all'>('all');
  const [activeStatus, setActiveStatus] = useState<ContentStatus | 'all'>('all');
  const [creating,     setCreating]     = useState(false);
  const [newItem,      setNewItem]      = useState({ type: 'banner' as ContentType, title: '', body: '', imageUrl: '' });
  const [uploading,    setUploading]    = useState(false);
  const [submitting,   setSubmitting]   = useState(false);
  const [actionId,     setActionId]     = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  // cms.update was defined with no caller: a typo in a live in-app banner
  // could only be fixed by deleting and recreating it, losing its id.
  const [editing,      setEditing]      = useState<CmsItem | null>(null);
  const [editDraft,    setEditDraft]    = useState({ title: '', body: '', imageUrl: '' });
  const confirm                         = useConfirm();

  // Same fix as /audit-log: the legacy check missed super admins whose
  // role comes from the dynamic role system.
  const isSuper = isSuperAdminFromUser(getUser());

  const load = () => {
    setLoading(true);
    setError(null);
    adminApi.cms.list(
      activeType !== 'all' ? activeType : undefined,
      activeStatus !== 'all' ? activeStatus : undefined,
    ).then((data: any) => {
      setItems(Array.isArray(data) ? data : data?.items ?? []);
    })
      // A swallowed error read as "nothing published", which on a content
      // surface invites someone to create a duplicate of what is already there.
      .catch((e: any) => setError(e?.message ?? 'Could not load CMS content'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeType, activeStatus]);

  const create = async () => {
    if (!newItem.title.trim()) return;
    setSubmitting(true);
    try {
      await adminApi.cms.create({
        ...newItem,
        imageUrl: newItem.imageUrl || undefined,
      });
      setCreating(false);
      setNewItem({ type: 'banner', title: '', body: '', imageUrl: '' });
      load();
    } finally {
      setSubmitting(false);
    }
  };

  // R2 upload, same helper /website already uses. An image-less banner
  // system fails the app-must-look-alive rule on the one surface built
  // to carry pictures.
  const uploadImage = async (file: File, onDone: (url: string) => void) => {
    setUploading(true);
    setError(null);
    try {
      const { url } = await adminApi.upload.image(file, 'cms');
      onDone(url);
    } catch (e: any) {
      setError(e?.message ?? 'Image upload failed');
    } finally {
      setUploading(false);
    }
  };

  const openEdit = (item: CmsItem) => {
    setEditing(item);
    setEditDraft({ title: item.title ?? '', body: item.body ?? '', imageUrl: item.imageUrl ?? '' });
  };

  const saveEdit = async () => {
    if (!editing || !editDraft.title.trim()) return;
    setSubmitting(true);
    try {
      await adminApi.cms.update(editing.id, {
        title:    editDraft.title.trim(),
        body:     editDraft.body,
        imageUrl: editDraft.imageUrl || null,
      });
      setEditing(null);
      load();
    } catch (e: any) {
      setError(e?.message ?? 'Could not save this item');
    } finally {
      setSubmitting(false);
    }
  };

  const approve = async (id: string) => {
    setActionId(id);
    try { await adminApi.cms.approve(id); load(); } finally { setActionId(null); }
  };

  const publish = async (id: string) => {
    setActionId(id);
    try { await adminApi.cms.publish(id); load(); } finally { setActionId(null); }
  };

  const remove = async (id: string) => {
    const ok = await confirm({
      title:        'Delete this content item?',
      message:      'Deletes the row for good. No app or website reads this table, so nothing changes for any user either way. This cannot be undone.',
      confirmLabel: 'Delete',
      danger:       true,
    });
    if (!ok) return;
    setActionId(id);
    try { await adminApi.cms.delete(id); load(); } finally { setActionId(null); }
  };

  return (
    <div className="min-h-screen">
      <main className="p-6 lg:p-8 max-w-6xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2B4C]">In-App CMS (inactive)</h1>
            <p className="text-sm text-[#0F2B4C]/40 mt-1">Banners · Stories · Promotions · not wired to any app yet</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-[#0F2B4C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3A7BD5] transition-colors"
          >
            <Plus size={15} /> New Content
          </button>
        </div>

        {/* ── THE DEAD END ────────────────────────────────────────────
            Founder 2026-08-26: "the content management did not work".
            He wrote a story here, published it, and it never reached a
            phone. Nothing was broken in the sense of throwing an error.

            This page writes to the `cms_items` table. Every route that
            touches that table lives on the admin controller behind
            JwtAuthGuard + AdminGuard, and there is not one @Public read
            of it anywhere in the backend. No app fetches it, the website
            does not fetch it, so publishing here moves a row from one
            admin-only status to another admin-only status.

            The surface he wanted, the home carousel, is served by
            listFeaturedCards over the `website_content` table, which the
            Website editor writes. So the page named "In-App CMS" reaches
            no app, and the page named "Website" is the one that reaches
            both apps and the website. That naming is the trap.

            Saying so out loud beats leaving a convincing form that goes
            nowhere. Removing the page is not this app's call: the table
            holds whatever has already been typed into it, and wiring a
            public read is backend work. Until then it says what it is.
        */}
        <div className="bg-[#B45309]/8 border border-[#B45309]/30 rounded-xl px-4 py-4 mb-6">
          <div className="flex items-start gap-2.5">
            <AlertCircle size={17} className="mt-0.5 shrink-0 text-[#B45309]" />
            <div className="text-sm text-[#0F2B4C]/80">
              <p className="font-bold text-[#B45309]">Content saved here does not reach the apps yet.</p>
              <p className="mt-1.5 leading-relaxed">
                These banners, stories and promotions are stored, but no customer, driver or business app
                reads them, and neither does the website. Publishing here only changes the status on this
                screen. Nothing about it fails loudly, which is exactly why this notice is here.
              </p>
              <p className="mt-2 leading-relaxed">
                To put a story on the app home carousel, or an article in the app Stories list, use{' '}
                <a href="/website" className="font-semibold text-[#3A7BD5] underline hover:no-underline">
                  Website Content
                </a>{' '}
                and tick <span className="font-semibold">Feature on the app home carousel</span>. That editor
                feeds the customer app, the business app and seirs.app from one story, and it now shows the
                real card before you publish.
              </p>
            </div>
          </div>
        </div>

        {/* Workflow notice */}
        <div className="bg-[#3A7BD5]/8 border border-[#3A7BD5]/20 rounded-xl px-4 py-3 mb-6 text-sm text-[#0F2B4C]/70">
          <span className="font-medium text-[#0F2B4C]">Publish workflow:</span>{' '}
          Draft → <span className="text-amber-600 font-medium">Pending Approval</span> (Super Admin reviews) → <span className="text-emerald-600 font-medium">Published</span>
        </div>

        {/* Edit modal */}
        {editing && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-[#0F2B4C] mb-1">Edit content item</h2>
              <p className="text-xs text-gray-500 mb-4 capitalize">
                {editing.type} · {STATUS_LABEL[editing.status]}
              </p>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Title</label>
                  <input
                    value={editDraft.title}
                    onChange={(e) => setEditDraft((d) => ({ ...d, title: e.target.value }))}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Body / Description</label>
                  {/* rows=12 and resizable: an editor proof-reading a
                      story through a 3-line window with resize-none was
                      the founder's complaint on 2026-08-26, and stories
                      are the longest thing this app publishes. */}
                  <textarea
                    value={editDraft.body}
                    onChange={(e) => setEditDraft((d) => ({ ...d, body: e.target.value }))}
                    rows={12}
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] resize-y min-h-[9rem]"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    {(editDraft.body ?? '').length} characters. Drag the corner to make this taller.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Image</label>
                  <div className="flex items-center gap-3">
                    {editDraft.imageUrl ? (
                      <img src={editDraft.imageUrl} alt="" className="h-14 w-14 rounded-lg border border-gray-200 object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-300">
                        <ImageIcon size={18} />
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadImage(f, (url) => setEditDraft((d) => ({ ...d, imageUrl: url })));
                      }}
                      className="text-xs"
                    />
                    {editDraft.imageUrl && (
                      <button
                        onClick={() => setEditDraft((d) => ({ ...d, imageUrl: '' }))}
                        className="text-xs font-semibold text-red-600 hover:underline"
                      >
                        Remove
                      </button>
                    )}
                  </div>
                  {uploading && <p className="mt-1 text-xs text-gray-400">Uploading…</p>}
                </div>
                {editing.status === 'published' && (
                  // Used to read "This item is live. Saving changes what
                  // users see on their next app open." No user sees it:
                  // cms_items has no public read route. Overstating reach
                  // is how the founder came to trust this page.
                  <p className="text-xs text-amber-700">
                    Marked published, but nothing reads this table yet, so no user sees this item. Use
                    Website Content for anything that has to reach a phone.
                  </p>
                )}
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setEditing(null)}
                    className="flex-1 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={submitting || !editDraft.title.trim()}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold bg-[#0F2B4C] text-white hover:bg-[#3A7BD5] disabled:opacity-50 transition-colors"
                  >
                    {submitting ? 'Saving…' : 'Save changes'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Create modal */}
        {creating && (
          <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
              <h2 className="text-lg font-bold text-[#0F2B4C] mb-4">New Content Item</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Type</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(['banner', 'story', 'promotion'] as ContentType[]).map((t) => (
                      <button
                        key={t}
                        onClick={() => setNewItem((n) => ({ ...n, type: t }))}
                        className={`py-2 rounded-lg text-sm font-medium capitalize transition-colors ${
                          newItem.type === t
                            ? 'bg-[#0F2B4C] text-white'
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Title</label>
                  <input
                    value={newItem.title}
                    onChange={(e) => setNewItem((n) => ({ ...n, title: e.target.value }))}
                    placeholder="Enter title…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Body / Description</label>
                  <textarea
                    value={newItem.body}
                    onChange={(e) => setNewItem((n) => ({ ...n, body: e.target.value }))}
                    rows={12}
                    placeholder="Description or markdown content. Paste a full story here: this box grows."
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] resize-y min-h-[9rem]"
                  />
                  <p className="mt-1 text-[11px] text-gray-400">
                    {(newItem.body ?? '').length} characters. Drag the corner to make this taller.
                  </p>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5">Image</label>
                  <div className="flex items-center gap-3">
                    {newItem.imageUrl ? (
                      <img src={newItem.imageUrl} alt="" className="h-14 w-14 rounded-lg border border-gray-200 object-cover" />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-lg border border-dashed border-gray-300 text-gray-300">
                        <ImageIcon size={18} />
                      </div>
                    )}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) uploadImage(f, (url) => setNewItem((n) => ({ ...n, imageUrl: url })));
                      }}
                      className="text-xs"
                    />
                  </div>
                  {uploading && <p className="mt-1 text-xs text-gray-400">Uploading…</p>}
                </div>
                <div className="flex gap-3 pt-2">
                  <button
                    onClick={() => setCreating(false)}
                    className="flex-1 py-2 rounded-lg text-sm text-gray-500 border border-gray-200 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={create}
                    disabled={submitting || !newItem.title.trim()}
                    className="flex-1 py-2 rounded-lg text-sm font-semibold bg-[#0F2B4C] text-white hover:bg-[#3A7BD5] disabled:opacity-50 transition-colors"
                  >
                    {submitting ? 'Creating…' : 'Create Draft'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Type tabs */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-4 w-fit">
          {TYPE_TABS.map(({ key, label, Icon }) => (
            <button
              key={key}
              onClick={() => setActiveType(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeType === key ? 'bg-white text-[#0F2B4C] shadow-sm' : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              <Icon size={14} /> {label}
            </button>
          ))}
        </div>

        {/* Status filter */}
        <div className="flex gap-2 mb-6 flex-wrap">
          {(['all', 'draft', 'pending', 'published', 'archived'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setActiveStatus(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium capitalize transition-colors ${
                activeStatus === s
                  ? 'bg-[#0F2B4C] text-white'
                  : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
              }`}
            >
              {s === 'all' ? 'All Statuses' : STATUS_LABEL[s]}
            </button>
          ))}
        </div>

        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span className="flex-1">{error}</span>
            <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
          </div>
        )}

        {/* Items list */}
        {loading ? (
          <div className="text-center py-20 text-[#0F2B4C]/30">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-[#0F2B4C]/30">No content found</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {items.map((item, idx) => (
              <div key={item.id} className={`flex items-center gap-4 px-5 py-4 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
                {/* Thumbnail so the row is identifiable before opening it
                    (founder 2026-08-13). A list of titles alone means
                    clicking into each one to find the right banner. */}
                {item.imageUrl ? (
                  <img
                    src={item.imageUrl}
                    alt=""
                    className="w-14 h-14 rounded-lg object-cover bg-gray-100 shrink-0 border border-gray-200"
                  />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gray-100 shrink-0 border border-gray-200 flex items-center justify-center text-gray-300">
                    <ImageIcon size={18} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs bg-[#0F2B4C]/8 text-[#0F2B4C]/60 px-2 py-0.5 rounded capitalize font-medium">
                      {item.type}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${STATUS_COLORS[item.status]}`}>
                      {STATUS_LABEL[item.status]}
                    </span>
                  </div>
                  <p className="font-medium text-[#0F2B4C] text-sm truncate">{item.title}</p>
                  {item.body && <p className="text-xs text-gray-400 mt-0.5 truncate">{item.body}</p>}
                  <p className="text-xs text-gray-400 mt-1">
                    Updated {new Date(item.updatedAt).toLocaleDateString('en-NG')}
                    {item.publishedAt && ` · Published ${new Date(item.publishedAt).toLocaleDateString('en-NG')}`}
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => openEdit(item)}
                    title="Edit title and body in place, keeping the item's id"
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-gray-50 text-gray-700 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  {item.status === 'draft' && isSuper && (
                    <button
                      onClick={() => approve(item.id)}
                      disabled={actionId === item.id}
                      title="Approve for publishing"
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 rounded-lg hover:bg-amber-100 disabled:opacity-50 transition-colors"
                    >
                      <CheckCircle size={13} /> Approve
                    </button>
                  )}
                  {item.status === 'pending' && isSuper && (
                    <button
                      onClick={() => publish(item.id)}
                      disabled={actionId === item.id}
                      title="Publish now"
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50 transition-colors"
                    >
                      <Send size={13} /> Publish
                    </button>
                  )}
                  {item.status === 'published' && (
                    // Said "Live" with a green eye. It is not live
                    // anywhere: nothing consumes cms_items.
                    <span
                      title="Published in this table only. No app or website reads it."
                      className="flex items-center gap-1 text-xs text-gray-400"
                    >
                      <EyeOff size={13} /> Not shown anywhere
                    </span>
                  )}
                  {isSuper && (
                    <button
                      onClick={() => remove(item.id)}
                      disabled={actionId === item.id}
                      className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
