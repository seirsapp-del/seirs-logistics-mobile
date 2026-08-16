# SEIRS Website: navigation and CTA audit

Scope: `apps/seirs-website` only. Analysis and recommendation. No files changed.
Date: 2026-08-14. Verified against the live public API (content counts, partner directory) on the same day.

---

## TL;DR

**15 of the site's CTAs point at `/contact`.** That includes "Start Sending", "Get the Customer App", "Get Started Today" and "Talk to Sales" (the last two sit side by side in the same banner, going to the same URL). The contact form is the only working intake the site has, so routing there is not wrong in itself. What is wrong is that the **labels promise an action the destination does not perform**, and the form does not even know which audience sent the visitor: every arrival lands on "General Enquiry".

The single biggest structural problem is not any one button. It is that the site asks a phone visitor to pick between four audiences, five separate times, and never tells them which one is the default. **The default should be "I want to send something."**

Second biggest: `/track/[code]` is fully built and working, and **nothing on the site links to it.** There is no `/track` index, so the "seirs.app/track" text on the Find a Partner page points at a 404.

---

## 1. Full inventory

### Global chrome (every page)

| Element | Location | Current destination | What a user expects |
|---|---|---|---|
| Logo lockup | `Nav.tsx:63` | `/` | Home. Correct. |
| How it Works | `Nav.tsx:9` | `/how-it-works` | Correct. |
| Find a Partner | `Nav.tsx:10` | `/find-a-partner` | A list of nearby stores. **Directory currently returns 0 partners.** |
| For Business | `Nav.tsx:11` | `/for-business` | Correct. |
| For Drivers | `Nav.tsx:12` | `/for-drivers` | Correct. |
| Partner Stores | `Nav.tsx:13` | `/for-partner-stores` | Correct. |
| News | `Nav.tsx:14` | `/news` | Correct. 12 articles published. |
| Contact | `Nav.tsx:15` | `/contact` | Correct. |
| **Get Started** (desktop) | `Nav.tsx:84` | `/contact` | Sign up, or get the app. **Mismatch**, and it duplicates the "Contact" link two slots away. |
| **Get Started** (mobile) | `Nav.tsx:118` | `/contact` | Same mismatch. |
| Hamburger | `Nav.tsx:93` | Opens sheet | Correct. |
| `LangSwitcher` | `Nav.tsx:139-210` | **Never rendered** | Dead code, 72 lines. Intentionally unmounted (comment at `Nav.tsx:80`), but it is unreferenced. |

### Footer

| Element | Location | Current destination | What a user expects |
|---|---|---|---|
| Logo | `Footer.tsx:13` | `/` | Correct. |
| 8 company links | `Footer.tsx:34-42` | Their pages | Correct. Careers renders an empty state: **0 job listings published**. |
| Privacy / Terms | `Footer.tsx:62-64`, `:131`, `:138` | Correct pages | Correct, but duplicated in the bottom bar. |
| Careers (bottom bar) | `Footer.tsx:145` | `/careers` | Duplicate of the Company column link. |
| `support@seirs.co` | `Footer.tsx:86` | `mailto:` | Correct. |
| `business@seirs.co` | `Footer.tsx:95` | `mailto:` | Correct. |
| **`+234 800 000 0000`** | `Footer.tsx:104` | `tel:+2348000000000` | **Placeholder number. Dials nothing.** The contact page already removed this exact number as dishonest (`contact/page.tsx:43-45`); the footer is the surviving copy. |
| App Store badge | `AppStoreBadges.tsx:33` | `null` -> `<span aria-disabled>` | **Nothing happens on tap.** No feedback, no next step. |
| Google Play badge | `AppStoreBadges.tsx:38` | `null` -> same | Same. |

Note on the badges: `Badge()` at `AppStoreBadges.tsx:67` renders a bare `<span aria-disabled>` when the env URL is unset. `aria-disabled` on a `span` has no role to attach to, so assistive tech announces nothing at all. The `app` prop (`'driver' | 'business'`) is never passed anywhere.

### Home page (`src/app/page.tsx`)

| Element | Location | Current destination | What a user expects |
|---|---|---|---|
| **Start Sending** | `page.tsx:335` | `/contact` | To start sending a package. **This is the one the founder found.** |
| Become a Driver | `page.tsx:342` | `/for-drivers` | Correct. The only hero CTA on the site that does the right thing. |
| Language story chip | `page.tsx:355` | `/news/speaking-nigerian-languages` | Correct. Article is published. |
| Open a Business Account | `page.tsx:473` | `/contact` | To open an account. **Mismatch.** |
| Join as a Driver | `page.tsx:589` | `/contact` | **Inconsistent**: the hero's driver CTA goes to `/for-drivers`, this one goes to `/contact`. |
| 10 mosaic tiles | `page.tsx:630` | `/news/<slug>` | Correct. All 10 slugs verified published. |
| Apply as Partner Store | `page.tsx:882` | `/contact` | **Inconsistent** with the nav's Partner Stores link. |
| Get Started Today | `page.tsx:952` | `/contact` | **Mismatch.** |
| Talk to Sales | `page.tsx:959` | `/contact` | **Two adjacent buttons, one destination.** Worst offender on the site. |
| Section anchors `#how-it-works`, `#for-business`, `#for-drivers`, `#partner-stores` | `page.tsx:407`, `:455`, `:527`, `:810` | n/a | **Nothing links to them.** Dead ids. |

### Audience pages (all via `PageHero` / `PageCta`)

| Page | CTA | Location | Destination | Verdict |
|---|---|---|---|---|
| How it Works | **Get the Customer App** | `how-it-works:93` | `/contact` | **Label is false.** There is no app to get. |
| How it Works | Become a Driver | `how-it-works:95` | `/for-drivers` | Correct. |
| How it Works | Get Started (`PageCta`) | `how-it-works:239` | `/contact` | Mismatch. Subtitle also claims you can "place your first delivery in under two minutes". |
| For Business | Talk to our team | `for-business:80` | `/contact` | **Correct.** Label matches destination. |
| For Business | Become a partner store | `for-business:82` | `/for-partner-stores` | Correct. |
| For Business | Read more about Partner Stores | `for-business:248` | `/for-partner-stores` | Correct target, but uses a raw `<a>` instead of `<Link>`: full page reload. |
| For Business | Book a demo (`PageCta`) | `for-business:283` | `/contact` | Partial. There is no calendar; it is the same generic form, and the form has no phone field. |
| For Drivers | Apply to drive | `for-drivers:125` | `/contact` | Partial. The form is the real intake pre-launch, but nothing on the form says so. |
| For Drivers | See how it works | `for-drivers:127` | `/how-it-works` | Correct. |
| For Drivers | Apply to drive (`PageCta`) | `for-drivers:371` | `/contact` | Same. |
| Partner Stores | Apply to be a partner | `for-partner-stores:93` | `/contact` | Same. |
| Partner Stores | See how it works | `for-partner-stores:95` | `/how-it-works` | Correct. |
| Partner Stores | Apply to be a partner (`PageCta`) | `for-partner-stores:336` | `/contact` | Same. |

### Contact page

| Element | Location | Destination | Verdict |
|---|---|---|---|
| General Support card | `contact:19` | `mailto:support@seirs.co` | Correct. |
| Business Enquiries card | `contact:29` | `mailto:business@seirs.co` | Correct. |
| Legal & Privacy card | `contact:37` | `mailto:legal@seirs.co` | Correct. |
| **Urgent Delivery Issues card** | `contact:48` | `/how-it-works` | **Mismatch.** Card says "Open Contact Support inside any SEIRS app", then navigates to a marketing page that never mentions in-app support, for an app nobody can install yet. |
| Submit | `contact:260` | `POST /website/contact` | **Working.** Subject values match the backend `ContactSubject` enum exactly. |
| Send another message | `contact:156` | Resets form | Correct. |
| Subject dropdown | `contact:215` | Local state only | **Does not read `?subject=`.** Every one of the 15 inbound CTAs lands on "General Enquiry". |

The backend accepts an optional `phone` field (`website-content.controller.ts:143`); the form does not collect it. In Nigeria that is the field most likely to actually get someone called back.

### Find a Partner

| Element | Location | Destination | Verdict |
|---|---|---|---|
| Search input | `find-a-partner:155` | Debounced API query | Working. |
| Nearest to me | `find-a-partner:163` | Browser geolocation | Working, degrades correctly on deny. |
| Want to become a partner? | `find-a-partner:190` | `/for-partner-stores` | Correct. |
| Clear search | `find-a-partner:212` | Resets query | Correct. |
| Store phone | `find-a-partner:260` | `tel:` | Correct. |
| Get directions | `find-a-partner:271` | Google Maps, new tab | Correct. |
| How it works | `find-a-partner:294` | `/how-it-works` | Correct. |
| For businesses | `find-a-partner:300` | `/for-business` | Correct. |
| **"seirs.app/track"** | `find-a-partner:291` | **Plain text, not a link** | And `/track` has no index route, so typing it 404s. |

**The directory returns 0 partners.** A top-level nav slot currently leads to "0 partners in the network".

### Everything else

| Element | Location | Destination | Verdict |
|---|---|---|---|
| Track: Back to Seirs | `track/[code]:162` | `/` | Correct. |
| Track: Refresh | `track/[code]:191` | Refetch | Correct. |
| News cards | `news:39` | `/news/<slug>` | Correct. |
| Article: All stories | `news/[slug]:103` | `/news` | Correct. |
| Article: See how it works | `news/[slug]:148` | `/how-it-works` | Correct. |
| Related article cards | `news/[slug]:160` | `/news/<slug>` | Correct. |
| Careers: role cards | `careers:48` | `/careers/<slug>` | Correct. 0 roles published, empty state shows. |
| Careers: `careers@seirs.co` | `careers:42`, `careers/[slug]:76` | `mailto:` | Correct, subject prefilled on the role page. |
| Privacy/Terms TOC | `privacy:88`, `terms:102` | `#section-N` | Correct. |
| External: flutterwave, ndpc.gov.ng | `privacy:185`, `:313` | External, new tab | Correct. |
| 404: Back to Home | `not-found:14` | `/` | Correct. |
| Cookie banner | `CookieBanner:48/57/63` | localStorage | Correct. Privacy link works. |
| Reset password: Open app | `reset-password:118` | `seirscustomer://` etc. | Correct, and it already tells the user what to do if the button does nothing. |
| Markdown links in CMS body | `cms.ts:161` | Whatever the editor typed, `target="_blank"` | Unvalidated, but editor-controlled. Acceptable. |

### Orphan pages: live, crawlable, in the sitemap, linked from nowhere

| Page | Status | Note |
|---|---|---|
| `/faq` | **3 entries published** | Not in nav, not in footer. It is in `sitemap.ts:25`. This is free support deflection sitting unused. |
| `/changelog` | **1 entry published** | Not linked anywhere. In `sitemap.ts:26`. |
| `/track/[code]` | Working | Not linked anywhere. No index route. |
| `/lottie-preview` | Working, `force-dynamic` | **Dev tool shipped to production.** Reads the filesystem on every request. Its own header says "don't link from production nav". Delete it. |
| `/reset-password` | Working | Correctly unlinked: it is deep-linked from email. |

### Two plumbing issues worth fixing in the same pass

1. **Split API env var.** `cms.ts:9` and `contact/page.tsx:77` read `NEXT_PUBLIC_API_BASE_URL`. `find-a-partner:28`, `track/[code]:24` and `reset-password:20` read `NEXT_PUBLIC_API_URL`. Both fall back to the same Railway URL, so it works today. Set one of them on Vercel and half the site silently breaks. Unify on `NEXT_PUBLIC_API_BASE_URL`.
2. **Three different canonical domains.** `layout.tsx:26` says `seirs-website.vercel.app`, `sitemap.ts:9` defaults to `seirs.app`, `CookieBanner:42` says "seirs.app". Pick one and set `NEXT_PUBLIC_SITE_URL`.

---

## 2. Mismatches, ranked

| # | Problem | Severity |
|---|---|---|
| 1 | "Start Sending" -> contact form. Label promises the core product action, delivers a support form. | High |
| 2 | "Get the Customer App" -> contact form. There is no app to get. | High |
| 3 | "Get Started Today" and "Talk to Sales" are two adjacent buttons with the same href. | High |
| 4 | Contact form ignores `?subject=`, so 15 CTAs all arrive tagged "General Enquiry". Every lead is untriaged. | High |
| 5 | Tracking is built, working, and unreachable. No `/track` index, no nav entry, and the one on-page reference is dead plain text. | High |
| 6 | Footer dials a placeholder phone number. | High (trust) |
| 7 | App store badges look tappable, do nothing, offer no alternative. | Medium |
| 8 | "Find a Partner" holds a top-level nav slot and shows 0 results. | Medium |
| 9 | Driver CTA goes to `/for-drivers` in the hero and `/contact` further down the same page. Same for partner stores. | Medium |
| 10 | "Urgent Delivery Issues" contact card points at `/how-it-works`. | Medium |
| 11 | `/faq` (3 answers) and `/changelog` are orphaned. | Medium |
| 12 | `/lottie-preview` dev tool is live in production. | Medium |
| 13 | Four unreferenced section anchor ids on the home page. | Low |
| 14 | `for-business:248` uses `<a>` where `<Link>` belongs: full reload. | Low |
| 15 | `LangSwitcher` is 72 lines of dead code. | Low |

---

## 3. The decision: what every button should do

The constraint that drives all of this: **the apps are not published, and there is no web booking flow.** So no CTA can honestly say "download" or "book now". The only working intake is `POST /website/contact`, which already writes to `contact_submissions` with a subject enum that maps one-to-one onto the four audiences. That is the asset to build on.

**The unlock is one small change to `/contact`:** read `?subject=` into initial form state (roughly ten lines, `useSearchParams`), add an optional phone field (the backend already accepts it), and change the page's heading when a subject is passed so it reads as joining rather than complaining. Every recommendation below depends on that.

On the subject enum: add `sender` to `ContactSubject` so early-access senders are a filterable bucket in the admin inbox. If the enum migration is not worth it right now, use `general` and label the option "Sending a package". Do not leave senders untagged.

### Per-CTA decisions

| CTA (current label) | New label | New destination | Why |
|---|---|---|---|
| Start Sending (hero) | **Get early access** | `/contact?subject=sender` | No app, no web booking. The only honest action is to take the email so you can tell them the day it launches. Says what it does. |
| Become a Driver (hero) | unchanged | `/for-drivers` | **Already correct.** Drivers must read the requirements (licence, NIN, insurance) before committing; that page ends in its own apply CTA. |
| Get Started (nav, desktop + mobile) | **Get early access** | `/contact?subject=sender` | Matches the hero, and stops the nav button duplicating the "Contact" link sitting two slots away. |
| Open a Business Account (home) | **See business plans** | `/for-business` | A business account is a considered decision. Send them to the page that sells it; that page already ends in "Talk to our team". Mirrors the driver path. |
| Join as a Driver (home driver band) | **Join the driver waitlist** | `/contact?subject=driver` | The requirements block sits directly above this button, so the visitor is already qualified. Sending them to `/for-drivers` would loop them back to what they just read. |
| Apply as Partner Store (home) | **Apply as a partner store** | `/contact?subject=partner` | Same reasoning: the 4-step explainer is right above it. |
| Get Started Today + Talk to Sales (footer banner) | **One** button: **Get early access** | `/contact?subject=sender` | Plus a plain text link underneath: "Running a business? Talk to sales" -> `/contact?subject=business`. Two identical buttons train people that buttons are decorative. |
| Get the Customer App (how-it-works hero) | **Notify me when the app launches** | `/contact?subject=sender` | The current label is a straight lie until a Play Store listing exists. |
| Get Started (how-it-works `PageCta`) | **Get early access** | `/contact?subject=sender` | Also rewrite the subtitle: "place your first delivery in under two minutes" is not true yet. |
| Talk to our team (for-business hero) | unchanged | `/contact?subject=business` | **Already correct**, just needs the subject tag. |
| Book a demo (for-business `PageCta`) | **Talk to our team** | `/contact?subject=business` | There is no calendar behind "book a demo". One label, one destination, across the page. |
| Apply to drive (for-drivers, both) | unchanged | `/contact?subject=driver` | Honest: pre-launch, the form **is** the application. Add a line to the form when `subject=driver`: "We will contact you to complete your KYC when driver onboarding opens." |
| Apply to be a partner (partner-stores, both) | unchanged | `/contact?subject=partner` | Same. |
| App store badges (footer) | Keep grayscale, add caption **"Coming soon. Get notified"** | Wrap in a link to `/contact?subject=sender` | Something that looks tappable must do something. This is the highest-intent moment on the page: they were reaching for the app. Keep them dimmed so nobody thinks it shipped. |
| `+234 800 000 0000` (footer) | **Delete** | n/a | The contact page already removed this exact fake number. If a real business line exists, replace it with a WhatsApp `wa.me` link, which converts far better than an email form in Nigeria. If not, remove it. |
| Urgent Delivery Issues (contact card 4) | **Delivery issues** | `mailto:support@seirs.co` | Pre-launch nobody has the app, so "open the app" is not an instruction anyone can follow. Swap to the in-app-ticket wording after launch. |

### Web flows that already work and should be linked

| Existing flow | Should be reached from | Currently reached from |
|---|---|---|
| `/track/[code]` (public tracking, live, polling) | **Nav, permanently** | Nothing |
| `/faq` (3 published answers) | Footer Company column, and the bottom of `/contact` | Nothing |
| `/changelog` | Footer, next to News | Nothing |
| `/find-a-partner` (live directory) | Nav, **once it has stores** | Nav (with 0 results) |

**Build `/track` as an index page.** One input, "Enter your tracking code", pushes to `/track/<code>`. Put **Track** in the nav. Recipients are the largest audience a Nigerian logistics site gets, they arrive already holding a code, and right now a fully working tracking page is unreachable unless someone hand-types a deep URL. It also fixes the dead "seirs.app/track" text on Find a Partner. Build it now even though there are no deliveries to track yet: the empty state is honest, and this is the permanent anchor of the post-launch site.

**Demote "Find a Partner" from the nav until the directory has stores.** A top-level slot that answers "0 partners in the network" reads as an abandoned product. Keep the page, keep it linked from `/for-partner-stores` and the footer, and re-promote it into the nav at roughly 10 live stores.

---

## 4. The IA question: who is this site for?

Right now: four audiences, four competing CTAs, no triage, and a mobile menu that hides all seven nav links behind a hamburger while the only visible action is a contact form.

### Recommendation: the primary action is "get early access as a sender"; at launch it becomes "track a delivery"

Why senders and not the others:

- They are the largest audience by volume and the **demand side**. Drivers and partner stores follow demand; supply does not bootstrap itself.
- They are the only audience that converts in one tap from a phone arriving off a social post, which is where this traffic comes from.
- Drivers and stores are a slower, considered loop: they need a requirements page and a callback, not hero real estate. They need a clear **path**, not a competing button.

### Concretely

1. **One primary CTA site-wide.** "Get early access" -> `/contact?subject=sender`. It is the nav button, the hero primary, and the single button in the footer banner. Same words in all three places.
2. **Two buttons maximum in the hero.** Primary as above, secondary stays "Become a Driver" -> `/for-drivers`.
3. **Collapse the supply-side pages into one nav item.** Replace "For Business / For Drivers / Partner Stores" with a single **"Join SEIRS"** item: a dropdown on desktop, a grouped block in the mobile sheet. Nav goes from 7 flat peers to 5:

   `How it Works` · `Join SEIRS ▾` · `Track` · `News` · `Contact` · **[Get early access]**

4. **Mobile, specifically.** Move the primary CTA to the **top** of the hamburger sheet, not the bottom. Add a three-way triage row above the links: "I want to send" / "I want to drive" / "I have a shop". And once tracking launches, keep **Track** visible in the header bar itself rather than inside the menu: a recipient holding a code should never have to open a menu.
5. **Phase 2, the homepage itself.** The page currently makes the visitor choose an audience five separate times on the way down. Put one audience-triage row near the top (Send · Drive · Partner), then let the rest of the page tell the **sender** story only, trimming the driver and partner-store bands to one section each that links out to their pages. This is a content restructure, not a link fix, so it should be a separate decision after the routing above lands.

---

## 5. Suggested order of work

**Pass 1, honesty and plumbing (small, no design decisions):**
1. Delete the placeholder phone number from `Footer.tsx:104`.
2. Delete `/lottie-preview`.
3. Fix the "Urgent Delivery Issues" card destination.
4. Unify the API env var on `NEXT_PUBLIC_API_BASE_URL`; set `NEXT_PUBLIC_SITE_URL`.
5. `<a>` to `<Link>` at `for-business:248`. Remove the dead `LangSwitcher` and the four unused section ids.

**Pass 2, make `/contact` a real intake:**
6. Read `?subject=` into initial state; add the optional phone field; adapt the heading per subject.
7. Add `sender` to `ContactSubject` (or use `general` with a "Sending a package" label).
8. Retarget and relabel all 15 CTAs per the table in section 3.
9. Make the app store badges link to `/contact?subject=sender` with the "Coming soon. Get notified" caption.

**Pass 3, IA:**
10. Build the `/track` index page; add **Track** to the nav; link the plain-text mention on Find a Partner.
11. Link `/faq` and `/changelog` from the footer; link the FAQ from the bottom of `/contact`.
12. Collapse the three audience pages under a "Join SEIRS" nav item; restructure the mobile sheet with the CTA on top and the triage row.
13. Demote "Find a Partner" from the nav until the directory has stores.

**Phase 2 (separate decision):** homepage audience triage and trimming the supply-side bands.
