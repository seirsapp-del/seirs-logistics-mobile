import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-off-white">
      <div className="text-center">
        <div className="w-16 h-16 bg-navy rounded-2xl flex items-center justify-center mx-auto mb-6">
          <span className="text-white font-black text-2xl">S</span>
        </div>
        <h1 className="text-7xl font-black text-navy mb-3">404</h1>
        <p className="text-text-muted text-lg mb-8">
          This page doesn&apos;t exist.
        </p>
        <Link
          href="/"
          className="inline-flex items-center gap-2 bg-navy text-white font-bold px-8 py-4 rounded-btn hover:opacity-90 transition-opacity"
        >
          Back to Home
        </Link>
      </div>
    </div>
  );
}
