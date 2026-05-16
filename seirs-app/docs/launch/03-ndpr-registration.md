# NITDA NDPR Registration + DPO Appointment

**Mandatory under the Nigeria Data Protection Regulation 2019** (and the Nigeria Data Protection Act 2023 supersedes it). Any entity processing personal data of Nigerian residents must:

1. **Register with NITDA** as a data controller
2. **Appoint a Data Protection Officer (DPO)** — can be internal or outsourced
3. **Conduct an annual Data Protection Impact Assessment (DPIA)** if processing >2,000 data subjects per year (SEIRS will hit this in week 1)
4. **File an annual Data Protection Audit Return** through a NITDA-licensed Data Protection Compliance Organisation (DPCO)

---

## Step 1 — Register with NITDA

**Where:** https://nitda.gov.ng/ → "Data Protection" → "Register as a Data Controller"

**What you need:**
- CAC certificate (RC number)
- Company directors list
- Detailed description of the data you collect, why, and how long you retain it
- Privacy Policy URL (yours: https://seirs.app/privacy-policy)
- Designated DPO contact details
- Annual filing fee (varies by company size — small/medium business is typically ₦25,000–₦100,000)

**Timeline:** 7–14 working days for registration confirmation.

---

## Step 2 — Appoint a DPO

You have two options:

### Option A — Internal DPO
- Designate an existing team member (typically the founder, COO, or Head of Legal)
- Email NITDA the appointment letter
- Cost: salary only (existing employee)
- Risk: conflict-of-interest concerns if the DPO also runs growth/ops

### Option B — Outsourced DPO (recommended for launch)
Hire a NITDA-licensed Data Protection Compliance Organisation (DPCO) to act as DPO.

Reputable DPCOs in Nigeria:
- **Tech-Hive Solutions** — established, fintech-friendly
- **DPO Africa Network**
- **DataPro Insights**
- **Compliancepro Solutions**

Cost: ₦200,000–₦800,000/year depending on company size + audit complexity.

**Recommended:** start with outsourced DPO for launch year (regulatory cover + audit support), revisit internal hire once you have a Head of Legal / Head of Ops on payroll.

---

## DPO appointment email template

> **Subject: DPO engagement enquiry — SEIRS Logistics**
>
> Hello [Firm Name],
>
> SEIRS Logistics is a Nigerian last-mile delivery + ride-sharing platform launching in Lagos in [target month]. We need to appoint a Data Protection Officer and register with NITDA before go-live.
>
> **Our data profile**
> - Customer count target: 10,000 within year 1, 100,000 within year 3
> - Driver count target: 2,000 within year 1
> - Partner store count: 50 within year 1
> - Data we hold:
>   - **Customers**: name, email, phone, address book, payment-method tokens (no PCI data — Flutterwave tokenises), delivery history with addresses
>   - **Drivers**: above + National ID front/back, driver's licence, vehicle insurance cert, bank account details, GPS history
>   - **Partner stores**: above + storefront photos, CAC documents, owner ID
> - Storage: PostgreSQL on Railway (EU + US regions); files on Cloudflare R2
> - Retention: per Spec V8, 30-day soft-delete window then hard-purge from live tables with reduced PII archived for legal compliance
>
> **What we need**
> 1. Act as outsourced DPO of record on our NITDA registration
> 2. File our annual Data Protection Audit Return
> 3. Quarterly DPIA review (we're a high-volume data processor; 4× annually feels right)
> 4. Be reachable on a DPO email address we publish on https://seirs.app/privacy-policy
> 5. Handle subject access requests (customers right to data portability) when escalated
>
> **Questions for you**
> 1. Annual fee for the engagement?
> 2. Setup time from contract signing to NITDA registration filed?
> 3. Do you cover incident response (e.g. data breach disclosure to NITDA within 72 hours)?
> 4. References from similar-stage Nigerian platforms?
>
> Could we schedule a 30-minute intro this week? Available [insert 3 time windows].
>
> Best,
> [Your Name]
> Founder, SEIRS Logistics

---

## Step 3 — DPIA template

A Data Protection Impact Assessment documents:
1. What personal data you collect
2. Why (the legal basis under NDPR)
3. How long you keep it
4. Who you share it with
5. How you secure it
6. How users can exercise their NDPR rights

SEIRS already has these capabilities built into the platform:
- ✅ Right to access (Article 22): `/users/me/export` endpoint
- ✅ Right to erasure (Article 26): self-delete via app + admin hard-delete via `/admin/users/:id/hard-delete`
- ✅ Right to rectification: edit-profile screens in all 3 apps
- ✅ Right to data portability: same as access — JSON export
- ✅ Cookie consent: banner shipped in bucket 9

The DPO will help draft the formal DPIA document. Provide them with:
- `docs/payments-spec.md`
- This launch checklist
- Architecture summary (NestJS backend + 3 Expo apps + Next.js website + admin)

---

## NDPR-critical disclosures to verify on Privacy Policy

Before launch, [apps/seirs-website/src/app/privacy-policy/page.tsx](../../apps/seirs-website/src/app/privacy-policy/page.tsx) must include:

- [ ] **Lawful basis** for each data category (consent / contract / legitimate interest / legal obligation)
- [ ] **Retention period** for each data category
- [ ] **List of third-party processors** (Flutterwave, Firebase, Cloudflare R2, Resend, Google Maps, Railway)
- [ ] **DPO contact email** (e.g. dpo@seirs.co)
- [ ] **Complaint escalation path** to NITDA
- [ ] **Cross-border transfer disclosure** (Cloudflare R2 may store in EU/US; Railway hosts in US)
- [ ] **Children's data** — SEIRS is 18+ enforced at registration (per Spec V8)
- [ ] **Cookie types disclosed** + link to bucket-9 cookie banner choice management

---

## Post-launch annual cycle

- **Annually**: file Data Protection Audit Return via your DPCO
- **Within 72 hours of any breach**: notify NITDA + affected users (you can use the admin /notify push composer for the user notification)
- **Quarterly**: DPIA review with DPO
- **On every major feature**: update DPIA if data flow changes
