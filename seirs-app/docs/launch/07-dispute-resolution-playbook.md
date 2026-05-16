# SEIRS Dispute Resolution Playbook

**Audience:** customers, drivers, partner stores, business clients. **Publish at** https://seirs.app/dispute-resolution (TBD — currently buried in Terms of Service).

**Why this matters:** NDPR + Federal Competition and Consumer Protection Act (FCCPA) require platforms to publish a clear dispute mechanism. Failure to provide one accelerates regulatory complaints to FCCPA, which can result in fines + forced refunds.

---

## Public-facing policy (draft for /dispute-resolution page)

> # How SEIRS Handles Disputes
>
> We aim to resolve every complaint fast and fairly. Most issues can be raised inside the app — open a support ticket from your trip detail screen and a SEIRS agent will respond within the SLAs below.
>
> ## Service Level Agreements
>
> | Issue type | Response | Resolution |
> |---|---|---|
> | **Driver no-show after pickup** | <30 min | <2 hours |
> | **Package damaged in transit** | <2 hours | <72 hours |
> | **Package lost in transit** | <2 hours | <7 days |
> | **Payment charged twice** | <1 hour | <48 hours |
> | **Driver behaviour complaint** | <4 hours | <72 hours (review) |
> | **Partner store mishandling** | <4 hours | <7 days |
> | **General enquiry** | <24 hours | <72 hours |
>
> ## Step 1 — In-app support ticket
> 1. Open the SEIRS app
> 2. Tap the affected trip
> 3. Tap "Report Issue"
> 4. Pick the category and describe what happened
> 5. Attach photos if relevant
>
> Tickets land in our support queue with priority routing based on SLA above.
>
> ## Step 2 — Escalation
>
> If our first response doesn't resolve your issue, reply to the ticket with the word **ESCALATE** in the first line. The ticket immediately routes to a senior support manager, with a new 24-hour resolution SLA.
>
> ## Step 3 — Refunds
>
> Where SEIRS or a SEIRS driver is at fault, refunds are issued to your original payment method via Flutterwave. Processing time: **3-5 working days** for cards, **same day** for bank transfers, **instant** for SEIRS wallet.
>
> Liability is determined by our chain-of-custody photo trail (see [Liability Matrix](#liability)).
>
> ## Step 4 — External escalation
>
> If you remain dissatisfied after Step 3, you may escalate to:
>
> | Authority | When | Contact |
> |---|---|---|
> | **FCCPA** (Federal Competition and Consumer Protection Commission) | Any unresolved consumer complaint | https://fccpc.gov.ng |
> | **NCC** (Nigerian Communications Commission) | Issues with app accessibility / SMS | https://www.ncc.gov.ng |
> | **CBN** (Central Bank of Nigeria) | Payment-related complaints | https://www.cbn.gov.ng/consumerprotection |
> | **NITDA** (National Information Technology Development Agency) | Data protection / NDPR issues | https://nitda.gov.ng |
>
> ## Liability Matrix {#liability}
>
> Per our [Terms of Service](/terms-of-service):
>
> | Lost between | Liable party |
> |---|---|
> | Customer → Partner store | Customer (pre-handoff) |
> | Inside Partner store | Partner store |
> | Partner store → Driver | Partner store until driver scans |
> | Driver in transit | Driver (rating penalty + earnings withhold) |
> | Driver → Final Partner store | Driver until store scans |
> | Inside final Partner store | Partner store |
> | Partner store → Recipient | Partner store until recipient scans |
>
> Every handoff is scanned + photographed + timestamped — these records are the source of truth in disputes.
>
> ## Insurance
>
> Packages in driver custody are insured (see [Insurance Policy](/insurance-policy)). Insurance claim for losses above ₦50,000 are coordinated by SEIRS support with our carrier.
>
> ## Contact us directly
>
> - Email: support@seirs.co (general)
> - Email: business@seirs.co (B2B disputes)
> - Email: legal@seirs.co (formal complaints, legal correspondence)
> - Phone: +234 800 000 0000 (Mon-Fri 8am-6pm WAT, urgent only)

---

## Internal SOPs for support agents

(These are NOT public — they're for the support team to follow.)

### Category routing
- **Driver no-show**: priority queue → dispatch ops manager. Manual reassignment via [/admin/deliveries/:id/reassign](../../seirs-backend/src/admin/admin.controller.ts).
- **Damaged package**: support agent reviews driver's pickup + dropoff photos via [/admin/disputes](../../apps/admin-dashboard/src/app/disputes/page.tsx). Determines liability per matrix. Triggers refund via [/admin/payments/:id/refund](../../seirs-backend/src/admin/admin.controller.ts) if SEIRS-at-fault.
- **Lost package**: open insurance claim form within 24 hours. SEIRS support coordinates carrier visit + customer-facing updates.
- **Payment duplicate charge**: query Flutterwave dashboard → cross-check `payments` table → trigger refund via `paymentsService.manualRefund`. Always reconfirm with customer that refund was received.
- **Driver behaviour**: triage on severity. Verbal misconduct → warning + rating review. Physical or sexual misconduct → immediate driver suspension (via `/admin/drivers/:id/suspend`) + police referral. Document everything.
- **Partner store mishandling**: review storage timeline + handoff photos. If staff error → partner training + warning. If repeated → suspend store via partner-store endpoint.

### Escalation triggers
- Customer mentions "lawyer", "FCCPA", or "social media" → senior manager within 1 hour
- Refund request above ₦100,000 → senior manager approval before payout
- Any safety / sexual misconduct allegation → CEO + legal within 1 hour
- Any cluster of complaints about a single driver (3+ in 7 days) → automatic suspension pending review

### Audit trail
Every dispute touches the [`audit-log`](../../seirs-backend/src/admin/audit-log.entity.ts) automatically when admin actions are taken. Support agents should additionally:
- Add internal notes on the ticket explaining their decision
- Tag tickets with `category:damaged|lost|behaviour|payment|other` for monthly reporting

### Monthly reporting
First Monday of each month, run:
- Ticket volume by category
- Average response time vs SLA per category
- Refund total
- Driver suspensions issued
- Partner store warnings issued
- Top-5 escalation triggers

Use this for the public "transparency report" (year 1 quarterly, year 2+ monthly).

---

## Where to publish

- [ ] Add `/dispute-resolution` route to [apps/seirs-website/src/app/](../../apps/seirs-website/src/app/) (rendered server-side, ISR-cached; mirror structure of /privacy-policy)
- [ ] Link from Footer in [Footer.tsx](../../apps/seirs-website/src/components/Footer.tsx) under Legal
- [ ] Link from in-app "Help" screen in customer / driver / business apps
- [ ] Reference in Terms of Service as the canonical complaint mechanism
- [ ] Include URL in every transactional email footer (sendDeliveryFailed, etc.)

---

## When to invoke

The dispute process is invoked **automatically** when:
- A customer rates a trip 1-star and selects "Report Issue"
- A driver flags a customer in chat
- A payment refund webhook fires from Flutterwave
- An admin manually opens a ticket from `/admin/tickets`

Build the routing rules into [admin/tickets.service.ts](../../seirs-backend/src/admin/admin.service.ts) so urgent tickets bypass the queue automatically.
