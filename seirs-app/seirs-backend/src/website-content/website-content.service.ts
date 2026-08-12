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
    // Category story articles (founder 2026-08-11): each What-We-Move
    // tile links to an admin-editable article about that trade's real
    // situation and how SEIRS helps. Same missing-slug sweep.
    await this.ensureStoryArticles();
  }

  private async ensureStoryArticles() {
    try {
      const existing = await this.repo.find({
        where: { type: WebContentType.ARTICLE },
        select: ['slug'],
      });
      const have = new Set(existing.map(r => r.slug));
      const missing = STORY_ARTICLES.filter(s => !have.has(s.slug!));
      if (missing.length === 0) return;
      await this.repo.save(missing.map(s => this.repo.create({
        type:        WebContentType.ARTICLE,
        lang:        'en',
        category:    'impact',
        status:      WebContentStatus.PUBLISHED,
        publishedAt: new Date(),
        ...s,
      })));
      this.logger.log(`Seeded ${missing.length} category story article(s)`);
    } catch (e: any) {
      this.logger.warn(`story-article seed skipped: ${e?.message ?? e}`);
    }
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

  /**
   * Slides for the customer-app home carousel. Deliberately narrow:
   * only PUBLISHED stories an admin ticked featureInApp, newest first,
   * and only the fields a card needs. The app keeps its built-in cards
   * as the fallback, so an empty result is a normal state (nothing
   * featured this week), not an error.
   */
  async listFeaturedCards(limit = 4, lang = 'en') {
    const rows = await this.repo.find({
      where: {
        featureInApp: true,
        status:       WebContentStatus.PUBLISHED,
        lang,
      },
      order: { sortOrder: 'ASC', publishedAt: 'DESC' },
      take:  limit,
    });

    return {
      items: rows.map(r => ({
        id:            r.id,
        slug:          r.slug,
        title:         r.title,
        excerpt:       r.excerpt,
        coverImageUrl: r.coverImageUrl,
        category:      r.category,
        badge:         r.featureBadge ?? r.category ?? null,
        publishedAt:   r.publishedAt,
      })),
    };
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
      featureInApp:   body.featureInApp   ?? false,
      featureBadge:   body.featureBadge   ?? null,
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
    if (body.featureInApp   !== undefined) row.featureInApp   = body.featureInApp;
    if (body.featureBadge   !== undefined) row.featureBadge   = body.featureBadge;
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

// ── Category story articles (founder 2026-08-11): the What-We-Move
// tiles each link to one of these. Admin-editable like any article;
// covers start on the tile's placeholder image and upgrade with it.
// Statistics are framed with attribution and soft language: we cite
// widely-reported figures, never invent SEIRS numbers.
const STORY_ARTICLES: Array<Partial<WebsiteContent>> = [
  { slug: 'moving-farm-produce', title: 'Farm produce: beating the clock from harvest to plate',
    excerpt: 'Up to 40% of Nigeria\'s fresh produce spoils before anyone eats it. Faster, direct last-mile trips are part of the answer.',
    coverImageUrl: '/placeholders/move-farm.jpg',
    body: 'The FAO has estimated that as much as 40% of the fresh food Nigeria grows never reaches a plate: it spoils in transit, in storage, or waiting for a buyer. For a smallholder farmer, that is not a statistic, it is half a season\'s income rotting in a basket.\n\nThe biggest enemy is time. Every hour between harvest and kitchen costs freshness, and traditional distribution routes: farm to aggregator to market to hawker to home, add hours at every hop.\n\nSEIRS shortens the chain. A farmer or market seller books a rider directly from the app, the buyer tracks the trip live, and produce moves farm-to-buyer in one leg instead of four. Partner stores act as neighbourhood collection points so a working customer never misses a perishable delivery. We will not pretend an okada solves the cold-chain problem alone: but cutting the journey from all day to under two hours keeps real food out of the waste heap.' },
  { slug: 'moving-market-traders', title: 'Market traders: every stall is now a citywide shop',
    excerpt: 'Lagos market traders sell face to face. Delivery turns a stall in Balogun into a shop the whole city can buy from.',
    coverImageUrl: '/placeholders/move-trader.jpg',
    body: 'Nigeria\'s markets are engines: Balogun, Onitsha Main Market, Kano\'s Kurmi, and thousands of neighbourhood stalls between them. But a stall only earns from the people who walk past it.\n\nSocial commerce changed the selling: WhatsApp status, Instagram pages, phone orders. What did not change is the delivery problem: traders lose sales daily because "how will it reach you?" has no good answer, and unreliable dispatch eats the profit on the sales they do make.\n\nWith SEIRS a trader books from the stall in under a minute, the buyer pays into escrow so nobody is chasing transfers on trust, and the trader watches the package to the customer\'s door. Recurring templates handle the weekly restock runs. The stall stays where it is: the customers no longer have to.' },
  { slug: 'moving-tailors-fashion', title: 'Tailors and aso-ebi: delivered before the party',
    excerpt: 'A tailor\'s reputation dies the day the outfit arrives late. Reliable delivery is part of the craft now.',
    coverImageUrl: '/placeholders/move-tailor.jpg',
    body: 'Every Nigerian knows the tailor deadline drama: the wedding is Saturday, the aso-ebi was promised Thursday, and by Friday night someone is sitting in traffic holding a nylon bag and praying.\n\nFashion is one of Nigeria\'s fastest-growing creative industries, powered by tens of thousands of independent tailors and small labels. Their bottleneck is rarely the sewing: it is the last mile, done by okada negotiation at the roadside with no tracking and no recourse.\n\nSEIRS gives a tailor the same delivery machinery a big brand has: booked in the app, priced upfront, tracked by the customer, proof photo at handoff, and a receiver name so the package goes to the celebrant\'s sister and not a stranger at the gate. The craft deserves an arrival as sharp as the outfit.' },
  { slug: 'moving-furniture-woodwork', title: 'Furniture and woodwork: from bench to new flat',
    excerpt: 'Carpenters build for the whole city but deliver on borrowed trucks. Bigger vehicles on the platform change that.',
    coverImageUrl: '/placeholders/move-wood.jpg',
    body: 'From Mushin workshops to Aba\'s furniture clusters, Nigerian carpenters and woodworkers supply homes, offices, and churches across every city. The making is world-class. The moving is chaos: flag down a truck, negotiate, hope.\n\nA chair scratched in transit is a refund. A wardrobe delivered a day late is an angry landlord and a lost referral. Craftspeople carry all of that risk with no system behind them.\n\nSEIRS puts vans and trucks on the same platform as okadas: a workshop books the vehicle the job actually needs, the buyer sees the trip live, and the handoff is photographed. House-move categories cover single items to full moves. The woodworker goes back to the bench: the platform handles the road.' },
  { slug: 'moving-hot-food', title: 'Hot food: amala that arrives still steaming',
    excerpt: 'Food delivery is a trust business. Live tracking and short direct trips keep the food and the promise warm.',
    coverImageUrl: '/placeholders/move-food.jpg',
    body: 'Nigeria\'s food business runs on buka pride: the amala must land soft, the jollof must arrive with smoke still in it. Every cold delivery is a customer who never orders again.\n\nSmall food businesses: bukas, home kitchens, small chops caterers, mostly cannot afford their own riders, and shared dispatch means the food waits while other errands finish.\n\nSEIRS trips are direct: one pickup, one drop, live on the map, priced from a hot-food rate card that respects the clock. The 24/7 network matters here too: night market runs and owambe caterers work when the city eats, not when an office closes. Warm food, warm reviews.' },
  { slug: 'moving-medical-supplies', title: 'Medical supplies: deliveries that cannot wait',
    excerpt: 'When the package is medicine, logistics is healthcare. Verified riders and custody records treat it that way.',
    coverImageUrl: '/placeholders/move-medical.jpg',
    body: 'Sometimes the package is paracetamol. Sometimes it is a diabetic\'s insulin, a mother\'s antimalarials, or the test results a clinic is waiting on. Nigeria\'s pharmacies increasingly deliver: what they need is a network that understands the stakes.\n\nMedical deliveries on SEIRS ride a dedicated category: ID-verified riders, chain-of-custody records on handoff, receiver names so medicine reaches the patient or their named carer, and partner-store fallbacks so a missed knock never means a lost prescription.\n\nWe are honest about our limits: we are couriers, not a cold-chain pharma operation. But for the everyday medical mile: pharmacy to home, lab to clinic, reliably and fast at any hour, that mile is exactly what we built.' },
  { slug: 'moving-electronics', title: 'Electronics: handled like eggs, tracked like money',
    excerpt: 'Phones and laptops are the most-stolen cargo on the road. Escrow, ID handoffs, and custody records protect both ends.',
    coverImageUrl: '/placeholders/move-electronics.jpg',
    body: 'Computer Village moves a nation\'s worth of phones and laptops, and every seller has the same two nightmares: the package that "never arrived", and the buyer who claims it never did.\n\nHigh-value electronics are where delivery trust breaks down: cash-on-delivery scams, swapped devices, riders who vanish. The result is that sellers restrict delivery to buyers they already know, which is no way to grow.\n\nSEIRS was built for exactly this cargo. Payment sits in escrow until delivery is confirmed. High-value packages REQUIRE an identity-verified handoff: physical ID plus an emailed code, or SEIRS ID plus a typed name, before the driver can even mark it delivered. The fragile-electronics category prices careful handling in, and every step lands in an audit trail both sides can see.' },
  { slug: 'moving-documents', title: 'Documents: signatures across the city in an hour',
    excerpt: 'Contracts, certificates, tenders: paper still runs Nigeria. It deserves a courier with an audit trail.',
    coverImageUrl: '/placeholders/move-documents.jpg',
    body: 'For all the talk of going digital, Nigeria still runs on paper: signed contracts, original certificates, tender submissions with 4 PM deadlines, court filings that must be physically stamped.\n\nA missing document is not an inconvenience: it is a lost contract, a missed admission, a case adjourned. Yet most documents travel with whoever was available, no record, no recourse.\n\nOn SEIRS a document rides its own category: sealed, tracked, delivered to a NAMED receiver with the handoff logged. The sender watches the envelope cross the city in real time and holds proof of exactly who took delivery and when. Paper with a paper trail.' },
  { slug: 'moving-building-materials', title: 'Building materials: cement and cable, straight to site',
    excerpt: 'Construction stalls when materials do not show. Right-sized vehicles and tracked runs keep sites moving.',
    coverImageUrl: '/placeholders/move-building.jpg',
    body: 'Anyone who has built in Nigeria knows the rhythm: the workmen are on site, the money is burning daily, and everything is waiting for a delivery that "is coming". Materials logistics is where budgets and timelines go to die.\n\nSites need odd loads at odd times: ten bags of cement now, a coil of cable at noon, tiles on Saturday. Owning a truck for that makes no sense: begging for one every morning makes even less.\n\nSEIRS puts keke, vans, and trucks a booking away, priced by distance and load on the building-materials rate card. The site engineer tracks the run instead of phoning around, and the receipt lands itemised for the project file. The blocks arrive: the day\'s work happens.' },
  { slug: 'speaking-nigerian-languages', title: 'Speaking Nigerian: where our translations stand, honestly',
    excerpt: 'The apps carry Yoruba, Igbo and Hausa today. Here is exactly how good they are, and what we are doing about the gaps.',
    coverImageUrl: '/placeholders/contact-lagos.jpg',
    body: 'Nigeria speaks over 500 languages. Three of them - Yoruba, Igbo and Hausa - are first languages for the majority of the people who will use SEIRS, and English is the language of business rather than the language of home.\n\nSo the SEIRS apps ship with Yoruba, Igbo and Hausa built in. Open any of the three apps, go to Language, pick yours, and the interface changes: booking a delivery, checking earnings, reading your wallet.\n\nNow the honest part, because we would rather tell you than have you discover it.\n\n## Our translations are not finished\n\nThe current Yoruba, Igbo and Hausa text was machine-assisted, not written by native speakers. It covers most of each app, and a small number of screens still fall back to English where a phrase has not been translated yet.\n\nThat is not good enough as a final state, and we know exactly where the weak points are. Tone marks in Yoruba are inconsistent in places. Hausa loanwords for technical words like "wallet" may not match how people actually speak. Igbo has real dialect variation, and we defaulted to what reads most widely rather than making a considered choice.\n\n## What we are doing about it\n\nBefore we call any language complete, a native speaker reviews it end to end: the money screens first, because a confusing word next to a naira amount costs someone trust, then the booking flow, then everything else. Short command words on buttons get special attention: "Send", "Confirm", "Cancel" need to feel like instructions, not dictionary entries.\n\nIf you speak one of these languages well and something reads wrong inside the app, tell us. Contact support from any SEIRS app, say which screen and what it should say, and it goes straight to the person maintaining that language file. Corrections ship in the next update, and they are credited in our changelog.\n\n## What about this website?\n\nThis site is in English. Your browser will translate it into Yoruba, Igbo, Hausa or any other language it supports, and that translation is genuinely decent for reading. We would rather point you to a tool that works today than pretend we have translated every marketing page ourselves.\n\nThe apps are where the translation work matters most, because that is where you handle your money and your packages. That is where our effort goes first.' },

  { slug: 'moving-live-animals', title: 'Live animals: yes, even the Christmas chicken',
    excerpt: 'From day-old chicks to the December goat, animal transport is real Nigerian logistics: done humanely and honestly.',
    coverImageUrl: '/placeholders/move-animals.jpg',
    body: 'Every December, Nigeria\'s roads fill with chickens and goats heading to family pots, and all year round poultry farmers move day-old chicks, layers, and broilers between farms and markets. It is real commerce: rarely treated like it.\n\nAnimals are cargo that breathes. Heat, delay, and rough handling are not just cruel, they are losses: a stressed bird is a lighter bird, and a dead one is money gone.\n\nSEIRS carries live animals as their own declared category: the rider knows what they are carrying before they accept, trips are direct rather than pooled with other errands, and the short-leg model keeps time-in-transit low. From the farm gate to the market cage, or the Christmas chicken to grandma\'s compound: booked, tracked, and arriving on its feet.' },
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
