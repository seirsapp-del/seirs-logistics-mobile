import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index, Unique,
} from 'typeorm';

// Spec V8 - public website CMS. Distinct from CmsItem (which targets
// in-app banners/stories/promotions); WebsiteContent powers the
// marketing site at seirs.app - news articles, FAQ, changelog, and
// the inline "page block" copy chunks that replace hardcoded headers
// on the homepage / how-it-works pages.
//
// Renderer (apps/seirs-website) reads via the public endpoint with
// Next.js ISR (revalidate: 60), so a publish appears within ~1 min.

export enum WebContentType {
  ARTICLE     = 'article',       // /news/[slug] - blog + news + press
  CHANGELOG   = 'changelog',     // /changelog page entries
  FAQ         = 'faq',           // /faq page entries
  PAGE_BLOCK  = 'page_block',    // inline copy block - slug = "home_hero", etc.
  JOB_LISTING = 'job_listing',   // /careers/[slug] - open roles
}

export enum WebContentStatus {
  DRAFT     = 'draft',
  // Submitted by a content editor, waiting for a super admin to approve
  // (2026-08-13). The In-App CMS has had this gate since it shipped; the
  // website did not, so anyone with content permission could publish
  // straight to the live site. Same review step now applies to both.
  PENDING_APPROVAL = 'pending_approval',
  SCHEDULED = 'scheduled',
  PUBLISHED = 'published',
  ARCHIVED  = 'archived',
}

@Entity('website_content')
@Unique(['slug', 'lang'])
@Index(['type', 'status'])
@Index(['status', 'publishAt'])
export class WebsiteContent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  type: WebContentType;

  // URL slug for articles + page-block keys. Unique with lang so the
  // same slug can have multiple language translations.
  @Column({ type: 'varchar', length: 120 })
  slug: string;

  @Column({ type: 'varchar', length: 8, default: 'en' })
  lang: string;        // 'en' | 'yo' | 'ig' | 'ha' - schema-ready for i18n; UI ships en-only

  @Column()
  title: string;

  // Short blurb for cards + meta description fallback.
  @Column({ type: 'text', nullable: true })
  excerpt: string | null;

  // Markdown body. Website renders via react-markdown; FAQ + page_block
  // are usually short paragraphs, articles are long-form.
  @Column({ type: 'text' })
  body: string;

  // Cover image stored on R2 (uploadApi). Optional for FAQ/page_block.
  @Column({ type: 'text', nullable: true })
  coverImageUrl: string | null;

  // Gallery, added 2026-08-15 (founder: a success story about a farmer
  // should carry more than one picture; many Nigerians are visual
  // learners). Up to 5 additional image URLs beyond the cover, enforced
  // in the service so a fat-fingered admin call cannot store 40. The
  // website interleaves them through the article body the same way the
  // built-in illustrations already flow.
  @Column({ type: 'jsonb', nullable: true })
  galleryImages: string[] | null;

  // Optional video for the article: a YouTube link or a direct MP4 URL
  // (e.g. an interview with the farmer). The website embeds YouTube and
  // renders a <video> tag for direct files. One per article on purpose:
  // if a story needs two videos it should be two stories.
  @Column({ type: 'text', nullable: true })
  videoUrl: string | null;

  // SEO meta - falls back to title + excerpt when blank.
  @Column({ type: 'text', nullable: true })
  seoTitle: string | null;

  @Column({ type: 'text', nullable: true })
  seoDescription: string | null;

  // Article sub-category: "news", "press", "product_update", "guide", etc.
  // Used as a filter chip on the /news listing.
  @Column({ type: 'varchar', length: 40, nullable: true })
  category: string | null;

  @Index()
  @Column({ type: 'varchar', length: 20, default: WebContentStatus.DRAFT })
  status: WebContentStatus;

  // For SCHEDULED rows - the cron flips them to PUBLISHED when this ≤ now.
  @Column({ type: 'timestamptz', nullable: true })
  publishAt: Date | null;

  // Set automatically when status flips to PUBLISHED.
  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'uuid', nullable: true })
  authorUserId: string | null;

  // Sort hint for FAQ + changelog (lower shows first).
  @Column({ default: 0 })
  sortOrder: number;

  /**
   * Feature this story on the customer app home carousel (the slides
   * after the animated okada). Admin ticks this per article, so the
   * carousel is curated rather than "whatever was published last".
   * Publishing alone does NOT put a story in front of every customer.
   * The app takes the newest few featured items and falls back to its
   * built-in cards when none are flagged.
   */
  @Index()
  @Column({ default: false })
  featureInApp: boolean;

  /**
   * Optional short pill label drawn on the carousel card ("NEW OUTLET",
   * "PROMO"). Falls back to the category when blank.
   */
  @Column({ type: 'varchar', length: 24, nullable: true })
  featureBadge: string | null;

  /**
   * Special-offer window (founder 2026-08-13). A promo card should stop
   * showing when the promo ends, without anyone remembering to go and
   * untick it on the day. Both bounds optional: blank from = show
   * immediately, blank until = show until unticked.
   *
   * Separate from publishAt/status, which govern the article on the
   * website. A story can stay published and readable long after it has
   * finished occupying a carousel slot.
   */
  @Column({ type: 'timestamptz', nullable: true })
  featureFrom: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  featureUntil: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
