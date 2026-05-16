# Flutterwave Volume-Rate Negotiation

**Standard Flutterwave rates** (published, no negotiation):
- Card transactions: **1.4% + ₦100** per successful transaction (capped at ₦2,000)
- Bank transfer (NIP): **₦50** flat
- USSD: **1.5%** capped at ₦2,000
- International cards: 3.8% + ₦100

**Why negotiate:** at SEIRS's projected volume (5,000 deliveries/day × ~₦1,000 avg fare = ₦5M/day = ₦150M/month), the standard 1.4% rate costs you ₦2.1M/month in fees. A negotiated rate of 0.9–1.1% saves ₦450k–₦750k/month.

Flutterwave **does** negotiate for volume merchants. Their account-management team has discretion up to ~50% off published rates for committed-volume merchants.

---

## Pre-meeting prep

Have these numbers ready (real data trumps projections):

1. **Volume projections**: monthly transaction count + monthly GMV for months 1, 3, 6, 12
2. **Average ticket size**: ~₦1,000–₦5,000 per delivery; ~₦300–₦1,500 per ride
3. **Method mix**: card vs bank-transfer vs USSD vs Opay (Flutterwave gives different rates per method)
4. **Refund rate**: currently 0% (SEIRS hasn't launched) — promise to keep <2%
5. **Chargeback rate**: aim to demonstrate <0.5% by post-launch month 6
6. **Settlement timing**: are you ok with T+1 (standard) or do you want T+0 (premium rate)
7. **Commitment**: are you willing to commit to a 12- or 24-month exclusive (vs Paystack / Monnify / Korapay)

---

## Negotiation email template

> **Subject: Volume-rate enquiry — SEIRS Logistics scaling to ₦150M/month GMV in 6 months**
>
> Hello [Account Manager / Sales],
>
> SEIRS Logistics is on Flutterwave's standard rate today (FLWSECK_LIVE-* keys live). We're 2 weeks out from public launch in Lagos and our 6-month projections put us at meaningful volume — I'd like to discuss whether you can offer a volume-tiered rate.
>
> **Volume forecast**
>
> | Month | Daily deliveries | Avg ticket | Monthly GMV |
> |---|---|---|---|
> | 1 | 200 | ₦1,500 | ₦9M |
> | 3 | 1,000 | ₦1,500 | ₦45M |
> | 6 | 5,000 | ₦1,500 | ₦225M |
> | 12 | 15,000 | ₦1,500 | ₦675M |
>
> **Method mix forecast** (drove this from our checkout picker bucket-7 work)
>
> | Method | Mix |
> |---|---|
> | Card (one-tap saved) | 50% |
> | Bank Transfer (one-time virtual account) | 25% |
> | USSD | 15% |
> | SEIRS Wallet (top-up via card) | 10% |
>
> **What we're asking**
> 1. Volume-tiered card rate — ideally 1.0% (with no ₦100 fixed component for tickets <₦5,000) once we hit ₦50M/month sustained
> 2. Bank-transfer rate reduction to ₦35/transaction at the same volume tier
> 3. T+0 settlement option (we can pay a premium if needed — confirms what that premium is)
> 4. Dedicated account manager + slack support channel
>
> **What we can commit to in return**
> 1. **Exclusive** Flutterwave for 24 months on launch (no Paystack / Monnify / Korapay)
> 2. **Refund rate** target <2% (we'll share monthly dashboards)
> 3. **Chargeback rate** target <0.5% (we'll surface any concerning trends within 24 hours)
> 4. **Customer-payment-method funnel data** shared monthly with your data team
> 5. **Joint case study** for your "powered by Flutterwave" partner page once we hit ₦100M monthly GMV
>
> Could we meet within the next 14 days to talk through the rate sheet? Available [insert 3 time windows].
>
> Best,
> [Your Name]
> Founder, SEIRS Logistics
> [email] | [phone]

---

## Negotiation tactics

**In the meeting:**

1. **Lead with the exclusive commitment.** Flutterwave loses ~30% of its merchant base to Paystack each year — exclusive 2-year is a real concession on your part and they'll value it.

2. **Anchor high on rate ask.** Start at 0.9% on cards, expect to settle at 1.1%. Don't ask for what you actually want — anchor lower so the negotiated rate is what you wanted.

3. **Trade payment-terms flexibility for rate.** If they push back on rate, ask for T+0 settlement at the standard rate, OR T+1 at the lower rate. Either way you win.

4. **Bring chargeback prediction confidence.** Logistics has low chargeback rates because the customer sees their package — better than e-commerce. Highlight this.

5. **Walk away with a written quote.** Don't accept verbal commitments. Get the rate sheet in email before you sign anything internally.

6. **Confirm escalation path.** Ask "if I have a problem, what's the response SLA?" Flutterwave's enterprise tier promises <2hr response on critical issues — anchor your support expectations.

---

## Once the new rate is signed

- [ ] Update the price model in [`seirs-app/seirs-pricing-spec.html`](../../seirs-app/seirs-pricing-spec.html) — our take-rate assumptions
- [ ] Re-run the unit economics in your investor deck
- [ ] Add a calendar reminder 90 days before the contract anniversary to renegotiate
- [ ] Document the contact + the rate in a private channel (Slack DM to founders, or a 1Password note) so it's not lost when account managers rotate

## If Flutterwave won't budge

Two backstops:
1. **Multi-processor**: split traffic 70/30 Flutterwave/Paystack. Paystack tends to offer ~1.1% rates more readily to win volume. Architecturally this is a real lift — you'd need a router service in front of the existing `payments` module. Not worth it for v1.
2. **Direct CBN PSP licence**: process payments yourself. Requires ~₦100M minimum capital + 6-month regulatory process + ongoing compliance overhead. Year 3+ conversation.

For v1, you're better off being a high-volume Flutterwave merchant on a negotiated 1.1% rate than splitting 1.4%+1.4% across two providers.
