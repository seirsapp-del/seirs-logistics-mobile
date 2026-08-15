import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Calendar, Clock } from 'lucide-react';
import { getContentBySlug, listContent, fmtDate, renderMarkdown, getImageSlots } from '@/lib/cms';
import { Reveal } from '@/components/Reveal';

export const revalidate = 60;

// Required by Next.js `output: 'export'`, see careers/[slug] for the
// full reasoning. Re-deploy the website to pick up new news posts.
export async function generateStaticParams() {
  const items = await listContent('article', { pageSize: 100 });
  return items.map(a => ({ slug: a.slug }));
}

interface Props { params: Promise<{ slug: string }> }

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const a = await getContentBySlug(slug);
  if (!a) return { title: 'Not found · SEIRS' };
  return {
    title:       a.seoTitle ?? `${a.title} · SEIRS`,
    description: a.seoDescription ?? a.excerpt ?? undefined,
    openGraph: a.coverImageUrl ? { images: [a.coverImageUrl] } : undefined,
  };
}

// Founder 2026-08-12: "it should feel like a 10 min read... picture
// spaces IN the reading, not just at the top". Each story article gets
// supporting images interleaved through the body. Admin-uploaded images
// in the body always win: auto-illustration only kicks in when the
// author hasn't placed any.
const STORY_ILLUSTRATIONS: Record<string, string[]> = {
  'moving-farm-produce':      ['img_move_farm', 'img_interstate', 'img_handoff_hands'],
  'moving-market-traders':    ['img_move_trader', 'img_business_owner', 'img_handoff_hands'],
  'moving-tailors-fashion':   ['img_move_tailor', 'img_step_delivered', 'img_handoff_hands'],
  'moving-furniture-woodwork':['img_move_wood', 'img_interstate', 'img_step_pickup'],
  'moving-hot-food':          ['img_move_food', 'img_night_rider', 'img_step_delivered'],
  'moving-medical-supplies':  ['img_move_medical', 'img_night_rider', 'img_handoff_hands'],
  'moving-electronics':       ['img_move_electronics', 'img_handoff_hands', 'img_step_delivered'],
  'moving-documents':         ['img_move_documents', 'img_step_book', 'img_handoff_hands'],
  'moving-building-materials':['img_move_building', 'img_interstate', 'img_step_pickup'],
  'moving-live-animals':      ['img_move_animals', 'img_interstate', 'img_handoff_hands'],
};

/** ~200 words per minute, the standard editorial estimate. */
function readingMinutes(body: string): number {
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/**
 * Interleave supporting images between the article's paragraphs so the
 * reader gets a visual beat every few paragraphs instead of a wall of
 * text. Skipped entirely when the author already placed images.
 */
/**
 * Turns whatever video URL the admin pasted into something embeddable.
 * YouTube watch / youtu.be / shorts links become the privacy-enhanced
 * youtube-nocookie embed; anything else is treated as a direct video file
 * and rendered with a native <video> tag. Returns null for unrecognised
 * YouTube-ish URLs rather than embedding something broken.
 */
function videoEmbed(url: string): { kind: 'youtube'; src: string } | { kind: 'file'; src: string } | null {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      const id = u.pathname.startsWith('/shorts/')
        ? u.pathname.split('/')[2]
        : u.searchParams.get('v');
      return id ? { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    if (host === 'youtu.be') {
      const id = u.pathname.slice(1).split('/')[0];
      return id ? { kind: 'youtube', src: `https://www.youtube-nocookie.com/embed/${id}` } : null;
    }
    return { kind: 'file', src: url };
  } catch {
    return null;
  }
}

function illustrate(body: string, images: string[], force = false): string {
  // The skip-when-author-placed-images rule exists for the GENERIC slot
  // illustrations, which would clash with hand-positioned pictures. A
  // curated gallery was chosen for this specific article, so it interleaves
  // regardless (force=true from the caller).
  if (!images.length || (!force && /!\[[^\]]*\]\([^)]+\)/.test(body))) return body;
  const blocks = body.split(/\n\n+/);
  if (blocks.length < 4) return body;

  // Aim for an image roughly every 3 paragraphs, never before the first
  // paragraph and never immediately before the closing one.
  const out: string[] = [];
  let imgIdx = 0;
  blocks.forEach((block, i) => {
    out.push(block);
    const isLast = i === blocks.length - 1;
    if (!isLast && i > 0 && (i + 1) % 3 === 0 && imgIdx < images.length) {
      out.push(`![](${images[imgIdx++]})`);
    }
  });
  return out.join('\n\n');
}

export default async function ArticlePage({ params }: Props) {
  const { slug } = await params;
  const [article, img, siblings] = await Promise.all([
    getContentBySlug(slug),
    getImageSlots(),
    listContent('article', { pageSize: 12 }),
  ]);
  if (!article) notFound();

  const slotKeys = STORY_ILLUSTRATIONS[slug] ?? [];
  // Precedence, 2026-08-15: the admin's own gallery for THIS article wins
  // over the generic per-slug illustration slots. The slots stay as the
  // fallback so the ten existing stories keep their pictures until each
  // gets a curated gallery.
  // null = never curated (fallback illustrations apply); [] = the admin
  // deliberately emptied the gallery (no images at all). Founder 2026-08-15.
  const curated = article.galleryImages != null;
  const galleryUrls = article.galleryImages ?? [];

  // Manual placement (founder 2026-08-15: "the ability to put it within the
  // article anywhere we want, maybe after a certain paragraph"). The admin
  // types {{img1}}..{{img5}} in the body to pin a specific gallery image
  // after a paragraph, and {{video}} to pin the video. Placed images leave
  // the auto-interleave pool so nothing shows twice; unplaced ones keep
  // flowing every few paragraphs, and an unplaced video stays at the top.
  // A token whose image does not exist is stripped rather than printed.
  let rawBody = article.body;
  const placed = new Set<number>();
  rawBody = rawBody.replace(/\{\{img([1-5])\}\}/g, (_m, d: string) => {
    const idx = Number(d) - 1;
    const url = galleryUrls[idx];
    if (!url) return '';
    placed.add(idx);
    return `

![image](${url})

`;
  });
  const videoTokenUsed = /\{\{video\}\}/.test(rawBody) && !!article.videoUrl;

  const interleavePool = curated
    ? galleryUrls.filter((_, i) => !placed.has(i))
    : slotKeys.map(k => img[k]).filter(Boolean);
  const body = illustrate(rawBody, interleavePool, curated);

  // {{video}} placement. The token has no markdown-special characters, so it
  // survives renderMarkdown as a plain <p>{{video}}</p>, which is swapped for
  // the embed here. The src is admin-supplied and publish-gated, but quotes
  // are stripped anyway so a pasted URL cannot break out of the attribute.
  let bodyHtml = renderMarkdown(body);
  if (videoTokenUsed) {
    const v = videoEmbed(article.videoUrl!);
    const embedHtml = !v ? '' : v.kind === 'youtube'
      ? `<div class="article-video"><iframe src="${v.src.replace(/"/g, '')}" title="Video" allow="accelerometer; encrypted-media; picture-in-picture" allowfullscreen loading="lazy"></iframe></div>`
      : `<div class="article-video"><video src="${v.src.replace(/"/g, '')}" controls preload="metadata"></video></div>`;
    bodyHtml = bodyHtml.split('<p>{{video}}</p>').join(embedHtml);
  }

  const minutes = readingMinutes(article.body);
  const related = siblings.filter(s => s.slug !== slug).slice(0, 3);
  const cover = article.coverImageUrl ?? img[slotKeys[0]] ?? null;

  return (
    <article className="bg-cream">
      {/* Full-bleed cover with the title laid over it: the reader knows
          what they are getting before a single line of body text. */}
      <header className="relative bg-navy">
        {cover && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt="" className="absolute inset-0 w-full h-full object-cover opacity-40" />
        )}
        <div className="relative max-w-3xl mx-auto px-6 pt-24 pb-14">
          <Link href="/news" className="inline-flex items-center gap-1 text-sm text-white/70 hover:text-white mb-8">
            <ArrowLeft size={14} /> All stories
          </Link>
          {article.category && (
            <span className="inline-block text-[10px] uppercase font-bold tracking-[0.2em] text-[#FFBE0B] mb-4">
              {article.category}
            </span>
          )}
          <h1 className="text-title-sm lg:text-title-lg font-extrabold text-white mb-5">
            {article.title}
          </h1>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-white/60">
            <span className="flex items-center gap-1.5">
              <Calendar size={14} />
              {fmtDate(article.publishedAt)}
            </span>
            <span className="flex items-center gap-1.5">
              <Clock size={14} />
              {minutes} min read
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-14">
        {article.excerpt && (
          <p className="text-xl sm:text-2xl text-navy/80 leading-relaxed font-medium mb-10">
            {article.excerpt}
          </p>
        )}

        {/* Optional interview video, near the top so a visual-first reader
            gets the story without reading a word (founder 2026-08-15). The
            16:9 box is reserved either way, so the page does not jump when
            the player loads. */}
        {(() => {
          const v = article.videoUrl && !videoTokenUsed ? videoEmbed(article.videoUrl) : null;
          if (!v) return null;
          return (
            <div className="mb-10 rounded-card overflow-hidden shadow-lg aspect-video bg-navy">
              {v.kind === 'youtube' ? (
                <iframe
                  src={v.src}
                  title={`Video: ${article.title}`}
                  className="w-full h-full"
                  allow="accelerometer; encrypted-media; picture-in-picture"
                  allowFullScreen
                  loading="lazy"
                />
              ) : (
                // eslint-disable-next-line jsx-a11y/media-has-caption
                <video src={v.src} controls preload="metadata" className="w-full h-full" />
              )}
            </div>
          );
        })()}

        {/* Long-form reading rhythm: generous line height, comfortable
            measure, and images that breathe (styled by the renderer's
            own img class). */}
        <Reveal>
          <div
            className="article-body text-[17px] sm:text-lg leading-[1.85] text-text-dark"
            dangerouslySetInnerHTML={{ __html: bodyHtml }}
          />
        </Reveal>

        <div className="mt-14 pt-8 border-t border-gray-200">
          <p className="text-sm text-text-muted leading-relaxed">
            SEIRS is a Nigerian delivery platform: okada, keke, car, van, and truck, booked from
            an app with live tracking and payment held until delivery.{' '}
            <Link href="/how-it-works" className="text-sky font-semibold hover:underline">See how it works</Link>.
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <section className="bg-off-white border-t border-gray-200 py-section-sm lg:py-section-lg">
          <div className="max-w-5xl mx-auto px-6">
            <h2 className="text-navy font-extrabold text-xl mb-6">More stories</h2>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
              {related.map((r, i) => (
                <Reveal key={r.slug} delay={i * 90}>
                  <Link
                    href={`/news/${r.slug}`}
                    className="group block bg-white rounded-card border border-gray-200 overflow-hidden h-full transition-all duration-300 hover:-translate-y-1.5 hover:shadow-xl"
                  >
                    {(r.coverImageUrl || img[STORY_ILLUSTRATIONS[r.slug]?.[0] ?? '']) && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={r.coverImageUrl ?? img[STORY_ILLUSTRATIONS[r.slug][0]]}
                        alt=""
                        className="w-full h-32 object-cover"
                        loading="lazy"
                      />
                    )}
                    <div className="p-4">
                      <h3 className="text-navy font-bold text-sm leading-snug group-hover:text-sky transition-colors">
                        {r.title}
                      </h3>
                      {r.excerpt && (
                        <p className="text-text-muted text-xs leading-relaxed mt-2 line-clamp-3">{r.excerpt}</p>
                      )}
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>
      )}
    </article>
  );
}
