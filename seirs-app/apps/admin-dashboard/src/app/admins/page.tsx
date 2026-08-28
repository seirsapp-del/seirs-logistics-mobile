'use client';
import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import {
  ROLE_LABELS,
  ROLE_COLORS,
  AdminRole,
  type AdminRoleType,
} from '@/lib/rbac';
import {
  Plus,
  X,
  Search,
  CheckCircle,
  XCircle,
  RefreshCw,
  UserX,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Users,
  AlertTriangle,
  Pencil,
  KeyRound,
} from 'lucide-react';
import { ConfirmDialog, useConfirm } from '@/components/ConfirmDialog';
import { PageIntro } from '@/components/PageIntro';
import { EmptyState } from '@/components/EmptyState';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * `lastLoginAt` is deliberately absent.
 *
 * This page used to render member.lastLoginAt in a "Last Login" column.
 * The User entity has no such column and never has (see the comment on
 * getAdmins in admin.service.ts), so the value was always undefined and
 * the column read "Never" for every single member of staff, including
 * people who had signed in an hour earlier. A column that tells a super
 * admin nobody has ever signed in is worse than no column: the honest
 * move is to stop showing it until sign-ins are actually recorded.
 */
interface AdminMember {
  id: string;
  firstName?: string;
  lastName?: string;
  name?: string;
  email: string;
  adminRole?: AdminRoleType;
  role?: AdminRoleType;
  // Spec V8 dynamic role assignment
  roleId?: string | null;
  isActive: boolean;
  createdAt: string;
}

// Spec V8. dynamic role from /admin/roles
interface DynamicRole {
  id:           string;
  slug:         string;
  name:         string;
  description:  string | null;
  permissions:  string[];
  isSystemRole: boolean;
  badgeColor:   string;
}

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

// ─── Utilities ─────────────────────────────────────────────────────────────────

function getInitials(member: AdminMember): string {
  if (member.firstName && member.lastName) {
    return `${member.firstName[0]}${member.lastName[0]}`.toUpperCase();
  }
  const name = member.name ?? member.email;
  const parts = name.split(' ');
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function getFullName(member: AdminMember): string {
  if (member.firstName && member.lastName) return `${member.firstName} ${member.lastName}`;
  return member.name ?? member.email;
}

function getRole(member: AdminMember): AdminRoleType | undefined {
  return (member.adminRole ?? member.role) as AdminRoleType | undefined;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

/**
 * Turn a permission slug into the words on the sidebar.
 *
 * A role was described to the person granting it as "8 permissions",
 * which says nothing about whether those eight include refunding money
 * or banning a customer. The catalogue endpoint already carries a human
 * label for every slug; this just uses it.
 */
function powerWords(perms: string[], labels: Record<string, string>): string[] {
  if (perms.includes('*')) return ['Everything, including staff and roles'];
  return perms.map(p => labels[p] ?? p.replace(/[._-]+/g, ' '));
}

function PowerList({ perms, labels }: { perms: string[]; labels: Record<string, string> }) {
  const words = powerWords(perms, labels);
  if (words.length === 0) {
    return <p className="mt-1 text-[11px] font-semibold text-amber-700">Opens nothing. They can sign in and see an empty dashboard.</p>;
  }
  const shown = words.slice(0, 8);
  return (
    <p className="mt-1 text-[11px] leading-snug text-[#0F2B4C]/50" title={words.join(', ')}>
      Can open: {shown.join(', ')}
      {words.length > shown.length ? `, and ${words.length - shown.length} more` : ''}
    </p>
  );
}

const AVATAR_BG: Record<string, string> = {
  super_admin:       'bg-red-600',
  ops_manager:       'bg-blue-600',
  support_agent:     'bg-green-600',
  finance_officer:   'bg-yellow-500',
  driver_compliance: 'bg-[#0F2B4C]',
  media_content:     'bg-pink-500',
  analyst:           'bg-cyan-600',
  partner_manager:   'bg-orange-500',
};

const PAGE_SIZE = 20;

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 flex flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-sm items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg
            ${t.type === 'success'
              ? 'border border-emerald-200 bg-emerald-50 text-emerald-800'
              : 'border border-red-200 bg-red-50 text-red-800'}`}
        >
          {t.type === 'success'
            ? <CheckCircle size={15} className="shrink-0 text-emerald-500" />
            : <XCircle size={15} className="shrink-0 text-red-500" />}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="ml-1 shrink-0 opacity-40 transition-opacity hover:opacity-80"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Create / Invite Drawer ────────────────────────────────────────────────────

interface CreateDrawerProps {
  onClose: () => void;
  onCreated: (member: AdminMember) => void;
  addToast: (type: Toast['type'], message: string) => void;
  roles: DynamicRole[];
  permLabels: Record<string, string>;
}

type CreateForm = {
  firstName: string;
  lastName: string;
  email: string;
  roleId: string; // dynamic role id
};

function CreateDrawer({ onClose, onCreated, addToast, roles, permLabels }: CreateDrawerProps) {
  const confirm = useConfirm();
  const [form, setForm] = useState<CreateForm>({
    firstName: '',
    lastName: '',
    email: '',
    roleId: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof CreateForm, string>>>({});
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof CreateForm>(key: K, value: CreateForm[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const validate = (): boolean => {
    const e: Partial<Record<keyof CreateForm, string>> = {};
    if (!form.firstName.trim()) e.firstName = 'Needed';
    if (!form.lastName.trim())  e.lastName  = 'Needed';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'A valid email address is needed';
    if (!form.roleId) e.roleId = 'Pick what they will be able to do';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    const role = roles.find(r => r.id === form.roleId);
    /**
     * Inviting somebody creates a live account with real powers and
     * emails a real person. That happened on one click with nothing on
     * screen saying what the chosen role could reach.
     */
    const ok = await confirm({
      title:   `Give ${form.firstName.trim()} ${form.lastName.trim()} a staff account?`,
      message:
        `An invitation email goes to ${form.email.trim().toLowerCase()} now.\n\n` +
        `As ${role?.name ?? 'this role'} they will be able to open: ` +
        `${powerWords(role?.permissions ?? [], permLabels).join(', ') || 'nothing at all'}.\n\n` +
        'You can change their role or offboard them later from this page.',
      confirmLabel: 'Send the invitation',
      danger:       (role?.permissions ?? []).includes('*'),
    });
    if (!ok) return;

    setSaving(true);
    try {
      const result = await adminApi.admins.create({
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        email:     form.email.trim().toLowerCase(),
        // Pass legacy adminRole only for system roles whose slug matches the enum.
        // Custom roles get roleId only. the user record stores both consistently.
        ...(role?.isSystemRole ? { adminRole: role.slug } : {}),
        roleId: form.roleId,
      });
      addToast('success', `Invitation emailed to ${form.email.trim().toLowerCase()}`);
      const newMember: AdminMember = {
        id:          String(result?.id ?? Date.now()),
        firstName:   form.firstName.trim(),
        lastName:    form.lastName.trim(),
        email:       form.email.trim().toLowerCase(),
        adminRole:   role?.isSystemRole ? (role.slug as AdminRoleType) : undefined,
        roleId:      form.roleId,
        isActive:    true,
        createdAt:   new Date().toISOString(),
        ...result,
      };
      onCreated(newMember);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'The account was not created.';
      addToast('error', msg);
    } finally {
      setSaving(false);
    }
  };

  const inputCls = (key: keyof CreateForm) =>
    `w-full px-3 py-2 border rounded-lg text-sm bg-white text-[#0F2B4C] focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] transition-shadow ${
      errors[key] ? 'border-red-400' : 'border-[#E5E7EB]'
    }`;

  return (
    <div className="fixed inset-0 z-40 flex items-start justify-end bg-black/40 backdrop-blur-sm">
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] px-6 py-5">
          <div>
            <h2 className="text-base font-bold text-[#0F2B4C]">Add somebody to the team</h2>
            <p className="mt-0.5 text-xs text-[#0F2B4C]/50">They get an email inviting them to set a password</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-[#0F2B4C]/40 transition-colors hover:bg-[#F5F5F0]"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto p-6">
            {/* Names */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/60">
                  First name
                </label>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                  placeholder="Adebayo"
                  className={inputCls('firstName')}
                />
                {errors.firstName && <p className="mt-1 text-xs text-red-500">{errors.firstName}</p>}
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/60">
                  Last name
                </label>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                  placeholder="Yusuf"
                  className={inputCls('lastName')}
                />
                {errors.lastName && <p className="mt-1 text-xs text-red-500">{errors.lastName}</p>}
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/60">
                Work email address
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="ada@seirs.ng"
                className={inputCls('email')}
              />
              {errors.email && <p className="mt-1 text-xs text-red-500">{errors.email}</p>}
            </div>

            {/* Role selection. dynamic from /admin/roles */}
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/60">
                What they will be able to do
              </label>
              {errors.roleId && <p className="mb-2 text-xs text-red-500">{errors.roleId}</p>}
              {roles.length === 0 ? (
                <p className="text-xs text-[#0F2B4C]/50">Loading the roles</p>
              ) : (
                <div className="space-y-2">
                  {roles.map((r) => (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all ${
                        form.roleId === r.id
                          ? 'border-[#3A7BD5] bg-blue-50'
                          : 'border-[#E5E7EB] bg-white hover:border-[#0F2B4C]/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="roleId"
                        value={r.id}
                        checked={form.roleId === r.id}
                        onChange={() => set('roleId', r.id)}
                        className="mt-0.5 shrink-0 accent-[#3A7BD5]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_BG[r.badgeColor] ?? COLOR_BG.gray}`}>
                            {r.name}
                          </span>
                          {!r.isSystemRole && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-[#3A7BD5]">made here</span>
                          )}
                        </div>
                        {r.description && (
                          <p className="mt-1 text-xs text-[#0F2B4C]/50">{r.description}</p>
                        )}
                        {/* Was "8 permissions", which told the person
                            granting it nothing about what those eight
                            actually let somebody do. */}
                        <PowerList perms={r.permissions} labels={permLabels} />
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-[#0F2B4C]/40">
              None of these fit?{' '}
              {/* Link, not <a>: a plain anchor reloads the whole dashboard and
                  throws away everything typed into this form. */}
              <Link href="/roles" className="text-[#3A7BD5] underline">Build a role first</Link>.
            </p>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#E5E7EB] bg-white px-6 py-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[#0F2B4C]/60 transition-colors hover:bg-[#F5F5F0]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 rounded-lg bg-[#3A7BD5] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#2a6bc4] disabled:opacity-60"
            >
              {saving ? (
                <><RefreshCw size={13} className="animate-spin" /> Sending</>
              ) : (
                <><Plus size={13} /> Send the invitation</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Edit Drawer ───────────────────────────────────────────────────────────────

interface EditDrawerProps {
  member: AdminMember;
  onClose: () => void;
  onUpdated: (member: AdminMember) => void;
  addToast: (type: Toast['type'], message: string) => void;
  roles: DynamicRole[];
  permLabels: Record<string, string>;
}

function EditDrawer({ member, onClose, onUpdated, addToast, roles, permLabels }: EditDrawerProps) {
  const ask = useConfirm();
  const currentRole = (getRole(member) ?? AdminRole.SUPPORT_AGENT) as AdminRoleType;
  // Pre-select the dynamic role that matches the user's current assignment
  // (either by roleId, or by matching the legacy adminRole slug).
  const initialRoleId =
    member.roleId
    || roles.find(r => r.slug === currentRole)?.id
    || roles[0]?.id
    || '';
  const [selectedRoleId, setSelectedRoleId] = useState<string>(initialRoleId);
  const [savingRole, setSavingRole]         = useState(false);
  const [resetting, setResetting]           = useState(false);
  const [confirm, setConfirm]               = useState<'offboard' | 'reactivate' | null>(null);
  const [actioning, setActioning]           = useState(false);
  // Offboarding wizard state
  const [footprint, setFootprint]           = useState<{
    ready: boolean;
    blockers: Array<{ type: string; count: number; action: string }>;
    auditEntries: number;
  } | null>(null);
  const [loadingFootprint, setLoadingFootprint] = useState(false);
  const [forceOffboard, setForceOffboard]   = useState(false);
  const [offboardReason, setOffboardReason] = useState('');

  const selectedRoleObj = roles.find(r => r.id === selectedRoleId);
  const previousRoleObj = roles.find(r => r.id === initialRoleId);
  const noChange = selectedRoleId === initialRoleId;

  const handleRoleSave = async () => {
    if (noChange || !selectedRoleObj) { onClose(); return; }

    /**
     * Changing a role changes what somebody can do to real customers
     * and real money, and it took effect on one click with no summary
     * of what was gained or lost.
     */
    const before = new Set(powerWords(previousRoleObj?.permissions ?? [], permLabels));
    const after  = new Set(powerWords(selectedRoleObj.permissions, permLabels));
    const gained = [...after].filter(w => !before.has(w));
    const lost   = [...before].filter(w => !after.has(w));

    const ok = await ask({
      title:   `Move ${getFullName(member)} to ${selectedRoleObj.name}?`,
      message:
        (gained.length ? `They will now be able to open: ${gained.join(', ')}.\n\n` : '') +
        (lost.length   ? `They will lose: ${lost.join(', ')}.\n\n` : '') +
        (!gained.length && !lost.length ? 'The two roles reach the same pages.\n\n' : '') +
        'It takes effect the next time they load a page. They are not emailed about it. You can move them back at any time.',
      confirmLabel: 'Change their role',
      danger:       selectedRoleObj.permissions.includes('*'),
    });
    if (!ok) return;

    setSavingRole(true);
    try {
      await adminApi.roles.assign(selectedRoleObj.id, member.id);
      addToast('success', `${getFullName(member)} is now ${selectedRoleObj.name}`);
      onUpdated({
        ...member,
        adminRole: selectedRoleObj.isSystemRole ? (selectedRoleObj.slug as AdminRoleType) : undefined,
        role:      selectedRoleObj.isSystemRole ? (selectedRoleObj.slug as AdminRoleType) : undefined,
        roleId:    selectedRoleObj.id,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'The role was not changed.';
      addToast('error', msg);
    } finally {
      setSavingRole(false);
    }
  };

  const handleResetPassword = async () => {
    const ok = await ask({
      title:   `Email a password reset to ${getFullName(member)}?`,
      message: `A reset link goes to ${member.email} straight away. Their current password keeps working until they use it.`,
      confirmLabel: 'Send it',
    });
    if (!ok) return;
    setResetting(true);
    try {
      await adminApi.admins.resetPassword(member.id);
      addToast('success', `Reset link emailed to ${member.email}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'The email was not sent.';
      addToast('error', msg);
    } finally {
      setResetting(false);
    }
  };

  // Spec V8. open offboarding wizard. Loads footprint to show what
  // the admin owns + needs reassigning before deactivation.
  const handleOpenOffboard = async () => {
    setConfirm('offboard');
    setLoadingFootprint(true);
    setFootprint(null);
    setForceOffboard(false);
    setOffboardReason('');
    try {
      const fp = await adminApi.admins.footprint(member.id);
      setFootprint(fp);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not check what they own.';
      addToast('error', msg);
      setConfirm(null);
    } finally {
      setLoadingFootprint(false);
    }
  };

  const handleConfirmOffboard = async () => {
    setActioning(true);
    try {
      await adminApi.admins.offboard(member.id, {
        reason: offboardReason.trim() || undefined,
        force:  forceOffboard,
      });
      addToast('success', `${getFullName(member)} can no longer sign in`);
      onUpdated({ ...member, isActive: false });
      setConfirm(null);
      onClose();
    } catch (err: any) {
      // Backend returns blocker list on 409. re-render the wizard with it
      addToast('error', err?.message ?? 'They were not offboarded.');
    } finally {
      setActioning(false);
    }
  };

  const handleReactivate = async () => {
    setConfirm(null);
    setActioning(true);
    try {
      await adminApi.admins.reactivate(member.id);
      addToast('success', `${getFullName(member)} can sign in again`);
      onUpdated({ ...member, isActive: true });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'The account was not restored.';
      addToast('error', msg);
    } finally {
      setActioning(false);
    }
  };

  const initials  = getInitials(member);
  const avatarBg  = AVATAR_BG[currentRole] ?? 'bg-[#3A7BD5]';

  return (
    <>
      <div className="fixed inset-0 z-40 flex items-start justify-end bg-black/40 backdrop-blur-sm">
        <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl">
          {/* Header */}
          <div className="flex shrink-0 items-center justify-between border-b border-[#E5E7EB] px-6 py-5">
            <div className="flex items-center gap-3">
              <div className={`h-10 w-10 shrink-0 rounded-full ${avatarBg} flex items-center justify-center text-sm font-bold text-white`}>
                {initials}
              </div>
              <div>
                <h2 className="text-base font-bold text-[#0F2B4C]">{getFullName(member)}</h2>
                <p className="text-xs text-[#0F2B4C]/50">{member.email}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-lg p-1.5 text-[#0F2B4C]/40 transition-colors hover:bg-[#F5F5F0]"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 space-y-6 overflow-y-auto p-6">
            {/* Status */}
            <div className="flex flex-wrap items-center gap-3">
              {member.isActive ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Can sign in
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-700">
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                  Offboarded, cannot sign in
                </span>
              )}
              <span className="text-xs text-[#0F2B4C]/40">
                Joined {formatDate(member.createdAt)}
              </span>
            </div>

            {/* SEIRS does not record sign-in times, so this drawer used to
                say "Last login: Never" about people who had signed in
                that morning. */}
            <p className="text-xs text-[#0F2B4C]/40">
              SEIRS does not record when staff sign in, so there is no last-sign-in to show here.
              To see what somebody has actually been doing, read the{' '}
              <Link href="/audit-log" className="text-[#3A7BD5] underline">audit log</Link>.
            </p>

            {/* Role change. dynamic from /admin/roles */}
            <div>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40">
                What they can do
              </h3>
              {roles.length === 0 ? (
                <p className="text-xs text-[#0F2B4C]/50">Loading the roles</p>
              ) : (
                <div className="space-y-2">
                  {roles.map((r) => (
                    <label
                      key={r.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-all ${
                        selectedRoleId === r.id
                          ? 'border-[#3A7BD5] bg-blue-50'
                          : 'border-[#E5E7EB] bg-white hover:border-[#0F2B4C]/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="editRole"
                        value={r.id}
                        checked={selectedRoleId === r.id}
                        onChange={() => setSelectedRoleId(r.id)}
                        className="mt-0.5 shrink-0 accent-[#3A7BD5]"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${COLOR_BG[r.badgeColor] ?? COLOR_BG.gray}`}>
                            {r.name}
                          </span>
                          {r.id === initialRoleId && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-[#0F2B4C]/40">their role now</span>
                          )}
                          {!r.isSystemRole && (
                            <span className="text-[10px] font-bold uppercase tracking-wide text-[#3A7BD5]">made here</span>
                          )}
                        </div>
                        {r.description && (
                          <p className="mt-1 text-xs text-[#0F2B4C]/50">{r.description}</p>
                        )}
                        <PowerList perms={r.permissions} labels={permLabels} />
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Account actions */}
            <div className="space-y-3 border-t border-[#E5E7EB] pt-5">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40">
                Their account
              </h3>

              <button
                onClick={handleResetPassword}
                disabled={resetting}
                className="flex w-full items-center gap-2 rounded-xl border border-[#E5E7EB] px-4 py-3 text-left text-sm font-medium text-[#0F2B4C] transition-colors hover:bg-[#F5F5F0] disabled:opacity-50"
              >
                {resetting
                  ? <RefreshCw size={15} className="shrink-0 animate-spin text-[#3A7BD5]" />
                  : <KeyRound size={15} className="shrink-0 text-[#3A7BD5]" />}
                {resetting ? 'Sending the email' : 'Email them a password reset link'}
              </button>

              {member.isActive ? (
                <button
                  onClick={handleOpenOffboard}
                  disabled={actioning}
                  className="flex w-full items-center gap-2 rounded-xl border border-red-200 px-4 py-3 text-left text-sm font-medium text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  <UserX size={15} className="shrink-0" />
                  Offboard: stop them signing in
                </button>
              ) : (
                <button
                  onClick={() => setConfirm('reactivate')}
                  disabled={actioning}
                  className="flex w-full items-center gap-2 rounded-xl border border-emerald-200 px-4 py-3 text-left text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 disabled:opacity-50"
                >
                  <UserCheck size={15} className="shrink-0" />
                  Let them sign in again
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex shrink-0 items-center justify-end gap-3 border-t border-[#E5E7EB] bg-white px-6 py-4">
            <button
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-[#0F2B4C]/60 transition-colors hover:bg-[#F5F5F0]"
            >
              Cancel
            </button>
            <button
              onClick={handleRoleSave}
              disabled={savingRole || noChange}
              title={noChange ? 'Pick a different role first' : ''}
              className="flex items-center gap-1.5 rounded-lg bg-[#0F2B4C] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#1E3A5F] disabled:opacity-40"
            >
              {savingRole ? (
                <><RefreshCw size={13} className="animate-spin" /> Saving</>
              ) : (
                'Change their role'
              )}
            </button>
          </div>
        </div>
      </div>

      {confirm === 'offboard' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[#E5E7EB] bg-white shadow-2xl">
            {/* Header */}
            <div className="border-b border-[#E5E7EB] px-6 py-5">
              <div className="flex items-start gap-3">
                <AlertTriangle size={20} className="mt-0.5 shrink-0 text-red-500" />
                <div>
                  <h3 className="text-base font-bold text-[#0F2B4C]">Offboard {getFullName(member)}</h3>
                  <p className="mt-0.5 text-xs text-[#0F2B4C]/50">
                    They stop being able to sign in, and their role is removed. What are they holding first?
                  </p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 space-y-4 overflow-y-auto p-6">
              {loadingFootprint && (
                <div className="py-8 text-center text-[#0F2B4C]/40">
                  <RefreshCw size={18} className="mx-auto mb-2 animate-spin" />
                  Checking what they own
                </div>
              )}

              {footprint && footprint.ready && (
                <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                  <CheckCircle size={16} className="mt-0.5 shrink-0" />
                  <div>
                    <p className="font-semibold">Nothing needs handing over</p>
                    <p className="mt-1 text-xs">No open tickets, no unfinished content, no live API keys, no fraud flags waiting on them.</p>
                  </div>
                </div>
              )}

              {footprint && !footprint.ready && (
                <>
                  <p className="text-sm text-[#0F2B4C]">
                    {footprint.blockers.length} thing{footprint.blockers.length === 1 ? '' : 's'} should be handed to somebody else first:
                  </p>
                  {footprint.blockers.map((b, i) => (
                    <div key={i} className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
                      <span className="shrink-0 rounded bg-amber-100 px-2 py-1 text-xs font-bold uppercase tracking-wide text-amber-800">
                        {b.count}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold capitalize text-[#0F2B4C]">
                          {b.type.replace(/_/g, ' ')}
                        </p>
                        <p className="mt-1 text-xs leading-snug text-[#0F2B4C]/70">{b.action}</p>
                      </div>
                    </div>
                  ))}
                </>
              )}

              {footprint && footprint.auditEntries > 0 && (
                <p className="text-xs text-[#0F2B4C]/40">
                  Their {footprint.auditEntries.toLocaleString()} audit log entries are kept whatever happens here. Offboarding does not erase what somebody did.
                </p>
              )}

              {/* Reason */}
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#0F2B4C]/60">
                  Why (optional, but it is what the audit log will show)
                </label>
                <input
                  type="text"
                  value={offboardReason}
                  onChange={(e) => setOffboardReason(e.target.value)}
                  placeholder="Resigned 4 May 2026, moved to the ops team"
                  className="w-full rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
                />
              </div>

              {/* Force toggle. only relevant when blockers exist */}
              {footprint && !footprint.ready && (
                <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-3">
                  <input
                    type="checkbox"
                    checked={forceOffboard}
                    onChange={(e) => setForceOffboard(e.target.checked)}
                    className="mt-0.5 shrink-0 accent-red-600"
                  />
                  <div>
                    <p className="text-sm font-semibold text-red-800">Offboard anyway</p>
                    <p className="mt-1 text-xs leading-snug text-red-700/80">
                      The items above are left with nobody on them. Tickets go unassigned, unfinished content loses its owner,
                      and any live API keys keep working until somebody revokes them by hand on Developer Accounts.
                    </p>
                  </div>
                </label>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-[#E5E7EB] px-6 py-4">
              <button
                onClick={() => setConfirm(null)}
                className="rounded-lg px-4 py-2 text-sm font-medium text-[#0F2B4C]/60 hover:bg-[#F5F5F0]"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmOffboard}
                disabled={
                  actioning
                  || !footprint
                  || (footprint && !footprint.ready && !forceOffboard)
                }
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {actioning
                  ? 'Offboarding'
                  : footprint?.ready
                    ? 'Offboard them'
                    : forceOffboard
                      ? 'Offboard anyway'
                      : 'Hand those over first'}
              </button>
            </div>
          </div>
        </div>
      )}
      {/*
        The copy says what actually happens. Offboarding wipes the role on
        purpose, so a restored account comes back able to sign in and do
        nothing. The old wording promised access "based on their role",
        which would have had a super admin press this expecting a colleague
        restored, then field a call about a dashboard full of locked doors.
      */}
      {confirm === 'reactivate' && (
        <ConfirmDialog
          title={`Let ${getFullName(member)} back in?`}
          message={`They will be able to sign in again, but with NO role at all: offboarding removed it. Give them a role straight afterwards or they will sign in to an empty dashboard.`}
          onConfirm={handleReactivate}
          onCancel={() => setConfirm(null)}
          confirmLabel="Let them sign in"
        />
      )}
    </>
  );
}

// ─── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-[#F5F5F0]">
      {[140, 160, 90, 100, 56].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div
            className="h-4 animate-pulse rounded-md bg-[#0F2B4C]/5"
            style={{ width: w }}
          />
        </td>
      ))}
    </tr>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function StaffManagementPage() {
  const [members, setMembers]         = useState<AdminMember[]>([]);
  const [roles,   setRoles]           = useState<DynamicRole[]>([]);
  const [permLabels, setPermLabels]   = useState<Record<string, string>>({});
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);

  // Filters
  const [search, setSearch]           = useState('');
  const [roleFilter, setRoleFilter]   = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'active' | 'inactive' | ''>('');

  // Pagination
  const [page, setPage] = useState(1);

  // Modals
  const [showCreate, setShowCreate]   = useState(false);
  const [editMember, setEditMember]   = useState<AdminMember | null>(null);

  // Toasts
  const [toasts, setToasts]           = useState<Toast[]>([]);
  const toastCounter                  = useRef(0);

  const addToast = useCallback((type: Toast['type'], message: string) => {
    const id = ++toastCounter.current;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 5000);
  }, []);

  const dismissToast = (id: number) =>
    setToasts((prev) => prev.filter((t) => t.id !== id));

  // Fetch. admins, dynamic roles and the permission wording, in parallel.
  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [data, rolesList, catalogue] = await Promise.all([
        adminApi.admins.list(),
        adminApi.roles.list().catch(() => []),
        // The catalogue is what lets a permission be described in words
        // instead of as a slug. A failure here only costs the wording.
        adminApi.roles.catalogue().catch(() => []),
      ]);
      setMembers(Array.isArray(data) ? data : []);
      setRoles(Array.isArray(rolesList) ? rolesList : []);
      const map: Record<string, string> = {};
      (Array.isArray(catalogue) ? catalogue : []).forEach((section: any) => {
        (section?.items ?? []).forEach((item: any) => {
          if (item?.slug) map[item.slug] = item.label ?? item.slug;
        });
      });
      setPermLabels(map);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'The staff list could not be loaded.';
      setFetchError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Optimistic handlers
  const handleCreated = (member: AdminMember) => {
    setMembers((prev) => [member, ...prev]);
    setPage(1);
  };

  const handleUpdated = (updated: AdminMember) => {
    setMembers((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
    setEditMember(null);
  };

  /**
   * Client-side filter. Search and the two dropdowns combine with AND,
   * so "support agents called Chidi who are offboarded" means all three
   * and not any of them.
   *
   * The role filter matches on the role id as well as the slug: a member
   * on a role built in Role Management carries roleId and no adminRole,
   * so filtering by any custom role used to return an empty table.
   */
  const filtered = useMemo(() => members.filter((m) => {
    const term = search.trim().toLowerCase();
    const matchSearch =
      !term ||
      getFullName(m).toLowerCase().includes(term) ||
      m.email.toLowerCase().includes(term);
    const matchRole =
      !roleFilter ||
      m.roleId === roleFilter ||
      getRole(m) === roles.find(r => r.id === roleFilter)?.slug;
    const matchStatus =
      !statusFilter ||
      (statusFilter === 'active' ? m.isActive : !m.isActive);
    return matchSearch && matchRole && matchStatus;
  }), [members, search, roleFilter, statusFilter, roles]);

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated   = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  const activeCount   = members.filter((m) => m.isActive).length;
  const inactiveCount = members.filter((m) => !m.isActive).length;
  const filtersOn     = !!(search || roleFilter || statusFilter);

  // Paginator pages with ellipsis
  const pageItems = Array.from({ length: totalPages }, (_, i) => i + 1)
    .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
    .reduce<(number | '...')[]>((acc, p, idx, arr) => {
      if (idx > 0) {
        const prev = arr[idx - 1];
        if (typeof prev === 'number' && p - prev > 1) acc.push('...');
      }
      acc.push(p);
      return acc;
    }, []);

  return (
    <>
      <div className="min-h-screen">
        <main className="mx-auto max-w-7xl p-8">

          <PageIntro
            title="Staff Management"
            purpose="Give people at SEIRS an account, decide what each of them can reach in this dashboard, and stop the ones who have left."
            storageKey="admins"
            help={
              <>
                <p><strong>Add somebody</strong> emails them an invitation and creates a live account. Read what the role can open before you send it.</p>
                <p><strong>Change their role</strong> takes effect the next time they load a page. Nobody is emailed about it.</p>
                <p><strong>Offboard</strong> stops them signing in and removes their role. It can be undone, but they come back with no role at all, so give them one again.</p>
                <p>To see what somebody actually did, read the audit log. This page shows who can do what, not who did what.</p>
              </>
            }
            actions={
              <button
                onClick={() => setShowCreate(true)}
                className="flex shrink-0 items-center gap-2 rounded-xl bg-[#3A7BD5] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#2a6bc4]"
              >
                <Plus size={15} /> Add somebody
              </button>
            }
          />

          {/* ── Stats Bar ── */}
          <div className="mb-6 grid grid-cols-3 gap-4">
            {[
              {
                label: 'People with an account',
                value: members.length,
                icon:  <Users size={16} className="text-[#3A7BD5]" />,
                bg:    'bg-blue-50',
              },
              {
                label: 'Can sign in',
                value: activeCount,
                icon:  <CheckCircle size={16} className="text-emerald-500" />,
                bg:    'bg-emerald-50',
              },
              {
                label: 'Offboarded',
                value: inactiveCount,
                icon:  <XCircle size={16} className="text-red-400" />,
                bg:    'bg-red-50',
              },
            ].map(({ label, value, icon, bg }) => (
              <div key={label} className={`${bg} flex items-center gap-3 rounded-xl px-5 py-4`}>
                <div className="shrink-0">{icon}</div>
                <div>
                  <div className="text-2xl font-bold tabular-nums text-[#0F2B4C]">
                    {loading ? <span className="inline-block h-6 w-6 animate-pulse rounded bg-[#0F2B4C]/10" /> : value}
                  </div>
                  <div className="text-xs font-medium text-[#0F2B4C]/50">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Filter Bar ── */}
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-[#E5E7EB] bg-white px-4 py-3">
            {/* Search */}
            <div className="relative min-w-48 flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#0F2B4C]/30" />
              <input
                type="text"
                placeholder="Search by name or email"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-lg border border-[#E5E7EB] bg-[#F8F9FB] py-2 pl-9 pr-8 text-sm text-[#0F2B4C] placeholder:text-[#0F2B4C]/30 focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  aria-label="Clear the search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#0F2B4C]/30 transition-colors hover:text-[#0F2B4C]/60"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Role filter. Value is the role id, so custom roles work. */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="min-w-40 rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#0F2B4C] focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
            >
              <option value="">Every role</option>
              {roles.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'active' | 'inactive' | '')}
              className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#0F2B4C] focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
            >
              <option value="">Everybody</option>
              <option value="active">Can sign in</option>
              <option value="inactive">Offboarded</option>
            </select>

            {/* Clear */}
            {filtersOn && (
              <button
                onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); }}
                className="text-xs font-medium text-[#0F2B4C]/40 transition-colors hover:text-[#0F2B4C]/70"
              >
                Clear the filters
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={load}
              disabled={loading}
              title="Reload the list"
              className="ml-auto rounded-lg border border-[#E5E7EB] p-2 text-[#0F2B4C]/40 transition-colors hover:bg-[#F5F5F0] hover:text-[#0F2B4C]/70 disabled:opacity-40"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* ── Error state ── */}
          {fetchError && (
            <div className="mb-4 flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              <XCircle size={15} className="shrink-0" />
              {fetchError}
              <button onClick={load} className="ml-auto text-xs font-semibold underline">
                Retry
              </button>
            </div>
          )}

          {/* ── Table ── */}
          <div className="overflow-hidden rounded-xl border border-[#E5E7EB] bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-[#E5E7EB] bg-[#F5F5F0]">
                <tr>
                  {/* "Last Login" used to sit between Status and Date
                      Created, reading "Never" for everybody. */}
                  {['Person', 'What they can do', 'Account', 'Joined', ''].map((h) => (
                    <th
                      key={h || 'actions'}
                      className="whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-[#0F2B4C]/40"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F5F0]">
                {loading
                  ? Array.from({ length: 7 }).map((_, i) => <SkeletonRow key={i} />)
                  : paginated.map((m) => {
                      const role      = getRole(m);
                      const initials  = getInitials(m);
                      // Spec V8. prefer dynamic role lookup by roleId, fall
                      // back to legacy hardcoded label/color for older users.
                      const dynamicRole = m.roleId
                        ? roles.find(r => r.id === m.roleId)
                        : roles.find(r => role && r.slug === role);
                      const avatarBg  = role ? (AVATAR_BG[role] ?? 'bg-[#3A7BD5]') : 'bg-[#3A7BD5]';
                      const roleColor = dynamicRole
                        ? (COLOR_BG[dynamicRole.badgeColor] ?? COLOR_BG.gray)
                        : role ? (ROLE_COLORS[role] ?? '') : '';
                      const roleName = dynamicRole?.name
                        ?? (role ? (ROLE_LABELS[role] ?? role) : 'No role');

                      return (
                        <tr key={m.id} className="group transition-colors hover:bg-[#F8F9FB]">
                          {/* Person */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className={`h-9 w-9 rounded-full ${avatarBg} flex shrink-0 items-center justify-center text-xs font-bold text-white`}
                              >
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <div className="truncate font-semibold text-[#0F2B4C]">
                                  {getFullName(m)}
                                </div>
                                <div className="truncate text-xs text-[#0F2B4C]/40">{m.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Role, plus the powers in words */}
                          <td className="max-w-sm px-4 py-3.5">
                            <span className={`inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${roleColor}`}>
                              {roleName}
                            </span>
                            {dynamicRole
                              ? <PowerList perms={dynamicRole.permissions} labels={permLabels} />
                              : <p className="mt-1 text-[11px] text-[#0F2B4C]/40">Older account. Open it to see and set what they can reach.</p>}
                          </td>

                          {/* Account state */}
                          <td className="px-4 py-3.5">
                            {m.isActive ? (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                                Can sign in
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-red-100 px-2.5 py-1 text-xs font-semibold text-red-600">
                                <span className="inline-block h-1.5 w-1.5 rounded-full bg-red-400" />
                                Offboarded
                              </span>
                            )}
                          </td>

                          {/* Joined */}
                          <td className="whitespace-nowrap px-4 py-3.5 text-xs text-[#0F2B4C]/50">
                            {formatDate(m.createdAt)}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5">
                            <button
                              onClick={() => setEditMember(m)}
                              className="flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] px-3 py-1.5 text-xs font-medium text-[#0F2B4C]/50 opacity-0 transition-all hover:border-[#0F2B4C]/20 hover:bg-[#F5F5F0] hover:text-[#0F2B4C] focus:opacity-100 group-hover:opacity-100"
                            >
                              <Pencil size={12} /> Open
                            </button>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>

            {/* Empty state */}
            {!loading && paginated.length === 0 && (
              filtersOn ? (
                <EmptyState
                  icon={<Search size={20} />}
                  title="Nobody matches those filters"
                  body="The search box and both dropdowns all have to match at once."
                  action={{ label: 'Clear the filters', onClick: () => { setSearch(''); setRoleFilter(''); setStatusFilter(''); } }}
                />
              ) : fetchError ? (
                <EmptyState
                  icon={<XCircle size={20} />}
                  title="The staff list could not be loaded"
                  body="This is a connection or permission problem, not an empty team."
                  action={{ label: 'Try again', onClick: load }}
                />
              ) : (
                <EmptyState
                  icon={<Users size={20} />}
                  title="Nobody has a staff account yet"
                  body="Add the first person and they will get an email inviting them in."
                  action={{ label: 'Add somebody', onClick: () => setShowCreate(true) }}
                />
              )
            )}
          </div>

          {/* ── Pagination ──
              The count used to be hidden behind filtered.length > PAGE_SIZE,
              so it disappeared exactly when somebody had filtered down and
              most wanted to know how many they were looking at. */}
          {!loading && (
            <div className="mt-4 flex items-center justify-between">
              <span className="text-xs tabular-nums text-[#0F2B4C]/40">
                {filtered.length === 0
                  ? 'Nobody to show'
                  : `Showing ${(currentPage - 1) * PAGE_SIZE + 1}-${Math.min(currentPage * PAGE_SIZE, filtered.length)} of ${filtered.length}${filtersOn ? ` (out of ${members.length})` : ''}`}
              </span>
              {totalPages > 1 && (
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    aria-label="Previous page"
                    className="rounded-lg border border-[#E5E7EB] p-2 text-[#0F2B4C]/40 transition-colors hover:bg-[#F5F5F0] hover:text-[#0F2B4C]/70 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronLeft size={14} />
                  </button>

                  {pageItems.map((item, i) =>
                    item === '...' ? (
                      <span key={`ellipsis-${i}`} className="w-8 text-center text-xs text-[#0F2B4C]/30">
                        ...
                      </span>
                    ) : (
                      <button
                        key={item}
                        onClick={() => setPage(item as number)}
                        className={`h-8 w-8 rounded-lg text-xs font-semibold transition-colors ${
                          currentPage === item
                            ? 'bg-[#3A7BD5] text-white'
                            : 'border border-[#E5E7EB] text-[#0F2B4C]/50 hover:bg-[#F5F5F0]'
                        }`}
                      >
                        {item}
                      </button>
                    )
                  )}

                  <button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    aria-label="Next page"
                    className="rounded-lg border border-[#E5E7EB] p-2 text-[#0F2B4C]/40 transition-colors hover:bg-[#F5F5F0] hover:text-[#0F2B4C]/70 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <ChevronRight size={14} />
                  </button>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {/* ── Drawers ── */}
      {showCreate && (
        <CreateDrawer
          onClose={() => setShowCreate(false)}
          onCreated={handleCreated}
          addToast={addToast}
          roles={roles}
          permLabels={permLabels}
        />
      )}

      {editMember && (
        <EditDrawer
          member={editMember}
          onClose={() => setEditMember(null)}
          onUpdated={handleUpdated}
          addToast={addToast}
          roles={roles}
          permLabels={permLabels}
        />
      )}

      {/* ── Toast container ── */}
      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </>
  );
}
