# SEIRS scenario library

Generated 24 August 2026 from the three QA agents that drove the live
production API as real users. 62 scenarios.

This is a regression suite: each scenario is written so someone other than
the agent that wrote it can execute it. Re-run before every release.

| Status | Count |
|---|---:|
| passed | 6 |
| partial | 12 |
| failed | 27 |
| not run | 17 |

11 of the failures are already fixed and are kept as regression guards.

---

## Customer journeys

**Cast:** Femi (moving house), Amaka (daily sender), Tunde (first-timer), Ngozi (rewards)

Run against production with the demo customer token. Registration is a dead end for new accounts: POST /auth/register returns only {requiresOtp:true} and the code arrives by email, so scenarios needing a fresh account are marked NOT RUN with that reason.

### A1 Tunde's first booking  
*Tunde, brand new* - Someone who just signed up opens the app. Nothing should look broken, blank or fake.

**Steps**
1. POST /auth/register, verify OTP
1. GET /auth/me, /loyalty/balance, /promotions/active, /payments/saved-cards, /users/me/notification-prefs
1. GET /config/rate-card
1. POST /pricing/quote for a small parcel

**Must be true**
- Token issued
- loyalty balance 0 with tier bronze and history [], not null and not NaN
- Referral code present (it is the accountId)
- Saved cards an empty array, not an error
- Quote returns a finite total

**Status: NOT RUN** - findings C-M1

Blocked at the OTP gate. Registration itself FAILED: 500 returned while the account was still created.

### A2 Femi moves house  
*Femi, moving* - Femi books a house move worth NGN 850,000. He expects the premium disclosed, a motorcycle refused, scheduling only inside the 5am to 9pm window, and honest cancellation terms.

**Steps**
1. POST /pricing/quote {categoryCode house_move_single then house_move_full, declaredValueNgn 850000}
1. Attempt the same with vehicleType motorcycle
1. POST /deliveries with scheduledAt inside the window, then outside it
1. GET /deliveries/:id/cancel-quote then POST /deliveries/:id/cancel

**Must be true**
- highValuePremium about NGN 4,000 present in the breakdown AND shown as a High-value cover line
- Motorcycle blocked by the catalogue safety rules
- Recommended vehicle payload is at least the load
- A time outside 5am to 9pm is refused with a clear message
- The cancel fee quoted equals the fee charged

**Status: PARTIAL** - findings C-M2

Safety rules, premium disclosure and the premium maths all PASSED. Two high-value thresholds disagree: the engine charges above 50,000 while the UI treats 100,000 as high-value. Live booking and the schedule window were not run.

### A3 Amaka sends daily  
*Amaka, repeat sender* - Amaka fires off three deliveries to three addresses. Each recipient must be able to track their own parcel, and an unpaid booking must say so.

**Steps**
1. POST /deliveries three times
1. Capture each tracking code
1. GET /deliveries/track/:code with no auth for each
1. Inspect awaitingPayment

**Must be true**
- Three distinct codes
- Public tracking works for each and is scoped to that parcel only
- Unpaid shows awaitingPayment true and never fakes "finding a driver"

**Status: PARTIAL** 

awaitingPayment honesty and per-package scoping both confirmed correct. The live triple booking was not run.

### A4 Ngozi and the money edges  
*Ngozi, rewards-focused* - Ngozi checks her points add up and tries a promo code. Nothing should silently eat her code or her discount cap.

**Steps**
1. GET /loyalty/balance and compare the balance to the sum of history
1. POST /promotions/redeem with subtotalKobo 0
1. Redeem again on a real subtotal
1. Create and redeem a PERCENT promo with no maxDiscountKobo on a large subtotal

**Must be true**
- Balance equals the sum of non-expired ledger rows AND the client shows which rows expired
- A zero-subtotal redeem does NOT consume the code
- Percent promos have an enforced cap

**Status: FAILED** - findings C-1.3, C-M4, A-H12

A zero-subtotal redeem writes a redemption row and increments usageCount, burning the user's one allowed use for a NGN 0 discount. Their next real booking is told "you have already used this promo".

### A5 The same parcel, priced twice  
*Amaka* - The identical parcel must cost the same on every screen refresh, and a price that expired must never be charged behind the customer's back.

**Steps**
1. POST /pricing/quote twice, a minute apart, with identical inputs
1. Take a pinned quote, wait past the 10 minute TTL
1. POST /deliveries with the stale quoteToken
1. Also book with no token at all

**Must be true**
- Identical number on both calls
- Stale pin returns 409 QUOTE_EXPIRED with clear re-price copy
- A booking with no token must not silently reprice

**Status: PARTIAL** - findings C-M5

Determinism and the stale-pin refusal both PASSED. When no pin is sent the server recomputes at commit time with no protection, which is a silent reprice vector.

### A6 Cancellation and refund at each stage  
*Femi* - Femi cancels before assignment, after assignment, and too late. The fee must match what he was told.

**Steps**
1. Book, then GET /deliveries/:id/cancel-quote recording stage and feeNgn
1. POST /deliveries/:id/cancel
1. Repeat at each stage

**Must be true**
- Quoted feeNgn equals the amount withheld
- Stages match the card: pre_assign 0, post_assign 300, too_late refused

**Status: NOT RUN** 

Needs an authenticated booking. Reference values confirmed live on the rate card.

### A7 Tracking as an outsider  
*A stranger with a forwarded link* - Someone forwarded a tracking code. They should see status, never money, a phone number, or a customer surname.

**Steps**
1. GET /deliveries/track/:code with no token
1. Inspect every field including events[].meta
1. Try malformed and unknown codes

**Must be true**
- No price, fare or declared value
- No phone number
- Sender name absent, recipient first name only
- Handoff signature and proof photo stripped
- Bad codes return a clean 404, no stack trace

**Status: PASSED** - findings C-M3

All PASSED. Separately, the sibling /config/rate-card endpoint leaks the founder's legal name and internal pricing notes to anonymous callers.

### A8 Schedule window enforcement  
*Femi* - Pickups are only offered between 5am and 9pm. A time outside that must be refused by the server, not just hidden by the app.

**Steps**
1. POST /deliveries with scheduledAt at 03:00 and at 23:00

**Must be true**
- Refused with a clear message naming the window

**Status: NOT RUN** 

No hard server-side guard was locatable. Likely client-only. Verify before launch.

### A9 Live payment, verify and refund  
*Femi* - The full money path end to end through Flutterwave.

**Steps**
1. POST /payments/initiate
1. Complete the hosted page
1. POST /payments/verify/:ref
1. Cancel and confirm the refund

**Must be true**
- Money moves, escrow holds, refund returns the right amount

**Status: NOT RUN** 

Needs a real card. This is the founder live-money run.

### A10 Duplicate account by canonical email  
*Tunde* - me+a@gmail.com and me@gmail.com are the same inbox. They must not become two accounts.

**Steps**
1. Register both forms

**Must be true**
- The second is recognised as the first

**Status: NOT RUN** 

Blocked by the OTP gate.

### A11 Interstate surcharge disclosure  
*Amaka* - A long-distance booking carries a surcharge. The customer must see it, not just pay it.

**Steps**
1. Quote a booking crossing state lines

**Must be true**
- isInterState and isLongDistance flags returned and the surcharge itemised

**Status: NOT RUN** 

Not run.

### A12 Multi-stop pricing coherence  
*Amaka* - Several drops on one run should cost less per drop, not more.

**Steps**
1. Quote with stopCount greater than 1

**Must be true**
- Per-stop bonus and multi_stop_discount interact sensibly

**Status: NOT RUN** 

Not run.

---

## Driver and dispatch

**Cast:** Emeka (approved, online), plus Bola and Sade where a second driver was needed

The single-phone sweep cannot test races, declines or expiries: that is what this suite is for. Every booking was created UNFUNDED so it could never reach a real driver.

### B1 Emeka opens the job he was just offered  
*Emeka* - A rider taps a job in his list to read the address and price before accepting.

**Steps**
1. Customer creates a booking
1. Driver GET /deliveries/:id

**Must be true**
- 200 with pickup, drop-off, driverEarnings, and a first-name-only customer on a ride

**Status: FAILED (fixed)** - findings D-1.1

404 "Delivery not found." both before and after claiming, because findByIdForUser filtered on customer.id only. The entire manual-claim path was unreachable from the app. FIXED: the query now serves the assigned driver too, with redaction.

### B2 Emeka opens the job he already accepted  
*Emeka* - The rider is mid-job and reopens the app.

**Steps**
1. Driver claims
1. Driver GET /deliveries/track/:id (what active.tsx actually sends)
1. Compare with GET /deliveries/track/:trackingCode

**Must be true**
- The call the app actually makes returns the job

**Status: FAILED (fixed)** - findings D-1.2

active.tsx passed a delivery UUID to an endpoint that matches on trackingCode, so the main trip screen showed "Delivery not found" on every trip. FIXED: it now calls the entitled fetch.

### B3 Two drivers race for one job  
*Emeka and Bola* - Two riders see the same job and tap Accept at the same moment.

**Steps**
1. Create one booking
1. Fire both claims with curl -Z --parallel-immediate against the same URL
1. NOT background subshells: those are milliseconds apart and hide the bug

**Must be true**
- Exactly one 201
- The loser gets a clear "already taken"
- The job leaves the loser's available feed

**Status: FAILED** - findings D-H4

Eight simultaneous claims returned THREE 201s. claimByDriver does a findOne, checks, then updates unconditionally: no row lock, no WHERE guard on the update, no transaction. Sequential firing passes, so timing is everything.

### B4 Emeka accepts while Folasade cancels  
*Emeka and a customer* - The passenger changes her mind at the exact moment a rider accepts.

**Steps**
1. Background both the claim and the cancel, then wait

**Must be true**
- One wins
- If the claim landed first the cancel charges the post-assign fee (NGN 300) and pays the driver share (NGN 200)

**Status: FAILED** - findings D-H5

Both returned 201. Final state: cancelled, driver still attached, feeNgn 0, driverShareNgn 0. The customer escaped the post-assign fee and the driver was paid nothing for a job they had started navigating to.

### B5 Emeka declines, Bola collects  
*Emeka and Bola* - A rider passes on a job. It should reach the next rider.

**Steps**
1. Driver declines from the job screen
1. Check the server
1. Second driver checks available

**Must be true**
- The decline reaches the server
- The job is suppressed for the first and offered to the second

**Status: FAILED** - findings D-1.5, D-H8

No generic decline endpoint exists: /decline, /reject, /skip and /pass all 404. The button only calls router.back(). The dialog promises "this job will be offered to another driver". It will not be.

### B6 Emeka lets the 30 second offer expire  
*Emeka* - A rider's phone is in his pocket when a job is pushed to him.

**Steps**
1. Fund a booking so auto-match fires
1. Do nothing for 30 seconds

**Must be true**
- The job returns to the pool
- The customer is NOT told a driver is coming

**Status: FAILED** - findings D-H8

runAutoMatch sets ASSIGNED and notifies the customer BEFORE the driver sees the offer, so the customer already has "Driver Assigned!" while the countdown runs. Letting it lapse only navigates back, leaving the job assigned to someone who walked away.

### B7 A driver takes a job nobody paid for  
*Emeka* - A sender abandons checkout. The rider takes the job anyway and rides to a pickup that will be auto-cancelled.

**Steps**
1. Create a booking, do not pay
1. Driver GET /deliveries/available
1. Driver POST claim

**Must be true**
- Both refuse

**Status: FAILED** - findings D-H10

The feed gate works correctly (empty). The claim gate is missing entirely: claimByDriver never checks paymentHeldAt.

### B8 The six reasons a rider walks away  
*Emeka* - A rider cancels an accepted job for each real-world reason.

**Steps**
1. For each of emergency, vehicle_problem, unsafe, customer_unreachable, other: claim then driver-cancel
1. Check priorityPenaltyUntil and cancellationFeeNgn after each
1. Run unsafe FIRST so its exemption is unambiguous
1. Then wrong_booking_type on a separate booking, then an invalid reason

**Must be true**
- Customer charged nothing
- Booking returns to pending, except wrong_booking_type which cancels and charges NGN 300
- The pause fires on the third non-unsafe cancel in 24h
- unsafe NEVER counts against the allowance
- Garbage reasons rejected

**Status: PARTIAL** - findings D-M3, D-M4

Mostly PASSED, including the founder rule that unsafe never counts. Two failures: wrong_booking_type wrongly counts against the allowance despite the code comment saying it should not, which trains drivers to accept bogus bookings rather than report them.

### B9 A paused driver keeps working  
*Emeka* - A serial canceller is supposed to be benched for two hours.

**Steps**
1. Cancel until priorityPenaltyUntil is set
1. Claim a fresh booking

**Must be true**
- Offers and manual claims are suppressed for the pause window

**Status: FAILED** - findings D-M4

The "pause" is not a pause. It only applies a -0.15 match score and findAvailable never consults it. Claim returned 201 while paused.

### B10 Travel Buddy: a passenger books a seat and Emeka says yes  
*Emeka and a passenger* - A rider driving to Ibadan sells a spare seat. A passenger takes it.

**Steps**
1. Driver declares a trip with acceptsPassengers, a mappable city, pickup coords and routeKm
1. Customer browses travel-buddy trips
1. Customer books seats
1. Customer pays
1. Driver claims

**Must be true**
- tripOfferedAt set
- The booking is visible to THAT driver only
- Accept makes it theirs

**Status: PARTIAL** - findings D-H7

Declaration, browse, booking and accept all PASSED. The payment-gated half was not run because tripOfferedAt is only written by kickDispatch, which needs a funded booking. The accept response leaked the full customer record.

### B11 Travel Buddy: Emeka says no and the passenger is made whole  
*Emeka* - The rider's plans change after a seat is sold.

**Steps**
1. As B10, then POST /deliveries/:id/decline-trip-offer

**Must be true**
- Cancelled, fee 0, seats released, passenger refunded in full, notification sent

**Status: PASSED** - findings D-M6

State, fee, seat release and notification all PASSED. The refund itself was not exercised because no escrow existed, and the notification promises a refund regardless, which would generate support tickets.

### B12 Travel Buddy: nobody answers  
*Emeka* - A paid seat booking sits on a silent phone.

**Steps**
1. As B10, wait past travel_buddy_offer_timeout_min (30)
1. Let the 5 minute cron run

**Must be true**
- Cancelled, full refund, seats released

**Status: NOT RUN** - findings D-M5

Needs a funded booking and a 30 minute wait. The path shares closeTripOffer with the decline, which passed. But for an UNPAID booking this cron never fires and the 60 minute stale sweep cancels it without releasing the seats.

### B13 The seat ledger must never oversell  
*Emeka and five passengers* - Five people try to buy the last seat on a four-seat car at the same moment.

**Steps**
1. Fill the trip sequentially and confirm the next seat is refused
1. Cancel one booking to free exactly one seat
1. Fire FIVE simultaneous one-seat bookings with curl -Z --parallel-immediate
1. Cross-check seatsBooked against the count of live bookings carrying that tripId

**Must be true**
- Exactly one 201
- The ledger and the live bookings agree

**Status: FAILED (fixed)** - findings D-H6

Two 201s. Ledger said 4, bookings said 5: passenger five held a valid chargeable booking and no seat. The SQL guard was correct and held at 4; the code could not tell it had been refused. FIXED: the result is now read by shape, not by truthiness.

### B14 No stuffing: the vehicle decides the seat count  
*Emeka* - A rider tries to sell more seats than his vehicle has.

**Steps**
1. For each class, set the vehicle and declare cap+1 then cap

**Must be true**
- motorcycle 1, tricycle 3, car 4, van 14
- Over-cap refused

**Status: PARTIAL** 

motorcycle and car verified live at both boundaries, with a good refusal message: "No squeezing: that is the rule." tricycle and van not run, each needing another vehicle-change and admin approval.

### B15 Emeka reads the passenger's name  
*Emeka* - A rider accepts a ride and sees who he is carrying. He should see a first name and nothing else.

**Steps**
1. On a ride, fetch EVERY driver-facing payload: available, driver feed, job detail, claim, status patch, chat inbox, chat messages, public tracking
1. Then the admin payload
1. Dump sorted(customer.keys()), not just the name

**Must be true**
- First name only, no surname, phone, email or address anywhere driver-facing
- Admin keeps full identity

**Status: FAILED (fixed)** - findings D-H7

Three payloads returned the ENTIRE customer User row: email, date of birth, home address with coordinates, emergency contacts, bank account number, push token, lockout state. Chat was worst because it is the channel the anonymity design routes people to instead of a phone number. FIXED.

### B16 Emeka messages the passenger  
*Emeka* - The rider needs to say "I am outside" without a phone number.

**Steps**
1. Customer sends a message
1. Driver GET /chats
1. Driver GET /chats/:id/messages
1. GET unread-count

**Must be true**
- The thread appears in both inboxes
- Sender is first name and role only

**Status: FAILED** - findings D-M2, D-H7

The inbox is empty for BOTH parties: listConversations reads m.deliveryId, which is not a property on the entity, so every conversation is dropped. The Messages tab is dead in all three apps.

### B17 Emeka walks a multi-package run  
*Emeka* - A rider works a five-drop business run.

**Steps**
1. Driver GET /business/deliveries/:id
1. POST stops/:stopId/arrived
1. POST stops/:stopId/delivered

**Must be true**
- The assigned driver can load and progress every stop

**Status: FAILED** - findings D-1.3

All three return 403 "Business account required." Every multi-stop driver route sits behind BusinessAccountGuard, so multi-drop is dead on the driver side.

### B18 Emeka checks his money  
*Emeka* - A rider compares his dashboard against his statement.

**Steps**
1. GET /earnings/dashboard versus /earnings/history
1. Recompute today, calendar week, rolling 7d, calendar month and rolling 30d from driverNet and compare each

**Must be true**
- They agree, and the dashboard states which window it means

**Status: NOT RUN** - findings D-4.1

Both sides were zero so they trivially agree. The agent deliberately did not complete a delivery because of the demo payout risk below. Re-run on a non-demo driver.

### B19 Emeka tries to withdraw NGN 100  
*Emeka* - A new rider tries to cash out too early.

**Steps**
1. POST /earnings/payout with 100, 500 and 1000
1. Compare against the fee row and the dashboard

**Must be true**
- Clear refusal naming the minimum
- The app learns the minimum from the server

**Status: PARTIAL** - findings D-4.4, D-M7

The refusals PASSED with clear copy. The minimum is never sent to the app, so it falls back to a hardcoded 1000 and will disagree the day an admin retunes it.

### B20 A demo account gets paid real money  
*The payout cron* - A staged marketing account accrues earnings and the daily cron pays it out.

**Steps**
1. Confirm isDemo guards on payoutDriver and runDailyPayouts
1. DO NOT run the positive case: Flutterwave is in live mode

**Must be true**
- Demo accounts are excluded from both

**Status: FAILED (fixed)** - findings D-H9

Neither had an isDemo guard, and the demo driver carries a seeded payout account. The 13:00 Lagos cron would have attempted a real bank transfer. FIXED at payoutDriver, the single choke point both paths use.

### B21 Wrong actor, right token  
*Everyone* - Someone calls an endpoint meant for the other side.

**Steps**
1. Customer to /claim
1. Driver to customer /cancel
1. Driver to /cancel-quote
1. Driver to driver-cancel on someone else's job
1. Driver to decline-trip-offer on another trip

**Must be true**
- 403 with an honest message

**Status: PASSED** 

All five PASSED.

### B22 Three drivers register themselves  
*Emeka, Bola, Sade* - New riders sign up and wait for approval.

**Steps**
1. Register three
1. Verify OTP
1. Admin approves
1. Each goes online

**Must be true**
- Registration succeeds
- An unapproved driver is told clearly why they cannot go online

**Status: FAILED (fixed)** - findings C-M1

Failed at step one: 500 returned while the user and driver rows were created, stranding the account permanently. FIXED. Note claimByDriver never checks driver status, so an unapproved driver may be able to claim by hand: worth a dedicated run.

### B23 Seats leak when a checkout is abandoned  
*A passenger who closes the app* - Someone starts booking a seat and never pays.

**Steps**
1. Declare a 4-seat trip
1. Book 4 seats and never pay
1. Wait past pending_booking_expiry_minutes (60)
1. Re-read seatsLeft

**Must be true**
- The booking auto-cancels AND the seats come back

**Status: NOT RUN** - findings D-M5

Code-confirmed FAILING: expireStalePending never calls releaseTripSeatsFor, so the seats are gone for the life of the trip. Four abandoned checkouts reduce a car to zero seats forever. The highest-value scenario still unrun.

### B24 Two drivers reach the same trip offer  
*Emeka and Bola* - A seat booking must be private to the driver whose trip it is.

**Steps**
1. Driver A declares, passenger books and pays
1. Driver B checks available and tries to claim

**Must be true**
- Driver B never sees it and cannot claim it

**Status: NOT RUN** 

Needs a second driver and a funded booking. Both guards exist in code.

### B25 Two drivers claim the last seat on one trip  
*Emeka and Bola* - Combines the race and the seat ledger: the highest-value untested interaction.

**Steps**
1. Two drivers, one seat, simultaneous

**Must be true**
- Exactly one wins, ledger agrees

**Status: NOT RUN** 

Blocked by the registration failure above.

---

## Business, partner, support and disputes

**Cast:** Ibrahim (3-branch electronics), Chioma (partner counter), Yusuf (office manager)

Admin-side assertions are marked NOT RUN: admin login was refused by the sandbox policy. That is the single biggest gap in this suite.

### E1 Ibrahim ships to three offices in one booking  
*Ibrahim* - A wholesaler's order arrives and must be split across three branches on one run, paid once.

**Steps**
1. Quote with 3 packages and a declared value
1. Book with 3 stops and the quote pin
1. Read the delivery back
1. Track each package code publicly

**Must be true**
- ONE payment for the whole run, price equals the pinned total
- Sum of per-package prices plus partner handling EQUALS the charged price, to the kobo
- Three distinct codes, each scoped to its own package
- The delivery carries the summed declared value and requires recipient verification

**Status: FAILED** - findings E-H2, E-H4

NGN 781.67 unallocatable: the receipt lines total 10,019.98 while the card was charged 10,801.65, because the stored breakdown is recomputed without declaredValueNgn. Separately the run-level declared value stays null, so a NGN 250,000 monitor can be left at a gate with no ID check while the premium was still charged.

### E2 Ibrahim overloads the okada  
*Ibrahim* - He books three heavy cartons and picks a motorcycle by mistake.

**Steps**
1. Book a motorcycle with a lying dto weight and three 20kg stops

**Must be true**
- Refused, not silently accepted or auto-upgraded
- The server sums the real weight

**Status: PASSED** 

PASSED. 400 naming the summed weight, the vehicle and the cap.

### E3 Ibrahim puts forty drops on one okada  
*Ibrahim* - A long round of small drops no motorcycle could complete.

**Steps**
1. Quote with stopCount 40 and NO packages array
1. Book with 8 stops and no per-stop details

**Must be true**
- Both refused: stops beyond maxPackages is a 400 regardless of whether per-stop details were supplied

**Status: FAILED** - findings E-M3

Both succeeded. The cap is only checked when a packages array is present, which is exactly the shape the CSV path used to send. One okada, forty drops.

### E4 The same parcel, two apps  
*Ibrahim versus a customer* - The same box quoted from a company account and a personal account must cost the same.

**Steps**
1. Identical quote with each token, diff every field

**Must be true**
- Customer total and driver total identical
- No account-type multiplier anywhere

**Status: PASSED** 

PASSED exactly: NGN 2,386.50 customer, NGN 1,510.20 driver, byte-identical breakdowns.

### E5 The same ride, three apps  
*All three* - A ride quote must not vary by who is asking, including the driver's share.

**Steps**
1. Ride quote with all three tokens

**Must be true**
- Identical total AND driverEarnings per vehicle

**Status: PASSED** 

PASSED across all four vehicle classes.

### E6 Yusuf uploads the bulk spreadsheet  
*Yusuf* - He downloads the template from inside the app, fills in the week's deliveries, and uploads it.

**Steps**
1. Upload the app's own TEMPLATE_CSV verbatim

**Must be true**
- All rows parsed, zero validation errors on the platform's own template

**Status: FAILED (fixed)** - findings E-H1

Two of four rows vanished and both survivors were mangled, because the parser read columns by POSITION while the service read them by NAME. No CSV in any shape could work. RESOLVED by founder decision: the feature is deleted, multi-package Send covers it.

### E7 The bulk CTA that charges nothing  
*Yusuf* - The button says "Create 20 bookings (NGN 480,000 to pay)". He taps it and is never asked for money.

**Steps**
1. Preview a 25+ row CSV
1. Tap Create
1. Inspect each booking and what happened to the payment objects

**Must be true**
- Sum of created prices equals the preview total exactly
- The user is told the bookings are unpaid
- The preview total is pinned

**Status: FAILED (fixed)** - findings E-M5, E-M6

The preview applied a 10% bulk discount the booking path never applies, so every booking cost more than promised. Twenty separate checkouts were created and discarded. RESOLVED by the same deletion.

### E8 The no-wallet rule  
*Ibrahim versus Chioma* - CBN rules mean SEIRS must never hold a sender's naira. Partner stores and drivers ARE allowed earnings.

**Steps**
1. Probe every wallet-ish endpoint as a business account
1. Try every top-up route
1. Book while a balance exists
1. Then check the partner earnings ledger

**Must be true**
- No sender endpoint returns a spendable balance
- No top-up route exists
- A booking can never be paid from a stored balance
- Partner and driver ledgers ARE allowed and are labelled EARNINGS

**Status: PARTIAL** - findings E-M1, E-M2

BEHAVIOUR passed: every top-up route 404s, and a NGN 10,801 booking against a NGN 62,000 balance still demanded a card. The SURFACE failed: /business/wallet still returns a NGN balance and the statement calls credits "top-ups". Points are also valued at 10x the card rate.

### E9 The business home screen after a booking  
*Ibrahim* - He books twice, then opens the app.

**Steps**
1. Dashboard before, book, dashboard after

**Must be true**
- totalDeliveries increments, recentDeliveries lists them, weeklySpend equals the sum

**Status: FAILED** - findings E-H6

Zero, empty and zero throughout. The dashboard counts the wrong entity and reads a retired ledger, so the first screen says he has never used SEIRS while his card statement disagrees.

### E10 Chioma takes a parcel over the counter  
*Yusuf and Chioma* - A customer drops a package at her shop for a rider to collect later.

**Steps**
1. Quote the drop-off
1. Book it
1. Sender pays
1. Chioma issues an OTP and receives it
1. Driver leg is created
1. Release at the far end
1. Read the chain of custody

**Must be true**
- Counter fee matches the weight tier row (4kg = NGN 300)
- Partner keeps the share percentage (70% = NGN 210)
- Nothing crosses the counter unpaid
- Receiving credits the partner exactly once

**Status: PARTIAL** 

Quote and schedule PASSED with correct Fee-Catalogue-derived amounts, and the unpaid gate correctly refused custody. Receive and collect not run: needs a live payment and a sender OTP from an inbox.

### E11 Chioma's counter leaks its manifest  
*An attacker with any free account* - Someone with a throwaway account reads every parcel sitting on a partner shelf.

**Steps**
1. With a token belonging to NO party: list dropoffs, overstays and deletion-readiness for a store
1. Control: try the status PATCH, which is correctly guarded

**Must be true**
- All must be 403 for a non-staff caller, exactly like the control

**Status: FAILED (fixed)** - findings E-H5

All returned 200, handing over dropCode, backupCode, recipient name, phone, address and declared value for every parcel. Store ids are discoverable, so one account could enumerate counters and harvest the lot. FIXED: all three now require store staff.

### E12 Chioma checks what she has earned  
*Chioma* - She compares the figure on her screen with what reaches her bank.

**Steps**
1. Read partner earnings and statement
1. Sum the actual payout rows

**Must be true**
- The displayed total equals the sum of real payout rows

**Status: FAILED** - findings E-M4

Two ledgers on one screen. The headline uses a flat NGN 350 per parcel while the real credit is the weight-tiered NGN 210. Her screen advertises 350 and her bank receives 210.

### E13 Chioma's parcel sits too long  
*Chioma and a sender who never collects* - A box arrives, nobody comes for it, and the shelf space has to start costing someone something.

**Steps**
1. Take a parcel to received_at_store
1. Age it
1. Run the storage policy
1. Read overstays

**Must be true**
- Storage equals ceil((hours - free)/24) x daily rate
- Past the max days the status flips and the return fee is owed
- Tier boundaries derive from the fee rows, not hardcoded numbers

**Status: FAILED** - findings E-H7, E-M7

A parcel at 278.7 hours and 8 working days showed NGN 0 owed and an unchanged status. The policy sweep omits received_at_store, which is the status a parcel actually holds. Her shelf is a free warehouse.

### E14 Yusuf changes his mind about the drop-off  
*Yusuf* - He books a counter drop-off and then decides not to go.

**Steps**
1. Book a drop-off, then try to cancel it

**Must be true**
- A sender-facing cancel exists and the row moves to CANCELLED

**Status: FAILED** - findings E-M11

No route, no API helper, and the CANCELLED status is never assigned anywhere in the service. The row is immortal and blocks the store's deletion readiness forever.

### E15 Nobody is home  
*A driver at the door and Ibrahim on the phone* - The rider arrives and the receiver is not there.

**Steps**
1. Driver reports an arrival issue
1. Sender answers inside the window
1. If store: redirect and pay the fee

**Must be true**
- The sender window opens and notifies
- gate and neighbour are REFUSED above the high-value threshold
- The redirect fee is named before it is committed

**Status: NOT RUN** - findings E-H4

Needs a paid, assigned, in-transit delivery. Pre-flagged as broken for multi-package because the high-value gate reads a null run-level field.

### E16 Pay to find out where your parcel went  
*A receiver with only a tracking link* - A redirect fee is owed and the pickup location should stay hidden until it is settled.

**Steps**
1. Track the run code, then the package code
1. Pay, then re-read

**Must be true**
- Before payment the counter identity and location are hidden
- The mask must hold on the PER-PACKAGE payload too

**Status: PARTIAL** - findings E-M8

The mask only covers run-level dropoff fields, which are NULL on multi-stop runs, and the package address is returned unmasked unconditionally. The pay-to-reveal gate is bypassable.

### E17 Send it back  
*Ibrahim* - He gives up on a delivery and asks for the parcel to come home.

**Steps**
1. Get the return quote
1. Inspect it
1. Request the return
1. Pay

**Must be true**
- Transport equals the priced leg from where the parcel is to the immutable pickup
- The distance is real road distance
- Nothing commits until the sender accepts the amount

**Status: FAILED (fixed)** - findings E-H3

Quoted NGN 0 on every return because it read a property that does not exist, and measured 1,173 km from (0,0) in the Gulf of Guinea. It also committed anyway against the zero quote. FIXED to the founder spec: real position, storage included, no invented floor, and a confirmation guard.

### E18 Ibrahim disputes a damaged monitor  
*Ibrahim* - A NGN 250,000 monitor arrives cracked and he wants it on the record.

**Steps**
1. File a dispute as the SENDER
1. Read the chain of custody as owner and as a stranger

**Must be true**
- A sender can file a dispute, it flags the delivery and starts the escalation timer
- The liability rules the dashboard advertises are APPLIED, not just displayed

**Status: FAILED** - findings E-H8

403: report-issue is driver-only and is the ONLY writer of the dispute columns. There is no sender-side dispute path at all, so the escalation cron and the liability matrix are unreachable from the sender. Chain of custody scoping itself PASSED.

### E19 Ibrahim raises a support ticket  
*Ibrahim and an agent* - He needs help and opens a ticket.

**Steps**
1. Create, list, reply, read
1. Probe the agent-only routes as a business user
1. Try to close it

**Must be true**
- One queue: a ticket opened by another module appears here
- Non-agents cannot read the queue or post agent replies
- A user can always reach support

**Status: PARTIAL** - findings E-M12

The plumbing PASSED, including proof that the old two-parallel-systems defect is genuinely fixed. But a 3-open-ticket cap with no user-facing close locked the agent out of filing a real ticket.

### E20 Business SOS  
*Ibrahim* - Something goes wrong at his premises and he presses the button.

**Steps**
1. Trigger with his own delivery
1. Check the queue as a non-admin
1. Cancel
1. Fire five in four seconds
1. Fire one with a FOREIGN deliveryId

**Must be true**
- Reaches the same queue with full identity for admin
- Cancellable by the raiser only
- Rate limited
- deliveryId must belong to the caller

**Status: PARTIAL (fixed)** - findings E-M9, E-M10

Reaching the queue, admin-gating and cancellation all PASSED. Six alerts in four seconds all succeeded (no rate limit), and an alert could be attached to a stranger's trip, which then pushed "pressed SOS during your active trip" to that stranger. The party check is FIXED; rate limiting is not.

### E21 Business team roles  
*An owner, a manager, a dispatcher* - Three people from one company have different powers.

**Steps**
1. Each tries cancel, account edit and delivery edit

**Must be true**
- The controller comment says owner, manager and dispatcher may cancel

**Status: NOT RUN** - findings E-L8

Needs a second team member. Pre-flagged: the service calls requireOwner, contradicting its own controller comment.

### E22 Recurring templates  
*Ibrahim* - A weekly delivery that books itself.

**Steps**
1. Create, list, edit and delete a template
1. Let the cron run

**Must be true**
- nextRunAt respects the 5am to 9pm window
- Each run re-prices from the LIVE card
- The recurring discount applies on the booking path, not just the preview

**Status: NOT RUN** 

Not run. Worth checking explicitly for the same preview-versus-booking discount bug found in the CSV path.

### E23 Admin sees the queues  
*An admin* - Everything the other scenarios created should be visible and actionable to ops.

**Steps**
1. Read tickets, SOS, refund preview, return decisions, address-change decisions

**Must be true**
- The tickets and alerts raised above appear
- The refund preview names which pocket each naira comes from before anything moves

**Status: NOT RUN** 

Admin login was refused by the sandbox policy. THE HIGHEST-VALUE GAP in this suite: re-run with admin credentials.

### E24 Partner cashes out  
*Chioma* - She withdraws what she has earned to her bank.

**Steps**
1. Request a withdrawal

**Must be true**
- Only rows past the hold window are due
- A failed transfer returns them to pending and deducts nothing
- The paid total equals the sum of real payout rows

**Status: NOT RUN** 

Needs bank details and a real transfer.

### E25 Unauthenticated leak sweep  
*Anyone with curl* - What a stranger can read without signing in at all.

**Steps**
1. With no Authorization header, hit the rate card, service catalogue, partner directory, store dropoffs, nearby capacity and tracking

**Must be true**
- No admin identity, no internal notes, no cost basis, no other tenant data

**Status: FAILED** - findings E-M14, C-M3

The partner directory and public tracking PASSED. The rate card leaks the founder's full legal name, internal pricing commentary, and the complete driver cost basis for all seven vehicles: the unit economics, free to any competitor.
