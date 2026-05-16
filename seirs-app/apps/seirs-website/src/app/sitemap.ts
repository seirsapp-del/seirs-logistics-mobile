import type { MetadataRoute } from 'next';
import { listContent } from '@/lib/cms';

// Next.js Metadata API sitemap — generates /sitemap.xml at build /
// revalidate time. ISR cadence matches the article fetch so newly
// published articles appear in the sitemap within ~1 minute.
export const revalidate = 60;

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://seirs.app';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const articles = await listContent('article', { pageSize: 200 });

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${BASE}/`,                   changeFrequency: 'weekly',  priority: 1.0 },
    { url: `${BASE}/how-it-works`,       changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/for-business`,       changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/for-drivers`,        changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/for-partner-stores`, changeFrequency: 'monthly', priority: 0.8 },
    { url: `${BASE}/news`,               changeFrequency: 'daily',   priority: 0.9 },
    { url: `${BASE}/faq`,                changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE}/changelog`,          changeFrequency: 'weekly',  priority: 0.6 },
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

  return [...staticRoutes, ...articleRoutes];
}
