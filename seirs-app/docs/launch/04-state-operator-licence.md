# State Operator Licence — Lagos First, then Abuja / Ibadan / PH

**Why this matters:** Lagos State Transport Management Authority (LASTMA) + Lagos State Ministry of Transportation regulate commercial transport. Ride-hailing platforms (Uber, Bolt, Gokada) operate under state-issued **e-hailing operator licences**. Last-mile delivery sits in a similar regulatory space.

Operating without a licence risks:
- LASTMA stop-and-impound of driver vehicles
- Fines (₦1M+ per incident historically)
- Negative press attention that kills consumer trust
- Loss of corporate B2B clients who require regulatory compliance

---

## Lagos State — primary target

**Authority:** Lagos State Ministry of Transportation
**Address:** Block H, Secretariat Complex, Alausa, Ikeja
**Phone:** typically need to call to schedule — no standing online portal
**Email:** ministryoftransport@lagosstate.gov.ng (verify)

### Lagos requirements (per published Uber/Bolt/Gokada precedent — verify current):

| Item | Detail |
|---|---|
| **Application fee** | ~₦25,000 (one-time) |
| **Annual licence fee** | ₦10,000,000 (e-hailing) or per-driver fee structure (₦25,000/driver) |
| **Per-trip levy** | 10% of fare (typically) collected by platform, remitted monthly |
| **Operations centre** | Must have a physical office in Lagos with on-call ops manager |
| **Insurance proof** | Cargo + driver accident policies (see [02-insurance-rfq.md](02-insurance-rfq.md)) |
| **Driver verification** | LASRRA registration evidence for all drivers (already required by Spec V8 KYC) |
| **Vehicle inspection** | Annual roadworthiness for every vehicle in fleet |
| **Data sharing** | Real-time trip data to LASTMA dashboard (see "Lagos Smart City" initiative) |

**Process:**
1. Schedule intro meeting with Ministry of Transportation
2. Submit application package
3. Inspection of operations centre
4. Pay licence fee
5. Licence issued (typical 30-60 days)

---

## Outreach email template

> **Subject: Operator licence application enquiry — SEIRS Logistics (e-hailing + last-mile delivery)**
>
> Honourable Commissioner / Permanent Secretary,
>
> SEIRS Logistics Ltd is preparing to launch a last-mile delivery + ride-sharing platform in Lagos, with operations targeted for [target month]. We write to formally apply for the appropriate state operator licence(s) before commencing services.
>
> **About SEIRS**
> - Registered Nigerian limited company (RC pending verification — will share on request)
> - Platform combines package delivery + corridor-pool ride-sharing in a single app
> - Driver fleet target: 50 at launch → 500 within 6 months → 2,000 within year 1
> - Vehicle mix: ~70% motorcycle, ~20% tricycle, ~10% car/van
> - Daily trip volume target: 200 at launch → 5,000 within 6 months
> - All drivers undergo KYC: National ID, LASRRA registration, driver's licence verification, vehicle ownership proof, insurance certificate, background check, working camera requirement
>
> **What we need**
> 1. Confirmation that the e-hailing operator licence framework applies to our hybrid delivery + ride-sharing model
> 2. Application checklist with current fees and timelines
> 3. Inspection schedule for our operations centre at [office address]
> 4. Data-sharing requirements (what fields, what cadence, what API/SFTP shape)
> 5. Any clarifications on per-trip levy obligations
>
> **What we can offer**
> - Full real-time trip data feed to LASTMA via secure API
> - Driver KYC dossiers on demand
> - Quarterly operations report (volume, incidents, ops centre staffing)
> - Active participation in the Lagos Smart City ride-hailing working group
>
> Could we schedule a meeting with the relevant department head within the next 14 days? We're flexible: available [insert 3 time windows].
>
> Yours respectfully,
> [Your Name]
> Founder, SEIRS Logistics
> [email] | [phone]

---

## Other Nigerian cities — phased outreach

| City | Authority | Notes |
|---|---|---|
| **Abuja (FCT)** | FCT Department of Road Traffic Services (FCT-DRTS) | Slightly more bureaucratic than Lagos; allow 90 days |
| **Ibadan** | Oyo State Road Transport Management Authority (OYRTMA) | Smaller market; less standardised licensing — may be easier |
| **Port Harcourt** | Rivers State Ministry of Transportation | Security concerns relevant; budget extra for driver background checks |
| **Kano** | Kano Road Traffic Agency (KAROTA) | Cultural considerations — separate vehicle for female passengers? |

For initial launch (year 1), focus on **Lagos only**. Expansion to other states is a year-2 conversation that benefits from Lagos market evidence.

---

## Until the licence lands

Per industry precedent, you can begin **soft-launch / closed-beta** while application is in flight:
- Internal employees + invited partner-store testers only
- No public marketing
- Daily volume capped to single-digits
- Document every interaction for the licence inspection

Once licence is issued, full public launch.

---

## Post-licence ongoing obligations

- [ ] Monthly per-trip levy remittance (calendar reminder in admin)
- [ ] Quarterly operations report submission
- [ ] Annual licence renewal (set reminder 60 days before expiry)
- [ ] Real-time trip data API maintenance — add to monitoring
- [ ] Driver licence audit (every driver's commercial permit valid + on file)
