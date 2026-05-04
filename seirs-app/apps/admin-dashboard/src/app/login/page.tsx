'use client';
import { useState, FormEvent, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { adminApi } from '@/lib/api';
import { saveSession } from '@/lib/auth';
import { Shield, Lock, Mail, AlertCircle, Eye, EyeOff } from 'lucide-react';

function LoginForm() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const redirect     = searchParams.get('from') ?? '/';
  const reason       = searchParams.get('reason');

  const [step,         setStep]        = useState<'credentials' | 'totp'>('credentials');
  const [email,        setEmail]       = useState('');
  const [password,     setPassword]    = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [totpCode,     setTotpCode]    = useState('');
  const [tempToken,    setTempToken]   = useState('');
  const [error,        setError]       = useState('');
  const [loading,      setLoading]     = useState(false);

  const handleCredentials = async (e: FormEvent) => {
    e.preventDefault();
    if (!password) { setError('Password is required.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await adminApi.login(email.trim().toLowerCase(), password);
      if (res.requiresTOTP && res.tempToken) {
        setTempToken(res.tempToken);
        setStep('totp');
      } else if (res.token && res.user) {
        if (res.user.role !== 'admin') {
          setError('This account does not have admin access.');
          return;
        }
        saveSession(res.token, res.user);
        router.replace(redirect);
      }
    } catch (err: any) {
      setError(err.message ?? 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  const handleTOTP = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { token, user } = await adminApi.verifyTOTP(tempToken, totpCode.trim());
      saveSession(token, user);
      router.replace(redirect);
    } catch (err: any) {
      setError(err.message ?? 'Invalid authenticator code.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0F2B4C] flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-[#3A7BD5] mb-4">
            <Shield size={22} className="text-white" />
          </div>
          <div className="text-3xl font-black tracking-widest text-white">SEIRS</div>
          <p className="text-white/40 text-sm mt-1">Admin Dashboard</p>
        </div>

        {reason === 'timeout' && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3 mb-4 text-amber-400 text-sm">
            <AlertCircle size={16} />
            Session expired due to inactivity.
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-2xl p-8">

          {step === 'credentials' ? (
            <>
              <h1 className="text-xl font-bold text-[#111827] mb-6">Sign in</h1>
              <form onSubmit={handleCredentials} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoFocus
                      className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] focus:border-transparent"
                      placeholder="admin@seirs.app"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <div className="relative">
                    <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full pl-9 pr-9 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] focus:border-transparent"
                      placeholder="Enter your password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                      tabIndex={-1}
                    >
                      {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
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
                  disabled={loading || !email || !password}
                  className="w-full bg-[#0F2B4C] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[#3A7BD5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? 'Signing in…' : 'Sign in'}
                </button>

                <div className="text-center">
                  <Link
                    href="/forgot-password"
                    className="text-xs text-gray-500 hover:text-[#3A7BD5] transition-colors"
                  >
                    Forgot password?
                  </Link>
                </div>
              </form>
            </>
          ) : (
            <>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-[#3A7BD5]/10 mb-3">
                  <Shield size={20} className="text-[#3A7BD5]" />
                </div>
                <h1 className="text-xl font-bold text-[#111827]">Two-Factor Auth</h1>
                <p className="text-sm text-gray-500 mt-1">Enter the 6-digit code from your authenticator app</p>
              </div>
              <form onSubmit={handleTOTP} className="space-y-4">
                <input
                  type="text"
                  inputMode="numeric"
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                  maxLength={6}
                  autoFocus
                  required
                  className="w-full text-center text-2xl font-mono tracking-[0.5em] border border-gray-200 rounded-lg py-3 focus:outline-none focus:ring-2 focus:ring-[#3A7BD5] focus:border-transparent"
                  placeholder="000000"
                />
                {error && (
                  <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                    <AlertCircle size={14} className="shrink-0" />
                    {error}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading || totpCode.length !== 6}
                  className="w-full bg-[#0F2B4C] text-white py-2.5 rounded-lg font-semibold text-sm hover:bg-[#3A7BD5] disabled:opacity-50 transition-colors"
                >
                  {loading ? 'Verifying…' : 'Verify Code'}
                </button>
                <button
                  type="button"
                  onClick={() => { setStep('credentials'); setError(''); setTotpCode(''); }}
                  className="w-full text-sm text-gray-400 hover:text-gray-600 py-1 transition-colors"
                >
                  ← Back to sign in
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

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
