import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index, Unique,
} from 'typeorm';

// Spec V8 — public website CMS. Distinct from CmsItem (which targets
// in-app banners/stories/promotions); WebsiteContent powers the
// marketing site at seirs.app — news articles, FAQ, changelog, and
// the inline "page block" copy chunks that replace hardcoded headers
// on the homepage / how-it-works pages.
//
// Renderer (apps/seirs-website) reads via the public endpoint with
// Next.js ISR (revalidate: 60), so a publish appears within ~1 min.

export enum WebContentType {
  ARTICLE    = 'article',       // /news/[slug] — blog + news + press
  CHANGELOG  = 'changelog',     // /changelog page entries
  FAQ        = 'faq',           // /faq page entries
  PAGE_BLOCK = 'page_block',    // inline copy block — slug = "home_hero", etc.
}

export enum WebContentStatus {
  DRAFT     = 'draft',
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
  lang: string;        // 'en' | 'yo' | 'ig' | 'ha' — schema-ready for i18n; UI ships en-only

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

  // SEO meta — falls back to title + excerpt when blank.
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

  // For SCHEDULED rows — the cron flips them to PUBLISHED when this ≤ now.
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
