# Insurance RFQ — In-Transit + Driver Accident + Cyber Liability

**Three policies to procure before launch:**
1. **Cargo / in-transit insurance** — covers packages while in driver custody
2. **Driver accident / personal accident** — covers drivers for medical bills + lost income
3. **Cyber liability** — covers data breach, ransomware, DDoS, third-party claims

**Recommended brokers** (Nigerian, fintech-friendly):
- AIICO Insurance (large, established; cargo-strong)
- Leadway Assurance (motorcycle-strong; common for ride/delivery)
- AXA Mansard (cyber strong; expensive)
- Cornerstone Insurance (driver accident specialists)
- Sanlam Allianz (formerly Custodian Allianz — broad)

Get quotes from **at least 3** before committing.

---

## RFQ template (copy-paste-ready)

> **Subject: Insurance quote request — SEIRS Logistics (Cargo + Driver Accident + Cyber)**
>
> Dear [Sales Team / Account Manager],
>
> SEIRS Logistics is a Nigerian last-mile delivery + ride-sharing platform launching in Lagos. We need quotes for three policies before our go-live date.
>
> **About us**
> - Company: SEIRS Logistics Ltd (RC pending)
> - Operations: Lagos (year 1), Abuja + Ibadan + Port Harcourt (year 2)
> - Driver fleet target: 50 at launch, 500 within 6 months, 2,000 within year 1
> - Vehicle mix: ~70% motorcycle (okada), ~20% tricycle (keke), ~10% car/van
> - Daily delivery volume target: 200 at launch → 5,000 within 6 months
> - Booking model: customer pays SEIRS via Flutterwave; funds held in escrow; released to driver on delivery confirmation
>
> **Policy 1 — Cargo / in-transit insurance**
> Per-package value bands we expect:
>   - 80% of deliveries: under ₦5,000 declared value
>   - 15%: ₦5,000–₦50,000
>   - 5%: ₦50,000–₦500,000
>   - Rare: declared value above ₦500,000 (special handling)
>
> Coverage requirements:
> - In-transit damage / loss / theft
> - From handoff to driver until handoff to recipient
> - Per-incident limit: ₦500,000 (option to increase to ₦1M for an upcharge)
> - Aggregate annual: ₦100M
>
> Request quotes for:
> - (a) Per-package premium model (e.g. 0.3% of declared value)
> - (b) Monthly flat premium for unlimited deliveries up to the aggregate cap
> - (c) Hybrid: low monthly base + per-incident excess
>
> **Policy 2 — Driver personal accident**
> - Covers medical bills + lost income for the driver if injured while on a SEIRS trip
> - Per-driver coverage limit: ₦1,000,000
> - Aggregate annual: ₦100M
> - Driver target count: 50 at launch, scaling to 2,000 in year 1
> - Quote options:
>   - (a) Per-driver monthly premium (e.g. ₦1,500/driver/month)
>   - (b) Group policy with pooled cap
>
> **Policy 3 — Cyber liability**
> - Covers data breach (NDPR-compliant disclosure costs), ransomware payments, DDoS mitigation, third-party claims arising from a SEIRS data leak
> - We hold: customer email + phone + delivery address + KYC docs (NIN, driver's licence images) for drivers
> - Customer count target: 10,000 within year 1
> - Per-incident limit: ₦50M
> - Annual aggregate: ₦200M
> - Request:
>   - (a) Standalone cyber policy
>   - (b) Add-on to a general business owner's policy
>
> **What we need from you**
> 1. Premium quote for each policy (best to provide all three options where relevant)
> 2. Policy terms in PDF (we'll have our lawyer review before signing)
> 3. Claim process explained — average days from claim to payout
> 4. Excess / deductible per policy
> 5. Exclusions (please be specific about what's NOT covered)
> 6. Whether you offer monthly billing vs annual lump-sum
>
> **Timeline:** we'd like quotes within 14 days, with policies in place 7 days before our launch.
>
> Could we schedule a 45-minute call to walk through SEIRS's operating model? Available [insert 3 time windows].
>
> Best,
> [Your Name]
> Founder, SEIRS Logistics
> [email] | [phone]

---

## Once quotes are in

- [ ] Build a comparison table: provider × policy × premium × per-incident limit × aggregate × exclusions
- [ ] Spec V8 §3.13 already has an `/admin/insurance` directory page (commit `21ab7b3`) — onboard the winning provider(s) there
- [ ] Update `apps/seirs-website/src/app/privacy-policy/page.tsx` to disclose the cyber-liability carrier
- [ ] Driver KYC flow already references insurance partners during onboarding ([apps/driver-app/app/(driver)/kyc.tsx](../../apps/driver-app/app/%28driver%29/kyc.tsx)) — wire the real partner(s) into `INSURANCE_PARTNERS` array

## Insurance referral commission (Spec V8 Tier 3)

Spec V8 §"Revenue Model — Tier 3" calls for a **12% referral commission** on partner-issued driver insurance. Ask each carrier directly during the call:

> "We can refer our drivers to your insurance products at scale (50 → 2,000 drivers in year 1). Spec calls for a 12% commission on premiums for referred policies. Is that workable, and what's your standard partner-referral arrangement?"

Get this in writing as a separate agreement.
