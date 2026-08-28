'use client';
import { useEffect, useMemo, useState } from 'react';
import { adminApi } from '@/lib/api';
import { useConfirm, useNotify } from '@/components/ConfirmDialog';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';
import {
  ShieldCheck, Plus, Save, Trash2, X, Lock, AlertCircle, AlertTriangle,
} from 'lucide-react';

/**
 * What each job title at SEIRS is allowed to open.
 *
 * The list described a role by its database slug ("driver_compliance")
 * and its powers by a number ("9 permissions"), which is precisely the
 * information a person deciding whether to grant it cannot use. Both are
 * now the words on the sidebar, taken from the same catalogue the editor
 * already loads.
 *
 * Saving also says how many people are about to be affected. Adjusting a
 * system role's permissions changes what everybody holding it can do to
 * customers and money, and it used to happen on an unconfirmed click.
 */

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

const COLOR_OPTIONS = ['gray', 'red', 'blue', 'green', 'yellow', 'pink', 'cyan', 'orange'];

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
  // Who currently holds each role, so a change can say who it affects.
  // Optional: a viewer with the roles grant but not the staff grant is
  // refused this list, and the page simply stops quoting numbers.
  const [holders,   setHolders]   = useState<Record<string, number> | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [loadError, setLoadError] = useState('');
  const [editing,   setEditing]   = useState<Role | null>(null);
  const [creating,  setCreating]  = useState(false);

  const [draftName,        setDraftName]        = useState('');
  const [draftDescription, setDraftDescription] = useState('');
  const [draftPerms,       setDraftPerms]       = useState<Set<string>>(new Set());
  const [draftColor,       setDraftColor]       = useState('gray');
  const [saving,           setSaving]           = useState(false);
  const [error,            setError]            = useState('');
  const confirm                                 = useConfirm();
  const notify                                  = useNotify();

  const load = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [r, c, staff] = await Promise.all([
        adminApi.roles.list(),
        adminApi.roles.catalogue(),
        adminApi.admins.list().catch(() => null),
      ]);
      setRoles(Array.isArray(r) ? r : []);
      setCatalogue(Array.isArray(c) ? c : []);
      if (Array.isArray(staff)) {
        const counts: Record<string, number> = {};
        staff.forEach((m: any) => {
          const key = m?.roleId ?? (Array.isArray(r) ? r.find((x: Role) => x.slug === (m?.adminRole ?? m?.role))?.id : undefined);
          if (key) counts[key] = (counts[key] ?? 0) + 1;
        });
        setHolders(counts);
      } else {
        setHolders(null);
      }
    } catch (e: any) {
      // This used to write into the drawer's error box, which is not on
      // screen when the page first loads, so a failed load rendered as
      // "there are no roles" with nothing to click.
      setLoadError(e?.message ?? 'The roles could not be loaded.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const allPermSlugs = useMemo(() =>
    catalogue.flatMap(s => s.items.map(i => i.slug)),
    [catalogue],
  );

  const permLabels = useMemo(() => {
    const map: Record<string, string> = {};
    catalogue.forEach(s => s.items.forEach(i => { map[i.slug] = i.label; }));
    return map;
  }, [catalogue]);

  /** Slugs into the words on the sidebar. */
  const words = (perms: string[]): string[] => {
    if (perms.includes('*')) return ['Everything in the dashboard'];
    return perms.map(p => permLabels[p] ?? p.replace(/[._-]+/g, ' '));
  };

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
    if (!draftName.trim()) { setError('Give the role a name first.'); return; }

    // The editor expands '*' to every slug when it opens. Posting that
    // expansion back turned the super_admin wildcard into a frozen list,
    // so every page added afterwards needed an explicit grant and
    // permissions.includes('*') stopped matching. Collapse it back.
    const selected   = Array.from(draftPerms);
    const isWildcard = allPermSlugs.length > 0 && allPermSlugs.every(s => draftPerms.has(s));

    const before = new Set(editing ? words(editing.permissions) : []);
    const after  = new Set(isWildcard ? words(['*']) : words(selected));
    const gained = [...after].filter(w => !before.has(w));
    const lost   = [...before].filter(w => !after.has(w));
    const affected = editing && holders ? (holders[editing.id] ?? 0) : 0;

    const ok = await confirm({
      title: creating ? `Create the role "${draftName.trim()}"?` : `Change what "${draftName.trim()}" can do?`,
      message:
        (creating
          ? `Nobody holds this role yet. It will be offered on Staff Management as soon as you save.\n\n`
          : affected > 0
            ? `${affected} ${affected === 1 ? 'person holds' : 'people hold'} this role. What they can do changes the next time they load a page, and they are not told.\n\n`
            : 'Nobody holds this role right now, so nothing changes for anybody today.\n\n') +
        (isWildcard
          ? 'It opens EVERYTHING in the dashboard, including staff, roles and the launch reset.\n\n'
          : selected.length === 0
            ? 'It opens NOTHING. Anybody given it can sign in and will see an empty dashboard.\n\n'
            : `It opens: ${[...after].join(', ')}.\n\n`) +
        (gained.length ? `Newly allowed: ${gained.join(', ')}.\n\n` : '') +
        (lost.length   ? `No longer allowed: ${lost.join(', ')}.\n\n` : '') +
        'You can change it again at any time.',
      confirmLabel: creating ? 'Create the role' : 'Save the change',
      danger:       isWildcard || (!creating && lost.length > 0),
    });
    if (!ok) return;

    setSaving(true);
    setError('');
    try {
      const body = {
        name:        draftName.trim(),
        description: draftDescription.trim(),
        permissions: isWildcard ? ['*'] : selected,
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
      setError(e?.message ?? 'The role was not saved.');
    } finally {
      setSaving(false);
    }
  };

  const remove = async (role: Role) => {
    const count = holders?.[role.id] ?? 0;
    const ok = await confirm({
      title:   `Delete the role "${role.name}"?`,
      message:
        (count > 0
          ? `${count} ${count === 1 ? 'person is' : 'people are'} on this role right now. They keep their account but lose everything this role opened, so they will sign in to an empty dashboard until somebody gives them another one.\n\n`
          : 'Nobody is on this role, so nobody is affected.\n\n') +
        'This cannot be undone, though you can build the same role again.',
      confirmLabel: 'Delete the role',
      danger:       true,
    });
    if (!ok) return;
    try {
      await adminApi.roles.deleteOne(role.id);
      void notify({ title: 'Deleted', message: `"${role.name}" is gone.`, tone: 'success' });
      load();
    } catch (e: any) {
      void notify({ title: 'Could not delete it', message: e?.message ?? 'The server refused it. The role is unchanged.', tone: 'error' });
    }
  };

  return (
    <div className="p-8">
      <PageIntro
        title="Role Management"
        purpose="Decide what each job title at SEIRS is allowed to open in this dashboard, and build a new one when none of the existing titles fits."
        storageKey="roles"
        help={
          <>
            <p>A role is a list of the pages somebody can reach. Changing one changes what every person holding it can do, straight away, without telling them.</p>
            <p><strong>The eight built-in roles</strong> cannot be renamed or deleted, but what they open can still be adjusted.</p>
            <p><strong>Deleting a role</strong> leaves anybody on it able to sign in and see nothing. Move them to another role first.</p>
            <p>Grant the fewest pages that let somebody do their job. Every extra page is another record they can change.</p>
          </>
        }
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-2 rounded-lg bg-[#3A7BD5] px-4 py-2 text-sm font-semibold text-white hover:bg-[#2f6cc0]"
          >
            <Plus size={15} /> Build a role
          </button>
        }
      />

      {loadError && (
        <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{loadError}</span>
          <button onClick={load} className="shrink-0 font-semibold underline hover:no-underline">Retry</button>
        </div>
      )}

      {/* Roles list */}
      {loading ? (
        <div className="py-16 text-center text-gray-400">Loading the roles</div>
      ) : loadError ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white">
          <EmptyState
            icon={<AlertCircle size={20} />}
            title="The roles could not be loaded"
            body="This is a connection or permission problem. It does not mean no roles exist."
            action={{ label: 'Try again', onClick: load }}
          />
        </div>
      ) : roles.length === 0 ? (
        <div className="rounded-xl border border-[#E5E7EB] bg-white">
          <EmptyState
            icon={<ShieldCheck size={20} />}
            title="No roles exist"
            body="The eight built-in roles are normally created when the API starts, so an empty list here usually means something is wrong with the deployment rather than with your account."
            action={{ label: 'Try again', onClick: load }}
          />
        </div>
      ) : (
        <div className="divide-y divide-[#E5E7EB] rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
          {roles.map(role => {
            const list  = words(role.permissions);
            const count = holders?.[role.id];
            return (
              <div key={role.id} className="flex items-start gap-4 px-4 py-3">
                {/* Was the raw slug, e.g. "driver_compliance". */}
                <span className={`shrink-0 rounded px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${COLOR_BG[role.badgeColor] ?? COLOR_BG.gray}`}>
                  {role.name}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold text-[#0F2B4C]">{role.name}</p>
                    {role.isSystemRole && (
                      <span className="flex items-center gap-1 text-[10px] text-gray-500">
                        <Lock size={10} /> built in, cannot be renamed or deleted
                      </span>
                    )}
                    {count !== undefined && (
                      <span className="text-[10px] font-semibold text-[#0F2B4C]/50">
                        {count === 0 ? 'nobody has this role' : `${count} ${count === 1 ? 'person has' : 'people have'} it`}
                      </span>
                    )}
                  </div>
                  {role.description && (
                    <p className="mt-1 text-xs leading-snug text-gray-500">{role.description}</p>
                  )}
                  {/* Was "9 permissions", which tells the person granting
                      it nothing about what those nine reach. */}
                  <p className="mt-1 text-[11px] leading-snug text-gray-500" title={list.join(', ')}>
                    {list.length === 0
                      ? <span className="font-semibold text-amber-700">Opens nothing at all.</span>
                      : <>Can open: {list.slice(0, 10).join(', ')}{list.length > 10 ? `, and ${list.length - 10} more` : ''}</>}
                  </p>
                </div>
                <button
                  onClick={() => openEdit(role)}
                  className="shrink-0 text-xs font-semibold text-[#3A7BD5] hover:underline"
                >
                  {role.isSystemRole ? 'Change what it opens' : 'Edit'}
                </button>
                {!role.isSystemRole && (
                  <button onClick={() => remove(role)} aria-label={`Delete ${role.name}`} className="shrink-0 text-red-500 hover:text-red-700">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Editor drawer */}
      {(editing || creating) && (
        <>
          <div className="fixed inset-0 z-40 bg-black/30" onClick={close} />
          <aside className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-2xl overflow-y-auto bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-start justify-between border-b border-[#E5E7EB] bg-white p-4">
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-bold text-[#0F2B4C]">
                  {creating ? 'Build a role' : `What "${editing?.name}" can open`}
                </h2>
                {editing?.isSystemRole && (
                  <p className="mt-1 text-xs text-gray-500">
                    Built-in role. The name is fixed, but you can still change what it opens.
                  </p>
                )}
                {editing && holders?.[editing.id] ? (
                  <p className="mt-1 text-xs font-semibold text-amber-700">
                    {holders[editing.id]} {holders[editing.id] === 1 ? 'person is' : 'people are'} on this role. Anything you change here changes what they can do.
                  </p>
                ) : null}
              </div>
              <button onClick={close} aria-label="Close" className="rounded p-1 hover:bg-gray-100">
                <X size={18} className="text-gray-500" />
              </button>
            </div>

            <div className="space-y-4 p-4">
              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-600">Name of the job</label>
                <input
                  type="text"
                  value={draftName}
                  onChange={e => setDraftName(e.target.value)}
                  disabled={editing?.isSystemRole}
                  placeholder="Lagos Ops Lead"
                  className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#3A7BD5] focus:outline-none disabled:bg-gray-50 disabled:text-gray-500"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-bold uppercase tracking-wide text-gray-600">What this person does</label>
                <textarea
                  value={draftDescription}
                  onChange={e => setDraftDescription(e.target.value)}
                  rows={2}
                  placeholder="Runs dispatch for Lagos and handles rider complaints"
                  className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:border-[#3A7BD5] focus:outline-none"
                />
                <p className="mt-1 text-[11px] text-gray-400">
                  Shown to whoever is choosing a role on Staff Management. Write it for them.
                </p>
              </div>

              <div>
                <label className="mb-2 block text-xs font-bold uppercase tracking-wide text-gray-600">Badge colour</label>
                <div className="flex flex-wrap gap-2">
                  {COLOR_OPTIONS.map(c => (
                    <button
                      key={c}
                      onClick={() => setDraftColor(c)}
                      className={`rounded px-2 py-1 text-[10px] font-bold uppercase ${COLOR_BG[c]} ${draftColor === c ? 'ring-2 ring-[#0F2B4C]' : ''}`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-xs font-bold uppercase tracking-wide text-gray-600">Pages this role can open</label>
                  <span className="text-xs tabular-nums text-gray-500">
                    {draftPerms.size} of {allPermSlugs.length} ticked
                  </span>
                </div>

                {draftPerms.size === 0 && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    Nothing is ticked. Anybody given this role will sign in to an empty dashboard.
                  </div>
                )}
                {allPermSlugs.length > 0 && allPermSlugs.every(s => draftPerms.has(s)) && (
                  <div className="mb-2 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                    Everything is ticked, which makes this a full-access role: staff, roles, pricing and the launch reset included.
                  </div>
                )}

                <div className="space-y-3">
                  {catalogue.map(section => {
                    const sectionSlugs = section.items.map(i => i.slug);
                    const allOn  = sectionSlugs.every(s => draftPerms.has(s));
                    const someOn = sectionSlugs.some(s => draftPerms.has(s));
                    return (
                      <div key={section.section} className="overflow-hidden rounded-lg border border-[#E5E7EB]">
                        <button
                          onClick={() => toggleSection(section)}
                          title={allOn ? 'Untick this whole group' : 'Tick this whole group'}
                          className="flex w-full items-center justify-between bg-gray-50 px-3 py-2 hover:bg-gray-100"
                        >
                          <span className="text-xs font-bold uppercase tracking-wide text-[#0F2B4C]">
                            {section.section}
                          </span>
                          <span className={`text-[10px] font-bold ${allOn ? 'text-green-700' : someOn ? 'text-yellow-700' : 'text-gray-400'}`}>
                            {allOn ? 'all of it' : someOn ? `${sectionSlugs.filter(s => draftPerms.has(s)).length} of ${sectionSlugs.length}` : 'none of it'}
                          </span>
                        </button>
                        <div className="grid grid-cols-2 gap-1 p-2">
                          {section.items.map(perm => {
                            const on = draftPerms.has(perm.slug);
                            return (
                              <label
                                key={perm.slug}
                                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
                              >
                                <input
                                  type="checkbox"
                                  checked={on}
                                  onChange={() => togglePerm(perm.slug)}
                                  className="h-4 w-4 accent-[#3A7BD5]"
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
                <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertCircle size={14} /> {error}
                </div>
              )}

              <button
                onClick={save}
                disabled={saving}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#0F2B4C] py-2.5 font-semibold text-white hover:bg-[#3A7BD5] disabled:opacity-50"
              >
                <Save size={15} />
                {saving ? 'Saving' : creating ? 'Build the role' : 'Save the change'}
              </button>
            </div>
          </aside>
        </>
      )}
    </div>
  );
}
