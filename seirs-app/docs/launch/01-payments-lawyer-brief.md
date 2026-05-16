# Payments Lawyer Brief — CBN Positioning Review

**Purpose:** retain a Nigerian payments lawyer to confirm SEIRS's pass-through payments model does not trigger the CBN Payment Service Provider (PSP) licence requirement.

**Recommended firms** (handle CBN / fintech specifically):
- Olaniwun Ajayi LP
- Banwo & Ighodalo
- Aluko & Oyebode
- TNP (Templars)
- G. Elias

Budget: ₦500k–₦2M for an initial opinion letter; ₦5M+ if a full registration is needed.

---

## Brief (copy-paste-ready)

> **Subject: Engagement request — CBN positioning review for logistics + payments platform**
>
> Hello [Partner Name],
>
> SEIRS Logistics (RC pending) is a Nigerian last-mile delivery + ride-sharing platform launching in Lagos. We are about to go to market and need a written opinion confirming our payments architecture does not require us to register as a Payment Service Provider (PSP) under the CBN Payment Systems Management Act 2007 or any subsequent CBN circular.
>
> **What we do**
> Customers book deliveries / rides in our mobile apps. Payment flows entirely through Flutterwave: customer card → Flutterwave merchant account → our Nigerian bank → driver's Nigerian bank (Flutterwave Transfers API). We never hold customer balances on our servers.
>
> **Our position (which we need confirmed)**
> 1. We are a **technology platform**, not a payment processor. The actual processing of payments (card auth, KYC, AML screening, fraud, settlement) is performed by Flutterwave, who hold the PSP licence.
> 2. **Customer-facing "Loyalty Points"** are non-monetary — they have no cash face value, are non-redeemable for cash, are non-transferable, and can only be applied as a discount on SEIRS service fees. This should fall outside the CBN's definition of "e-money".
> 3. **Driver "earnings"** are a ledger entry representing a liability we owe the driver. We trigger a Flutterwave Transfer on payout day to move actual money from our bank to theirs. We do not "hold" driver money — we owe it.
> 4. **Customer "wallet" balances** for the SEIRS app exist but are funded by direct Flutterwave card-on-file charges per booking; we do not have a top-up-and-hold model. (NOTE: re-verify this with the engineering team — if customer wallet top-ups are added later, that materially changes the analysis.)
>
> **Specific questions we need answered in writing**
> 1. Does our current architecture require a CBN PSP / Payment Solution Service Provider (PSSP) / Mobile Money Operator (MMO) licence?
> 2. If we add a customer-funded prepaid wallet later (Phase 2), what additional licensing or relationships would be required?
> 3. Does our driver "ledger" structure (debit/credit entries in our DB, settled via Flutterwave Transfer on a daily schedule) constitute "holding" customer funds under any CBN definition?
> 4. Are there NDPR / NITDA registration requirements adjacent to the payments licensing question that we should fulfil before launch?
> 5. What is the safest disclosure language to put in our Terms of Service to make this positioning legally defensible?
>
> **What we'll send you**
> - Our payments architecture document (`docs/payments-spec.md`) — single-source-of-truth, ~10 pages
> - Our current Terms of Service draft (`apps/seirs-website/src/app/terms-of-service/page.tsx`)
> - Our Privacy Policy (NDPR-aligned) (`apps/seirs-website/src/app/privacy-policy/page.tsx`)
> - A high-level diagram of money flow (we can produce on request)
>
> **Timeline:** we'd like a written opinion within 21 days, so we can adjust before our scheduled launch.
>
> Could we schedule a 30-minute intro call this week? Available [insert 3 time windows].
>
> Best,
> [Your Name]
> Founder, SEIRS Logistics
> [email] | [phone]

---

## Post-engagement deliverables

After the lawyer's opinion lands:

- [ ] Update [`apps/seirs-website/src/app/terms-of-service/page.tsx`](../../apps/seirs-website/src/app/terms-of-service/page.tsx) with their suggested disclosure language
- [ ] Add a `legal-opinion-2026.pdf` to `docs/legal/` (gitignored if confidential)
- [ ] If they recommend additional licensing, add new line items to LAUNCH_CHECKLIST.md
- [ ] If they confirm pass-through model is sound, add a one-line note to `project_seirs` memory: "CBN positioning confirmed by [Firm Name], opinion dated YYYY-MM-DD"
