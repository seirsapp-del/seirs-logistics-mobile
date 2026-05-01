'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { getAdminRole } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/rbac';
import {
  Plus, Eye, CheckCircle, Send, Trash2, ImageIcon, Megaphone, Star, Filter,
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
  const [newItem,      setNewItem]      = useState({ type: 'banner' as ContentType, title: '', body: '' });
  const [submitting,   setSubmitting]   = useState(false);
  const [actionId,     setActionId]     = useState<string | null>(null);

  const role = getAdminRole();
  const isSuper = isSuperAdmin(role);

  const load = () => {
    setLoading(true);
    adminApi.cms.list(
      activeType !== 'all' ? activeType : undefined,
      activeStatus !== 'all' ? activeStatus : undefined,
    ).then((data: any) => {
      setItems(Array.isArray(data) ? data : data?.items ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [activeType, activeStatus]);

  const create = async () => {
    if (!newItem.title.trim()) return;
    setSubmitting(true);
    try {
      await adminApi.cms.create(newItem);
      setCreating(false);
      setNewItem({ type: 'banner', title: '', body: '' });
      load();
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
    if (!confirm('Delete this content item?')) return;
    setActionId(id);
    try { await adminApi.cms.delete(id); load(); } finally { setActionId(null); }
  };

  return (
    <div className="min-h-screen">
      <main className="p-6 lg:p-8 max-w-6xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0F2B4C]">Content Management</h1>
            <p className="text-sm text-[#0F2B4C]/40 mt-1">Banners · Stories · Promotions</p>
          </div>
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 bg-[#0F2B4C] text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-[#3A7BD5] transition-colors"
          >
            <Plus size={15} /> New Content
          </button>
        </div>

        {/* Workflow notice */}
        <div className="bg-[#3A7BD5]/8 border border-[#3A7BD5]/20 rounded-xl px-4 py-3 mb-6 text-sm text-[#0F2B4C]/70">
          <span className="font-medium text-[#0F2B4C]">Publish workflow:</span>{' '}
          Draft → <span className="text-amber-600 font-medium">Pending Approval</span> (Super Admin reviews) → <span className="text-emerald-600 font-medium">Published</span>
        </div>

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
                    rows={3}
                    placeholder="Optional description or markdown content…"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] resize-none"
                  />
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

        {/* Items list */}
        {loading ? (
          <div className="text-center py-20 text-[#0F2B4C]/30">Loading…</div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 text-[#0F2B4C]/30">No content found</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {items.map((item, idx) => (
              <div key={item.id} className={`flex items-center gap-4 px-5 py-4 ${idx > 0 ? 'border-t border-gray-100' : ''}`}>
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
                    <span className="flex items-center gap-1 text-xs text-emerald-600">
                      <Eye size={13} /> Live
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
