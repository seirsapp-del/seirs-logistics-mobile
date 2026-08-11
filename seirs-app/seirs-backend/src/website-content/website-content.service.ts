import {
  BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { WebsiteContent, WebContentStatus, WebContentType } from './website-content.entity';
import { ContactSubmission, ContactStatus, ContactSubject } from './contact-submission.entity';

// Slugs are URL-safe identifiers - lowercase alphanumerics + hyphens,
// 2-120 chars. Keep it strict to avoid Next.js dynamic route ambiguity.
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,118}[a-z0-9])?$/;

@Injectable()
export class WebsiteContentService implements OnModuleInit {
  private readonly logger = new Logger(WebsiteContentService.name);

  constructor(
    @InjectRepository(WebsiteContent)    private repo:        Repository<WebsiteContent>,
    @InjectRepository(ContactSubmission) private contactRepo: Repository<ContactSubmission>,
  ) {}

  // ── Spec V8 §3.13 - Public contact form (W7) ─────────────────────────────

  async submitContact(input: {
    name: string;
    email: string;
    phone?: string;
    subject: ContactSubject;
    message: string;
    sourceIp?: string;
    userAgent?: string;
  }) {
    const name    = input.name?.trim();
    const email   = input.email?.trim().toLowerCase();
    const message = input.message?.trim();
    if (!name || name.length < 2)       throw new BadRequestException('Name required.');
    if (!email || !/.+@.+\..+/.test(email)) throw new BadRequestException('Valid email required.');
    if (!message || message.length < 12) throw new BadRequestException('Message must be at least 12 characters.');
    if (message.length > 5000)           throw new BadRequestException('Message too long (max 5000 chars).');

    const subject = Object.values(ContactSubject).includes(input.subject)
      ? input.subject : ContactSubject.GENERAL;

    const row = this.contactRepo.create({
      name, email, phone: input.phone?.trim() ?? null as any,
      subject, message, sourceIp: input.sourceIp, userAgent: input.userAgent,
    });
    const saved = await this.contactRepo.save(row);

    // Email fan-out is a follow-up - for now the row sits in the table
    // and admin can pull it from /admin/contact-submissions. When mail
    // routing is wired, dispatch to subject-specific inboxes (support@
    // business@ legal@ etc.) based on `subject`.
    this.logger.log(`CONTACT_SUBMISSION id=${saved.id} subject=${subject} from="${email}"`);
    return { ok: true, id: saved.id };
  }

  listContactSubmissions(opts: { status?: ContactStatus; page?: number } = {}) {
    const page  = opts.page ?? 1;
    const take  = 50;
    const where = opts.status ? { status: opts.status } : {};
    return this.contactRepo.findAndCount({
      where, order: { createdAt: 'DESC' }, take, skip: (page - 1) * take,
    }).then(([items, total]) => ({ items, total, page, take }));
  }

  async updateContactSubmission(id: string, body: { status?: ContactStatus; internalNote?: string }) {
    const row = await this.contactRepo.findOne({ where: { id } });
    if (!row) throw new NotFoundException('Submission not found.');
    if (body.status       !== undefined) row.status       = body.status;
    if (body.internalNote !== undefined) row.internalNote = body.internalNote;
    return this.contactRepo.save(row);
  }

  // Idempotent seed - only inserts rows that don't already exist by
  // (type, slug, lang). Lets us ship sensible defaults so the website
  // doesn't render an empty /faq or /news on first boot.
  async onModuleInit() {
    const existing = await this.repo.count();
    if (existing === 0) {
      const rows = SEED.map(s => this.repo.create({
        ...s,
        status:      WebContentStatus.PUBLISHED,
        publishedAt: new Date(),
      }));
      await this.repo.save(rows);
      this.logger.log(`Seeded ${rows.length} website content rows`);
    }
    // Image slots seed independently of the main seed (which only runs
    // on an empty table): prod already has rows, so missing slots are
    // inserted by slug like the Fee Catalogue's missing-key sweep.
    await this.ensureImageSlots();
  }

  // ── Admin-managed image slots (founder 2026-08-11) ────────────────────
  // Every marketing-site image is a PAGE_BLOCK row with an img_* slug:
  // title = human label, excerpt = what-goes-where instructions shown in
  // the admin UI, coverImageUrl = the image. Admin swaps images without
  // a deploy; the site falls back to its built-in illustration when a
  // slot is empty.
  private async ensureImageSlots() {
    try {
      const existing = await this.repo.find({
        where: { type: WebContentType.PAGE_BLOCK },
        select: ['slug'],
      });
      const have = new Set(existing.map(r => r.slug));
      const missing = IMAGE_SLOTS.filter(s => !have.has(s.slug));
      if (missing.length === 0) return;
      await this.repo.save(missing.map(s => this.repo.create({
        type:        WebContentType.PAGE_BLOCK,
        lang:        'en',
        status:      WebContentStatus.PUBLISHED,
        publishedAt: new Date(),
        body:        s.excerpt!,
        ...s,
      })));
      this.logger.log(`Seeded ${missing.length} website image slot(s)`);
    } catch (e: any) {
      this.logger.warn(`image-slot seed skipped: ${e?.message ?? e}`);
    }
  }

  // Public: all image slots in one shot for the website renderer.
  async getImageSlots(): Promise<Record<string, string>> {
    const rows = await this.repo
      .createQueryBuilder('c')
      .where('c.type = :t', { t: WebContentType.PAGE_BLOCK })
      .andWhere(`c.slug LIKE 'img_%'`)
      .andWhere('c.status = :s', { s: WebContentStatus.PUBLISHED })
      .andWhere('c.coverImageUrl IS NOT NULL')
      .getMany();
    const map: Record<string, string> = {};
    for (const r of rows) map[r.slug] = r.coverImageUrl!;
    return map;
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

  // PAGE_BLOCK lookup - returns the row OR null (so the website can
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

// ── Image slots: one row per marketing-site image (founder 2026-08-11).
// excerpt doubles as the admin's what-goes-where instruction card AND
// the generation brief (matches Desktop\seirs-image-prompts.txt names).
const IMAGE_SLOTS: Array<Partial<WebsiteContent>> = [
  { slug: 'img_hero_rider',     title: 'Homepage hero: okada rider',
    excerpt: 'Full-width homepage hero backdrop. Okada rider with yellow delivery box, Lagos dusk. Wide 21:9. Midjourney file: hero-rider. Falls back to the drawn okada scene when empty.' },
  { slug: 'img_step_book',      title: 'How It Works step 1: booking',
    excerpt: 'How-it-works card 1 (homepage + how-it-works page). Hands booking on a phone in a Lagos shop. 4:3. Midjourney file: step-book.' },
  { slug: 'img_step_pickup',    title: 'How It Works step 2: pickup',
    excerpt: 'How-it-works card 2. Rider receiving a yellow-taped parcel at a gate, golden hour. 4:3. Midjourney file: step-pickup.' },
  { slug: 'img_step_delivered', title: 'How It Works step 3: delivered',
    excerpt: 'How-it-works card 3. Recipient receiving a parcel at the door, warm light. 4:3. Midjourney file: step-delivered.' },
  { slug: 'img_business_owner', title: 'For Business: shop owner packing',
    excerpt: 'For Businesses section (homepage + for-business page). Businesswoman packing orders in her small shop. 16:9. Midjourney file: business-owner.' },
  { slug: 'img_driver_portrait', title: 'For Drivers: courier portrait',
    excerpt: 'For Drivers section (homepage + for-drivers page). Proud courier holding helmet beside his motorcycle, dusk. Portrait 3:4. Midjourney file: driver-portrait.' },
  { slug: 'img_night_rider',    title: '24/7 section: night rider',
    excerpt: 'The night-delivery section. Rider on a quiet Lagos street at night under warm shop lights. 16:9. Midjourney file: night-rider.' },
  { slug: 'img_partner_store',  title: 'Partner Stores: shopkeeper handoff',
    excerpt: 'Partner Stores section (homepage + for-partner-stores page). Shopkeeper handing a parcel across the counter. 16:9. Midjourney file: partner-store.' },
  { slug: 'img_interstate',     title: 'Coverage band: interstate dawn',
    excerpt: 'Interstate/coverage band. Lone motorcycle with cargo box on an open highway at dawn. Wide 21:9. Midjourney file: interstate.' },
  { slug: 'img_handoff_hands',  title: 'CTA band: package handoff close-up',
    excerpt: 'Call-to-action band background. Close-up of hands exchanging a yellow-taped package. Wide 21:9, will be darkened for text overlay. Midjourney file: handoff-hands.' },
  { slug: 'img_lagos_dusk',     title: 'Story band: Lagos aerial dusk',
    excerpt: 'About/story band background. Aerial Lagos at dusk, Third Mainland Bridge light trails. Wide 21:9, will be darkened for text overlay. Midjourney file: lagos-dusk.' },
  // Batch 2 (founder 2026-08-11: audience pages need their own imagery).
  { slug: 'img_business_csv',   title: 'For Business page: bulk orders desk',
    excerpt: 'for-business page, CSV/bulk section. Laptop + neat parcel stack on a Lagos shop back-office desk. 16:9. Midjourney file: business-csv.' },
  { slug: 'img_business_team',  title: 'For Business page: team at work',
    excerpt: 'for-business page, team-roles section. Two colleagues reviewing orders on a tablet in a small business. 16:9. Midjourney file: business-team.' },
  { slug: 'img_driver_earnings', title: 'For Drivers page: payday moment',
    excerpt: 'for-drivers page, earnings section. Rider checking his phone with a satisfied look, parked roadside. 4:3. Midjourney file: driver-earnings.' },
  { slug: 'img_driver_kyc',     title: 'For Drivers page: verification',
    excerpt: 'for-drivers page, get-verified section. Close-up of hands holding a Nigerian driver licence and phone. 4:3. Midjourney file: driver-kyc.' },
  { slug: 'img_store_counter',  title: 'Partner Stores page: receiving counter',
    excerpt: 'for-partner-stores page, how-receiving-works section. Parcels being logged at a shop counter. 16:9. Midjourney file: store-counter.' },
  { slug: 'img_store_shelf',    title: 'Partner Stores page: package shelf',
    excerpt: 'for-partner-stores page, storage section. Tidy shelf of yellow-taped parcels in a shop corner. 4:3. Midjourney file: store-shelf.' },
  { slug: 'img_careers_team',   title: 'Careers page: the team',
    excerpt: 'careers page hero band. Young Nigerian tech team collaborating in a bright office. 21:9, darkened for text overlay. Midjourney file: careers-team.' },
  { slug: 'img_contact_lagos',  title: 'Contact page: Lagos street',
    excerpt: 'contact page side image. Colourful Lagos market street, welcoming daytime energy. 3:4. Midjourney file: contact-lagos.' },
  { slug: 'img_testimonial_band', title: 'Testimonials: community backdrop',
    excerpt: 'homepage testimonial section backdrop. Soft-focus Lagos street life, okada + danfo energy. 21:9, heavily blurred/darkened. Midjourney file: testimonial-band.' },
  { slug: 'img_app_hand',       title: 'Download band: phone in hand',
    excerpt: 'app-download band. Hand holding a phone seen from behind at an angle (screen NOT visible; the real app screenshot is composited separately). 4:3. Midjourney file: app-hand.' },
  // Batch 3 (founder 2026-08-11: storytelling - what Nigeria moves,
  // mirroring the app's real service categories; nothing international).
  { slug: 'img_move_farm',      title: 'What we move: farm produce',
    excerpt: 'homepage "What Nigeria Moves" tile. Fresh produce baskets at a Lagos market stall, dawn light. 4:3. Midjourney file: move-farm.' },
  { slug: 'img_move_trader',    title: 'What we move: market traders',
    excerpt: 'story tile. Market trader packing customer orders in her stall, fabrics and goods around. 4:3. Midjourney file: move-trader.' },
  { slug: 'img_move_tailor',    title: 'What we move: tailors + fashion',
    excerpt: 'story tile. Tailor folding finished aso-ebi outfits into a delivery bag, sewing machine behind. 4:3. Midjourney file: move-tailor.' },
  { slug: 'img_move_wood',      title: 'What we move: furniture + woodwork',
    excerpt: 'story tile. Carpenter finishing a chair in his workshop, wood shavings, warm light. 4:3. Midjourney file: move-wood.' },
  { slug: 'img_move_food',      title: 'What we move: hot food',
    excerpt: 'story tile. Steaming Nigerian food (jollof/amala) being sealed into a delivery pack. 4:3. Midjourney file: move-food.' },
  { slug: 'img_move_medical',   title: 'What we move: medical supplies',
    excerpt: 'story tile. Pharmacist handing over a sealed medicine package at the counter. 4:3. Midjourney file: move-medical.' },
  { slug: 'img_move_electronics', title: 'What we move: fragile + electronics',
    excerpt: 'story tile. Phone/laptop being bubble-wrapped carefully on a shop counter. 4:3. Midjourney file: move-electronics.' },
  { slug: 'img_move_documents', title: 'What we move: documents',
    excerpt: 'story tile. Envelope and stamped documents handed across an office desk. 4:3. Midjourney file: move-documents.' },
  { slug: 'img_move_building',  title: 'What we move: building materials',
    excerpt: 'story tile. Cement bags and cables loaded for a building site, keke/small truck. 4:3. Midjourney file: move-building.' },
  { slug: 'img_move_animals',   title: 'What we move: live animals',
    excerpt: 'story tile. Healthy chickens in a ventilated transport crate, market setting. 4:3. Midjourney file: move-animals.' },
];

// ── Seed data - sensible defaults so the website ships non-empty ────────────
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
    body:  'Card, bank transfer, USSD, or wallet - all powered by Flutterwave. Earn loyalty points on every delivery.',
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
    body:  'Card, bank transfer, USSD, and saved wallet balance - all processed by Flutterwave. We do not accept cash on delivery.',
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
