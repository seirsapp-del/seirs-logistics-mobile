'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';
import {
  ShieldCheck, Plus, Save, Trash2, X, Lock, Check, AlertCircle,
} from 'lucide-react';

// Spec V8 — dynamic role management. Super-admin creates custom job
// titles + bespoke permission sets without a code deploy. System
// roles (the original 8) are seeded on backend boot and protected
// from delete/rename.

interface Role {
  id:           string;
  slug:         string;
  name:         string;
  description:  string | null;
  permissions:  string[];
  isSystemRole: boolean;
  badgeColor:   string;
}

interface CatalogueSection {
  section: string;
  items:   Array<{ slug: string; label: string }>;
}

const COLOR_OPTIONS = ['gray', 'red', 'blue', 'green', 'yellow', 'purple', 'pink', 'cyan', 'orange'];

const COLOR_BG: Record<string, string> = {
  gray:   'bg-gray-100 text-gray-700',
  red:    'bg-red-100 text-red-700',
  blue:   'bg-blue-100 text-blue-700',
  green:  'bg-green-100 text-green-700',
  yellow: 'bg-yellow-100 text-yellow-700',
  purple: 'bg-purple-100 text-purple-700',
  pink:   'bg-pink-100 text-pink-700',
  cyan:   'bg-cyan-100 text-cyan-700',
  orange: 'bg-orange-100 text-orange-700',
};

export default function RolesPage() {
  const [roles,     setRoles]     = useState<Role[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueSection[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editing,   setEditing]   = useState<Role | null>(null);
  const [creating,  setCreating]  = useState(false);

  const [draftName,        setDraftName]        = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftPerms,       setDraftPerms]       = useState<Set<string>>(new Set());
  const [draftColor,       setDraftColor]       = useState('gray');
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [r, c] = await Promise.all([
        adminApi.roles.list(),
        adminApi.roles.catalogue(),
      ]);
      setRoles(Array.isArray(r) ? r : []);
      setCatalogue(Array.isArray(c) ? c : []);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load roles');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const allPermSlugs = useMemo(() =>
    catalogue.flatMap(s => s.items.map(i => i.slug)),
    [catalogue],
  );

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setDraftName('');
    setDraftDescription('');
    setDraftPerms(new Set());
    setDraftColor('gray');
    setError('');
  };

  const openEdit = (role: Role) => {
    setEditing(role);
    setCreating(false);
    setDraftName(role.name);
    setDraftDescription(role.description ?? '');
    setDraftPerms(new Set(role.permissions.includes('*') ? allPermSlugs : role.permissions));
    setDraftColor(role.badgeColor);
    setError('');
  };

  const close = () => {
    setEditing(null);
    setCreating(false);
    setError('');
  };

  const togglePerm = (slug: string) => {
    setDraftPerms(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else                next.add(slug);
      return next;
    });
  };

  const toggleSection = (section: CatalogueSection) => {
    const sectionSlugs = section.items.map(i => i.slug);
    const allOn = sectionSlugs.every(s => draftPerms.has(s));
    setDraftPerms(prev => {
      const next = new Set(prev);
      if (allOn) sectionSlugs.forEach(s => next.delete(s));
      else       sectionSlugs.forEach(s => next.add(s));
      return next;
    });
  };

  const save = async () => {
    if (!draftName.trim()) { setError('Name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const body = {
        name:        draftName.trim(),
        description: draftDescription.trim(),
        permissions: Array.from(draftPerms),
        badgeColor:  draftColor,
      };
      if (editing) {
        await adminApi.roles.update(editing.id, body);
      } else {
        await adminApi.roles.create(body);
      }
      await load();
      close();
    } catch (e: any) {
      setError(e?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (role: Role) => {
    if (!confirm(`Delete role "${role.name}"? This cannot be undone.`)) return;
    try {
      await adminApi.roles.deleteOne(role.id);
      load();
    } catch (e: any) {
      alert(e?.message ?? 'Could not delete');
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#0F2B4C] flex items-center justify-center">
            <ShieldCheck size={18} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#0F2B4C]">Role Management</h1>
            <p className="text-sm text-gray-500">
              Create custom job titles and assign granular permissions. System roles cannot be renamed or deleted.
            </p>
          </div>
        </div>
        <button
          onClick={openCreate}
          className="flex items-center gap-2 bg-[#3A7BD5] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-[#2f6cc0]"
        >
          <Plus size={15} />
          Create role
        </button>
      </div>

      {/* Roles list */}
      {loading ? (
        <div className="text-center py-16 text-gray-400">Loading roles…</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] divide-y divide-[#E5E7EB]">
          {roles.map(role => (
            <div key={role.id} className="px-4 py-3 flex items-start gap-4">
              <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded ${COLOR_BG[role.badgeColor] ?? COLOR_BG.gray}`}>
                {role.slug}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-bold text-[#0F2B4C]">{role.name}</p>
                  {role.isSystemRole && (
                    <span className="flex items-center gap-1 text-[10px] text-gray-500">
                      <Lock size={10} /> system
                    </span>
                  )}
                </div>
                {role.description && (
                  <p className="text-xs text-gray-500 mt-1 leading-snug">{role.description}</p>
                )}
                <p className="text-[10px] text-gray-400 mt-1">
                  {role.permissions.includes('*')
                    ? 'Full access (all permissions)'
                    : `${role.permissions.length} permission${role.permissions.length === 1 ? '' : 's'}`}
                </p>
              </div>
              <button
                onClick={() => openEdit(role)}
                className="text-xs text-[#3A7BD5] font-semibold hover:underline"
              >
                {role.isSystemRole ? 'Adjust permissions' : 'Edit'}
              </button>
              {!role.isSystemRole && (
                <button onClick={() => remove(role)} className="text-red-500 hover:text-red-700">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Editor drawer */}
      {(editing || creating) && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={close} />
          <aside className="fixed right-0 top-0 bottom-0 w-full max-w-2xl bg-white shadow-2xl z-50 overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-[#E5E7EB] flex items-start justify-between p-4 z-10">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-[#0F2B4C]">
                  {creating ? 'Create new role' : `Edit ${editing?.name}`}
                </h2>
                {editing?.isSystemRole && (
                  <p className="text-xs text-gray-500 mt-1">
                    System role — name and slug are locked. Permissions can still be adjusted.
                  </p>
                )}
              </div>
              <button onClick={close} className="p-1 hover:bg-gray-100 rounded">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Name</label>
                <input
                  type="text"
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  disabled={editing?.isSystemRole}
                  placeholder="e.g. Lagos Ops Lead"
                  className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:border-[#3A7BD5] disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-1">Description</label>
                <textarea
                  value={draftDescription}
                  onChange={e => setDraftDescription(e.target.value)}
                  rows={2}
                  placeholder="What does this role do?"
                  className="w-full px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm focus:outline-none focus:border-[#3A7BD5]"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wide mb-2">Badge colour</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setDraftColor(c)}
                      className={`text-[10px] font-bold uppercase px-2 py-1 rounded ${COLOR_BG[c]} ${draftColor === c ? 'ring-2 ring-[#0F2B4C]' : ''}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-bold text-gray-600 uppercase tracking-wide">Permissions</label>
                  <span className="text-xs text-gray-500">
                    {draftPerms.size} of {allPermSlugs.length} selected
                  </span>
                </div>

                <div className="space-y-3">
                  {catalogue.map(section => {
                    const sectionSlugs = section.items.map(i => i.slug);
                    const allOn = sectionSlugs.every(s => draftPerms.has(s));
                    const someOn = sectionSlugs.some(s => draftPerms.has(s));
                    return (
                      <div key={section.section} className="border border-[#E5E7EB] rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleSection(section)}
                          className="w-full px-3 py-2 bg-gray-50 flex items-center justify-between hover:bg-gray-100"
                        >
                          <span className="text-xs font-bold text-[#0F2B4C] uppercase tracking-wide">
                            {section.section}
                          </span>
                          <span className={`text-[10px] font-bold ${allOn ? 'text-green-700' : someOn ? 'text-yellow-700' : 'text-gray-400'}`}>
                            {allOn ? 'all' : someOn ? `${sectionSlugs.filter(s => draftPerms.has(s)).length}/${sectionSlugs.length}` : 'none'}
                          </span>
                        </button>
                        <div className="p-2 grid grid-cols-2 gap-1">
                          {section.items.map(perm => {
                            const on = draftPerms.has(perm.slug);
                            return (
                              <label
                                key={perm.slug}
                                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => togglePerm(perm.slug)}
                                  className="w-4 h-4 accent-[#3A7BD5]"
                                />
                                <span className="text-xs text-[#0F2B4C]">{perm.label}</span>
                              </label>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {error && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
                  <AlertCircle size={14} />
                  {error}
                </div>
              )}

              <button
                onClick={save}
                disabled={saving}
                className="w-full bg-[#0F2B4C] text-white font-semibold py-2.5 rounded-lg hover:bg-[#3A7BD5] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                <Save size={15} />
                {saving ? 'Saving…' : creating ? 'Create role' : 'Save changes'}
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
