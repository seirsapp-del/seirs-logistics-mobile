import type { MetadataRoute } from 'next';
import { listContent } from '@/lib/cms';
import { SITE_URL } from '@/lib/launch';

// Next.js Metadata API sitemap, generates /sitemap.xml at build /
// revalidate time. ISR cadence matches the article fetch so newly
// published articles appear in the sitemap within ~1 minute.
export const revalidate = 60;

// One source for the canonical host, shared with layout.tsx, robots.ts
// and CookieBanner. This used to read the env var directly, which was the
// same default but a second place to change.
const BASE = SITE_URL;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [articles, jobs] = await Promise.all([
    listContent('article',     { pageSize: 200 }),
    listContent('job_listing', { pageSize: 100 }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,                   changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/how-it-works`,       changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/find-a-partner`,     changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/for-business`,       changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/for-drivers`,        changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/for-partner-stores`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/news`,               changeFrequency: 'daily',   priority: 0.9 },
    // /track added 2026-08-15. High priority on purpose: recipients holding
    // a code are the largest search audience a logistics site gets, and they
    // search for tracking far more than for marketing pages.
    { url: `${BASE}/track`,              changeFrequency: 'monthly', priority: 0.9 },
    { url: `${BASE}/faq`,                changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/changelog`,          changeFrequency: 'weekly',  priority: 0.6 },
    { url: `${BASE}/careers`,            changeFrequency: 'weekly',  priority: 0.7 },
    { url: `${BASE}/contact`,            changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE}/privacy-policy`,     changeFrequency: 'yearly',  priority: 0.3 },
    { url: `${BASE}/terms-of-service`,   changeFrequency: 'yearly',  priority: 0.3 },
  ];

  const articleRoutes: MetadataRoute.Sitemap = articles.map(a => ({
    url: `${BASE}/news/${a.slug}`,
    lastModified: a.publishedAt ?? undefined,
    changeFrequency: 'monthly' as const,
    priority: 0.7,
  }));

  const jobRoutes: MetadataRoute.Sitemap = jobs.map(j => ({
    url: `${BASE}/careers/${j.slug}`,
    lastModified: j.publishedAt ?? undefined,
    changeFrequency: 'weekly' as const,
    priority: 0.6,
  }));

  return [...staticRoutes, ...articleRoutes, ...jobRoutes];
}
