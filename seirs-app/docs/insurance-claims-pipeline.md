# Insurance Claims Pipeline — Spec

**Status:** Design. Required BEFORE flipping `rateCard.insurance.enabled: true`. Today the rate card holds the math (`insurancePremium()` in `customer-app/constants/rateCard.ts`) but `enabled: false` so customers can never opt in — because we have no operational way to handle the payout side. This doc is the gate.

**Why a doc and not code:** every claim is a refund-shaped event. SEIRS is bootstrapped and cannot absorb fraudulent or sloppy claims without going underwater. The pipeline below is the cheapest way to accept premium without exposure.

---

## 0. Decision summary

| Question | Answer |
|---|---|
| Who can opt in? | Sender, before booking confirmation, when `declaredValueNgn ≥ ₦50,000`. |
| Premium math | `max(₦500, 2% × (declaredValue − ₦50,000))`, capped at the value's coverage. From rate-card `insurance.*`. |
| Coverage cap | `rateCard.insurance.maxCoverageNgn` — default ₦2,000,000 per shipment. |
| Who pays for claims | SEIRS, out of an **insurance float account** funded by collected premiums. Float reaches breakeven when collected premiums ≥ paid claims + admin cost. |
| Operational owner | A named "Claims Officer" admin role. Reports go to founder weekly until volume justifies hiring. |
| Refund/payout window | Resolution decision within **7 business days** of claim submission. Payout to sender wallet within **3 business days** of approval. |
| Hard "we don't pay" cases | Documented below in §5. |

---

## 1. Pre-shipment requirements (the gate)

A booking can ONLY be insured when **all four** are satisfied; otherwise the opt-in checkbox is disabled in `/send` with a "what's missing" hint.

1. **Declared value provided** — sender enters in `/send` step 3 (currently `codAmount` field; insurance gets a parallel `declaredValueNgn` input).
2. **Photos at pickup** — sender uploads 1–5 photos in `/send` step 0 (already required for COD and recommended for all). The **driver** is required to take an additional 1 photo of the package at pickup confirming it matches the sender photos. This is the canonical "condition at start" record.
3. **Vehicle is allowed for the category** — `category.forbiddenVehicles` enforcement in `calcPackageFare`. Insurance does not cover claims where the booking violated a safety hard-stop.
4. **Sender accepts insurance terms** — short modal: "If you claim, you'll need to provide photos, the recipient's report, and submit within 48 hours. SEIRS reviews within 7 business days."

**Out of scope at launch:** group claims, partial-damage proration, insurance for COD-only shipments (those have a separate dispute path).

---

## 2. Driver-side handoff requirements

The DRIVER APP must enforce these before a delivery can be marked `delivered` when `delivery.isInsured === true`:

| Step | Driver action | Backend stores |
|---|---|---|
| Pickup | Photo of package as received | `delivery.pickupPhotoUrl` |
| Pickup | Tap "I've inspected this package" — checkbox | `delivery.pickupInspectedAt` |
| Recipient handover | Recipient TYPES their full name (not signature image) | `delivery.handoverTypedName` |
| Recipient handover | Recipient TAPS "Confirm I received this in good condition" | `delivery.handoverConfirmedAt` |
| Recipient handover | Driver photo of recipient holding package | `delivery.handoverPhotoUrl` |

If any of these are missing, the delivery cannot be closed → it stays in `delivered_pending_evidence` status → automatically becomes a dispute after 24 h.

**For uninsured shipments:** only the typed-name handover is required (already in the spec). The 3 insured-only requirements above are extra.

---

## 3. Claim submission (sender side)

The customer-app exposes a "Report damage / loss" link on:

- `/trip/[id]` — when status is `delivered` and `delivery.isInsured === true`
- `/notifications` — push notification thread for the trip

The flow:

1. Sender taps "Report claim" → form opens.
2. Form fields (required):
   - **Type:** Lost / Damaged / Partial / Other
   - **Description** (min 50 chars)
   - **Estimated loss in NGN** (cannot exceed `declaredValueNgn`)
   - **Photos** (min 1, max 10) — taken AFTER delivery, showing the damage or empty packaging
   - **Recipient statement** — short text from the recipient confirming what happened (or an audio recording link)
3. Submit → backend creates `claim` row with status `submitted` and notifies Claims Officer.
4. **Submission window:** must be submitted within **48 hours** of `delivery.handoverConfirmedAt`. Late submissions are auto-rejected.

---

## 4. Backend schema

### New entity: `InsuranceClaim`

```ts
@Entity('insurance_claims')
export class InsuranceClaim {
  @PrimaryGeneratedColumn('uuid') id: string;

  @Index() @Column() deliveryId: string;
  @ManyToOne(() => Delivery) delivery: Delivery;

  @Column({ type: 'enum', enum: ['lost', 'damaged', 'partial', 'other'] })
  type: 'lost' | 'damaged' | 'partial' | 'other';

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal' })
  claimedAmountNgn: number;          // ≤ declaredValueNgn at booking time

  @Column({ type: 'jsonb' })
  evidence: {
    senderPhotoUrls:    string[];    // post-delivery damage photos
    recipientStatement?: string;
  };

  @Column({ type: 'enum', enum: ['submitted', 'investigating', 'approved', 'rejected', 'paid'], default: 'submitted' })
  status: ClaimStatus;

  @Column({ type: 'decimal', nullable: true })
  approvedAmountNgn: number | null;  // can be partial — adminNote explains

  @Column({ type: 'text', nullable: true }) adminNote: string;
  @Column({ nullable: true }) reviewedBy: string;
  @Column({ type: 'timestamp', nullable: true }) reviewedAt: Date;
  @Column({ type: 'timestamp', nullable: true }) paidAt: Date;

  @CreateDateColumn() createdAt: Date;
  @UpdateDateColumn() updatedAt: Date;
}
```

### Endpoints

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/claims` | customer | Sender submits a claim |
| `GET` | `/claims/mine` | customer | Sender lists own claims |
| `GET` | `/admin/claims?status=submitted` | admin (Claims Officer role) | Queue |
| `GET` | `/admin/claims/:id` | admin | Full evidence view incl. pickup/handover photos from delivery |
| `PATCH` | `/admin/claims/:id` | admin | Update status + approvedAmount + adminNote |
| `POST` | `/admin/claims/:id/pay` | admin | Triggers wallet credit + status → `paid` |

### Audit log

Every PATCH writes a row to `claim_audit_events` with `actorAdminId`, `beforeStatus`, `afterStatus`, `note`, `at`. Insurance payouts are one of the few places where a single admin can move SEIRS money, so the audit trail is non-negotiable.

---

## 5. Hard rejections — the "we don't pay" cases

The Claims Officer auto-rejects (with one click → templated note) when:

1. **Safety hard-stop violation** — e.g. fragile shipped by bicycle when `forbiddenVehicles` had bicycle. Backend can detect this from `delivery.packageCategory` + `delivery.vehicleType`.
2. **No pickup photo** — driver skipped it. (Should be impossible after §2 enforcement, but historical bookings might lack it — for those: reject and offer goodwill credit instead.)
3. **Recipient confirmed "good condition"** at handover but reports damage post-handover → not covered unless within 1 hour AND with photo proof of opened-on-camera unboxing.
4. **Beyond submission window** (>48h after delivery).
5. **Claim amount > declaredValueNgn** — claimable is capped at the declared value, period.
6. **Pattern fraud detection** — sender has filed N ≥ 3 claims in the last 90 days. Auto-rejects further claims pending manual review.

Every auto-rejection sends the sender a polite explanation push notif with the specific reason + appeal link.

---

## 6. Admin UI — `/admin/claims`

Mirror the `/admin/pricing` patterns:

- Top-of-page **queue counter** (e.g. "3 submitted · 2 investigating · 7 awaiting payment").
- Table of claims with filters (status, date range, type, claimed amount).
- Detail page per claim: shows the booking, the pickup photo, the handover photo, the typed name, sender's claim photos, recipient statement, side-by-side. One-click "Approve full / Approve partial / Reject" with templated notes.
- "Pay" button on approved claims — triggers wallet credit + log entry.

Estimated build: **~2 days** for the admin page once backend endpoints exist. ~1 day backend. Doesn't block — can ship after this doc is signed off.

---

## 7. Finance — the insurance float

Without basic float accounting, every payout is a panic.

| Account | Purpose | How it moves |
|---|---|---|
| `insurance_float` | Pool of collected premiums | Credit on every booking with `insurancePremium > 0`. Debit on every approved payout. |
| `insurance_admin_cost` | Claims Officer salary + tooling overhead | Monthly debit. |
| `insurance_pnl` | Net = premiums collected − payouts − admin cost | Reported in weekly admin email. |

**Gate to flip `insurance.enabled: true`:** `insurance_float ≥ projected 3 months of claim payouts` (initial estimate ~₦500k). Until that, admin keeps `enabled: false` and the opt-in checkbox is hidden in `/send`.

---

## 8. Phased rollout

1. **Phase 0 (today)** — `enabled: false`, math is in the rate card, no UI exposure.
2. **Phase 1** — admin claims page exists, backend entity + endpoints exist, no public exposure. Internal team submits test claims to verify the flow.
3. **Phase 2** — opt-in checkbox appears in `/send` for declared values ≥ ₦50k, capped at small-value shipments (≤ ₦100k coverage) to bound max payout while we learn.
4. **Phase 3** — coverage cap raised to ₦2M (current rate-card default) once Phase 2 shows acceptable claim rate (<3% of insured shipments) and median resolution time ≤5 business days.
5. **Phase 4** — corporate/bulk insurance for partner-store + business app shipments.

Each phase requires sign-off from founder + Claims Officer.

---

## 9. Open questions for founder before Phase 1

- Who is the Claims Officer at launch? (Founder doubles up initially?)
- Float seed: where does the first ₦500k come from? Bootstrap budget vs. delayed launch?
- Appeal path for rejected claims — is it just "email founder" at launch?
- Press position: do we advertise insurance ("ship valuable cargo with confidence") or keep it quiet ("opt-in for high-value shipments")? Advertising drives premium revenue but also claim volume.

When these are answered, this doc moves from `Design` to `Ready for implementation`.
