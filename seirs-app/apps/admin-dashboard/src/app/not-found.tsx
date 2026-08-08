import Link from 'next/link';
import { SeirsLockup } from '@/components/SeirsLogo';

// Branded 404 replacing Next.js's default text-only page.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border border-gray-100 p-8 flex flex-col items-center text-center">
        <SeirsLockup size={140} color="#0E2540" />
        <div className="mt-6 text-5xl font-black text-gray-300">404</div>
        <h1 className="mt-2 text-xl font-bold text-gray-900">Page not found</h1>
        <p className="mt-2 text-sm text-gray-600">
          The URL you followed does not exist in the admin dashboard.
        </p>
        <Link
          href="/"
          className="mt-6 px-4 py-2 rounded-lg bg-[#0E2540] text-white text-sm font-semibold hover:bg-[#0a1b30]"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
