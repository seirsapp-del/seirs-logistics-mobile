'use client';
import { useState, FormEvent } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { ArrowLeft, Mail, AlertCircle, CheckCircle2 } from 'lucide-react';

// Spec V8 §3 — admin password recovery. Backend branches the email link
// by user role so admins receive a web URL instead of a mobile deep link.
// Page intentionally never reveals whether an email exists in the system.
export default function ForgotPasswordPage() {
  const [email,    setEmail]    = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!email) { setError('Email is required.'); return; }
    setError('');
    setLoading(true);
    try {
      await adminApi.forgotPassword(email.trim().toLowerCase());
      // The API always returns a generic success message regardless of
      // whether the email exists, so we can mirror that on the UI.
      setSubmitted(true);
    } catch (err: any) {
      setError(err?.message ?? 'Could not send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0F2B4C] via-[#1a3d6b] to-[#0F2B4C] flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-2xl p-8">
          <Link href="/login" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-[#3A7BD5] mb-6 transition-colors">
            <ArrowLeft size={14} />
            Back to sign in
          </Link>

          {submitted ? (
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-green-100 mb-4">
                <CheckCircle2 size={24} className="text-green-600" />
              </div>
              <h1 className="text-xl font-bold text-[#111827] mb-2">Check your email</h1>
              <p className="text-sm text-gray-500 leading-relaxed">
                If an admin account exists for <strong className="text-[#111827]">{email}</strong>,
                a password reset link has been sent. The link expires in <strong>1 hour</strong>.
              </p>
              <p className="text-xs text-gray-400 mt-4">
                Didn&apos;t get it? Check spam, then try again in a few minutes.
              </p>
            </div>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#3A7BD5]/10 mb-3">
                  <Mail size={20} className="text-[#3A7BD5]" />
                </div>
                <h1 className="text-xl font-bold text-[#111827]">Reset Password</h1>
                <p className="text-sm text-gray-500 mt-1">
                  Enter the email associated with your admin account
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-1.5">
                    Email
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoFocus
                      required
                      placeholder="admin@seirs.co"
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
                  disabled={loading || !email}
                  className="w-full bg-[#0F2B4C] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[#3A7BD5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>
        <p className="text-center text-xs text-white/20 mt-6">Seirs Logistics — Internal Admin Tool</p>
      </div>
    </div>
  );
}
