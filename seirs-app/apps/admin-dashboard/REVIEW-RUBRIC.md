# Admin dashboard: how to review one page

The reader of every screen in this dashboard is a SEIRS employee who is
not technical and may be on their second day. They are usually in a
hurry, often on the phone to a customer or a rider, and they will not
explore. If a thing is not visible, it does not exist to them.

Work **one page at a time**. Finish a page completely, typecheck, and
only then start the next. A half-done pass across ten pages is worth
less than one page actually finished, because nobody can tell which half
is done.

Each page gets all ten checks below. Write down the answer to check 1
before touching anything: if you cannot say what the page is for in one
sentence, you cannot judge whether it does it well.

---

## 1. What is this page FOR

Name the single job somebody opens it to do. Not "manage drivers":
"approve the riders who signed up overnight, and suspend anyone who has
become a problem".

If the page has two unrelated jobs, say so. That is usually the finding.

## 2. The first ten seconds

Open the page cold, as somebody who has never seen it. Can they tell:
- what they are looking at,
- what needs their attention right now,
- what to do first?

Every page gets a `PageIntro` with a one-sentence purpose. Pages whose
buttons carry consequences also get the dismissible `help` panel saying
what those buttons do.

## 3. Navigation: in, across, out

- **In**: how does someone arrive? Sidebar, a link from another page,
  the Ctrl+K palette. If the only route is knowing the URL, that is a
  finding.
- **Across**: from a row, can they reach the related records? A delivery
  should reach its customer, its rider, its dispute, its SOS alert. A
  dead end is a finding.
- **Out**: after acting, where do they go? A detail page needs a way
  back that does not lose the filter they came from.

Links must be next/link `Link`, never `<a href>`, which reloads the
whole app and throws away scroll position and filter state.

## 4. Is the data honest

This dashboard has repeatedly shown people numbers that were wrong. Check:
- **Pagination exists at all.** A list with a server limit and no pager
  silently hides everything past the first page.
- **Next is disabled on a computed last page**, never on
  `rows.length < N`. That test is fatal when the server returns a short
  page for any other reason.
- **The pager does not vanish on filtered views** (`{total > 20 && ...}`
  hides the count exactly when it is most wanted).
- **The count says which slice**: "Showing 21-40 of 63", not "Page 3".
- **Search actually reaches the server** and the server honours it.
- **Filters combine with AND**, so a role filter plus a search term does
  not silently become one or the other.

## 5. Language a person would say out loud

No raw database values on screen. `in_transit` is not a word. Use
`humanLabel` from `src/lib/labels.ts`.

No unexplained abbreviations, no internal slugs, no field names. If a
column needs a glossary, it needs a different label.

## 6. Actions: consequence, reversibility, direction

For every button that changes something:
- Does the screen say what will happen, **before** it is pressed?
- Does it say whether it can be undone?
- Does it say who else is affected (does the customer get an email? does
  the rider stop receiving offers?)
- **Is there a way back?** Suspend with no reactivate, reject with no
  reconsider, is a one-way door built by accident.
- Money and messages to real users: state the amount or the recipient
  count explicitly, and say it cannot be recalled.

## 7. Empty, loading and error states

- Empty must distinguish three cases: genuinely nothing to do (good
  news, say so), a filter that matched nothing (offer to clear it), and
  a failure (say what failed and offer retry). Use `EmptyState`.
- An empty compliance queue is the best news of the day. It should not
  look like a fault.
- Errors say what went wrong in plain words and what to do next.

## 8. Efficiency: count the clicks

Walk the page's main daily task and count the clicks and page loads.
- Is the most common action reachable without opening a detail page?
- Ten pending items should not mean ten dialogs. Note where a bulk
  action is missing.
- Is the information needed to make the decision on the same screen as
  the button that makes it? Sending a reviewer to another page to see
  the document they are judging is a finding.
- Can the table be sorted by the column somebody actually triages on?

## 9. How this page interacts with the rest of the app

Say what this page changes elsewhere:
- What does the customer, rider or partner see when this button is
  pressed? Do they get a push, an email, nothing?
- Which other admin screen shows the result?
- Does it move money, and if so, whose?
- Is the effect immediate or queued?

If pressing a button here changes what an app user sees and the screen
does not mention it, that is a finding.

## 10. Would a non-technical employee get this right

The final read. Hand the page to somebody who has never used it: would
they do the right thing, or would they hesitate, guess, or do damage?

Anything that would make them guess is the finding worth reporting, even
if the code is perfect.

---

## House rules

- Never the em-dash character. Colons, commas, periods, parentheses,
  regular hyphens.
- Comments explain WHY the change was needed (what was wrong for the
  person using it), not what the code does.
- Money shows two decimal places, always, so the arithmetic reconciles.
- Customers never hold a NGN balance and the word "wallet" must never
  describe one. Only riders and partner stores have withdrawable
  earnings.
- Do not widen a payload to make a screen easier. Narrow selects: a list
  endpoint returns the columns the list draws, nothing more.
