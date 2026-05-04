'use client';
import { useState, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { Lock, AlertCircle, CheckCircle2, Eye, EyeOff } from 'lucide-react';

const PASSWORD_RE = /^(?=.*[a-z])(?=.*[A-Z])(?=.*[\d\W]).{12,}$/;

function ResetForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const token        = searchParams.get('token') ?? '';

  const [password,        setPassword]        = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword,    setShowPassword]    = useState(false);
  const [done,            setDone]            = useState(false);
  const [error,           setError]           = useState('');
  const [loading,         setLoading]         = useState(false);

  if (!token) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-red-100 mb-4">
          <AlertCircle size={24} className="text-red-600" />
        </div>
        <h1 className="text-xl font-bold text-[#111827] mb-2">Invalid link</h1>
        <p className="text-sm text-gray-500 mb-4">
          This password reset link is missing its token. Request a new link to continue.
        </p>
        <Link href="/forgot-password" className="text-sm text-[#3A7BD5] font-semibold hover:underline">
          Request a new reset link
        </Link>
      </div>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    // Admin password rules per spec §3.6: 12+ chars, mixed case, number/symbol
    if (!PASSWORD_RE.test(password)) {
      setError('Password must be at least 12 characters and include uppercase, lowercase, and a number or symbol.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setError('');
    setLoading(true);
    try {
      await adminApi.resetPassword(token, password);
      setDone(true);
      setTimeout(() => router.replace('/login'), 3000);
    } catch (err: any) {
      setError(err?.message ?? 'Reset failed. The link may have expired.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="text-center py-4">
        <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-100 mb-4">
          <CheckCircle2 size={24} className="text-green-600" />
        </div>
        <h1 className="text-xl font-bold text-[#111827] mb-2">Password reset</h1>
        <p className="text-sm text-gray-500 mb-4">
          Your password has been updated. Redirecting to sign in…
        </p>
        <Link href="/login" className="text-sm text-[#3A7BD5] font-semibold hover:underline">
          Go to sign in now
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#3A7BD5]/10 mb-3">
          <Lock size={20} className="text-[#3A7BD5]" />
        </div>
        <h1 className="text-xl font-bold text-[#111827]">Choose a new password</h1>
        <p className="text-sm text-gray-500 mt-1">
          Must be at least 12 characters, with mixed case and a number or symbol.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            New password
          </label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoFocus
              required
              minLength={12}
              className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] focus:border-transparent"
            />
            <button
              type="button"
              onClick={() => setShowPassword(s => !s)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              tabIndex={-1}
            >
              {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
            Confirm password
          </label>
          <div className="relative">
            <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={12}
              className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] focus:border-transparent"
            />
          </div>
        </div>

        {error && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
            <AlertCircle size={14} className="shrink-0" />
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !password || !confirmPassword}
          className="w-full bg-[#0F2B4C] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[#3A7BD5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? 'Updating…' : 'Update password'}
        </button>
      </form>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F2B4C] via-[#1a3d6b] to-[#0F2B4C] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <Suspense fallback={<div className="text-center text-gray-400 py-8">Loading…</div>}>
            <ResetForm />
          </Suspense>
        </div>
        <p className="text-center text-xs text-white/20 mt-6">Seirs Logistics — Internal Admin Tool</p>
      </div>
    </div>
  );
}
