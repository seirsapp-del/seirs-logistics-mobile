import {
  BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebsiteContent, WebContentStatus, WebContentType } from './website-content.entity';

// Slugs are URL-safe identifiers — lowercase alphanumerics + hyphens,
// 2-120 chars. Keep it strict to avoid Next.js dynamic route ambiguity.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

@Injectable()
export class WebsiteContentService implements OnModuleInit {
  private readonly logger = new Logger(WebsiteContentService.name);

  constructor(
    @InjectRepository(WebsiteContent) private repo: Repository<WebsiteContent>,
  ) {}

  // Idempotent seed — only inserts rows that don't already exist by
  // (type, slug, lang). Lets us ship sensible defaults so the website
  // doesn't render an empty /faq or /news on first boot.
  async onModuleInit() {
    const existing = await this.repo.count();
    if (existing > 0) return;
    const rows = SEED.map(s => this.repo.create({
      ...s,
      status:      WebContentStatus.PUBLISHED,
      publishedAt: new Date(),
    }));
    await this.repo.save(rows);
    this.logger.log(`Seeded ${rows.length} website content rows`);
  }

  // ── Public-facing reads (no auth) ─────────────────────────────────────────
  // Used by apps/seirs-website. ISR caches per route so we don't need
  // micro-optimisation here.

  async listPublished(opts: {
    type:      WebContentType;
    category?: string;
    lang?:     string;
    page?:     number;
    pageSize?: number;
  }) {
    const page     = Math.max(1, opts.page     ?? 1);
    const pageSize = Math.min(50, opts.pageSize ?? 12);
    const where: any = {
      type:   opts.type,
      status: WebContentStatus.PUBLISHED,
      lang:   opts.lang ?? 'en',
    };
    if (opts.category) where.category = opts.category;

    const [items, total] = await this.repo.findAndCount({
      where,
      order: { sortOrder: 'ASC', publishedAt: 'DESC' },
      skip:  (page - 1) * pageSize,
      take:  pageSize,
    });
    return { items, total, page, pageSize };
  }

  async getBySlug(slug: string, lang = 'en') {
    const row = await this.repo.findOne({
      where: { slug, lang, status: WebContentStatus.PUBLISHED },
    });
    if (!row) throw new NotFoundException('Content not found.');
    return row;
  }

  // PAGE_BLOCK lookup — returns the row OR null (so the website can
  // fall back to a hardcoded default while CMS is empty).
  async getPageBlock(slug: string, lang = 'en'): Promise<WebsiteContent | null> {
    return this.repo.findOne({
      where: {
        slug,
        lang,
        type:   WebContentType.PAGE_BLOCK,
        status: WebContentStatus.PUBLISHED,
      },
    });
  }

  // ── Admin CRUD ────────────────────────────────────────────────────────────

  list(opts: { type?: WebContentType; status?: WebContentStatus } = {}) {
    const where: any = {};
    if (opts.type)   where.type   = opts.type;
    if (opts.status) where.status = opts.status;
    return this.repo.find({ where, order: { updatedAt: 'DESC' }, take: 200 });
  }

  async getOne(id: string) {
    const row = await this.repo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Content not found.');
    return row;
  }

  async create(adminId: string, body: Partial<WebsiteContent>) {
    this.validateSlug(body.slug);
    if (!body.type)  throw new BadRequestException('type required');
    if (!body.title) throw new BadRequestException('title required');
    if (!body.body)  throw new BadRequestException('body required');

    // Auto-resolve status: publishAt in the past → publish immediately;
    // future → schedule; missing → draft.
    const now    = new Date();
    const at     = body.publishAt ? new Date(body.publishAt) : null;
    const status = body.status
      ?? (at ? (at <= now ? WebContentStatus.PUBLISHED : WebContentStatus.SCHEDULED)
            : WebContentStatus.DRAFT);

    const row = this.repo.create({
      type:           body.type,
      slug:           body.slug!,
      lang:           body.lang ?? 'en',
      title:          body.title,
      excerpt:        body.excerpt        ?? null,
      body:           body.body,
      coverImageUrl:  body.coverImageUrl  ?? null,
      seoTitle:       body.seoTitle       ?? null,
      seoDescription: body.seoDescription ?? null,
      category:       body.category       ?? null,
      sortOrder:      body.sortOrder      ?? 0,
      authorUserId:   adminId,
      publishAt:      at,
      publishedAt:    status === WebContentStatus.PUBLISHED ? now : null,
      status,
    });
    return this.repo.save(row);
  }

  async update(id: string, body: Partial<WebsiteContent>) {
    const row = await this.getOne(id);
    if (body.slug !== undefined && body.slug !== row.slug) {
      this.validateSlug(body.slug);
      row.slug = body.slug;
    }
    if (body.title          !== undefined) row.title          = body.title;
    if (body.body           !== undefined) row.body           = body.body;
    if (body.excerpt        !== undefined) row.excerpt        = body.excerpt;
    if (body.coverImageUrl  !== undefined) row.coverImageUrl  = body.coverImageUrl;
    if (body.seoTitle       !== undefined) row.seoTitle       = body.seoTitle;
    if (body.seoDescription !== undefined) row.seoDescription = body.seoDescription;
    if (body.category       !== undefined) row.category       = body.category;
    if (body.sortOrder      !== undefined) row.sortOrder      = body.sortOrder;
    if (body.lang           !== undefined) row.lang           = body.lang;
    if (body.publishAt      !== undefined) row.publishAt      = body.publishAt ? new Date(body.publishAt) : null;

    if (body.status !== undefined && body.status !== row.status) {
      if (body.status === WebContentStatus.PUBLISHED && !row.publishedAt) {
        row.publishedAt = new Date();
      }
      row.status = body.status;
    }
    return this.repo.save(row);
  }

  async remove(id: string) {
    const row = await this.getOne(id);
    await this.repo.remove(row);
    return { ok: true };
  }

  private validateSlug(slug?: string) {
    if (!slug)               throw new BadRequestException('slug required');
    if (!SLUG_RE.test(slug)) throw new BadRequestException('slug must be lowercase letters, digits, hyphens (2-120 chars)');
  }

  // ── Scheduled publish cron ────────────────────────────────────────────────
  // Every 5 min, flip any SCHEDULED row whose publishAt <= now to
  // PUBLISHED. Keeps marketing's "publish at 9am Monday" workflow simple
  // without needing to babysit the admin tab.
  @Cron(CronExpression.EVERY_5_MINUTES)
  async publishScheduled() {
    const due = await this.repo.find({
      where: { status: WebContentStatus.SCHEDULED, publishAt: LessThanOrEqual(new Date()) },
    });
    if (!due.length) return;
    for (const r of due) {
      r.status      = WebContentStatus.PUBLISHED;
      r.publishedAt = new Date();
    }
    await this.repo.save(due);
    this.logger.log(`Published ${due.length} scheduled content rows`);
  }
}

// ── Seed data — sensible defaults so the website ships non-empty ────────────
const SEED: Array<Partial<WebsiteContent>> = [
  // ── Homepage hero page-block ─────────────────────────────────────────────
  {
    type:  WebContentType.PAGE_BLOCK,
    slug:  'home_hero',
    title: 'Send anything. Anywhere in Nigeria.',
    excerpt: 'Door-to-door delivery, ride-sharing, and partner-store pickups across Lagos, Abuja, and 20+ cities.',
    body:  'From a single envelope to a full house move. Real drivers, real-time tracking, real receipts.',
    sortOrder: 0,
  },
  {
    type:  WebContentType.PAGE_BLOCK,
    slug:  'home_value_1',
    title: 'Live tracking, every step',
    body:  'Watch your package or your ride move on the map in real time. Share a live link so the recipient knows when to expect arrival.',
    sortOrder: 1,
  },
  {
    type:  WebContentType.PAGE_BLOCK,
    slug:  'home_value_2',
    title: 'Pay your way',
    body:  'Card, bank transfer, USSD, or wallet — all powered by Flutterwave. Earn loyalty points on every delivery.',
    sortOrder: 2,
  },

  // ── FAQ ──────────────────────────────────────────────────────────────────
  {
    type:  WebContentType.FAQ,
    slug:  'how-do-i-track-my-delivery',
    title: 'How do I track my delivery?',
    body:  'Open the SEIRS app, tap your active delivery, and you will see the driver on the map plus the live ETA. You can also share a track-by-code link with the recipient.',
    category: 'getting_started',
    sortOrder: 1,
  },
  {
    type:  WebContentType.FAQ,
    slug:  'what-payment-methods-do-you-accept',
    title: 'What payment methods do you accept?',
    body:  'Card, bank transfer, USSD, and saved wallet balance — all processed by Flutterwave. We do not accept cash on delivery.',
    category: 'payments',
    sortOrder: 2,
  },
  {
    type:  WebContentType.FAQ,
    slug:  'can-someone-pick-up-on-my-behalf',
    title: 'Can someone pick up on my behalf at a partner store?',
    body:  'Yes. Share your 6-character SEIRS ID + your full name with the person collecting. The partner staff will verify both at handoff.',
    category: 'pickup',
    sortOrder: 3,
  },

  // ── Changelog ────────────────────────────────────────────────────────────
  {
    type:  WebContentType.CHANGELOG,
    slug:  'changelog-2026-05-15',
    title: 'Multi-stop deliveries, live earnings, and 16 new package categories',
    excerpt: 'Drivers now see a full ordered route with per-stop signature capture. Customers get live fare breakdowns before booking. Earnings update in real time.',
    body:  '- **Multi-stop**: business senders can now book up to 5 stops per delivery, auto-optimised by Google.\n- **Live earnings**: drivers see today / this week / pending / available in one place.\n- **Package categories**: 16 new types from documents to live animals, each with vehicle-safety rules.\n- **Loyalty tier engine**: bronze → silver → gold → platinum, with redemption for booking fee discount.',
    category: 'release',
    sortOrder: 100,
  },

  // ── First news article ───────────────────────────────────────────────────
  {
    type:  WebContentType.ARTICLE,
    slug:  'welcome-to-seirs',
    title: 'SEIRS: building the logistics layer Nigeria has been missing',
    excerpt: 'Why we are betting that the same approach that made Flutterwave dominant in payments can work for last-mile delivery.',
    body:  'Last-mile delivery in Nigeria is fragmented. Every e-commerce shop has built its own ad-hoc dispatch. Every restaurant has a guy on an okada. Every wholesaler has a keke arrangement.\n\nSEIRS is building one rail every business and every consumer can use. One app for sending, one app for driving, one dashboard for partner stores. Flutterwave-style infrastructure for everything that moves.\n\nWe launch in Lagos first. Then Abuja, Ibadan, Port Harcourt. Then every state.',
    category: 'news',
    sortOrder: 0,
  },
];
