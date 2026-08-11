'use client';

/**
 * Scroll-reveal wrapper (founder 2026-08-11: the site should feel alive
 * like apple.com). Children fade + rise into place the first time they
 * scroll into view. Respects prefers-reduced-motion (renders static),
 * and renders visible-by-default until JS hydrates so nothing is ever
 * hidden for crawlers or slow connections.
 */
import { useEffect, useRef, useState } from 'react';

export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  /** stagger in ms for card grids */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(false);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) return;
    setEnabled(true);
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShown(true);
            io.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -60px 0px', threshold: 0.1 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={className}
      style={
        enabled
          ? {
              opacity: shown ? 1 : 0,
              transform: shown ? 'none' : 'translateY(24px)',
              transition: `opacity 0.7s ease ${delay}ms, transform 0.7s ease ${delay}ms`,
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}
