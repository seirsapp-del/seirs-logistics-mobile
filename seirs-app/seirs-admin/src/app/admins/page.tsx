'use client';
import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/api';
import { AlertTriangle, CheckCircle, Plus, X } from 'lucide-react';

interface AdminForm {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword: string;
}

const EMPTY_FORM: AdminForm = { name: '', email: '', phone: '', password: '', confirmPassword: '' };

export default function AdminsPage() {
  const [admins,   setAdmins]   = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form,     setForm]     = useState<AdminForm>(EMPTY_FORM);
  const [errors,   setErrors]   = useState<Partial<AdminForm>>({});
  const [saving,   setSaving]   = useState(false);
  const [notice,   setNotice]   = useState('');
  const [revoking, setRevoking] = useState<string | null>(null);

  const load = () =>
    adminApi.admins.list()
      .then(setAdmins).catch(() => {})
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const validate = (): boolean => {
    const e: Partial<AdminForm> = {};
    if (!form.name.trim())                      e.name            = 'Name is required';
    if (!form.email.includes('@'))              e.email           = 'Valid email required';
    if (!form.phone.trim())                     e.phone           = 'Phone is required';
    if (form.password.length < 8)              e.password        = 'Min 8 characters';
    if (form.password !== form.confirmPassword) e.confirmPassword = 'Passwords do not match';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await adminApi.admins.create({
        name:     form.name.trim(),
        email:    form.email.trim().toLowerCase(),
        phone:    form.phone.trim(),
        password: form.password,
      });
      setForm(EMPTY_FORM);
      setErrors({});
      setShowForm(false);
      setNotice(`Admin account created for ${form.email}`);
      setTimeout(() => setNotice(''), 5000);
      load();
    } catch (err: any) {
      setErrors({ email: err.message ?? 'Failed to create admin' });
    } finally {
      setSaving(false);
    }
  };

  const revoke = async (id: string, name: string) => {
    if (!confirm(`Revoke admin access for ${name}? They will become a regular customer.`)) return;
    setRevoking(id);
    try {
      await adminApi.changeRole(id, 'customer');
      setNotice(`Admin access revoked for ${name}`);
      setTimeout(() => setNotice(''), 4000);
      load();
    } catch (err: any) {
      alert(err.message ?? 'Failed to revoke');
    } finally {
      setRevoking(null);
    }
  };

  const field = (key: keyof AdminForm, label: string, type = 'text') => (
    <div>
      <label className="block text-sm font-medium text-[#0D1B2A]/70 mb-1">{label}</label>
      <input
        type={type}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        className={`w-full px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#F4600C] bg-white text-[#0D1B2A] ${
          errors[key] ? 'border-red-400' : 'border-[#EDE4D9]'
        }`}
        autoComplete={type === 'password' ? 'new-password' : undefined}
      />
      {errors[key] && <p className="text-red-500 text-xs mt-1">{errors[key]}</p>}
    </div>
  );

  return (
    <div className="min-h-screen">
      <main className="p-8 max-w-4xl mx-auto">

        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-[#0D1B2A]">Admin Accounts</h1>
            <p className="text-sm text-[#0D1B2A]/50 mt-1">
              Admins have full platform access. Manage with care.
            </p>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setErrors({}); }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              showForm
                ? 'bg-[#0D1B2A]/10 text-[#0D1B2A]'
                : 'bg-[#F4600C] text-white hover:bg-[#D95209]'
            }`}
          >
            {showForm ? <><X size={14} /> Cancel</> : <><Plus size={14} /> New Admin</>}
          </button>
        </div>

        {notice && (
          <div className="mb-4 flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
            <CheckCircle size={16} className="shrink-0" />
            {notice}
          </div>
        )}

        {showForm && (
          <div className="bg-white rounded-2xl shadow-sm border border-[#EDE4D9] p-6 mb-6">
            <h2 className="text-base font-bold text-[#0D1B2A] mb-4">Create New Admin Account</h2>
            <form onSubmit={handleCreate} className="grid grid-cols-2 gap-4">
              {field('name',  'Full Name')}
              {field('email', 'Email Address', 'email')}
              {field('phone', 'Phone Number', 'tel')}
              <div />
              {field('password',        'Temporary Password', 'password')}
              {field('confirmPassword', 'Confirm Password',   'password')}

              <div className="col-span-2 flex items-center justify-between pt-2 border-t border-[#F5F0EB]">
                <p className="text-xs text-[#0D1B2A]/40">
                  The new admin will log in with these credentials and should change their password.
                </p>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-[#0D1B2A] text-white px-6 py-2 rounded-lg text-sm font-semibold hover:bg-[#1E3A5F] disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Creating…' : 'Create Admin'}
                </button>
              </div>
            </form>
          </div>
        )}

        {loading ? (
          <div className="text-center py-20 text-[#0D1B2A]/30">Loading…</div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-[#EDE4D9] overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#F5F0EB] border-b border-[#EDE4D9]">
                <tr>
                  {['Admin', 'Phone', 'Status', 'Created', 'Actions'].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-[#0D1B2A]/40 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F5F0EB]">
                {admins.map((a) => (
                  <tr key={a.id} className="hover:bg-[#F5F0EB] transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#F4600C] flex items-center justify-center text-white text-xs font-bold shrink-0">
                          {a.name?.[0]?.toUpperCase()}
                        </div>
                        <div>
                          <div className="font-medium text-[#0D1B2A]">{a.name}</div>
                          <div className="text-xs text-[#0D1B2A]/40">{a.email}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[#0D1B2A]/60">{a.phone}</td>
                    <td className="px-4 py-3">
                      {a.isActive !== false ? (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-700">Active</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-700">Suspended</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-[#0D1B2A]/40">
                      {new Date(a.createdAt).toLocaleDateString('en-NG', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => revoke(a.id, a.name)}
                        disabled={revoking === a.id}
                        className="text-xs bg-red-50 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-100 font-medium disabled:opacity-40 transition-colors"
                      >
                        {revoking === a.id ? '…' : 'Revoke Access'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {admins.length === 0 && (
              <div className="text-center py-16 text-[#0D1B2A]/30">
                No admins found. Create one above.
              </div>
            )}
          </div>
        )}

        <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
          <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800">Admin accounts have full platform access</p>
            <p className="text-xs text-amber-600 mt-1">
              Admins can view all users, approve drivers, cancel deliveries, adjust pricing, and manage fraud flags.
              Only grant access to trusted team members.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
