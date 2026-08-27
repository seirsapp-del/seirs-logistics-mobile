# The first real payout, 27 August 2026

**₦1,322.71 reached Opay 7032408308.** Flutterwave transfer `116519166`.
That is the first money SEIRS has ever sent to a rider.

It took four declines to get there, and the one success then exposed
three faults the four failures could not, because all three live on the
far side of a completed transfer. Eleven commits, all deployed.

---

## What the founder saw, in order

1. **Demo guard refused it.** Correct: Emeka is a seeded account holding a
   real Opay number, and Flutterwave runs in live mode.
2. **`isDemo` lifted** by the founder (that call is blocked for Claude).
3. **"Flutterwave transfer failed"** with no reason. Useless to the rider
   and to support.
4. **"Please enable IP Whitelisting"** after one deploy surfaced the
   reason. Transfers via API were also switched off in the dashboard.
5. **"This request cannot be processed"** after the whitelist entry, because
   the Railway egress IP had rotated between the founder adding it and the
   next attempt.
6. **Sent.** After whitelisting the new IP.

## The bugs, worst first

### The holdback was taken and never returned  `dce58b0`

The line applying it says *"kept as available for next round"*. It was
not. Every claimed earning row is marked `paid` while only
`100 - holdback`% is transferred, and rows are never split. A 1,469.68
earning paid out 1,322.71 and the remaining **146.97 was recorded as
paid, sent nowhere, and removed from the balance**.

Every new rider was losing 10% of their first 30 days, silently, under a
comment stating the opposite. Nothing could reach it before tonight
because no payout had ever succeeded.

Now written back as a fresh `available` row. If that write fails the
rider is still owed it, so it logs at error level and files a
`payout.declined` audit row rather than passing quietly.

### The payout could pay twice  `7dde057`

Flutterwave was called *before* the earnings were marked paid. A dropped
connection between the two left the money gone and the rows still
`available`, ready to be withdrawn again. Small window, total loss.

Rows are now claimed into a new `paying` state first, conditionally, so
two concurrent requests cannot both take the same earnings. A clean
refusal releases the claim; a *thrown* transfer does not, because that
is ambiguous, and those rows stay out of the balance until someone
checks the reference.

**Exercised four times for real tonight. Released cleanly every time.**

### The bank account name was the caller's  `7dde057`

`PATCH /payments/bank-details` stored whatever `bankAccountName` arrived
in the body. The apps resolve it first, which is why it looked sound.
Anything calling the API directly could file its own account number
under the holder's real name, and **the admin reviewing that change
would have seen exactly what they expected**. `bankVerifiedAt` was
declared with a comment promising payouts check it, and was never
written by any code path.

### The books disagreed with the bank  `8b401c6`, `9a8e4a2`

Nothing recorded money leaving. Admin figures were summed from
`driver_earnings` rows marked paid, which is what riders **earned**, not
what SEIRS **sent**. The dashboard reported 1,469.68 against a 1,322.71
transfer, and "1 transfers" counted earning rows, so one withdrawal
across three deliveries would have read as three.

New `driver_payouts` table: one row per transfer, with requested, sent,
withheld, reference and Flutterwave id. Rows predating it are labelled
"earned, not confirmed sent" rather than hidden.

### The rider was told untrue things  `ffd752a`, `0a90e42`, `2fb754f`

- Decline reasons first told them nothing, then leaked our merchant
  config to them. Now: safe sentence to the rider, real reason to the
  admin audit log against that rider.
- The holdback was never disclosed before confirming.
- The success screen said the shortfall was because *"withdrawals match
  whole deliveries"* (wrong mechanism) and that *"the rest stays
  available"* (it had not). Two falsehoods at the moment money moved.

### No receipt, no way to correct  `8b401c6`, `9316aff`, `249c0c5`

Riders were notified when they **earned** and never when they were
**paid**. Added push, in-app and email (`payout_sent`, `payout_failed`,
both editable in the admin Email Templates screen). Neither promises an
arrival time.

Nothing could put money back after a settlement error either. Added a
capped, audited, super-admin correction endpoint.

---

## Open, needs the founder

| Item | Why it needs you |
|---|---|
| **Emeka is owed ₦146.97** | Correction endpoint is deployed; needs a fresh admin token |
| **Emeka is armed for real money** (`isDemo=false`) | That call is blocked for Claude |
| **Railway static egress** | Pro-plan feature. Three IPs, **shared not dedicated** |
| **`driver_clearance_business_days` is 0** | No dispute buffer. Deliberate for testing, must be raised |

## Ready for tomorrow

Refunds, partner payouts and failed-trip compensation are **still
unproven and share this code**. Assume they carry the same class of
fault until each is run for real. That is the right order to test in.

---

## Audit of the paths that share this code

Tonight showed how much hides on the far side of a provider call, so I
audited the three untested money paths for the same class of fault.

### Refund: had it, worse  `7d6e3cc`

`refundEscrow` caught the Flutterwave error, logged it, and stamped
`REFUNDED` anyway. A declined refund left the customer out of pocket
while the row said their money was back. No balance for them to notice
it in, no retry, and a record that states the opposite of the truth.

Not hypothetical: Flutterwave refused us four times tonight over IP
whitelisting, and refunds use the same provider from the same rotating
egress address. The next IP change would have silently lost customer
refunds.

Now the escrow stays `HELD` on failure, which is truthful and
retryable, and nothing downstream runs, so the customer keeps their
loyalty points until they keep their money. Added
`GET /admin/wallet/stuck-refunds` because both callers swallow the
error, so it would otherwise be invisible. **That list should be empty.**

### Partner payout: already correct

Marks rows `processing` *before* the transfer, reverts to `pending` on
failure, `paid` on success. That is the claim-and-release pattern the
driver payout was missing. No change made.

One residual subtlety, shared with the driver path: `transferToBank`
catches internally and returns `success: false`, so a timeout *after*
Flutterwave received the request looks identical to a clean refusal, and
the rows go back to `pending`. The driver path now leaves an ambiguous
throw in `paying` rather than releasing it; the partner path does not
make that distinction. Low likelihood, real if it happens.

### Failed-trip compensation: cannot have the transfer bug

It only records an earning row; the money moves later through the payout
path, which is now fixed.

**Known fragility, deliberately not changed tonight.**
`recordForDelivery` dedupes on `deliveryId` alone and returns the
existing row. So any second earning for the same delivery is silently
dropped, and compensation for a delivery that already earned would
vanish with only a log line. The holdback carry-forward row added
tonight also reuses `deliveryId`, which makes two rows per delivery
normal and the dedupe more ambiguous than it was.

I did not touch it. That dedupe is what stops riders being paid twice
for one job, and rewriting it without tests at midnight trades a latent
problem for a live one. It needs a `(deliveryId, purpose)` key and a
proper test, in daylight.

## Suggested order for tomorrow

1. **Credit Emeka the ₦146.97** (endpoint deployed, needs a token)
2. **Check `stuck-refunds` is empty** before testing anything else
3. **Refund**, using a real booking, and confirm money actually returns
4. **Partner payout**, which should behave since the code is already right
5. **Failed-trip compensation**, watching whether the dedupe drops it
