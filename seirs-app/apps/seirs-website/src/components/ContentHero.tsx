/**
 * Navy page header with an optional, per-page admin backdrop.
 *
 * This component was copy-pasted locally in news, faq and changelog; now it
 * lives once. The IMAGE is never shared: every page passes the URL of its
 * own img_hero_* slot (founder 2026-08-15: each page's backdrop must be
 * individually changeable in the admin), so changing one page's image in
 * Website > Page Blocks touches that page alone. With the slot empty the
 * header stays the plain navy gradient it always was.
 */
export function ContentHero({
  title,
  subtitle,
  imageUrl,
}: {
  title: string;
  subtitle: string;
  imageUrl?: string | null;
}) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-navy via-[#1a3a5c] to-navy text-white pt-28 pb-16">
      {imageUrl && (
        <div
          aria-hidden
          className="absolute inset-0 bg-cover bg-center opacity-25"
          style={{ backgroundImage: `url(${imageUrl})` }}
        />
      )}
      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <h1 className="text-title-sm lg:text-title-lg font-extrabold mb-4">{title}</h1>
        <p className="text-white/70 text-lg max-w-2xl mx-auto">{subtitle}</p>
      </div>
    </section>
  );
}
