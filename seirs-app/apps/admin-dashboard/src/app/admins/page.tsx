'use client';
import { useEffect, useState, useCallback, useRef } from 'react';
import { adminApi } from '@/lib/api';
import {
  ROLE_LABELS,
  ROLE_COLORS,
  NAV_SECTIONS,
  AdminRole,
  type AdminRoleType,
  type NavItem,
} from '@/lib/rbac';
import {
  Plus,
  X,
  Search,
  CheckCircle,
  XCircle,
  Check,
  Minus,
  RefreshCw,
  UserX,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  Users,
  ShieldCheck,
  AlertTriangle,
  Pencil,
  KeyRound,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

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
  lastLoginAt?: string | null;
  createdAt: string;
}

// Spec V8 — dynamic role from /admin/roles
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

// ─── RBAC helpers (permissions defined inline to match backend) ───────────────

// Flatten all nav items that aren't super_admin_only for the permissions grid
const ALL_NAV_ITEMS: { section: string; item: NavItem }[] = NAV_SECTIONS.flatMap((s) =>
  s.items
    .filter((i) => i.permission !== 'super_admin_only')
    .map((i) => ({ section: s.title, item: i })),
);

// Mirror PERMISSIONS from rbac.ts (kept in sync manually)
const ROLE_PERMISSIONS: Record<AdminRoleType, string[]> = {
  super_admin:       ['*'],
  ops_manager:       ['overview', 'ops-map', 'deliveries', 'drivers', 'users', 'partners', 'partner-redirects', 'specialists', 'analytics', 'tickets', 'pricing'],
  support_agent:     ['tickets', 'users', 'suggestions', 'deliveries'],
  finance_officer:   ['overview', 'wallet', 'pricing', 'referrals', 'insurance', 'analytics', 'reports'],
  driver_compliance: ['drivers', 'kyc', 'duplicates', 'fraud', 'users', 'audit-log'],
  media_content:     ['cms', 'promotions'],
  analyst:           ['overview', 'analytics', 'reports'],
  partner_manager:   ['partners', 'partner-redirects', 'specialists', 'deliveries', 'overview'],
};

const ROLE_DESCRIPTIONS: Record<AdminRoleType, string> = {
  super_admin:       'Full unrestricted platform access',
  ops_manager:       'Operations, deliveries, drivers, pricing',
  support_agent:     'Customer tickets, users, delivery queries',
  finance_officer:   'Revenue analytics & pricing configuration',
  driver_compliance: 'Driver vetting, audits, and compliance',
  media_content:     'CMS and content publishing only',
  analyst:           'Read-only analytics and reporting',
  partner_manager:   'Delivery overview and partner relations',
};

const ALL_ROLES = Object.values(AdminRole) as AdminRoleType[];

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

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-NG', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

const AVATAR_BG: Record<string, string> = {
  super_admin:       'bg-red-600',
  ops_manager:       'bg-blue-600',
  support_agent:     'bg-green-600',
  finance_officer:   'bg-yellow-500',
  driver_compliance: 'bg-purple-600',
  media_content:     'bg-pink-500',
  analyst:           'bg-cyan-600',
  partner_manager:   'bg-orange-500',
};

const PAGE_SIZE = 20;

// ─── Permissions Preview Card ──────────────────────────────────────────────────

function PermissionsPreview({ role }: { role: AdminRoleType | '' }) {
  if (!role) return null;

  const perms = ROLE_PERMISSIONS[role] ?? [];
  const isSuperAdmin = role === AdminRole.SUPER_ADMIN;

  // Group nav items by section for display
  const sections = NAV_SECTIONS
    .map((s) => ({
      title: s.title,
      items: s.items.filter((i) => i.permission !== 'super_admin_only'),
    }))
    .filter((s) => s.items.length > 0);

  return (
    <div className="rounded-xl border border-[#E5E7EB] bg-[#F8F9FB] p-4">
      <div className="flex items-center gap-2 mb-3">
        <ShieldCheck size={14} className="text-[#3A7BD5] shrink-0" />
        <span className="text-xs font-semibold text-[#0F2B4C]">
          {isSuperAdmin ? 'Full access to all sections' : 'This role can access:'}
        </span>
      </div>
      <div className="space-y-3">
        {sections.map((sec) => (
          <div key={sec.title}>
            <p className="text-[10px] font-bold text-[#0F2B4C]/30 uppercase tracking-widest mb-1.5">
              {sec.title}
            </p>
            <div className="grid grid-cols-2 gap-1">
              {sec.items.map((navItem) => {
                const allowed = isSuperAdmin || perms.includes(navItem.permission);
                return (
                  <div key={navItem.permission} className="flex items-center gap-1.5">
                    {allowed ? (
                      <Check size={11} className="text-emerald-500 shrink-0" />
                    ) : (
                      <Minus size={11} className="text-[#0F2B4C]/20 shrink-0" />
                    )}
                    <span className={`text-xs leading-tight ${allowed ? 'text-[#0F2B4C]/80' : 'text-[#0F2B4C]/25'}`}>
                      {navItem.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface Toast {
  id: number;
  type: 'success' | 'error';
  message: string;
}

function ToastContainer({ toasts, dismiss }: { toasts: Toast[]; dismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium max-w-sm
            ${t.type === 'success'
              ? 'bg-emerald-50 border border-emerald-200 text-emerald-800'
              : 'bg-red-50 border border-red-200 text-red-800'}`}
        >
          {t.type === 'success'
            ? <CheckCircle size={15} className="text-emerald-500 shrink-0" />
            : <XCircle size={15} className="text-red-500 shrink-0" />}
          <span className="flex-1">{t.message}</span>
          <button
            onClick={() => dismiss(t.id)}
            className="ml-1 opacity-40 hover:opacity-80 transition-opacity shrink-0"
          >
            <X size={13} />
          </button>
        </div>
      ))}
    </div>
  );
}

// ─── Confirm Dialog ────────────────────────────────────────────────────────────

function ConfirmDialog({
  message,
  onConfirm,
  onCancel,
  confirmLabel = 'Confirm',
  danger = false,
}: {
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  danger?: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl border border-[#E5E7EB] p-6 max-w-sm w-full mx-4">
        <div className="flex items-start gap-3 mb-5">
          <AlertTriangle
            size={20}
            className={`shrink-0 mt-0.5 ${danger ? 'text-red-500' : 'text-amber-500'}`}
          />
          <p className="text-sm text-[#0F2B4C] leading-relaxed">{message}</p>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm font-medium text-[#0F2B4C]/60 hover:bg-[#F5F5F0] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors ${
              danger ? 'bg-red-600 hover:bg-red-700' : 'bg-[#3A7BD5] hover:bg-[#2a6bc4]'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Create / Invite Drawer ────────────────────────────────────────────────────

interface CreateDrawerProps {
  onClose: () => void;
  onCreated: (member: AdminMember) => void;
  addToast: (type: Toast['type'], message: string) => void;
  roles: DynamicRole[];
}

type CreateForm = {
  firstName: string;
  lastName: string;
  email: string;
  roleId: string; // dynamic role id
};

function CreateDrawer({ onClose, onCreated, addToast, roles }: CreateDrawerProps) {
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
    if (!form.firstName.trim()) e.firstName = 'Required';
    if (!form.lastName.trim())  e.lastName  = 'Required';
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email))
      e.email = 'Valid email required';
    if (!form.roleId) e.roleId = 'Select a role';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      const role = roles.find(r => r.id === form.roleId);
      const result = await adminApi.admins.create({
        firstName: form.firstName.trim(),
        lastName:  form.lastName.trim(),
        email:     form.email.trim().toLowerCase(),
        // Pass legacy adminRole only for system roles whose slug matches the enum.
        // Custom roles get roleId only — the user record stores both consistently.
        ...(role?.isSystemRole ? { adminRole: role.slug } : {}),
        roleId: form.roleId,
      });
      addToast('success', `Invitation email sent to ${form.email.trim().toLowerCase()}`);
      const newMember: AdminMember = {
        id:          String(result?.id ?? Date.now()),
        firstName:   form.firstName.trim(),
        lastName:    form.lastName.trim(),
        email:       form.email.trim().toLowerCase(),
        adminRole:   role?.isSystemRole ? (role.slug as AdminRoleType) : undefined,
        roleId:      form.roleId,
        isActive:    true,
        lastLoginAt: null,
        createdAt:   new Date().toISOString(),
        ...result,
      };
      onCreated(newMember);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to create staff member';
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
      <div className="h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E7EB] shrink-0">
          <div>
            <h2 className="text-base font-bold text-[#0F2B4C]">Invite Staff Member</h2>
            <p className="text-xs text-[#0F2B4C]/50 mt-0.5">They will receive an invitation email</p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-[#F5F5F0] text-[#0F2B4C]/40 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="p-6 space-y-5 flex-1 overflow-y-auto">
            {/* Names */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-[#0F2B4C]/60 mb-1.5 uppercase tracking-wide">
                  First Name
                </label>
                <input
                  type="text"
                  value={form.firstName}
                  onChange={(e) => set('firstName', e.target.value)}
                  placeholder="Ada"
                  className={inputCls('firstName')}
                />
                {errors.firstName && <p className="text-red-500 text-xs mt-1">{errors.firstName}</p>}
              </div>
              <div>
                <label className="block text-xs font-semibold text-[#0F2B4C]/60 mb-1.5 uppercase tracking-wide">
                  Last Name
                </label>
                <input
                  type="text"
                  value={form.lastName}
                  onChange={(e) => set('lastName', e.target.value)}
                  placeholder="Okonkwo"
                  className={inputCls('lastName')}
                />
                {errors.lastName && <p className="text-red-500 text-xs mt-1">{errors.lastName}</p>}
              </div>
            </div>

            {/* Email */}
            <div>
              <label className="block text-xs font-semibold text-[#0F2B4C]/60 mb-1.5 uppercase tracking-wide">
                Email Address
              </label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set('email', e.target.value)}
                placeholder="ada@seirs.ng"
                className={inputCls('email')}
              />
              {errors.email && <p className="text-red-500 text-xs mt-1">{errors.email}</p>}
            </div>

            {/* Role selection — dynamic from /admin/roles */}
            <div>
              <label className="block text-xs font-semibold text-[#0F2B4C]/60 mb-1.5 uppercase tracking-wide">
                Role
              </label>
              {errors.roleId && <p className="text-red-500 text-xs mb-2">{errors.roleId}</p>}
              {roles.length === 0 ? (
                <p className="text-xs text-[#0F2B4C]/50">Loading roles…</p>
              ) : (
                <div className="space-y-2">
                  {roles.map((r) => (
                    <label
                      key={r.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        form.roleId === r.id
                          ? 'border-[#3A7BD5] bg-blue-50'
                          : 'border-[#E5E7EB] hover:border-[#0F2B4C]/20 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="roleId"
                        value={r.id}
                        checked={form.roleId === r.id}
                        onChange={() => set('roleId', r.id)}
                        className="mt-0.5 accent-[#3A7BD5] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COLOR_BG[r.badgeColor] ?? COLOR_BG.gray}`}>
                            {r.name}
                          </span>
                          {!r.isSystemRole && (
                            <span className="text-[10px] uppercase tracking-wide text-[#3A7BD5] font-bold">custom</span>
                          )}
                        </div>
                        {r.description && (
                          <p className="text-xs text-[#0F2B4C]/50 mt-1">{r.description}</p>
                        )}
                        <p className="text-[10px] text-[#0F2B4C]/40 mt-1">
                          {r.permissions.includes('*') ? 'All pages' : `${r.permissions.length} permission${r.permissions.length === 1 ? '' : 's'}`}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <p className="text-xs text-[#0F2B4C]/40">
              Need a different permission set? <a href="/roles" className="text-[#3A7BD5] underline">Create a custom role</a> first.
            </p>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[#E5E7EB] flex items-center justify-end gap-3 shrink-0 bg-white">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[#0F2B4C]/60 hover:bg-[#F5F5F0] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-1.5 bg-[#3A7BD5] hover:bg-[#2a6bc4] disabled:opacity-60 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              {saving ? (
                <><RefreshCw size={13} className="animate-spin" /> Sending…</>
              ) : (
                <><Plus size={13} /> Send Invitation</>
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
}

function EditDrawer({ member, onClose, onUpdated, addToast, roles }: EditDrawerProps) {
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
  const [confirm, setConfirm]               = useState<'deactivate' | 'reactivate' | null>(null);
  const [actioning, setActioning]           = useState(false);

  const selectedRoleObj = roles.find(r => r.id === selectedRoleId);
  const noChange = selectedRoleId === initialRoleId;

  const handleRoleSave = async () => {
    if (noChange || !selectedRoleObj) { onClose(); return; }
    setSavingRole(true);
    try {
      await adminApi.roles.assign(selectedRoleObj.id, member.id);
      addToast('success', `Role updated to ${selectedRoleObj.name}`);
      onUpdated({
        ...member,
        adminRole: selectedRoleObj.isSystemRole ? (selectedRoleObj.slug as AdminRoleType) : undefined,
        role:      selectedRoleObj.isSystemRole ? (selectedRoleObj.slug as AdminRoleType) : undefined,
        roleId:    selectedRoleObj.id,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update role';
      addToast('error', msg);
    } finally {
      setSavingRole(false);
    }
  };

  const handleResetPassword = async () => {
    setResetting(true);
    try {
      await adminApi.admins.resetPassword(member.id);
      addToast('success', 'Password reset email sent');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to send reset email';
      addToast('error', msg);
    } finally {
      setResetting(false);
    }
  };

  const handleDeactivate = async () => {
    setConfirm(null);
    setActioning(true);
    try {
      await adminApi.admins.deactivate(member.id);
      addToast('success', `${getFullName(member)}'s account has been deactivated`);
      onUpdated({ ...member, isActive: false });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to deactivate account';
      addToast('error', msg);
    } finally {
      setActioning(false);
    }
  };

  const handleReactivate = async () => {
    setConfirm(null);
    setActioning(true);
    try {
      await adminApi.admins.reactivate(member.id);
      addToast('success', `${getFullName(member)}'s account has been reactivated`);
      onUpdated({ ...member, isActive: true });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to reactivate account';
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
        <div className="h-full w-full max-w-lg bg-white shadow-2xl flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-5 border-b border-[#E5E7EB] shrink-0">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-full ${avatarBg} flex items-center justify-center text-white text-sm font-bold shrink-0`}>
                {initials}
              </div>
              <div>
                <h2 className="text-base font-bold text-[#0F2B4C]">{getFullName(member)}</h2>
                <p className="text-xs text-[#0F2B4C]/50">{member.email}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-[#F5F5F0] text-[#0F2B4C]/40 transition-colors"
            >
              <X size={18} />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {/* Status */}
            <div className="flex items-center gap-3">
              {member.isActive ? (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                  Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-red-100 text-red-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                  Inactive
                </span>
              )}
              <span className="text-xs text-[#0F2B4C]/40">
                Last login: {relativeTime(member.lastLoginAt)}
              </span>
            </div>

            {/* Role change — dynamic from /admin/roles */}
            <div>
              <h3 className="text-xs font-semibold text-[#0F2B4C]/40 uppercase tracking-wide mb-3">
                Change Role
              </h3>
              {roles.length === 0 ? (
                <p className="text-xs text-[#0F2B4C]/50">Loading roles…</p>
              ) : (
                <div className="space-y-2">
                  {roles.map((r) => (
                    <label
                      key={r.id}
                      className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                        selectedRoleId === r.id
                          ? 'border-[#3A7BD5] bg-blue-50'
                          : 'border-[#E5E7EB] hover:border-[#0F2B4C]/20 bg-white'
                      }`}
                    >
                      <input
                        type="radio"
                        name="editRole"
                        value={r.id}
                        checked={selectedRoleId === r.id}
                        onChange={() => setSelectedRoleId(r.id)}
                        className="mt-0.5 accent-[#3A7BD5] shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${COLOR_BG[r.badgeColor] ?? COLOR_BG.gray}`}>
                            {r.name}
                          </span>
                          {!r.isSystemRole && (
                            <span className="text-[10px] uppercase tracking-wide text-[#3A7BD5] font-bold">custom</span>
                          )}
                        </div>
                        {r.description && (
                          <p className="text-xs text-[#0F2B4C]/50 mt-1">{r.description}</p>
                        )}
                        <p className="text-[10px] text-[#0F2B4C]/40 mt-1">
                          {r.permissions.includes('*') ? 'All pages' : `${r.permissions.length} permission${r.permissions.length === 1 ? '' : 's'}`}
                        </p>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Account actions */}
            <div className="border-t border-[#E5E7EB] pt-5 space-y-3">
              <h3 className="text-xs font-semibold text-[#0F2B4C]/40 uppercase tracking-wide">
                Account Actions
              </h3>

              <button
                onClick={handleResetPassword}
                disabled={resetting}
                className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-[#E5E7EB] text-sm font-medium text-[#0F2B4C] hover:bg-[#F5F5F0] disabled:opacity-50 transition-colors text-left"
              >
                {resetting
                  ? <RefreshCw size={15} className="animate-spin text-[#3A7BD5] shrink-0" />
                  : <KeyRound size={15} className="text-[#3A7BD5] shrink-0" />}
                {resetting ? 'Sending reset email…' : 'Send Password Reset Email'}
              </button>

              {member.isActive ? (
                <button
                  onClick={() => setConfirm('deactivate')}
                  disabled={actioning}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-red-200 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 transition-colors text-left"
                >
                  <UserX size={15} className="shrink-0" />
                  Deactivate Account
                </button>
              ) : (
                <button
                  onClick={() => setConfirm('reactivate')}
                  disabled={actioning}
                  className="w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-emerald-200 text-sm font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50 transition-colors text-left"
                >
                  <UserCheck size={15} className="shrink-0" />
                  Reactivate Account
                </button>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-[#E5E7EB] flex items-center justify-end gap-3 shrink-0 bg-white">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium text-[#0F2B4C]/60 hover:bg-[#F5F5F0] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleRoleSave}
              disabled={savingRole || noChange}
              className="flex items-center gap-1.5 bg-[#0F2B4C] hover:bg-[#1E3A5F] disabled:opacity-40 text-white px-5 py-2 rounded-lg text-sm font-semibold transition-colors"
            >
              {savingRole ? (
                <><RefreshCw size={13} className="animate-spin" /> Saving…</>
              ) : (
                'Save Changes'
              )}
            </button>
          </div>
        </div>
      </div>

      {confirm === 'deactivate' && (
        <ConfirmDialog
          message={`Deactivate ${getFullName(member)}'s account? They will lose all dashboard access immediately.`}
          onConfirm={handleDeactivate}
          onCancel={() => setConfirm(null)}
          confirmLabel="Deactivate"
          danger
        />
      )}
      {confirm === 'reactivate' && (
        <ConfirmDialog
          message={`Reactivate ${getFullName(member)}'s account? They will regain dashboard access based on their role.`}
          onConfirm={handleReactivate}
          onCancel={() => setConfirm(null)}
          confirmLabel="Reactivate"
        />
      )}
    </>
  );
}

// ─── Skeleton loader ───────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-b border-[#F5F5F0]">
      {[140, 90, 70, 80, 100, 56].map((w, i) => (
        <td key={i} className="px-4 py-3.5">
          <div
            className="h-4 rounded-md bg-[#0F2B4C]/5 animate-pulse"
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
  const [loading, setLoading]         = useState(true);
  const [fetchError, setFetchError]   = useState<string | null>(null);

  // Filters
  const [search, setSearch]           = useState('');
  const [roleFilter, setRoleFilter]   = useState<AdminRoleType | ''>('');
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

  // Fetch — admins + dynamic roles in parallel
  const load = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const [data, rolesList] = await Promise.all([
        adminApi.admins.list(),
        adminApi.roles.list().catch(() => []),
      ]);
      setMembers(Array.isArray(data) ? data : []);
      setRoles(Array.isArray(rolesList) ? rolesList : []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to load staff';
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

  // Client-side filter
  const filtered = members.filter((m) => {
    const fullName = getFullName(m).toLowerCase();
    const matchSearch =
      !search ||
      fullName.includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase());
    const matchRole   = !roleFilter || getRole(m) === roleFilter;
    const matchStatus =
      !statusFilter ||
      (statusFilter === 'active' ? m.isActive : !m.isActive);
    return matchSearch && matchRole && matchStatus;
  });

  const totalPages  = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const paginated   = filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => { setPage(1); }, [search, roleFilter, statusFilter]);

  const activeCount   = members.filter((m) => m.isActive).length;
  const inactiveCount = members.filter((m) => !m.isActive).length;

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
        <main className="p-8 max-w-7xl mx-auto">

          {/* ── Page Header ── */}
          <div className="flex items-start justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-[#0F2B4C]">Staff Management</h1>
              <p className="text-sm text-[#0F2B4C]/50 mt-1">
                Manage admin accounts and access control
              </p>
            </div>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-2 bg-[#3A7BD5] hover:bg-[#2a6bc4] text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-colors shadow-sm shrink-0"
            >
              <Plus size={15} />
              Invite Staff Member
            </button>
          </div>

          {/* ── Stats Bar ── */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              {
                label: 'Total Staff',
                value: members.length,
                icon:  <Users size={16} className="text-[#3A7BD5]" />,
                bg:    'bg-blue-50',
              },
              {
                label: 'Active',
                value: activeCount,
                icon:  <CheckCircle size={16} className="text-emerald-500" />,
                bg:    'bg-emerald-50',
              },
              {
                label: 'Inactive',
                value: inactiveCount,
                icon:  <XCircle size={16} className="text-red-400" />,
                bg:    'bg-red-50',
              },
            ].map(({ label, value, icon, bg }) => (
              <div key={label} className={`${bg} rounded-xl px-5 py-4 flex items-center gap-3`}>
                <div className="shrink-0">{icon}</div>
                <div>
                  <div className="text-2xl font-bold text-[#0F2B4C]">
                    {loading ? <span className="inline-block w-6 h-6 bg-[#0F2B4C]/10 rounded animate-pulse" /> : value}
                  </div>
                  <div className="text-xs text-[#0F2B4C]/50 font-medium">{label}</div>
                </div>
              </div>
            ))}
          </div>

          {/* ── Filter Bar ── */}
          <div className="bg-white rounded-xl border border-[#E5E7EB] px-4 py-3 mb-4 flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 min-w-48">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#0F2B4C]/30 pointer-events-none" />
              <input
                type="text"
                placeholder="Search by name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-8 py-2 rounded-lg border border-[#E5E7EB] text-sm bg-[#F8F9FB] text-[#0F2B4C] focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] placeholder:text-[#0F2B4C]/30"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#0F2B4C]/30 hover:text-[#0F2B4C]/60 transition-colors"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Role filter */}
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value as AdminRoleType | '')}
              className="px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm bg-white text-[#0F2B4C] focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] min-w-40"
            >
              <option value="">All Roles</option>
              {/* Spec V8 — dynamic roles from /admin/roles. Filter by role slug
                  (system roles use enum-style slugs; custom roles use derived). */}
              {roles.map((r) => (
                <option key={r.id} value={r.slug}>{r.name}</option>
              ))}
            </select>

            {/* Status filter */}
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'active' | 'inactive' | '')}
              className="px-3 py-2 border border-[#E5E7EB] rounded-lg text-sm bg-white text-[#0F2B4C] focus:outline-none focus:ring-2 focus:ring-[#3A7BD5]"
            >
              <option value="">All Status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>

            {/* Clear */}
            {(search || roleFilter || statusFilter) && (
              <button
                onClick={() => { setSearch(''); setRoleFilter(''); setStatusFilter(''); }}
                className="text-xs text-[#0F2B4C]/40 hover:text-[#0F2B4C]/70 font-medium transition-colors"
              >
                Clear filters
              </button>
            )}

            {/* Refresh */}
            <button
              onClick={load}
              disabled={loading}
              title="Refresh"
              className="ml-auto p-2 rounded-lg border border-[#E5E7EB] text-[#0F2B4C]/40 hover:text-[#0F2B4C]/70 hover:bg-[#F5F5F0] disabled:opacity-40 transition-colors"
            >
              <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>

          {/* ── Error state ── */}
          {fetchError && (
            <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700 font-medium">
              <XCircle size={15} className="shrink-0" />
              {fetchError}
              <button onClick={load} className="ml-auto text-xs underline font-semibold">
                Retry
              </button>
            </div>
          )}

          {/* ── Table ── */}
          <div className="bg-white rounded-xl shadow-sm border border-[#E5E7EB] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F5F0] border-b border-[#E5E7EB]">
                <tr>
                  {['Staff Member', 'Role', 'Status', 'Last Login', 'Date Created', 'Actions'].map((h) => (
                    <th
                      key={h}
                      className="text-left px-4 py-3 text-xs font-semibold text-[#0F2B4C]/40 uppercase tracking-wide whitespace-nowrap"
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
                      // Spec V8 — prefer dynamic role lookup by roleId, fall
                      // back to legacy hardcoded label/color for older users.
                      const dynamicRole = m.roleId
                        ? roles.find(r => r.id === m.roleId)
                        : roles.find(r => role && r.slug === role);
                      const avatarBg  = role ? (AVATAR_BG[role] ?? 'bg-[#3A7BD5]') : 'bg-[#3A7BD5]';
                      const roleColor = dynamicRole
                        ? (COLOR_BG[dynamicRole.badgeColor] ?? COLOR_BG.gray)
                        : role ? (ROLE_COLORS[role] ?? '') : '';
                      const roleLabel = dynamicRole?.name
                        ?? (role ? (ROLE_LABELS[role] ?? role) : '—');

                      return (
                        <tr key={m.id} className="hover:bg-[#F8F9FB] transition-colors group">
                          {/* Staff Member */}
                          <td className="px-4 py-3.5">
                            <div className="flex items-center gap-3">
                              <div
                                className={`w-9 h-9 rounded-full ${avatarBg} flex items-center justify-center text-white text-xs font-bold shrink-0`}
                              >
                                {initials}
                              </div>
                              <div className="min-w-0">
                                <div className="font-semibold text-[#0F2B4C] truncate">
                                  {getFullName(m)}
                                </div>
                                <div className="text-xs text-[#0F2B4C]/40 truncate">{m.email}</div>
                              </div>
                            </div>
                          </td>

                          {/* Role badge */}
                          <td className="px-4 py-3.5">
                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold whitespace-nowrap ${roleColor}`}>
                              {roleLabel}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3.5">
                            {m.isActive ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700 whitespace-nowrap">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block" />
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-600 whitespace-nowrap">
                                <span className="w-1.5 h-1.5 rounded-full bg-red-400 inline-block" />
                                Inactive
                              </span>
                            )}
                          </td>

                          {/* Last Login */}
                          <td className="px-4 py-3.5 text-xs text-[#0F2B4C]/50 whitespace-nowrap">
                            {relativeTime(m.lastLoginAt)}
                          </td>

                          {/* Date Created */}
                          <td className="px-4 py-3.5 text-xs text-[#0F2B4C]/50 whitespace-nowrap">
                            {formatDate(m.createdAt)}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3.5">
                            <button
                              onClick={() => setEditMember(m)}
                              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-xs font-medium text-[#0F2B4C]/50 hover:bg-[#F5F5F0] hover:text-[#0F2B4C] hover:border-[#0F2B4C]/20 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100"
                            >
                              <Pencil size={12} />
                              Edit
                            </button>
                          </td>
                        </tr>
                      );
                    })}
              </tbody>
            </table>

            {/* Empty state */}
            {!loading && paginated.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#F5F5F0] flex items-center justify-center mb-4">
                  <Users size={24} className="text-[#0F2B4C]/20" />
                </div>
                <p className="text-sm font-semibold text-[#0F2B4C]/40">No staff members found</p>
                <p className="text-xs text-[#0F2B4C]/25 mt-1">
                  {search || roleFilter || statusFilter
                    ? 'Try adjusting your filters'
                    : 'Invite your first team member to get started'}
                </p>
                {!search && !roleFilter && !statusFilter && (
                  <button
                    onClick={() => setShowCreate(true)}
                    className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-[#3A7BD5] hover:underline"
                  >
                    <Plus size={14} />
                    Invite Staff Member
                  </button>
                )}
              </div>
            )}
          </div>

          {/* ── Pagination ── */}
          {!loading && filtered.length > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-xs text-[#0F2B4C]/40">
                Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, filtered.length)} of {filtered.length}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg border border-[#E5E7EB] text-[#0F2B4C]/40 hover:bg-[#F5F5F0] hover:text-[#0F2B4C]/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                </button>

                {pageItems.map((item, i) =>
                  item === '...' ? (
                    <span key={`ellipsis-${i}`} className="w-8 text-center text-xs text-[#0F2B4C]/30">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      onClick={() => setPage(item as number)}
                      className={`w-8 h-8 rounded-lg text-xs font-semibold transition-colors ${
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
                  className="p-2 rounded-lg border border-[#E5E7EB] text-[#0F2B4C]/40 hover:bg-[#F5F5F0] hover:text-[#0F2B4C]/70 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
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
        />
      )}

      {editMember && (
        <EditDrawer
          member={editMember}
          onClose={() => setEditMember(null)}
          onUpdated={handleUpdated}
          addToast={addToast}
          roles={roles}
        />
      )}

      {/* ── Toast container ── */}
      <ToastContainer toasts={toasts} dismiss={dismissToast} />
    </>
  );
}
