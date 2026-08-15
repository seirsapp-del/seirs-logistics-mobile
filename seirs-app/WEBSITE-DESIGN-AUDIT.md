# SEIRS website: design audit

**Date:** 2026-08-15
**Method:** every page captured and measured at 360x740 (Samsung A30) and
1440x900, via Playwright driving real Chrome. Four reference sites measured
the same way. Numbers, not impressions.

**Scope note:** this is the audit, not the rebuild. Nothing here has been
applied. It exists so the redesign starts from an agreed standard instead of
another round of section-by-section nudging.

---

## 1. What the measurements actually say

### SEIRS, phone (360px)

| Page | h1 size | distinct font sizes | page height |
|---|---|---|---|
| home | 26px | 12 | 8,825px |
| how-it-works | 28px | 11 | 7,294px |
| for-business | 28px | 10 | 9,033px |
| for-drivers | 28px | 10 | 9,755px |
| partner-stores | 28px | 11 | 9,731px |
| track | 28px | **6** | **2,206px** |
| find-a-partner | 30px | 7 | 2,635px |
| news | 36px | 7 | 7,036px |
| faq | 36px | 7 | 2,202px |
| contact | 36px | 7 | 4,543px |
| careers | 36px | 6 | 2,377px |

### SEIRS, desktop (1440px)

h1 is 60px on the five marketing pages, 48px on track / find-a-partner / news
/ faq / careers, and **36px on contact**.

### Reference sites, same 360px viewport

| Site | biggest text | distinct font sizes | page height |
|---|---|---|---|
| Paystack | 40px | 4 | 1,036px |
| Flutterwave | 50px | 14 | 9,717px |
| Stripe | 34px | 13 | 20,326px |
| DHL | blocked automated access | | |

---

## 2. Where the evidence is strong

### 2.1 The hero headline is too small on a phone

SEIRS home leads at **26px**. Every reference leads bigger: Stripe 34,
Paystack 40, Flutterwave 50. This is the single clearest gap, and it is the
one a visitor feels in the first second.

The cause is known and specific. The phone hero holds two columns, so the
copy column is ~181px wide and the headline is capped by what fits beside the
okada. Every other cramped value on that screen follows from it: 12px body,
9px trust labels, "Send" stranded on its own line.

### 2.2 There is no type scale, and it shows as inconsistency

Five different h1 sizes across the phone pages (26, 28, 30, 36) and three
across desktop (36, 48, 60). Nothing chose those numbers together; they
accumulated page by page.

The clearest symptom: **contact's desktop h1 is 36px while its siblings are
48-60px.** Nobody decided that. It is what happens without a scale.

### 2.3 The pages I rebuilt score best

`track` is the newest page and the only one built in one pass against a
single idea: **6 font sizes, 2,206px tall**. The marketing pages that grew
section by section run 10-12 font sizes and 7,000-9,700px.

That is the argument for a system, made from our own codebase.

---

## 3. Where the evidence does NOT support the complaint

Being straight about this, because the case is weaker than it first looked.

**Page length is not the differentiator.** Flutterwave's mobile homepage is
9,717px, essentially identical to our 9,755px worst case. Stripe's is 20,326px,
more than twice ours. Long marketing pages are normal.

**Font-size count is not the differentiator either.** Flutterwave uses 14
distinct sizes and Stripe 13, both *more* than our homepage's 12.

So "our pages are too long and use too many sizes" is not true against these
references. What is true is that our sizes are not *related* to each other,
and theirs are. A scale can have many steps; it just cannot have arbitrary
ones.

**What this means for the rebuild:** the goal is not fewer sizes or shorter
pages. It is a defined scale, applied consistently, with a much larger top
end on mobile.

---

## 4. Proposed standard

### 4.1 Type scale

One scale, used everywhere. Mobile grows rather than shrinks.

| Role | Phone | Desktop |
|---|---|---|
| Display (hero h1) | 40px | 64px |
| Page title (h1) | 32px | 48px |
| Section title (h2) | 26px | 36px |
| Subsection (h3) | 18px | 20px |
| Body large | 17px | 18px |
| Body | 15px | 16px |
| Caption | 13px | 14px |

Floor: **nothing below 13px, ever.** Today we ship 9px trust labels and 10px
chip text.

### 4.2 Spacing scale

Section padding, phone / desktop: `48 / 96`. Between blocks: `24 / 40`.
Inside a card: `20 / 28`. No hand-tuned one-off values, which is what the
current per-section padding is.

### 4.3 Mobile layout rule

**Phones get one column.** No exceptions in the hero. The two-column phone
hero is the root cause of section 2.1 and should be the first thing reversed.

### 4.4 Colour

The existing navy / sky / yellow palette is not the problem and should stay:
it is distinctive and it is already the app's identity. What is missing is
*consistent application*. Yellow currently appears as `#FFBE0B` in the hero
chip and as `text-warning-amber` elsewhere, sky as both `text-sky` and
`#3A7BD5`. One token set, referenced everywhere.

Contrast to verify during the rebuild: white/60 and white/65 body text on
navy is borderline at small sizes and should be checked against WCAG AA once
the type sizes change.

---

## 5. Placeholder images, admin-replaceable

Every image in the rebuild uses an admin slot, following the pattern already
established (`img_*` page blocks, and `img_partner_logo_*` which is uncapped).

Existing slots stay as they are. New ones needed:

| Slot | Purpose |
|---|---|
| `img_hero_phone` | Hero visual sized for a one-column phone layout |
| `img_section_business` | Business section band |
| `img_section_drivers` | Driver section band |
| `img_cta_band` | Closing CTA background |

Rule carried forward from today: every stand-in is registered in
`lib/launch.ts` under `LAUNCH_CHECKLIST` so launch is a data swap.

---

## 6. Order of work

1. **Type and spacing tokens** in `globals.css` and the Tailwind config. One
   commit, no visual sign-off needed, since it only defines the vocabulary.
2. **Homepage hero to one column** with the 40px display size. This is the
   biggest single visual change and needs founder eyes before anything else
   follows it.
3. **Roll the scale through** the remaining pages once the hero is approved.
4. **Contact page desktop h1** to 48px with the rest.
5. **Colour token consolidation**, then a contrast pass at the new sizes.
6. **Verify every page** at 360 and 1440 before each push.

Estimated: 15-25 hours of working time. Steps 2 onward each need review,
because six design decisions today were overruled by the founder and every
one of those reversals was right.

---

## 7. Artefacts

Screenshots and raw measurements are in the scratchpad under `audit/`:
22 SEIRS captures (11 pages x 2 viewports), 3 reference captures, and
`measurements.json`. These are working files, not committed to the repo.
