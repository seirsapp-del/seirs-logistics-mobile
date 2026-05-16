"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { Menu, X, Globe, Check } from "lucide-react";

const navLinks = [
  { label: "How it Works",   href: "/how-it-works" },
  { label: "For Business",   href: "/for-business" },
  { label: "For Drivers",    href: "/for-drivers" },
  { label: "Partner Stores", href: "/for-partner-stores" },
  { label: "News",           href: "/news" },
  { label: "FAQ",            href: "/faq" },
  { label: "Contact",        href: "/contact" },
];

// Spec V8 §i18n — supported languages. UI ships en-only at launch;
// the dropdown persists the user preference, sets the html lang
// attribute so browsers/screen-readers pick up the choice, and
// signals to the user that browser translation kicks in. CMS schema
// already supports lang-per-row for future translated content.
const LANGS: Array<{ code: string; label: string; native: string }> = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'yo', label: 'Yoruba',  native: 'Yorùbá' },
  { code: 'ig', label: 'Igbo',    native: 'Igbo' },
  { code: 'ha', label: 'Hausa',   native: 'Hausa' },
];
const LANG_STORAGE_KEY = 'seirs.lang';

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  return (
    <nav
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-white border-b border-gray-200 shadow-sm"
          : "bg-white/95 backdrop-blur-sm"
      }`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-1.5 flex-shrink-0">
            <div className="w-8 h-8 bg-navy rounded-lg flex items-center justify-center">
              <span className="text-white font-black text-sm">S</span>
            </div>
            <div className="flex flex-col leading-none">
              <span className="text-navy font-extrabold text-xl tracking-tight">
                Seirs
              </span>
              <span className="text-sky text-[10px] font-semibold tracking-widest uppercase">
                Logistics
              </span>
            </div>
          </Link>

          {/* Desktop Links */}
          <div className="hidden md:flex items-center gap-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className="text-text-muted hover:text-navy font-medium text-sm px-4 py-2 rounded-lg transition-colors duration-150 hover:bg-gray-50"
              >
                {link.label}
              </Link>
            ))}
          </div>

          {/* Desktop CTA + lang switcher */}
          <div className="hidden md:flex items-center gap-2">
            <LangSwitcher />
            <Link
              href="/contact"
              className="bg-sky text-white font-semibold text-sm px-5 py-2.5 rounded-btn hover:opacity-90 transition-opacity"
            >
              Get Started
            </Link>
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 rounded-lg text-navy hover:bg-gray-100 transition-colors"
            aria-label="Toggle menu"
          >
            {open ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-gray-100 shadow-xl">
          <div className="px-4 py-4 space-y-1">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setOpen(false)}
                className="block text-text-dark font-medium text-base px-4 py-3 rounded-lg hover:bg-gray-50 transition-colors"
              >
                {link.label}
              </Link>
            ))}
            <div className="px-4 pt-3">
              <LangSwitcher />
            </div>
            <div className="pt-3 pb-1">
              <Link
                href="/contact"
                onClick={() => setOpen(false)}
                className="block w-full text-center bg-sky text-white font-semibold text-base px-5 py-3 rounded-btn hover:opacity-90 transition-opacity"
              >
                Get Started
              </Link>
            </div>
          </div>
        </div>
      )}
    </nav>
  );
}

// ─── Language switcher ──────────────────────────────────────────────────────
// UI ships en-only at launch. The dropdown persists the user choice +
// updates <html lang="..."> so screen readers and browser auto-
// translation pick up the right language. CMS lookups can pass the
// stored lang via a query param when translated content lands.

function LangSwitcher() {
  const [open,    setOpen]    = useState(false);
  const [lang,    setLang]    = useState('en');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem(LANG_STORAGE_KEY) : null;
    if (saved && LANGS.some(l => l.code === saved)) setLang(saved);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (open && wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const pick = (code: string) => {
    setLang(code);
    if (typeof window !== 'undefined') {
      localStorage.setItem(LANG_STORAGE_KEY, code);
      document.documentElement.lang = code;
    }
    setOpen(false);
  };

  const current = LANGS.find(l => l.code === lang) ?? LANGS[0];

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className="flex items-center gap-1.5 text-text-muted hover:text-navy text-sm px-3 py-2 rounded-lg hover:bg-gray-50 transition-colors"
      >
        <Globe size={14} />
        <span className="font-medium">{current.code.toUpperCase()}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-56 bg-white border border-gray-200 rounded-lg shadow-xl py-1 z-50">
          <p className="px-3 py-2 text-[10px] uppercase font-bold tracking-wider text-gray-400 border-b border-gray-100">
            Language
          </p>
          {LANGS.map(l => (
            <button
              key={l.code}
              onClick={() => pick(l.code)}
              className={`w-full text-left flex items-center justify-between px-3 py-2 text-sm hover:bg-gray-50 ${
                l.code === lang ? 'text-navy font-semibold' : 'text-gray-700'
              }`}
            >
              <span>
                {l.native}
                {l.label !== l.native && (
                  <span className="text-gray-400 text-xs ml-1">({l.label})</span>
                )}
              </span>
              {l.code === lang && <Check size={14} className="text-sky" />}
            </button>
          ))}
          <div className="border-t border-gray-100 mt-1 pt-2 pb-1 px-3">
            <p className="text-[10px] text-gray-500 leading-relaxed">
              UI translation rolls out post-launch. For now your browser will translate the page automatically.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
