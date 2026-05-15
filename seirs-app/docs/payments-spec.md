# SEIRS Payments, Loyalty, Driver Earnings & Fraud Spec

> **v1.0 — 2026-05-15** · Nigeria · NGN · Flutterwave-only
> Companion HTML doc for advisor review: `seirs-payments-spec.html`

---

## ① Principles

1. **SEIRS does not hold customer money.** All charges flow through Flutterwave to either the SEIRS company bank account (revenue) or the driver's bank account (payout). No customer-funded "wallet" balances live on our servers.
2. **Customer-side balance = Loyalty Points**, not money. Non-monetary, non-transferable, redeemable only for SEIRS service discounts. Same legal status as airline miles.
3. **Driver "earnings" = ledger entry**, not held cash. SEIRS records what the driver is owed; Flutterwave Transfers API moves the actual money on payout day.
4. **One processor: Flutterwave.** Paystack and any other processor references must be removed.
5. **Refunds always to the original payment method** (Flutterwave default — AML compliance).
6. **Dispute window before driver payout** is REQUIRED. 24-72h after delivery completion.

### Why no real wallet
CBN regulations require any entity holding customer balances to be a licensed bank, microfinance bank, or PSP under MMO/PSSP/PSB licence. SEIRS holds none. Pass-through model avoids the licence requirement entirely.

---

## ② Money Flow

### Customer payment (per delivery)

```
Customer taps "Pay" → Flutterwave Inline (web view)
                    → Flutterwave processes + holds in SEIRS merchant acct
                    → Webhook → SEIRS backend
                        ├─ Mark Delivery as paid
                        ├─ Credit driver earnings ledger (status: pending)
                        ├─ Award loyalty points
                        └─ Push: "Driver assigned"
                    → T+1 settlement to SEIRS NG bank account
                    → Nightly reconciliation cron matches settlement to deliveries
```

### Driver payout

```
Delivery completed + dispute window expires
  → Driver earnings: pending → available
  → Auto-payout cron (daily 2 PM) OR driver requests manual
  → Backend calls Flutterwave Transfers API
    (POST /v3/transfers — SEIRS bank → driver bank)
  → Flutterwave debits SEIRS, credits driver
  → Webhook → ledger: available → paid
  → Push + email to driver
```

---

## ③ Payment Methods (Flutterwave-supported)

| Method | Display priority | Notes |
|---|---|---|
| Card (Visa/MC/Verve) | 1 | Tokenized by Flutterwave. SEIRS stores token + last4 + expiry only. |
| Bank Transfer (virtual NUBAN) | 2 | One-time account # per order. No chargebacks. |
| USSD | 3 | Feature-phone friendly. |
| Apple Pay / Google Pay | 3 | One-tap, biometric. |
| Mobile Money (Opay/PalmPay) | 4 | Big with younger users. |
| Bank Account direct debit | 5 | Best for recurring business customers. |
| Pay on Delivery (cash) | 6 | High fraud risk. Driver settlement flow required. |
| Pay with Barter | 9 | Niche — keep off by default. |

**Card storage:** SEIRS NEVER stores raw card numbers. We store Flutterwave's reusable token (e.g. `flw_tok_abc123`) + last 4 digits + expiry month/year. Keeps SEIRS out of PCI-DSS scope.

---

## ④ Transaction Fees (Flutterwave's cut)

| Method | Rate | Cap (NGN) | Who pays |
|---|---|---|---|
| Local card | 1.4% | 2,000 | SEIRS |
| International card | 3.8% | no cap | SEIRS or pass to customer |
| Bank Transfer | 1.0% | 300 | SEIRS |
| USSD | 1.4% | 2,000 | SEIRS |
| Bank account debit | 1.4% | 2,000 | SEIRS |
| Mobile money | 1.4% | 2,000 | SEIRS |
| Driver payout (Transfer) | ₦10–50 fixed | n/a | SEIRS |
| Settlement | free | n/a | — |
| Refund | free | n/a | — |
| Chargeback | ~₦4,000/each | n/a | SEIRS |

### Net example (₦1,500 delivery, local card)
```
Customer pays              ₦ 1,500
Flutterwave fee (1.4%)    ─₦    21
─────────────────────────
Net to SEIRS bank          ₦ 1,479
Driver share (75%)        ─₦ 1,109
SEIRS gross                ₦   370
Transfer fee              ─₦    20
Ops/support overhead      ─₦    50
─────────────────────────
SEIRS net per delivery     ₦   300
```

> **Volume negotiation:** Default rates assume low volume. Once volume hits ₦50M/month+, negotiate Flutterwave down to ~0.9% on local cards.

---

## ⑤ Loyalty Points System

McDonald's-style: non-monetary rewards earned by usage, redeemable only for SEIRS service discounts.

### Earn rates (defaults)

| Action | Points |
|---|---|
| Complete a delivery | 10 pts per ₦1,000 paid (round down, min 1 pt) |
| Pay with bank transfer (vs card) | +5 bonus |
| Refer a friend (referee's 1st paid order) | +200 (cap: 10 referrals/mo) |
| Rate a driver | +5 |
| 5th delivery in calendar month | +50 |

### Redemption

| Reward | Cost |
|---|---|
| ₦500 off next delivery | 500 pts (~₦1/pt) |
| Free standard delivery (≤5 km) | 1,000 pts |
| Priority dispatch (single use) | 300 pts |
| Insurance upgrade (1 delivery, ₦50k cover) | 200 pts |

### Tiers (rolling 12-month points)

| Tier | Range | Perks |
|---|---|---|
| Bronze | 0–999 | Base earn rate |
| Silver | 1,000–4,999 | 1.25× earn, free monthly delivery (≤3 km) |
| Gold | 5,000–14,999 | 1.5× earn, dedicated support, no surge |
| Platinum | 15,000+ | 2× earn, free unlimited (≤5 km), always-priority |

### Backend
- `LoyaltyPoint` ledger table: `userId`, `delta`, `reason`, `relatedDeliveryId`, `expiresAt`, `createdAt`.
- Balance = sum of non-expired entries.
- Points expire after 24 months of inactivity (any earn or redeem resets).
- Anti-abuse: same device/IP/payment-method cross-check on referrals.

---

## ⑥ Driver Earnings & Payout

### States
- **pending** — delivery done, dispute window open
- **available** — dispute window expired, ready to pay out
- **paid** — Flutterwave Transfer succeeded
- **held** — fraud review or active dispute

### Configurable parameters

| Param | Default |
|---|---|
| Dispute window | 24h |
| Driver share | 75% |
| Auto-payout cadence | Daily 2 PM |
| Min payout | ₦1,000 |
| Max daily payout (established) | ₦200,000 |
| Max daily payout (new <30d) | ₦50,000 |
| New-driver holdback (first 30 days) | 10% |

### Backend
- `DriverEarning` table: `id`, `driverId`, `deliveryId`, `grossAmount`, `seirsCut`, `driverNet`, `status`, `availableAt`, `paidAt`, `flutterwaveTransferId`.
- Cron: `flipPendingToAvailable` runs every 15 min — flips entries past `availableAt`.
- Cron: `runDailyPayouts` runs at 2 PM Africa/Lagos — sums available per driver, calls Flutterwave Transfer if ≥ min.
- Webhook: `POST /webhooks/flutterwave/transfer` — updates ledger to `paid` or rolls back to `available` on failure.

### Driver bank verification
Driver provides bank during onboarding. Verified via Flutterwave's bank-name-resolution (`POST /v3/accounts/resolve`) before any payout is allowed.

---

## ⑦ Refunds & Disputes

| Scenario | Refund | Driver impact |
|---|---|---|
| Customer cancels pre-assignment | 100% | none |
| Cancels with driver en-route | 75% + ₦500 driver comp from SEIRS share | driver paid for time |
| Cancels mid-delivery | 0% | driver paid in full |
| Driver no-show (≥30m) | 100% + 200 pts | driver loses earning + reliability score |
| Damaged goods (photo verified) | 100% + insurance claim | earnings held |
| Wrong delivery | 100% + free re-delivery | earnings withheld until corrected |
| Customer dispute | held; SEIRS reviews <24h | held |

### Mechanism
- `POST /v3/transactions/:id/refund` (Flutterwave) → money to original payment method.
- Loyalty points clawed back.
- Refund timeline: 1-7 business days depending on payment method.

---

## ⑧ Fraud Protection

### Customer-side
| Risk | Defense |
|---|---|
| Stolen card → chargeback | Flutterwave risk score; trigger 3DS for high-risk; block accounts with ≥2 chargebacks |
| Fake "didn't arrive" claim | Driver photo + GPS trail + recipient OTP at handoff (V8 §1.17) |
| Coupon/multi-account abuse | Device fingerprinting + phone verification + payment-method cross-ref |
| Loyalty point farming | Cap referrals (10/mo), points only after referee's 1st paid order |

### Driver-side
| Risk | Defense |
|---|---|
| Steals package | Pickup photo + recipient OTP + earnings hold + KYC + bank verification |
| Cash-on-delivery driver pockets cash | Real-time settlement: confirm in-app, owed amount deducted from next payout. Negative = suspension + collections |
| Ghost rides | GPS within 100m of pickup AND dropoff to mark complete |
| Fake customer accounts | Same device/payment cross-ref |

### Collusion
| Risk | Defense |
|---|---|
| Driver + accomplice game incentives | New customer must use real card/bank with name match; behavioral analysis |
| Surge manipulation | Cap surge at 1.5× base; acceptance-rate scoring (drivers <80% lose priority) |

### Velocity limits

| Action | New (<30d) | Established |
|---|---|---|
| Deliveries/day per customer | 5 | 20 |
| ₦/day per customer | 50,000 | 500,000 |
| Driver payout/day | 50,000 | 200,000 |
| Failed payment attempts | 3 in 1h | 5 in 1h |

---

## ⑨ Company Protection

### T&C must-haves
- Pass-through model disclosure (we are NOT a financial institution).
- Liability cap = lower of declared value vs insurance cap.
- Arbitration clause (Lagos, Nigerian Arbitration Act).
- Driver as independent contractor (not employee).
- Right to refuse service.
- Loyalty points: no cash value, may be modified, expire after 24mo inactivity.
- Data + KYC consent.

### Insurance to procure
- In-transit goods (₦100k cap baseline)
- Driver accident
- Cyber liability / data breach (NDPR)
- Public liability

### Regulatory checkpoints
- NDPR (NITDA registration + DPO + annual audit)
- FRCN advertising standards
- State operator licences (Lagos LASTMA, etc.)
- FCCPC (Consumer Protection Council) — refund policy + complaints handling

---

## ⑩ Revenue Streams

### Phase 1 (build for v1 launch)

| Stream | Take rate / fee |
|---|---|
| 1. Per-delivery commission | 25% of customer payment |
| 2. Surge pricing | 1.2×–1.5× base, capped |
| 3. Insurance upsell | ₦100 per ₦100k coverage |
| 4. Express / priority delivery | +30% on base |
| 5. Failed-delivery fee | ₦500 |

### Phase 2 (v1.1 — recurring revenue)

| Stream | Pricing |
|---|---|
| SEIRS Plus (consumer) | ₦2,500/mo |
| SEIRS Business | ₦15,000–100,000/mo |
| Driver Pro | ₦3,000/mo |
| Partner Store | ₦20k setup + ₦5k/mo + 5%/order |

### Phase 3 (v1.2 — ad-hoc)
- In-app advertising (CPC/CPM)
- Anonymized data products (B2B)
- White-label API
- Currency arbitrage on int'l cards
- Affiliate revenue (driver loans, insurance, mobile data)

### Cost levers
- Flutterwave fee negotiation at scale (target: 0.9% on local cards at ₦50M+/mo)
- CAC cap: ₦10k per active driver
- AI chatbot for L1 support (saves ~70% support cost)
- Discourage reverse logistics or batch pickups

---

## ⑪ Implementation Plan

### Phase 1 — v1 launch (~2-3 weeks)

#### Backend
1. `PaymentMethod` entity (token, last4, expMonth, expYear, isDefault, userId)
2. `FlutterwaveService` abstraction:
   - `chargeWithToken(token, amount, currency)`
   - `chargeWithNewCard(cardData, amount, currency)` — actually returns Inline init
   - `tokenize(transactionId)` → returns reusable token
   - `refund(transactionId, amount?)`
   - `transfer(bankCode, accountNumber, amount, narration)`
   - `verifyBankAccount(bankCode, accountNumber)` → name match
3. `POST /webhooks/flutterwave` — verify HMAC, dispatch by event type
4. `DriverEarning` ledger entity + service
5. Cron: `flipPendingToAvailable` (every 15 min)
6. Cron: `runDailyPayouts` (daily 2 PM Africa/Lagos)
7. `LoyaltyPoint` ledger entity + service (earn, redeem, balance, tier)
8. Refund service + reverse loyalty points

#### Customer app
- Replace `mockData.SAVED_CARDS` with real `GET /payment-methods` API call
- Hide payment-methods screen with "Coming soon" until backend is live
- "Add card" → opens Flutterwave Inline → tokenize → save token to backend
- Checkout: payment-method picker (cards + bank transfer + USSD + Apple/Google Pay)
- Loyalty screen: balance, tier progress, redemption

#### Business app
- Build payment-methods screen (mirror of customer-app, tied to business account)
- Wallet screen → keep existing top-up flow (already works)

#### Driver app
- Earnings dashboard (today/week/all-time)
- Payout history
- Bank account verification flow (one-time, during onboarding)
- "Request payout now" button

#### Admin dashboard
- Reconciliation report
- Manual refund tool
- Driver payout queue (held/available/paid)
- Fraud-flagged accounts

#### Cleanup
- Remove all Paystack references → grep for `paystack` (case-insensitive) and replace.
- Hide mock customer-app payment-methods UI immediately.

### Phase 2 — v1.1 (~3-4 weeks post-launch)
- SEIRS Plus subscription (Flutterwave recurring billing)
- Surge pricing engine (zone × time-of-day × demand/supply)
- Loyalty tier upgrades + automated tier emails
- Insurance integration (AIICO/Leadway partnership)
- Pay-on-delivery flow with driver settlement
- Velocity limits + automated fraud-flagging engine

### Phase 3 — v1.2 (~6+ weeks)
- Driver Pro subscription
- White-label API
- In-app ad placements
- Data analytics product

### Pre-launch checklist (legal/ops)
- [ ] Payments lawyer reviews T&C — confirms CBN positioning
- [ ] Insurance products procured (in-transit, driver accident, cyber)
- [ ] NITDA registered + DPO assigned
- [ ] Flutterwave volume rate negotiated
- [ ] State operator licences (Lagos + initial expansion)
- [ ] Dispute resolution playbook + complaint email/phone published
