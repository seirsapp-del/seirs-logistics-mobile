# SEIRS sweep and audit register
Generated 23 August 2026 from the device sweep and the five per-surface code audits.
This file is generated. Edit `scratchpad/reg/*.py` and re-run `build.py`.

## Totals
| Severity | Found | Closed | Open |
|---|---:|---:|---:|
| HIGH | 72 | 54 | 18 |
| MEDIUM | 145 | 120 | 25 |
| LOW | 61 | 57 | 4 |
| **Total** | **278** | **231** | **47** |

15 of these were found by driving the phone, not by reading code.
6 are blocked on a founder decision.

---

## Customer app

HIGH 13/13 closed · MEDIUM 38/41 · LOW 9/10


### HIGH

- [x] **C-1.1 Drawer "Send Multiple" navigated to a route that does not exist**  
  `components/Drawer.tsx:48`  
  navigate("/(customer)/business"). No such file, and the generated router type union contains zero occurrences of "business". One of six drawer items was a dead end; on device it simply closed the drawer and did nothing.  
  *Fix:* Repointed at /(customer)/send, which IS the multi-package flow.
- [x] **C-1.2 SOS Quick Dial said it was calling and called nothing**  
  `app/(customer)/sos.tsx:177-188`  
  onPress showed Alert "Calling Police (199)..." and placed no call. Linking was not even imported in the file. In an emergency this is the worst possible lie.  
  *Fix:* Imported Linking, onPress now opens tel: with an Alert fallback.
- [x] **C-1.3 "Apply Code" permanently burns the promo and never reaches checkout**  
  `app/(customer)/promo.tsx:55`  
  Calls promotionsApi.redeem({code, subtotalKobo: 0}). The backend redeem() is a real redemption, not a validation: it counts against perUserLimit, persists a redemption row and increments the campaign-wide usageCount. With subtotal 0 the discount applies to nothing. No booking flow anywhere reads a promo code, so the promised checkout does not exist. Two harms: the customer loses their one allowed use and is told the opposite, and anyone can drain a campaign usageLimit from this screen without booking.  
  *Fix:* Add a validate-only endpoint (or dryRun flag) and call that; persist the accepted code into the booking store and pass it to deliveriesApi.create.
- [x] **C-2.1 share-trip shows a fabricated pickup and dropoff**  
  `app/(customer)/share-trip.tsx:31`  
  MOCK_TRIPS.find(tr => tr.id === id) ?? MOCK_TRIPS[2]. Real deliveries have UUIDs so find always misses and trip becomes the fictional Surulere to Ajah trip, rendered verbatim on the share card. Worst path: Drawer, SOS, "Share My Live Location" passes an undefined deliveryId, so a user sharing their location during an emergency shares someone else invented route. A 2026-08-15 sweep fixed the tracking code here and left the addresses.  
  *Fix:* In the .then at 42-44 also setFetchedTrip(d) and render fetchedTrip?.pickupAddress instead of trip.pickupAddress.
- [x] **C-3.1 usersApi.saveNotificationPrefs does not exist; both toggles threw**  
  `app/(customer)/notification-settings.tsx:57,111`  
  The method exists nowhere in the monorepo (confirmed by exhaustive repo-wide search). Calling undefined throws synchronously BEFORE a promise exists, so .catch cannot help. The privacy switch threw inside onValueChange (render-phase, red screen); the marketing switch threw inside a setTimeout as an unhandled exception. Neither preference had ever saved. This included the anonymity toggle shipped the same morning.  
  *Fix:* Renamed both to usersApi.updateNotificationPrefs, which exists and is already used correctly by privacy.tsx:76.
- [x] **C-4.1 The entire SOS screen was unreadable in light mode**  
  `app/(customer)/sos.tsx:121 and all text styles`  
  Root background isDark ? #0A0000 : #FFF1F1 (near-white) while every text style is hardcoded white or translucent white. On #FFF1F1 all of it vanishes. A dark-mode device sweep never sees this; a daytime user in an emergency sees a blank red-tinted screen with a red circle.  
  *Fix:* Deep red (#7F1D1D) ground in light mode too, so the white text reads in both themes. Verified on device.
- [x] **C-5.1 The app promises a 10% scheduling discount that does not exist**  
  `i18n/locales/en.json:299 and :305`  
  "schedule the pickup an hour ahead. You get a 10% discount" and "The 10% discount applies automatically, no code". constants/rateCard.ts:443-449 enumerates every discount: bulkUploadOffPct 0.05 (min 50 packages), recurringOffPct 0.03, welcomeOffPct 0.10 (capped N300), loyalty points. There is no scheduling discount, and nothing in the backend matches either. A customer who schedules pays full price after being told twice it would be 10% less.  
  *Fix:* Delete the two sentences, or add an admin-tunable scheduledAheadOffPct to the rate card and honour it.
- [x] **C-5.2 SOS claimed emergency contacts are notified; they are not**  
  `i18n/locales/en.json:842,845`  
  sos.service.ts fans out to all admins plus the other party on an active delivery. Nothing reads emergencyContactName/Phone, and per the no-SMS-at-launch policy nothing could. The user was asked to enter that contact on edit-profile, so they had every reason to believe it worked.  
  *Fix:* Copy now names who is actually reached, corrected in all four locales.
- [x] **C-5.3 Terms of Service link was a dead end**  
  `app/(customer)/(tabs)/profile.tsx:123`  
  Linking.openURL to /terms. The website route is /terms-of-service. The .catch fallback never fires because openURL succeeds at opening a browser onto a 404.  
  *Fix:* Repointed to /terms-of-service.
- [x] **C-D1 Keke, Small Truck and Large Truck could not be booked at all**  
  `shared/services/api.ts pricingApi.quote`  
  The Send screen holds the UI alias (keke, truck_sm, truck_lg) as its vehicle id and pricingApi.quote passed it straight through, so the engine answered "Unknown vehicle type: keke". Booking refuses without a server quote, so tapping Pay after the full four-step flow surfaced the raw backend error. deliveriesApi.quote/create normalised aliases all along; the pricing call never did.  
  *Fix:* pricingApi.quote now runs normalizeBodyVehicle. Verified end to end: SRS-QS335M4Q booked at N2,589.
- [x] **C-D2 The review showed a price the server does not charge**  
  `app/(customer)/send.tsx quote fallback`  
  The failed quote was caught silently and the screen fell back to the bundled client formula, which prices the service fee as an 18% PERCENTAGE while the live card charges a FLAT amount, currently 0. Review read N2,650 where the engine returns N2,588.96.  
  *Fix:* Fixed by C-D1: the server quote now lands, so the review shows N2,589 and the phantom N376 service-fee row is gone.
- [x] **C-D3 A real fee was charged and never shown**  
  `app/(customer)/send.tsx Order Summary`  
  Declaring a package value above the card threshold adds a premium (N500 at N150,000, N24,750 at N5,000,000, verified against the live engine) folded silently into the total. The summary own comment already called a hidden non-zero fee a lie.  
  *Fix:* Added a High-value cover line, rendered only when the engine charges one.
- [x] **C-D5 The "Features" tab rendered the customer own cancelled bookings**  
  `app/(customer)/(tabs)/index.tsx:136`  
  TRIPS.slice(0, 2) grabbed the two most recent bookings whatever their state. On the founder phone it showed two cancelled QA rows under a tab promising features. Cancelled bookings had no home anywhere else in the app.  
  *Fix:* The tab is now Cancelled and filters on that status.

### MEDIUM

- [x] **C-1.4 share-trip "Copy" button never copies**  
  `app/(customer)/share-trip.tsx:55-58`  
  handleShare("copy") sets copied=true for 2s and returns. The label flips to "Copied!" with a checkmark and the clipboard is untouched. expo-clipboard is a dependency used correctly in 8 other screens.  
  *Fix:* await Clipboard.setStringAsync(shareLink) before setCopied(true).
- [x] **C-1.5 Profile fetches the wallet on every focus and renders nothing**  
  `app/(customer)/(tabs)/profile.tsx:31,53,59`  
  walletBalance is set from paymentsApi.wallet() and never read. The comment at 217-221 explains the wallet cell was removed; the fetch was not. A wasted round-trip on every tab focus.  
  *Fix:* Delete the state and drop paymentsApi.wallet() from the Promise.all.
- [x] **C-1.6 Rewards tab fetches community pulse and renders nothing**  
  `app/(customer)/(tabs)/wallet.tsx:55,66,77`  
  pulse is set from deliveriesApi.communityPulse(); the section was removed. Styles pulseCard/pulseIcon/pulseCount/pulseCountUnit/pulseSub are dead too.  
  *Fix:* Remove the state, the call and the five styles.
- [x] **C-1.7 Home runs a scroll animation for buttons that no longer exist**  
  `app/(customer)/(tabs)/index.tsx:63-95,147`  
  onScroll with scrollEventThrottle 16 drives hideFabs/showFabs animating fabTranslate; nothing renders it (FABs removed). animateAndGo, sendWidth, rideWidth have one reference each. Styles fabPair/fabRow/fabPressable/fabLabel and drawerOverlay..drawerSignOutText are dead.  
  *Fix:* Delete onScroll/scrollEventThrottle, lines 60-95 and the dead styles.
- [x] **C-1.8 Transaction detail has a share button with no onPress**  
  `app/(customer)/transaction/[id].tsx:48-50`  
  A Pressable with a share icon and no handler.  
  *Fix:* Wire it to Share.share or remove it.
- [x] **C-1.9 Rating submit failure is invisible**  
  `components/RatingModal.tsx:31-33`  
  On throw, setSubmitted(true) is skipped and the catch is empty. The spinner stops, the form reappears, no message.  
  *Fix:* Surface the error in the modal.
- [x] **C-1.10 Privacy screen has a loaded-but-unrendered toggle**  
  `app/(customer)/privacy.tsx:57,67,81`  
  personalisedAds is read from the server and onTogglePersonalised exists, but no ToggleRow renders it. PRIVACY_PREF_KEYS is declared with an explanatory comment and never used.  
  *Fix:* Render the row or delete the state.
- [x] **C-2.2 MOCK_VEHICLES fallback mislabels every cargo vehicle**  
  `app/(customer)/fare-breakdown.tsx:54`  
  MOCK_VEHICLES ids are economy/premium/truck; the cargo picker passes bicycle/motorcycle/keke/car/van/truck_sm/truck_lg, so the lookup can never hit and it renders "Economy / Affordable everyday rides / 4 min" regardless. A landmine rather than a live bug because the cargo branch is unreachable (C-6.1).  
  *Fix:* Delete the screen or map ids properly.
- [x] **C-2.3 trip-progress falls back to mock trip and mock driver**  
  `app/(customer)/trip-progress.tsx:79,82,92`  
  mockTrip ?? MOCK_TRIPS[2], MOCK_DRIVERS[0], and eta: mockDriver.eta (hardcoded 4) is used even when a real driver was fetched. Unreachable today (C-6.2).  
  *Fix:* Delete the screen.
- [x] **C-2.4 Transaction detail is 100% mock**  
  `app/(customer)/transaction/[id].tsx:31`  
  MOCK_TRANSACTIONS.find(...) ?? MOCK_TRANSACTIONS[0], rendering "Wallet Top-up +N20,000 Bank Transfer success" as a real transaction. Unreachable today.  
  *Fix:* Delete the screen or wire it to the real ledger.
- [x] **C-2.5 Bundled article content carries stale dated promos and fabricated partnership claims**  
  `constants/heroCards.ts:16, i18n/locales/en.json:288-296`  
  The file states the contract: keep it evergreen, no dated promos, since changing it needs an app release. The data below it says "Up to 25% off your first three orders this week" and "Shoprite Surulere and Lekki branches open next month, followed by Ikoyi in July. We are also in talks with Spar and ShopRite Apapa." publishedAt is 2026-05-17, so those dates are three months past, and it names real retailers with partnership claims.  
  *Fix:* Rewrite evergreen or move to the CMS.
- [x] **C-2.6 Fabricated performance statistic**  
  `i18n/locales/en.json:311`  
  "Customers who schedule even 60 minutes ahead see deliveries arrive 18 minutes faster on average." No such data exists pre-launch, and it is also a delivery-speed claim.  
  *Fix:* Delete the sentence.
- [x] **C-4.2 Send CTA used raw insets.bottom under a comment asserting the opposite**  
  `app/(customer)/send.tsx:2015-2021`  
  Comment claimed insets.bottom is ~48dp on the 3-button layout. request.tsx:376-378 records the measured truth: it lies as 0 there. Send, the primary conversion flow, was left on the raw value.  
  *Fix:* Math.max(insets.bottom, 24) and the comment now states what was measured.
- [x] **C-4.3 Onboarding three CTAs use raw insets.bottom**  
  `app/(auth)/onboarding.tsx:172`  
  paddingBottom: insets.bottom + Spacing.md. With insets.bottom 0 the "Become a Driver" button sits ~16px off the edge, under the nav bar. This is the first screen a new user ever sees.  
  *Fix:* Math.max(insets.bottom, 24) + Spacing.md.
- [x] **C-4.4 Tab bar uses raw insets.bottom**  
  `app/(customer)/(tabs)/_layout.tsx:61-62`  
  height 64 + insets.bottom, paddingBottom 10 + insets.bottom. app.json has edgeToEdgeEnabled true, so with insets.bottom 0 the labels sit 10px from the physical edge.  
  *Fix:* Math.max(insets.bottom, 12) in both.
- [x] **C-4.5 The keyboard covered the field being typed into**  
  `app/(customer)/send.tsx:1008`  
  KeyboardAvoidingView behavior is undefined on Android and the CTA bar sits outside the ScrollView. Reproduced on the A30: tapping "What is it?" opened the keyboard straight over the input and the list never scrolled, so the sender could not see their own typing. The business Send solved this on 2026-08-16 and customer never got the fix.  
  *Fix:* Ported the business lift: measureInWindow the focused node against the real keyboard top and scroll by the overlap, with the first focus handled in keyboardDidShow. Verified on device.
- [ ] **C-4.6 Documents modal bottom padding is thin**  
  `app/(customer)/documents.tsx:115`  
  paddingBottom 20 + insets.bottom on a sheet whose Share/Close buttons are the last element. 20px floor is thin but not zero.  
  *Fix:* Raise the floor to 24-28.
- [x] **C-5.4 Dispute Resolution link 404s**  
  `app/(customer)/privacy.tsx:246`  
  https://seirs.app/dispute-resolution. No such route exists on the site.  
  *Fix:* Repointed at /terms-of-service, which carries the disputes section. Same fix applied to the driver app.
- [x] **C-5.5 Em-dash in user-visible copy (banned project-wide)**  
  `app/(customer)/track.tsx:51`  
  picked_up: 'Arrived - meet them outside' uses an em-dash, rendered at line 493. 13 more sit in comments.  
  *Fix:* Replace with a comma or colon.
- [x] **C-5.6 Version string is fabricated**  
  `i18n/locales/en.json:1051`  
  "SEIRS Logistics v2.0.0 Build 204", rendered at profile.tsx:287. app.json says version 1.0.0. Support will ask what version the user is on and get a made-up answer. Duplicated across all four locales.  
  *Fix:* Render from expo-constants.
- [x] **C-5.7 SOS instruction contradicted the control**  
  `i18n/locales/en.json:844, sos.tsx:140`  
  Copy said "Press and hold SOS button in an emergency" but the control uses onPress, a plain tap.  
  *Fix:* Copy changed to "Tap SOS in an emergency" in all four locales.
- [x] **C-5.8 SOS gives three different emergency numbers**  
  `sos.tsx:24-25, en.json:857-858`  
  sos.tsx says Police 199; en.json callPolice says "Call Police (112)"; en.json says "call 199 directly"; sos.tsx assigns 112 to Ambulance. 112 is Nigeria national emergency number and 199 is commonly fire service.  
  *Fix:* FOUNDER DECISION: confirm the correct number set before launch. I will not guess at numbers someone dials in a crisis.
- [x] **C-5.9 Card-removal dialog shows the empty-state text**  
  `app/(customer)/payment-methods.tsx:65`  
  Passes paymentMethods.emptyDesc as the body of a destructive confirmation, so under the heading "Remove VISA ****4532" it reads "Pay for your first delivery and your card appears here on its own."  
  *Fix:* Write a real confirmation body.
- [x] **C-5.10 "Activating in 5s" with a Cancel button, after the alert already fired**  
  `app/(customer)/sos.tsx:66-69,59-64,157-161`  
  sosApi.trigger runs immediately; the countdown and Cancel imply it has not sent. cancelSOS does call sosApi.cancel so the outcome is correct, the copy is not.  
  *Fix:* "SOS sent. Cancel within 5s if this was a mistake."
- [x] **C-5.11 Hardcoded "Live Tracking Active"**  
  `app/(customer)/share-trip.tsx:87`  
  Rendered unconditionally, including when the screen is opened from the drawer with no delivery at all.  
  *Fix:* Gate on a real delivery.
- [x] **C-5.12 Emoji and brand casing in RatingModal**  
  `components/RatingModal.tsx:70,50,53`  
  Uses a star emoji for the five rating stars and a folded-hands emoji; every other icon in the app is Ionicons or lucide, and emoji cannot be theme-tinted. Line 53 reads "helps us improve Seirs"; the brand is SEIRS everywhere else.  
  *Fix:* Swap to lucide icons and fix the casing.
- [x] **C-6.1 fare-breakdown.tsx (373 lines) is unreachable**  
  `app/(customer)/fare-breakdown.tsx`  
  Its only caller is vehicle-select.tsx:460, which runs solely in the !isRide branch. request.tsx always passes mode ride, and send.tsx never touches either screen. The whole screen and the cargo branch feeding it are dead.  
  *Fix:* Delete, or reconnect if the cargo breakdown is wanted.
- [x] **C-6.2 trip-progress.tsx is unreachable**  
  `app/(customer)/trip-progress.tsx`  
  Nothing navigates to it; only comments match. Carries the mock fallbacks in C-2.3, a hardcoded chatId "chat1" at 492, and __DEV__ auto-advance timers at 171-175.  
  *Fix:* Delete.
- [x] **C-6.3 transaction/[id].tsx is unreachable**  
  `app/(customer)/transaction/[id].tsx`  
  Unreachable, fully mock (C-2.4), dead share button (C-1.8).  
  *Fix:* Delete.
- [x] **C-6.4 add-payment.tsx is unreachable but still charges a real N100**  
  `app/(customer)/add-payment.tsx:18-22,51`  
  No screen navigates to it, but it is registered at /add-payment and fully wired to paymentsApi.addCardStart, a real N100 Flutterwave charge. payment-methods.tsx states the flow was deliberately replaced by save-on-first-payment. That contradicts the standing note that the N100 add-card UX shipped and must not change without asking. Line 39 also promises a refund "within 5-10 business days".  
  *Fix:* FOUNDER DECISION: is save-on-first-payment the intended behaviour, and should this screen be deleted?
- [x] **C-6.6 components/RatingModal.tsx (135 lines) is exported and never imported**  
  `components/RatingModal.tsx`  
  The live rating flow is app/(customer)/rate/[driverId].tsx. Carries C-1.9 and C-5.12.  
  *Fix:* Delete.
- [x] **C-7.1 promo.tsx comment claims the Apply check is validate-only**  
  `app/(customer)/promo.tsx:44-47`  
  Says the live Apply check only validates existence/activity/per-user cap and the discount recalculates at booking. Both halves are false: the backend persists a redemption and increments usageCount, and there is no booking-time re-application. This comment is why C-1.3 looked safe.  
  *Fix:* Correct it when fixing C-1.3.
- [x] **C-7.2 send.tsx comment asserted a disproven inset model**  
  `app/(customer)/send.tsx:2015-2017`  
  Claimed insets.bottom is ~48dp on 3-button Android; measured as 0.  
  *Fix:* Comment rewritten to state the measurement.
- [x] **C-7.3 payment-methods.tsx describes a CTA that does not exist**  
  `app/(customer)/payment-methods.tsx:87-89`  
  Says the add-payment CTA lives in the body (empty state plus "Add another" at the bottom of the list). No such CTA exists anywhere in the file.  
  *Fix:* Delete the comment.
- [x] **C-8.1 Every finished delivery renders a grey badge instead of green**  
  `app/(customer)/(tabs)/index.tsx:40`  
  statusVariant returns success for 'completed', but DeliveryStatus has no 'completed'; the terminal value is 'delivered'.  
  *Fix:* s === 'delivered' || s === 'completed' ? 'success' : ...
- [x] **C-D4 The Pay button sat dead with no reason given**  
  `app/(customer)/send.tsx CTA bar`  
  The consent checkbox is the last element on a long review, so landing at the top you see a greyed-out "Pay N2,589" and nothing explaining it.  
  *Fix:* A hint above the CTA names the blocker and taps through to the checkbox.
- [x] **C-D6 Home trip cards printed kobo and gave rides a truck icon**  
  `app/(customer)/(tabs)/index.tsx:363,376`  
  N4,676.25 instead of N4,676; every row used the delivery-truck icon including rides.  
  *Fix:* Math.round on the price and a car icon when kind is ride.
- [x] **C-D7 Empty states were raw English strings in a four-language app**  
  `app/(customer)/(tabs)/index.tsx:342-347`  
  Hardcoded English while everything around them used t().  
  *Fix:* Six keys added across en, ha, ig and yo.
- [x] **C-D8 The unpaid state used a colour that is not in the SEIRS palette**  
  `trip/[id].tsx, track.tsx, (tabs)/index.tsx`  
  Founder caught this on the phone: generic Tailwind amber (#F59E0B / #D97706) appears nowhere in the brand palette.  
  *Fix:* Brand yellow #FFBE0B with navy text for contrast, unpaid state only. Genuine warnings stay amber.
- [ ] **C-D9 The cargo vehicle step shows no prices**  
  `app/(customer)/send.tsx step 3`  
  The ride flow shows a live price per vehicle; the package flow shows only capacity, so a sender picks Okada vs Car vs Danfo blind until the review screen.  
  *Fix:* FOUNDER DECISION: build per-vehicle pricing on the cargo step to match the ride flow?
- [~] **C-D10 The home hero gradient is nearly invisible in dark mode**  
  `components/HomeHeroAnimated.tsx:94-95`  
  skyTop #1C2128 to skyBottom #0D1117 against a near-black page, so the top of the card has no visible boundary and the hero reads as half-painted. Fine in light mode.  
  *Fix:* FOUNDER DECISION: lift the dark-mode gradient or give the card a border.

### LOW

- [x] **C-6.5 app/modal.tsx is an untouched Expo template**  
  `app/modal.tsx`  
  Renders "This is a modal". Reachable at /modal and listed in _sitemap.  
  *Fix:* Delete.
- [x] **C-7.4 heroCards.ts contradicts itself about ctaKey/ctaRoute**  
  `constants/heroCards.ts:8-10 vs 81-82`  
  Lines 8-10 say they render an action button; 81-82 say the article view does not render a sticky CTA. No card sets either field and the article screen never reads them.  
  *Fix:* Remove the fields or implement them.
- [x] **C-7.5 Em-dashes in comments (banned project-wide)**  
  `hooks/use-bookmarks.ts:5,7; hooks/use-rate-card.ts:2,10,18,40,135,273,334,341,361; constants/nigerian-states.ts:5; utils/articleMeta.ts:4,21; i18n/index.ts:45`  
  13 occurrences.  
  *Fix:* Replace with colons, commas or hyphens.
- [x] **C-7.6 vehicle-select.tsx references a route that does not exist**  
  `app/(customer)/vehicle-select.tsx:44-45`  
  Says cargo mode comes from /multi-stop (the legacy Economy/Premium/Truck list). There is no /multi-stop route and the cargo list is PACKAGE_VEHICLES.  
  *Fix:* Correct the comment.
- [x] **C-7.7 Standing TODO markers and ts-ignores**  
  `constants/rateCard.ts:260,267; app/_layout.tsx:40,42`  
  TODO: deprecate; bake into base + perKm. Two @ts-ignore.  
  *Fix:* Resolve or ticket them.
- [x] **C-8.2 activeTrip.unpaid read but absent from the declared type**  
  `app/(customer)/(tabs)/index.tsx:96-98,197,200`  
  A tsc error that worked at runtime.  
  *Fix:* Added unpaid?: boolean to the trips state type.
- [x] **C-8.3 Unused imports**  
  `fare-breakdown.tsx:15, vehicle-select.tsx:15 (LAGOS_COORDS); share-trip.tsx:12 (MOCK_USER)`  
  *Fix:* Remove.
- [x] **C-8.4 Dead state and styles**  
  `sos.tsx:35; vehicle-select.tsx:178,125,515-519; index.tsx:51,30`  
  submitting never read; selectedShareable and shared plus five share styles left from the removed toggle; firstName and getGreetingKey unused.  
  *Fix:* Remove.
- [x] **C-8.5 Dead i18n keys implying features that do not exist**  
  `i18n/locales/*.json (sos block and others)`  
  Nine in sos alone (tapToActivate, holdToCancel, callPolice, callTrustedContact, shareLocation, iAmSafe, iAmSafeConfirm, sosSent, sosSentMsg) implying "I am Safe" and "Trusted Contact" features that do not exist; plus liveChatComingSoon, verifyIdentityComingSoon, profile.walletSub, profile.myTrips, notifications.walletTopupSub.  
  *Fix:* Delete the keys or build the features.
- [~] **C-D11 The empty-state illustration is a bright white disc on a near-black screen**  
  `components/Illustration.tsx usage on home`  
  A light-mode asset dropped into the dark theme unchanged; it dominates the screen.  
  *Fix:* FOUNDER DECISION: make the illustration theme-aware.

---

## Driver app

HIGH 12/18 closed · MEDIUM 24/30 · LOW 11/13


### HIGH

- [ ] **D-1.1 Job Details can never load. Every "Available Jobs" tap is a dead end**  
  `app/(driver)/job/[id].tsx:45`  
  Calls deliveriesApi.get(id) which is GET /deliveries/:id. The backend findOne filters where customer.id = userId, so a driver always 404s, the catch sets job null, and the screen renders "Job not found / Go Back". Reached from the ACTIVE JOB card and every pending job card. There is exactly one @Get(":id") and no driver branch.  
  *Fix:* Add a driver branch to findByIdForUser (OR driver.user.id = userId), or point the screen at the available-jobs data already in hand.
- [ ] **D-1.2 The main trip screen always shows "Delivery not found"**  
  `app/(driver)/active.tsx:86`  
  deliveriesApi.track(id) is GET /deliveries/track/:code and findByTracking matches on trackingCode only. id here is the delivery UUID passed from job/[id].tsx:142, which can never equal an SRS- code. From notifications.tsx:163 it arrives with no id at all.  
  *Fix:* Use driversApi.getDelivery(id) once D-1.3 is fixed, or pass trackingCode from the caller.
- [ ] **D-1.3 The whole multi-stop flow 403s for drivers**  
  `app/(driver)/delivery/[id].tsx:100,171,185 and multi-leg.tsx:154`  
  getDelivery / markStopArrived / markStopDelivered hit business/deliveries/... and all three routes carry @UseGuards(BusinessAccountGuard), which throws unless req.user.businessAccountId is set. A driver has none. Even past the guard, business.service.ts:533 compares the wrong ids: delivery.driver?.id === userId is a driver row id against a USER id, never true.  
  *Fix:* Drop BusinessAccountGuard from the three stop/detail routes and change the check to delivery.driver?.user?.id === userId.
- [x] **D-1.4 A job notification lands on a dead screen**  
  `app/(driver)/notifications.tsx:163`  
  n.deliveryId is checked but never passed, so active.tsx receives id undefined.  
  *Fix:* router.push({ pathname: "/(driver)/active", params: { id: n.deliveryId } }).
- [ ] **D-1.5 "Decline" is a confirm dialog that sends nothing**  
  `app/(driver)/job/[id].tsx:157-179`  
  The dialog says "This job will be offered to another driver" but for a non-Travel-Buddy job the handler is just router.back(). The 45-second countdown labelled "Accept in {n}s or it auto-declines" also only calls router.back(). There is no generic decline endpoint. Dispatch never learns the driver said no.  
  *Fix:* Add POST /deliveries/:id/decline and call it, or change the copy to "Skip for now" and stop promising re-offer.
- [ ] **D-1.6 The anti-theft trunk photo is uploaded and thrown away**  
  `app/(driver)/trunk-check.tsx:44-53`  
  The uploaded URL is only console.logged, while the footnote at 120 tells the driver "Photos here become evidence in any dispute". It is evidence of nothing.  
  *Fix:* Attach the URL to the delivery before the success alert, and drop the console.log.
- [x] **D-2.1 A fabricated ETA displayed as fact on every pool leg**  
  `app/(driver)/multi-leg.tsx:56,60,95`  
  etaMinutes: 8 for every leg, summed into a pool total, so a 3-leg pool always read "24m".  
  *Fix:* Replaced with real distanceKm from the delivery and a total-distance badge. Invented minutes are exactly what this platform does not promise.
- [x] **D-4.1 "This Week" and "Today" are computed client-side from a server-capped list**  
  `app/(driver)/(tabs)/earnings.tsx:77-97`  
  getHistory is limit 50. A driver who completes more than 50 trips in a week sees an UNDERSTATED week total, and the bar chart under-reports with it. Meanwhile EarningsDashboard already carries today.earned and week.earned computed server-side over the full table. todayTotal is also a rolling 24h bucket, not calendar-today like the server.  
  *Fix:* Read dashboard.week.earned and dashboard.today.earned; keep history only for the chart shape.
- [x] **D-6.1 The driver SOS screen was unreadable in light mode**  
  `app/(driver)/sos.tsx:114 and all text styles`  
  Page background isDark ? #0A0000 : #FFF1F1 while headerTitle, idleTitle, idleDesc, activeDesc, cancelBtnText, emergencyLabel and emergencySectionTitle are all hardcoded white. On the near-white pink everything except two red strings vanished. This is the safety screen.  
  *Fix:* Deep red ground in both themes, matching the customer fix.
- [x] **D-7.1 Full legal name AND phone number shown to the driver on rides**  
  `app/(driver)/active.tsx:598-620`  
  The Customer card was not gated on kind, so it rendered customer.name and customer.phone directly above the correctly-built Passenger card (first name, chat only). Rendered in addition to, not instead of.  
  *Fix:* Gated on (delivery as any).kind !== 'ride'.
- [x] **D-7.2 The passenger surname, on the ride path specifically**  
  `app/(driver)/delivery/[id].tsx:246`  
  Joined receiverFirstName and receiverLastName into the RIDE header.  
  *Fix:* Dropped receiverLastName. The surname is the lookup key the rule exists to withhold.
- [x] **D-7.3 Full name on the ACTIVE JOB card**  
  `app/(driver)/(tabs)/index.tsx:329`  
  The job list below it correctly masks rides; the active card was missed.  
  *Fix:* First name only when kind is ride.
- [x] **D-7.4 Full customer name in trip history and pool legs**  
  `app/(driver)/(tabs)/history.tsx:48,155 and multi-leg.tsx:57,148`  
  Both mapped straight from d.customer.name, both including rides; multi-leg renders it as "For: <full name>".  
  *Fix:* First name only when kind is ride.
- [x] **D-7.5 Full name in the chat inbox, propagating into the thread header and every avatar**  
  `shared/components/chat/MessagesInbox.tsx:203,219`  
  The name is also carried into the chat screen header and every incoming bubble. active.tsx does this correctly; the inbox path was the leak. Note the inbox is SHARED, so truncating client-side would wrongly hide the DRIVER name from customers.  
  *Fix:* Fixed at the source: chat.service.ts now sends the driver a first name only.
- [x] **D-7.6 The backend handed the driver the entire user row**  
  `seirs-backend/src/deliveries/deliveries.service.ts findActiveByDriverUserId`  
  leftJoinAndSelect on d.customer returned the full User entity with name, email and phone all selected by default. The available-jobs feed was sanitised in a 2026-08-10 audit; the ACTIVE-job feed never was.  
  *Fix:* redactCustomerForDriver: rides get first name only, no surname, no phone, no email; packages keep the sender phone so a courier can reach the door. Admin payloads untouched.
- [ ] **D-10.1 "My Trips" can never show a completed trip and always reads "N0 earned"**  
  `app/(driver)/(tabs)/history.tsx:38,84`  
  Calls GET /deliveries/driver which filters to ASSIGNED | PICKED_UP | IN_TRANSIT only, so the Delivered and Cancelled tabs are permanently empty and the header badge sums nothing. If the filter is ever loosened it would instead sum money the driver has not yet earned.  
  *Fix:* Add a status/history endpoint for the driver, or reuse earningsApi.history() which is already paid-trip data.
- [x] **D-10.2 The KYC screen never loads existing documents**  
  `app/(driver)/kyc.tsx:63,72`  
  docs initialises from INITIAL_DOCS (all eight not_uploaded) and the only effect probes camera permission. setDocs is called only after a fresh upload. An approved driver reopening KYC sees 0% progress and eight "Not Uploaded" rows, and will re-upload everything. The data is right there: /drivers/me spreads the whole entity and the driver entity holds all eight *Url columns.  
  *Fix:* One effect that calls driversApi.me() and marks each doc uploaded where its column is non-null.
- [x] **D-10.3 The phone number is submitted raw, not normalised**  
  `app/(auth)/driver-register.tsx:96`  
  normalisePhone is used for VALIDATION but the payload sends the raw field. A driver typing +2348012345678 passes validation and is registered with phone "+234+2348012345678"; typing 0801 234 5678 registers "+234801 234 5678". The placeholder invites both formats.  
  *Fix:* phone: '+234' + normalisePhone(phone).replace(/^0/, '').

### MEDIUM

- [x] **D-1.7 "Report a Trip Issue" has no onPress**  
  `app/(driver)/help.tsx:153`  
  Full-width red card with a chevron for "Customer dispute, route issue, vehicle damage". Tapping does nothing.  
  *Fix:* router.push("/(driver)/support/new").
- [x] **D-1.8 "Clear Trip History Cache" has no onPress**  
  `app/(driver)/privacy.tsx:194`  
  Chevron and all.  
  *Fix:* Wire to AsyncStorage.removeItem or delete the row.
- [x] **D-1.9 "Availability Hours" never reaches the server**  
  `app/(driver)/schedule.tsx:88-94`  
  handleSave writes only to AsyncStorage; matching has no idea. The screen presents a Save button and a "Saved!" state.  
  *Fix:* POST the schedule to the driver record, or relabel it "Personal reminder (this device only)".
- [x] **D-1.10 The "30-minute reminders" switch is pure local state**  
  `app/(driver)/schedule.tsx:66,175-180`  
  Never persisted, never read, and no such push exists.  
  *Fix:* Remove or build it.
- [ ] **D-1.11 The acceptance-rate gate is inert**  
  `app/(driver)/last-order.tsx:37,44,157`  
  drivers.service.ts hardcodes todayAcceptanceRate: null with the comment "Acceptance-rate calc is a follow-up". The card always shows a dash, meetsThreshold is always true, and the copy "Last Order requires 80%" describes a rule nothing enforces.  
  *Fix:* Compute the rate or change the copy.
- [x] **D-1.12 A hardcoded green "Online" under the other party name**  
  `app/(driver)/messages/[chatId].tsx:166`  
  No presence data is fetched; it is always shown.  
  *Fix:* Remove or wire real presence.
- [x] **D-2.2 A human passenger was always labelled "Package"**  
  `app/(driver)/multi-leg.tsx:52`  
  type: (d.packageDescription ? "package" : "package") is a tautology, making the Users icon and the "Passenger" label at 112/125 dead code.  
  *Fix:* type: d.kind === 'ride' ? 'passenger' : 'package'.
- [x] **D-2.3 A fully-wired paywall for a program the founder paused**  
  `app/(driver)/subscription.tsx`  
  profile.tsx:81 says SEIRS Premium was removed because the program is paused platform-wide, and deliveries.service.ts:1349 hardcodes driverIsPro false. The screen still offers "Activate: N5,000/week" charged from a wallet, which the no-wallet direction retires. Only reachable by deep link.  
  *Fix:* Delete the screen or gate it behind a live flag.
- [ ] **D-2.4 The pool cap of 4 is hardcoded in two files**  
  `app/(driver)/(tabs)/index.tsx:305, multi-leg.tsx:68,86`  
  {activeJobs.length}/4 and 4 - slotsUsed, rather than a Fee Catalogue row.  
  *Fix:* Read from the catalogue with a code fallback.
- [x] **D-4.2 Two different "this month" on the same screen**  
  `app/(driver)/(tabs)/earnings.tsx:143 vs :109`  
  The Month tab shows dashboard.month.earned (server, full table); EarningsCalendar renders "N X this month" summed client-side from the same 50-row history. They disagree for any busy driver.  
  *Fix:* Pass dashboard.month.earned into the calendar header.
- [x] **D-4.3 Two sources for "Today" across the app**  
  `app/(driver)/(tabs)/index.tsx:416 vs the Earnings tab`  
  The home widget shows driverData.todayEarnings, summed from delivery.driverEarnings for DELIVERED rows. The Earnings tab sums driver_earning.driverNet from the ledger. Different numbers: the delivery column is the booked share, the ledger row derives from what the customer actually paid, and a delivered-but-unreleased delivery counts on home with no ledger row at all.  
  *Fix:* The home widget already fetches the dashboard for withdrawable; read d.today.earned from the same response.
- [x] **D-4.4 The minimum withdrawal is hardcoded**  
  `app/(driver)/withdrawal.tsx:27`  
  MIN_WITHDRAWAL = 1000 while the server reads driver_min_payout_ngn from the Fee Catalogue. If an admin changes it the client gate silently disagrees. Same for the daily caps, which the app never surfaces, so a new driver requesting N60,000 only finds out via a server rejection.  
  *Fix:* Add minPayoutNgn and the caps to /earnings/dashboard and read them.
- [x] **D-4.5 "After 30% Seirs commission" is hardcoded copy**  
  `app/(driver)/job/[id].tsx:218`  
  The real cut is PLATFORM_COMMISSION in common/constants/pricing.ts, and the per-trip rows already show the exact fee. Goes stale the day the rate moves.  
  *Fix:* Render from the constant or drop the sentence.
- [ ] **D-4.6 Transaction detail loads the whole history and finds by id client-side**  
  `app/(driver)/transaction/[id].tsx:32-33,60,94`  
  Any entry older than the last 50 renders "Transaction not found". isCredit = true is a constant, making the ternary at 94 a dead branch.  
  *Fix:* Fetch the single earning by id.
- [x] **D-5.1 Bottom CTA bars double-count insets.bottom**  
  `withdrawal.tsx:325, add-bank.tsx:259, vehicle.tsx:298`  
  SafeAreaView already pads edges bottom, then the bar adds Spacing.md + insets.bottom again. With edgeToEdgeEnabled the button floats ~112dp above the screen edge on the 3-button nav.  
  *Fix:* Drop 'bottom' from the SafeAreaView edges on those three screens.
- [x] **D-5.2 Departure date/time is free text with no keyboard type**  
  `app/(driver)/interstate.tsx:189-196`  
  Placeholder YYYY-MM-DD HH:mm, no keyboardType, no date picker; a wrong format is rejected only after tapping Declare. This is the one field a driver fills at a bus park.  
  *Fix:* keyboardType="numbers-and-punctuation" as a stopgap, a real date picker properly.
- [x] **D-5.3 The weekly-goal modal has no keyboard avoidance**  
  `app/(driver)/(tabs)/earnings.tsx:217-246`  
  autoFocus opens the keyboard immediately and the Save/Cancel row sits below the input; on Android the buttons can be covered.  
  *Fix:* Wrap in KeyboardAvoidingView or lift the row.
- [x] **D-6.2 Banned em-dash, on screen**  
  `app/(driver)/(tabs)/index.tsx:414`  
  withdrawable == null ? '-' uses an em-dash character. Second occurrence in a comment at components/CorridorCard.tsx:2.  
  *Fix:* Plain hyphen.
- [x] **D-6.3 Non-Nigerian vehicle vocabulary on the first screen a driver sees**  
  `app/(auth)/driver-register.tsx:27,30`  
  Registration says 'Motorcycle' and 'Van'; app/(driver)/vehicle.tsx says 'Okada (Motorcycle)' and 'Van / Danfo'. Same app, two vocabularies.  
  *Fix:* Copy the labels from vehicle.tsx.
- [x] **D-6.4 The offline story is fiction**  
  `app/(driver)/status-broadcast.tsx:50,71,110`  
  Promises "your message is queued locally and delivered the moment your connection comes back", "will retry until acknowledged", and location "logged offline every 30s, uploaded in batches". There is no queue: send() is a bare await in a try/catch that alerts on failure. offlineSyncApi is exported and imported by nothing; there is no NetInfo dependency and no AsyncStorage queue anywhere. This is exactly the copy a driver relies on when they lose signal in traffic.  
  *Fix:* Build the queue or delete the promise.
- [x] **D-6.5 "Re-enabling within 30 minutes counts against next-day priority"**  
  `app/(driver)/last-order.tsx:173`  
  No such logic exists, and it contradicts the bullet directly above it and the handler at 79.  
  *Fix:* Delete the line.
- [x] **D-6.6 The SOS countdown lies**  
  `app/(driver)/sos.tsx:81 vs :143`  
  fireSOS POSTs immediately, then shows "SOS in 5s..." with a Cancel button. Ops is already alerted. The cancel is a real un-send so the mechanism is fine; the wording is not.  
  *Fix:* "SOS sent. Cancel within 5s if this was a mistake."
- [x] **D-6.7 "Payment will be credited to your wallet shortly"**  
  `app/(driver)/active.tsx:389`  
  Earnings clear in 2 business days, which every other screen states correctly. "Shortly" is a promise the ledger does not keep, and "wallet" is the retired model.  
  *Fix:* State the real clearance.
- [x] **D-6.8 A ride is presented to the driver as a package**  
  `app/(driver)/active.tsx:576,729`  
  The banner switches to RIDE_STEPS, but the info card is still titled "Package Details" with Size/Fragile rows, and the Progress list is hardcoded to STATUS_STEPS, so a ride driver reads "Package Collected".  
  *Fix:* Gate the Package Details card on kind !== 'ride' and use the same stepConfig for the progress list.
- [ ] **D-6.9 "You can decline any individual offer"**  
  `app/(driver)/interstate.tsx:303`  
  Per D-1.5, declining a non-Travel-Buddy offer sends nothing.  
  *Fix:* Fix D-1.5 or change the copy.
- [x] **D-6.10 The packages toggle ON/OFF colour is bound to the wrong state**  
  `app/(driver)/interstate.tsx:226`  
  Turning packages off while passengers is on leaves the "OFF" text in primary colour. Copy-paste from the row below.  
  *Fix:* Bind to takePackages alone.
- [x] **D-8.1 subscription.tsx (257 lines) is genuinely orphaned**  
  `app/(driver)/subscription.tsx`  
  No drawer entry, no profile row, no router.push anywhere. See D-2.3.  
  *Fix:* Delete.
- [ ] **D-9.2 Standing TODO: stop deliveries complete with no proof of delivery**  
  `app/(driver)/delivery/[id].tsx:182`  
  "TODO Phase 5b: tie into proof-of-delivery photo + signature. For now we ship the action without proof."  
  *Fix:* Build the proof step.
- [x] **D-10.4 The bar chart mislabels every day except Sunday**  
  `app/(driver)/(tabs)/earnings.tsx:27`  
  DAY_LABELS is a fixed Mon..Sat run plus 'Today', but dayTotals is a ROLLING 7-day window. On a Wednesday, 'Sat' is Tuesday money and 'Mon' is last Thursday. Only correct if today is Sunday.  
  *Fix:* Derive the labels from the actual dates.
- [ ] **D-10.5 NaN the moment the fetch is fixed**  
  `app/(driver)/active.tsx:582-583`  
  The tracking payload returns no distanceKm, driverEarnings, packageDescription, isFragile, receiverFirstName or customer, yet the screen reads all of them: "NaN km" and "N NaN". isFragile absent also means a fragile package always renders "Fragile: No". Currently masked by D-1.2.  
  *Fix:* Fix D-1.2 first, then read from the right payload.

### LOW

- [x] **D-1.13 Double Pressable on the notification bell**  
  `components/NotificationBell.tsx:24, (tabs)/index.tsx:241`  
  The bell is itself a Pressable but is wrapped in another with a duplicate router.push. The outer handler never fires.  
  *Fix:* Unwrap.
- [x] **D-1.14 "Remind me" Pressable with no onPress**  
  `app/(driver)/schedule.tsx:154`  
  Inside the always-empty PREBOOKED list, so unreachable.  
  *Fix:* Remove.
- [x] **D-2.5 243 lines of fake drivers, jobs, earnings, ratings, banks and chats**  
  `constants/driverMockData.ts`  
  Only DRIVER_HELP_FAQS is imported. Nothing else references MOCK_DRIVER*, NIGERIAN_BANKS or WEEKLY_EARNINGS. A loaded gun sitting in the repo.  
  *Fix:* Move DRIVER_HELP_FAQS into help.tsx and delete the file.
- [x] **D-6.11 Support email disagrees with the rest of the platform**  
  `app/(driver)/privacy.tsx:86`  
  Says support@seirs.co; everywhere else is seirs.app.  
  *Fix:* Pick one.
- [x] **D-6.12 Offers a bonus program the founder deferred**  
  `app/(driver)/privacy.tsx:93`  
  "Personalised Offers / bonus offers tailored to your driving patterns" while the bonus program is on the pending-decisions list.  
  *Fix:* Remove until it ships.
- [~] **D-6.13 199 is labelled "Police"**  
  `app/(driver)/sos.tsx:21`  
  In Nigeria 199 is commonly the Fire Service and 112 is the national emergency line.  
  *Fix:* FOUNDER DECISION: confirm the number set (same question as C-5.8).
- [x] **D-6.14 Every review avatar initial is the letter T**  
  `app/(driver)/ratings.tsx:51,136`  
  Sets customer: 'Trip SEIRS-XXXX'.  
  *Fix:* Use the real first name.
- [x] **D-9.1 Five stale comments describing behaviour the code no longer has**  
  `last-order.tsx:18-21; status-broadcast.tsx:15-18; scan-package.tsx:16-17; multi-leg.tsx:15-17; components/EarningsCalendar.tsx:4-5`  
  Each says backend wiring is "planned" or "comes later" when the real call is already made; multi-leg promises a mark-complete control that does not exist; EarningsCalendar claims arrows scroll back indefinitely when it only aggregates 50 rows.  
  *Fix:* Rewrite or delete.
- [x] **D-9.3 Dead code and unused styles**  
  `earnings.tsx:375-376; (tabs)/index.tsx:525,563,569-571,182,33; active.tsx:903-904; history.tsx:45,158,168`  
  tierChip leftovers from the removed tier badge; headerGreet/heatmapWidget/goalTrack/goalFill/heatmapBox; weekEarnings computed never rendered; avatar styles superseded by the component; history maps distance but reads item.distanceKm so distance never renders, and reads item.rating which the mapper never sets, making the whole rating block dead.  
  *Fix:* Remove.
- [x] **D-10.6 The location interval outlives the screen**  
  `app/(driver)/(tabs)/index.tsx:132-146`  
  startLocationUpdates sets a 15s interval posting GPS with no useEffect cleanup, and stopLocationUpdates never nulls the ref. After logout the timer keeps firing updateLocation.  
  *Fix:* Clear it on unmount, as active.tsx already does.
- [x] **D-10.7 Two divergent phone validators**  
  `driver-register.tsx:38 vs edit-profile.tsx:29`  
  Registration allows only 070|071|080|081|090|091; edit allows any 0[789]. A prefix the NCC issues tomorrow is editable but not registerable.  
  *Fix:* Share one validator.
- [ ] **D-10.8 Split names are never populated at signup**  
  `app/(auth)/driver-register.tsx:89`  
  Joins first/middle/last into a single name because authApi.register has no firstName/lastName. Since the ride-privacy rule and profile.tsx both prefer user.firstName, every driver runs on the string-split fallback until they open Edit Profile.  
  *Fix:* Add the fields to register.
- [x] **D-D1 Duplicate style keys silently dropped six styles**  
  `app/(driver)/seirs-id.tsx:166-182`  
  howCard, howTitle, howRow, howStep, howStepText and howText were each defined twice in one StyleSheet; the second block won and the first was dead. Surfaced by running the app own typecheck, which had never been run.  
  *Fix:* Removed the dead first block, preserving the rendered appearance exactly.

---

## Business app

HIGH 8/8 closed · MEDIUM 20/21 · LOW 12/12


### HIGH

- [x] **B-1.1 Drawer "Team Members" navigates to a route with no file**  
  `components/Drawer.tsx:54`  
  navigate("/(business)/team"). There is no app/(business)/team.tsx and the route is absent from the generated router union. Team management is a headline business feature; tapping it dead-ends on +not-found.  
  *Fix:* Build the screen, or remove the row until it exists.
- [x] **B-1.2 Drawer "Billing & Invoices" opens the Rewards tab, not invoices**  
  `components/Drawer.tsx:55`  
  navigate("/(business)/wallet") while app/(business)/billing.tsx exists and the Profile tab routes to it correctly. This is a regression of a bug the founder already reported: billing.tsx:4-7 records that the Profile row of this name opened Rewards and there was no invoices screen at all. The Profile row was fixed; the drawer row was not.  
  *Fix:* navigate("/(business)/billing").
- [x] **B-6.1 The full-screen map legend prints a Google ETA, which the same file bans 330 lines earlier**  
  `app/(business)/send-package.tsx:1850`  
  Renders route.durationText. The thumbnail version at 1519 deliberately omits it, with the comment "Kilometres only: minutes are a promise this platform does not make (founder rule)." The expanded map breaks the rule the collapsed one states.  
  *Fix:* Delete the route.durationText clause.
- [x] **B-6.3 The Terms of Service consent link points at a domain the app never otherwise uses**  
  `app/(business)/send-package.tsx:1659`  
  Linking.openURL("https://seirs.app/terms-of-service"). Every other legal/FAQ link in the app uses seirs-website.vercel.app. This is the "Read them" link inside the checkbox that legally gates payment.  
  *Fix:* Settle the canonical domain (see W-4) and use one shared constant.
- [x] **B-6.4 The recipient collection link is on the same unresolved domain**  
  `app/(business)/delivery/[id].tsx:123`  
  "Settle the collection fee and get the pickup address here: https://seirs.app/collect/<code>". This is shared out to the RECIPIENT to pay a redirect fee and reveal the pickup address. If seirs.app does not resolve, the fee is never settled and the parcel sits on a partner shelf accruing storage.  
  *Fix:* Point at the live host and verify /collect/{code} exists there before shipping.
- [x] **B-7.1 Six icon names are missing from the registry and render as NOTHING**  
  `components/Icon.tsx:21-38 (registry) and 8 call sites`  
  Icon returns null for an unknown name with only a __DEV__ warning. Missing: AlertTriangle (the SOS Emergency drawer row, the most safety-critical control in the app, and the seirs-id security warning), QrCode ("My SEIRS ID" in BOTH sender and partner drawers), ShieldCheck (verified-identity card, policy documents), FileSignature (contract documents), Flag ("Report an issue"), File (every "other" document AND the fallback at documents.tsx:181, so an unrecognised category is doubly invisible). This is the third time this registry has been under-filled.  
  *Fix:* Add the six to the import block and the ICONS map, and adopt the FALLBACK pattern Illustration.tsx already uses so something always renders.
- [x] **B-10.1 The session-expiry handler is never registered in this app**  
  `context/AuthContext.tsx`  
  The business AuthProvider never calls setSessionExpiredHandler; both sibling apps do. On a 401 the shared client clears the token, calls onSessionExpired (null here) and throws. Because isAuthenticated derives from in-memory user state it stays true, NavigationGuard never fires, and the user is stranded inside a fully rendered but EMPTY app: dashboard zeros, "No deliveries found", 0 points. Every screen has a catch that swallows the error, so nothing tells them to sign in again. Only a force-quit recovers. Exactly the defect a device sweep cannot catch: it needs an expired token.  
  *Fix:* Mirror the customer app: setSessionExpiredHandler(() => { setUser(null); router.replace("/(auth)/login"); }).
- [x] **B-10.2 CSV bulk upload "Confirm N480,000" charges nothing and never says so**  
  `app/(business)/csv-upload.tsx:323-331,121-170,302-313`  
  The CTA is labelled with the grand total. confirmCreate creates the deliveries and sets step done; the done card says only "Created N bookings" and offers "View Deliveries". No checkout is ever opened and the word unpaid appears nowhere, while the screen own instruction at 240 promises "Tap Confirm to create the deliveries, then pay for the batch". A business uploads 40 bookings, taps a button showing N480,000, and believes it is settled.  
  *Fix:* Rename to "Create N bookings (N X to pay)" and make the done card say they are awaiting payment.

### MEDIUM

- [x] **B-1.3 "Special Cargo" and "Send a Package" are the same button**  
  `app/(business)/(tabs)/index.tsx:115-120`  
  Both ActionCards push /(business)/send-package with no distinguishing param, and send-package reads no route params. The subtitle promises "Trucks, cold chain & heavy loads" but nothing preselects a truck or a cold-chain category.  
  *Fix:* Pass params { preset: "cargo" } and preselect truck_small, or drop the third card.
- [x] **B-1.4 Notification rows are pressable but go nowhere**  
  `app/(business)/notifications.tsx:179-181`  
  onPress only marks one read, so a "package delivered" notification just un-bolds itself.  
  *Fix:* Route on item.type to the delivery when the payload carries an id.
- [x] **B-2.1 Sponsored Placement metrics are hardcoded zeros for a paying partner**  
  `app/(partner)/billing.tsx:88-90`  
  impressions and clickThroughs are literal 0 in BOTH branches, yet the page sells "Live impression + click-through dashboard updated daily", and the "Activate to start collecting placement metrics" hint only renders when INACTIVE. A partner who pays the monthly fee sees a permanent 0/0 ROI panel with no explanation.  
  *Fix:* Render a dash with "Impression tracking ships with the placement_impressions table" until it is real.
- [x] **B-2.2 Partner dashboard invents a capacity of 50 when the fetch fails**  
  `app/(partner)/index.tsx:27-36`  
  The catch swallows the error, then capacity = data?.maxCapacity ?? 50 drives the "0 / 50 packages" readout and the percentage bar. A server outage is indistinguishable from an empty, correctly-configured store.  
  *Fix:* Hold error state and render "Could not load store status" instead of a fabricated denominator.
- [x] **B-2.3 Deliveries list shows raw backend vehicle enums, not Nigerian vocabulary**  
  `app/(business)/(tabs)/deliveries.tsx:214`  
  Prints "motorcycle", "tricycle", "van", "truck small". The booking wizard VEHICLE_LABEL maps these to Okada / Keke / Danfo. A business books an Okada and the list calls it a motorcycle.  
  *Fix:* Import and apply VEHICLE_LABEL here.
- [x] **B-4.1 The Wallet tab still calls the retired wallet endpoint and throws the answer away**  
  `app/(business)/(tabs)/wallet.tsx:38,47,56`  
  businessApi.wallet() fires on every mount, lands in setWallet, and wallet is never read again. A retired ledger endpoint kept warm in production traffic for nothing.  
  *Fix:* Delete the state and the call.
- [x] **B-4.2 A sender Rewards screen is titled "Wallet"**  
  `app/(business)/(tabs)/wallet.tsx:89`  
  Hardcodes the heading "Wallet" for both roles, while the tab bar correctly labels it Rewards for senders. A sender taps a tab that says Rewards and lands on a screen headed Wallet.  
  *Fix:* {isPartner ? 'Wallet' : 'Rewards'}.
- [x] **B-4.3 The documents statement prints a "Wallet top-ups" line to an accountant**  
  `app/(business)/documents.tsx:67,69`  
  Reads "Wallet top-ups: N X" and "Figures aggregate your SEIRS business wallet transactions". This goes into a file the business hands to its accountant and to FIRS, asserting a wallet relationship that does not exist.  
  *Fix:* Drop the line and reword to "delivery payments made through SEIRS".
- [x] **B-5.1 The partner tab bar has no bottom-inset floor**  
  `app/(partner)/_layout.tsx:34-35`  
  height 56 + insets.bottom and paddingBottom insets.bottom. The business tab bar solved exactly this with Math.max(insets.bottom, 8) and its comment explains why: on button-nav Androids insets.bottom is 0 so the bar has no cushion. The partner bar never got the fix and sits flush against the phone navigation.  
  *Fix:* Apply Math.max(insets.bottom, 8) to both lines.
- [x] **B-6.2 "Driver arrives ... around 9 AM"**  
  `app/(business)/send-package.tsx:1396`  
  This is a scheduled pickup hour the sender chose, but the word is ARRIVES, and Lagos traffic makes it a refund magnet.  
  *Fix:* "Pickup is booked for today, around 9 AM."
- [x] **B-8.1 Four fully-built screens have no entry point anywhere**  
  `api-keys.tsx (258 lines), api-usage.tsx (129), webhook-log.tsx (155), recurring.tsx (490)`  
  No drawer row, no tab, no router.push, no Link. api-keys issues live API keys that, per its own line 118, "charge real money". recurring.tsx is a complete Spec V8 recurring-delivery scheduler wired to a live backend cron.  
  *Fix:* Add a Developer section to the sender drawer for the trio, and a Recurring Deliveries row.
- [x] **B-8.2 Partners have no SOS**  
  `components/Drawer.tsx:81-92`  
  partnerItems omits the SOS row senderItems has. sos.tsx records the founder intent verbatim: "we do not know who may need it... if they feel unsafe and they have the SEIRS app they should be able to press it." A shopkeeper alone at a counter is arguably the most exposed user on the platform.  
  *Fix:* Add the same SOS entry to partnerItems.
- [x] **B-8.3 webhook-log instructs the user to use a control that does not exist**  
  `app/(business)/webhook-log.tsx:82`  
  "Subscribe to events from the API Keys page". api-keys.tsx only issues, copies and revokes keys; there is no endpoint-subscription UI at all.  
  *Fix:* Build it or change the copy.
- [x] **B-9.1 csv-upload comment describes the retired wallet path**  
  `app/(business)/csv-upload.tsx:12`  
  "Wallet debit + Delivery + DeliveryStop rows created atomically per booking". The code at 128-131 explicitly removed it. Line 236-240 in the same file WAS updated, so this one was simply missed.  
  *Fix:* Rewrite.
- [ ] **B-10.3 CSV bookings bypass the consent gate and the quote pin**  
  `app/(business)/csv-upload.tsx:142-162`  
  Calls createDelivery with no termsAccepted and no quoteToken, both of which send-package sends. Bulk bookings capture no consent to the failed-delivery terms, and the total on the Confirm button is unpinned so the server can legitimately charge something else.  
  *Fix:* Add the consent checkbox and thread the preview quote token through.
- [x] **B-10.4 The quote is priced on straight-line distance while the review displays road distance**  
  `app/(business)/send-package.tsx:526,541,743`  
  Sends km: totalKm (crow-flies x 1.45) but the effect dependency lists routeKm, so when Directions resolves the effect re-fires and re-quotes with the SAME stale number, burning the quote pin. Meanwhile the screen displays route.distanceText and handleSubmit books with km: routeKm. Quoted on one distance, displayed and booked on another.  
  *Fix:* Change line 526 to km: routeKm.
- [x] **B-10.5 KYC documents upload without the kyc folder**  
  `app/(business)/apply-partner.tsx:95-97`  
  Three bare uploadApi.file(uri) calls carrying the owner government ID, the CAC certificate and the storefront photo. folder is optional and omitted entirely when absent, so these land unsegregated while UploadFolder defines "kyc" for precisely this. Every other upload in the app passes one.  
  *Fix:* uploadApi.file(uri, 'image/jpeg', 'kyc').
- [x] **B-10.6 Partner handover proof photos pass an argument that is silently discarded**  
  `app/(partner)/receive-dropoff.tsx:181, release-pickup.tsx:183`  
  uploadApi.uploadFile(photoUri, "partner-receive"). That second parameter is _prefix and is explicitly ignored. These are chain-of-custody photos for a counter handover, and the code reads as though it files them by prefix when it does not.  
  *Fix:* uploadApi.file(photoUri, 'image/jpeg', 'proof').
- [x] **B-10.7 Partner notification toggles contradict the Profile tab stated policy**  
  `app/(partner)/settings.tsx:194-211 vs (tabs)/profile.tsx:93-96`  
  Settings offers three per-event switches while Profile deliberately removed the Notifications row on the grounds that everything always sends, and notifications.tsx notes push has not shipped. Today a partner can switch off "Payout Processed" and nothing changes.  
  *Fix:* Pick one position.
- [x] **B-10.8 Five hardcoded light panels glare in dark mode**  
  `api-keys.tsx:125,228; api-usage.tsx:121-122; seirs-id.tsx:174; csv-upload.tsx:479`  
  No theme override at the use site, so they render pale on a dark screen. api-keys:228 is the one-time secret reveal. partner/index.tsx documents this exact class as a founder finding and fixes it there with an isDark ternary; these five were missed.  
  *Fix:* Apply the same isDark pattern.
- [x] **B-D1 The consent passthrough shipped that morning did not typecheck**  
  `shared/services/api.ts businessApi.createDelivery`  
  termsAccepted and quoteToken were being SENT by send-package.tsx but neither was declared on the body type, so the business app tsc failed. It was shipped after running only the backend and admin builds, never the business app own typecheck.  
  *Fix:* Declared both fields. Business app now typechecks clean.

### LOW

- [x] **B-1.5 Dead QR modal in the Profile tab**  
  `app/(business)/(tabs)/profile.tsx:30,174-184`  
  qrVisible is only ever set false; nothing sets it true. The whole Modal and the QRCode import are unreachable; the ID row pushes to /(business)/seirs-id instead.  
  *Fix:* Delete the modal and the import.
- [x] **B-2.4 Fallback hero cards are badged NEW and dated three months ago**  
  `constants/heroCards.ts:120-123`  
  badgeKey NEW with publishedAt 2026-05-15, which relativeDate renders as "3 months ago". Whenever the CMS is empty or offline the carousel shows stale NEW content.  
  *Fix:* Omit publishedAt on the built-in fallbacks.
- [x] **B-3.1 Three screens bypass the barrel whitelist by design**  
  `api-keys.tsx:10, api-usage.tsx:8, webhook-log.tsx:9`  
  They import request straight from the shared module. It works, but request is not in the whitelist, so these three sidestep the guardrail. NOTE: the barrel category is otherwise fully CLEAN across all 84 imports.  
  *Fix:* Route through the barrel or document the exception.
- [x] **B-4.4 Orphaned wallet fields and a deleted button stylesheet**  
  `csv-upload.tsx:62-63, (tabs)/index.tsx:252-263`  
  walletBalance and canAfford remain in the response interface, neither rendered. walletCard, walletLabel, walletBalance, fundBtn and fundBtnText styles survive their deleted JSX: a literal fund-wallet button stylesheet.  
  *Fix:* Remove.
- [x] **B-5.2 Partner opening-hours fields have no keyboardType**  
  `app/(partner)/settings.tsx:170-176,180-186`  
  "Opens At" / "Closes At" with placeholders 08:00 and 18:00 open the full alpha keyboard.  
  *Fix:* keyboardType="numbers-and-punctuation".
- [x] **B-6.5 14 em-dash characters in comments (banned project-wide)**  
  `utils/articleMeta.ts, store/businessStore.ts, constants/nigerian-states.ts, constants/config.ts, i18n/index.ts, hooks/use-bookmarks.ts, send-package.tsx:2`  
  None reach the user, but the ban is project-wide.  
  *Fix:* Replace.
- [x] **B-6.6 Phone validation regex and its error message disagree**  
  `app/(auth)/register.tsx:63 vs :77`  
  The regex accepts 071 but the error lists only 080, 081, 070, 090 or 091. A Glo 071 user who mistypes is told 071 is invalid.  
  *Fix:* Align them.
- [x] **B-9.2 Four more stale or contradictory comments**  
  `(tabs)/_layout.tsx:71; send-package.tsx:490-491; (tabs)/profile.tsx:172-173; partner/billing.tsx:16`  
  Tab labels "step up to 12" when the code sets 11; Google distance "replaces the estimate" when it replaces it for display only; a comment describing the dead QR modal; and a standing TODO whose screen simultaneously says "no card is charged" and "Auto-billed monthly via Flutterwave".  
  *Fix:* Rewrite or resolve.
- [x] **B-9.3 api-usage renders a "what we will track" list of five unbuilt features**  
  `app/(business)/api-usage.tsx:66,71`  
  "ship in the next batch", contradicting the act-like-the-app-is-live rule.  
  *Fix:* Remove the card until the tracking exists.
- [x] **B-9.4 Dead code and misnamed styles**  
  `(tabs)/index.tsx:16-17,225-230; send-package.tsx:1903-1904; deliveries.tsx:396,399; wallet.tsx:261-265; StatePicker.tsx:141; partner/index.tsx:251; constants/heroCards.ts:83-84`  
  Unused fmt and getTimeOfDay; superseded errorBox/errorText; unused cancelLink; unused noteCard; inlined rowPressed; a style named logoutBtn that now opens the drawer; ctaKey/ctaRoute declared and documented but never set or read.  
  *Fix:* Remove.
- [x] **B-10.9 A failed deliveries fetch becomes an unhandled rejection**  
  `app/(business)/(tabs)/deliveries.tsx:75-87`  
  load() uses try/finally with no catch, so the list silently keeps its previous contents.  
  *Fix:* Add a catch and an error state.
- [x] **B-10.10 A Camera icon that only opens the photo library**  
  `app/(business)/send-package.tsx:874-880,415`  
  pickPhoto only calls launchImageLibraryAsync. There is no way to photograph the parcel in the moment: the sender must leave, use the camera app, and come back.  
  *Fix:* Offer a capture option.

---

## Admin dashboard

HIGH 10/18 closed · MEDIUM 18/25 · LOW 13/13


### HIGH

- [x] **A-H1 PUT /admin/rate-card was completely unauthenticated in production**  
  `seirs-backend/src/pricing/pricing.controller.ts:208-209`  
  @Controller() carries no class-level guards. Lines 156 and 171 both stacked @UseGuards(JwtAuthGuard, SuperAdminGuard) onto the SAME method (syncFuel) because a JSDoc block sat between the first decorator and its handler; publishRateCard got nothing. The only APP_GUARD is HttpThrottlerGuard, so there is no global JWT guard to fall back on. Anyone on the internet could publish a new rate card and reprice every delivery and ride on the platform.  
  *Fix:* Verified exploitable against production first (an unauthenticated PUT reached the handler body and returned 400 changeReason required rather than 401), then guarded, redeployed, and re-verified returning 401. Every controller swept for the same decorator-orphaning shape: none remaining.
- [ ] **A-H2 Role changes in Staff Management do not change any backend permission**  
  `roles.service.ts:128, super-admin.guard.ts:29, admin.service.ts:88, admins/page.tsx:437`  
  assignToUser writes only roleId while every backend gate reads adminRole. Demoting a super admin to a read-only custom role leaves them able to publish pricing, seed demo credentials, offboard colleagues and hard-delete accounts. Promoting someone to Super Admin grants them none of it. A custom-role admin has adminRole null, so every PII reveal, bank-change approval and NDPR export 403s with "Your role: none". adminApi.admins.updateRole, which does set adminRole, is dead code.  
  *Fix:* Have assignToUser also set adminRole to role.slug for system roles, or teach the guards to resolve via roleId.
- [ ] **A-H3 Two-factor auth does not exist, but the login page has a TOTP step**  
  `src/lib/api.ts:60-64, login/page.tsx:32`  
  Posts /auth/admin-totp-verify; auth.controller.ts has no such route. requiresTOTP and tempToken appear nowhere in the backend, so the branch is unreachable dead code that would 404 if reached. The backend DOES have totp/setup and totp/confirm, but no dashboard page calls them, so 2FA can never be enrolled either. Anyone believing admin 2FA is on is wrong.  
  *Fix:* Build the endpoint and enrolment UI, or delete the TOTP step.
- [ ] **A-H4 "Send Password Reset Email" and "Reactivate Account" hit routes that do not exist**  
  `src/lib/api.ts:141-143, admins/page.tsx:456,513`  
  The only admins/:id/* routes are role, totp/setup, totp/confirm, offboard and footprint. Consequence: an admin who is offboarded can NEVER be brought back, because the Reactivate button always errors and there is no other path. deactivate is dead code with no caller.  
  *Fix:* Add the two routes (reactivate is a one-line isActive true plus audit); point reset-password at the working POST /auth/forgot-password, which already branches the link to the admin web URL.
- [ ] **A-H5 Driver-assignment search returns an unfiltered list**  
  `deliveries/page.tsx:331, admin.controller.ts:246`  
  getDrivers has no search parameter. The dispatcher types "Chinedu", the modal returns the same arbitrary first 20 approved drivers, and the empty state "No approved drivers match that search" can never fire. On a platform with more than 20 approved drivers the manual-dispatch picker is a lottery.  
  *Fix:* Accept search on GET /admin/drivers and ILIKE against user.name, user.phone, vehiclePlate.
- [ ] **A-H6 The push composer one-person search can send to the wrong customer**  
  `notify/page.tsx:52, admin.controller.ts:133`  
  getUsers drops search, so the composer shows the first 8 users on page 1 regardless of what was typed and the operator picks one believing it matched. This sends a real push notification to a real stranger.  
  *Fix:* Add search to GET /admin/users, or switch the composer to adminApi.search(q), the endpoint actually built for this.
- [x] **A-H7 The fraud page "Action (Ban)" does not ban anyone**  
  `fraud/page.tsx:97-102, fraud.service.ts:102-105`  
  resolveFlag only updates the flag row status. The user stays fully active. A risk officer clears the queue believing fraudsters are locked out. There is also no confirm dialog and no link from a flag to the account.  
  *Fix:* Rename to "Mark Actioned" and add a separate explicit ban behind a confirm, plus a link to /users/{id}.
- [ ] **A-H8 /dev-usage shows the logged-in admin own key stats as "Platform API Stats"**  
  `dev-usage/page.tsx:17, dev-platform.service.ts:335`  
  getUsageStats filters by ownerUserId, which is the ADMIN id. Admins hold no developer keys, so Total Keys / Active Keys / Calls Today are permanently 0 under a heading saying "Aggregate Developer Platform usage". /dev-accounts correctly uses listAllKeys().  
  *Fix:* Point at listAccounts() and aggregate, or add an admin-scoped usage endpoint.
- [ ] **A-H9 Last-Order Compliance reads a field the API never returns, and states a rule nothing enforces**  
  `last-order-compliance/page.tsx:45,57, admin.service.ts:1340-1352`  
  Filters on d.lastOrderActiveAt, which driverComplianceStats never returns (the entity column is lastOrderEnabledAt). So "Currently Winding Down" is permanently 0 and the badge never renders: the page whole named purpose is inert. Line 57 also states "Drivers below 80% cannot enable the wind-down mode" while drivers.service.ts says the gate is informational only and performs no check.  
  *Fix:* Return lastOrderMode and lastOrderEnabledAt, and either enforce the gate or change the copy.
- [x] **A-H10 The push composer Schedule control silently sends immediately**  
  `notify/page.tsx:281-298,71-113,317`  
  Renders a Schedule button and datetime picker, requires a datetime, and the submit reads "Schedule broadcast", but send() never passes scheduleAt anywhere: the broadcast fires now. The code comment admits it and claims the toast surfaces it, but that note is only set on the one_user branch. An ops person schedules "Service resumes at 6am" and every customer phone buzzes at 11pm.  
  *Fix:* Disable Schedule with an explicit "not available yet", or set the note on the broadcast path.
- [ ] **A-H11 The Featured Promotion widget cannot save on a fresh database**  
  `settings/page.tsx:237, admin.service.ts:2477-2479,2449-2456`  
  updatePlatformConfig throws NotFoundException for an unknown key, and featured_promotion is not in DEFAULT_CONFIG. Nothing ever inserts the row, so "Publish Promotion" returns "Unknown config key: featured_promotion". The hero card on the customer Rewards tab can never be set from the dashboard.  
  *Fix:* Add featured_promotion to DEFAULT_CONFIG, or make the update upsert for an allow-list.
- [x] **A-H12 Every percentage promotion created from the dashboard is uncapped**  
  `promotions/page.tsx:203-227,150-158`  
  CreatePromoModal never sends maxDiscountKobo or minSubtotalKobo and has no input for either. The entity own comment is explicit: "Optional cap for % discounts so a 50% promo on a N40k delivery does not haemorrhage margin. Null = no cap." The list table does not display the cap either, so an admin cannot even see that existing promos are uncapped. This is the every-perk-needs-a-cap rule failing on the one surface that mints discounts.  
  *Fix:* Add Max discount and Min subtotal fields, convert to kobo, default the max non-null for percent, and add a Cap column.
- [x] **A-H13 There is no way to reject a driver KYC application anywhere in the dashboard**  
  `src/lib/api.ts:164-165 (zero callers), drivers/page.tsx:136-145, drivers/[id]/page.tsx:210-227`  
  adminApi.rejectDriver exists and is never called. The list offers Approve and Suspend; the detail offers Approve KYC / Suspend / Reinstate. A pending applicant with a forged licence can only be approved or left in the queue forever.  
  *Fix:* Add a Reject button with a required reason, wired to the existing endpoint.
- [x] **A-H14 Money renders as raw Postgres decimal strings on four surfaces**  
  `deliveries/page.tsx:206, users/[id]/page.tsx:402, drivers/[id]/page.tsx:523, page.tsx:506`  
  price and driverEarnings are decimal columns with no numeric transformer, so node-postgres returns "1500.00" and String.toLocaleString leaves it unchanged: N1500.00. Fractional naira breaks the house standard, and the missing separator makes N1500 and N15000 hard to tell apart in a scan. The delivery DETAIL page rounds correctly, so the same order shows two different numbers on two pages.  
  *Fix:* Use the existing naira() helper everywhere, or add a numeric transformer on the columns.
- [x] **A-H15 Stored XSS in the ops-map info windows**  
  `ops-map/page.tsx:209,254,278,355`  
  Interpolated strings go to infoWindow.setContent, which Google Maps parses as HTML. d.name, s.storeName, s.storeAddress and a.user.name are all user-supplied, and label at 355 comes from the ?label= query param (reflected). A driver who sets their name to an img onerror payload exfiltrates the admin session token from localStorage the moment ops clicks their pin.  
  *Fix:* Build the info window with createElement and textContent, or HTML-escape every interpolated value.
- [x] **A-H16 Fee Catalogue Save always 403s for the roles the nav grants**  
  `fees.controller.ts:59-60, rbac.ts:38,40,128, fees/page.tsx:320-327`  
  The PATCH is super-admin only, but the nav grants fees to ops_manager and finance_officer and puts Fee Catalogue in their sidebar. Those admins can open every fee, edit it, hit an always-enabled Save and get an alert. The same applies to the FuelDriftBanner "Apply pump prices and publish", which renders on the dashboard home for those roles but calls a super-admin-only route.  
  *Fix:* Gate both buttons on isSuperAdminFromUser with a read-only note, matching what /website already does.
- [x] **A-H17 NDPR hard-delete is offered to roles the API will refuse**  
  `users/[id]/page.tsx:224-232,33 and drivers/[id]/page.tsx:239-243`  
  Both render "NDPR hard-delete" and "Export NDPR data" unconditionally, while the service gates them to super_admin plus support_agent (delete) or finance_officer (export). /users and /drivers are granted to ops_manager and driver_compliance, so those roles get a fully enabled irreversible-purge button that 403s only AFTER they have typed the reason and confirmed the name. Tellingly, users/[id] already computes superAdmin and never uses it: the guard was written and not wired. /recycle-bin "Delete forever" has the same problem.  
  *Fix:* Wrap the destructive buttons in the role check that is already computed.
- [x] **A-H18 The middleware permission map is a stale copy missing about 15 routes**  
  `src/middleware.ts:11-48`  
  PATH_PERMISSIONS has 25 entries; NAV_SECTIONS has 39 pages. Ungated: /roles, /fees, /identity, /recycle-bin, /website, /notify, /email-templates, /health, /disputes, /interstate, /last-order-compliance, /service-catalog, /partner-applications, /dev-accounts, /dev-usage, /dev-docs, /sos. A media_content admin can navigate straight to Role Management. ROLE_PERMS is a second divergent copy of PERMISSIONS. And because decodeJwtRole reads adminRole ?? role from a JWT that carries no roleSlug, any custom-role admin decodes as "admin", fails isKnownGranularRole, and gets NO middleware gating at all.  
  *Fix:* Derive PATH_PERMISSIONS from NAV_SECTIONS, import PERMISSIONS instead of copying it, and put roleSlug and permissions in the JWT.

### MEDIUM

- [x] **A-M1 Analytics revenue chart X-axis is blank**  
  `analytics/page.tsx:109-110,116`  
  dataKey "day" with a date tickFormatter, but getRevenueByDay returns { date, revenue, count } where date is already a formatted string like "5 Aug". So r.day is undefined, the axis renders nothing, and the tooltip produces "Invalid Date". The dashboard home gets it right.  
  *Fix:* dataKey="date" and drop both formatters.
- [ ] **A-M2 The SOS desk can never link to the booking**  
  `sos/page.tsx:128-135, sos.service.ts:133-137`  
  listActive does a find with no relations and SosAlert.delivery is not eager, so a.delivery is always undefined and "Open their booking" never appears. user IS eager so name and phone work. This is the one screen whose stated job is the first minute of an emergency.  
  *Fix:* relations: ['delivery'].
- [x] **A-M3 Chat re-open has no early close**  
  `src/lib/api.ts:627-631, support/page.tsx:438-461`  
  chatReopen.close is defined against a live backend route and nothing calls it, while the api.ts comment promises "and close it early". Support can open a 24h PII window and cannot shut it.  
  *Fix:* Add a Close-chat button beside Re-open.
- [x] **A-M4 Published CMS items cannot be edited**  
  `cms/page.tsx`  
  cms.update is defined with no caller; the page offers create, approve, publish and delete only. A typo in a live in-app banner requires delete and recreate, losing its id.  
  *Fix:* Wire an edit action.
- [x] **A-M5 CMS banners can never carry an image**  
  `cms/page.tsx:19,238,137-175`  
  imageUrl is typed and a thumbnail is rendered, but the create modal has only Type, Title and Body. adminApi.upload.image is used on /website but not here. Given the app-must-look-alive rule, an image-less banner system is a real gap.  
  *Fix:* Add the uploader to the modal.
- [x] **A-M6 Revoked and expired identity verifications become unreachable**  
  `identity/page.tsx:163`  
  Tabs render only submitted, approved, rejected and withdrawn, though the status type, the styles and the API all support revoked and expired. An admin revokes a verification and the record disappears from the UI.  
  *Fix:* Add the two tabs.
- [ ] **A-M7 /partner-applications shows a truncated UUID instead of the applicant**  
  `partner-applications/page.tsx:124, partner-store.service.ts:1899-1904`  
  Renders the first 8 characters of userId because the query loads bare store rows with no user relation. An admin grants partner capability without ever seeing the owner name, email or SEIRS ID, and cannot click through. Against the admin-always-sees-identity rule.  
  *Fix:* relations: ['user'] and render name/email/phone plus a link.
- [ ] **A-M8 /dev-accounts identifies developer accounts only by raw UUID**  
  `dev-accounts/page.tsx:140, dev-platform.service.ts:86-88`  
  listAllKeys has no owner join, so suspending a developer account means suspending a UUID.  
  *Fix:* Join the owner.
- [ ] **A-M9 Referral "Credited" does not mean a bonus was paid**  
  `admin.service.ts:2431, referrals/page.tsx:67`  
  status is derived purely from finding a user whose accountId matches the code. The actual award runs through the 7-gate awardReferralBonusIfEligible on DELIVERED. The founder reads a payout rate that is really a code-resolution rate.  
  *Fix:* Derive the status from the actual award rows.
- [x] **A-M10 Rate-card history always says the change was made by "admin"**  
  `pricing/page.tsx:117,230, pricing.controller.ts:227`  
  activatedBy is hardcoded to the literal string 'admin' client-side and the controller spreads the body verbatim, so the History By column is 'admin' for every version. Pricing changes are unattributable. syncFuel does it correctly with the real name.  
  *Fix:* Drop the field client-side and set it from @CurrentUser().
- [x] **A-M11 The Health page "Auth" check probes the same endpoint as "Backend API"**  
  `health/page.tsx:40-41,7-8`  
  Both rows call adminApi.stats(): two green rows, one probe. The file comment also claims it pings each external dependency; nothing touches Flutterwave, Google Maps, R2 or email.  
  *Fix:* Point the auth row at GET /auth/me and add real dependency probes or correct the comment.
- [x] **A-M12 Audit Log is gated by the legacy role field only**  
  `audit-log/page.tsx:61, cms/page.tsx:58-59, rbac.ts:41`  
  Uses isSuperAdmin(getAdminRole()) which reads user.adminRole, so a super admin on a dynamic role sees "Access Restricted". Every other page uses isSuperAdminFromUser, which handles both. Conversely the nav grants /audit-log to driver_compliance, who always hits the block screen: a nav entry to a wall.  
  *Fix:* Use isSuperAdminFromUser and fix the nav grant.
- [x] **A-M13 Audit Log "Previous" duplicates rows**  
  `audit-log/page.tsx:54`  
  Appends unless page is 1, so paging Next to 3 then Previous to 2 appends page 2 again on top of the accumulated list, producing duplicate React keys and repeated entries.  
  *Fix:* Replace the list on every page change.
- [x] **A-M14 Twelve pages swallow fetch errors into a "no data" empty state**  
  `wallet, recycle-bin, fees, partners, partner-applications, referrals, deliveries, drivers, users, users/[id], fraud, cms, audit-log`  
  A 403 or a Railway cold start is indistinguishable from a clean board. wallet shows an all-zero money summary; recycle-bin, a compliance surface, says "Recycle bin is empty".  
  *Fix:* Keep an error state and render a retry banner, as /duplicates, /insurance, /interstate and /identity already do.
- [x] **A-M15 No global 401 handling**  
  `src/lib/api.ts:16-19, lib/auth.ts:43, auth.service.ts:729`  
  req() throws a generic Error on any non-ok response and nothing inspects the status. With an 8-hour cookie against a 30-minute JWT, a tab left closed for 40 minutes passes middleware, then every request 401s into the silent catches above and the admin stares at empty pages.  
  *Fix:* On 401, clearSession() and redirect to /login?reason=expired.
- [x] **A-M16 The Interstate Trip Board promises actions it does not have**  
  `interstate/page.tsx:6-8,58,20`  
  Says ops can match orphaned long-haul packages and override allocations. The page is read-only: no match control, no link to a package, no link to the driver, and the driver phone is typed but never rendered. The status filter is hardcoded to active though the API accepts completed and cancelled.  
  *Fix:* Build the actions or correct the copy.
- [x] **A-M17 Liability disputes are unreachable from a delivery**  
  `disputes/page.tsx:93, deliveries/[id]/page.tsx`  
  The page asks the admin to paste a UUID "from delivery detail page", but the delivery detail page never displays the id: it shows trackingCode.  
  *Fix:* Add an "Open chain of custody" link on the delivery detail page.
- [ ] **A-M18 The liability matrix is hardcoded in the dashboard**  
  `disputes/page.tsx:217-223`  
  Seven liability rules hardcoded as a table. This is a policy the founder has re-specified before; per the admin-tunable rule it should be config-backed with a code fallback.  
  *Fix:* Move to the Fee Catalogue or a config row.
- [x] **A-M19 The 80% acceptance threshold is hardcoded**  
  `last-order-compliance/page.tsx:25`  
  Drives both the summary card and the copy.  
  *Fix:* Make it a Fee Catalogue row.
- [x] **A-M20 Saving the Super Admin role converts its wildcard into an enumerated list**  
  `roles/page.tsx:96,134, roles.service.ts:76`  
  The editor expands '*' to every permission slug on open and save() posts the expanded array, which the service accepts for system roles without protection. After one accidental save the super_admin role no longer matches permissions.includes('*'), and every page added later needs an explicit grant.  
  *Fix:* Keep '*' when the full catalogue is selected, or reject permissions edits on system roles.
- [x] **A-M21 The nav fraud badge is dead config**  
  `rbac.ts:136, AdminNav.tsx:190`  
  rbac declares badge 'fraud' but the nav renders only badge === 'tickets'. The file own comment records that this exact bug was already fixed once for tickets. Open fraud flags are invisible until someone opens the page.  
  *Fix:* Render the fraud badge.
- [ ] **A-M22 Nine destructive or audited actions use browser prompt/confirm/alert**  
  `dev-accounts, drivers/[id] (the two-person-rule level change and its audited reason), identity (rejection and revocation reasons shown to users), partner-applications, partners, partners/[id], settings, support (bank and vehicle change approvals)`  
  users/[id]:103 documents the decision to stop doing this. prompt() is blocked outright in some browser configurations, which would make those flows unusable.  
  *Fix:* Use the app's ConfirmDialog.
- [ ] **A-M23 Fourteen API methods are dead code against live backend routes**  
  `src/lib/api.ts`  
  pricing.get/update (a whole second pricing config the dashboard never opens), payments.refund, suspendUser, pendingDeletions.softDelete, tickets.list/get/update/reply, analytics.heatmap, websiteContent.get, identityVerifications.get, roles.get, fees.get/grouped. Each is a maintained endpoint with no consumer.  
  *Fix:* Wire or delete.
- [x] **A-M24 "Deliveries by Category" is actually urgency**  
  `analytics/page.tsx:210, admin.service.ts:1807-1814`  
  The pie is labelled by category but the query groups by d.urgency, and the backend comment says so. The legend will read express/standard, not cargo categories.  
  *Fix:* Group by categoryCode or rename the chart.
- [x] **A-D1 Three build breaks in the dashboard**  
  `drivers/[id]/page.tsx:425, src/lib/api.ts, app/page.tsx:66`  
  A multiline single-quoted string broke the webpack parse; adminApi.revenueSplit was called but never defined on the client; and the Promise.all destructure ignored the inserted element so the revenue tiles would have rendered blank. None of these would have deployed.  
  *Fix:* Template literal, added the client method, fixed the destructure. next build now exits 0.

### LOW

- [x] **A-L1 Em-dash in user-visible copy**  
  `components/SosBanner.tsx:37, instrumentation.ts:1`  
  The only two in the project.  
  *Fix:* Replace.
- [x] **A-L2 dev-docs primary CTA links to a placeholder domain**  
  `dev-docs/page.tsx:36-44,73`  
  "Open docs.seirs.app" on a domain the same page admits is a placeholder. A nav entry whose main button goes nowhere.  
  *Fix:* Hide until the docs exist.
- [x] **A-L3 /partner-redirects is a nav entry to a feature with no backend**  
  `partner-redirects/page.tsx`  
  Renders three fake preview rows. Honestly labelled "Not available at launch", but occupies a permanent slot for ops_manager and partner_manager.  
  *Fix:* Hide behind a flag.
- [x] **A-L4 A date range renders as two sentences**  
  `promotions/page.tsx:157`  
  "05 Aug 2026. 05 Sep 2026".  
  *Fix:* Use "to".
- [x] **A-L5 An unreachable specific_zone audience that would throw if selected**  
  `notify/page.tsx:174,65,307,115`  
  specific_zone is handled but absent from AUDIENCES, so the zone input and preview branch are unreachable, and the non-null find at 115 would throw if it ever were selected.  
  *Fix:* Remove or add it properly.
- [x] **A-L6 The commission label always shows one decimal**  
  `app/page.tsx:141`  
  A float-modulo test (rate % 0.01 === 0) that is essentially never true, so it always renders "15.0% of gross revenue".  
  *Fix:* Round properly.
- [x] **A-L7 Fees whose category is not in a hardcoded list are silently hidden**  
  `fees/page.tsx:204`  
  CATEGORY_ORDER currently matches all 13 enum members exactly, so nothing is hidden today, but a new backend category would be invisible with no error.  
  *Fix:* Fall back to rendering unknown categories.
- [x] **A-L8 Middleware special-cases a /track route that does not exist**  
  `src/middleware.ts:91`  
  No app/track/**/page.tsx exists.  
  *Fix:* Remove.
- [x] **A-L9 Contradictory comments about the token refresh interval**  
  `src/lib/api.ts:25 vs components/NavWrapper.tsx:12-16`  
  One says ~5 minutes, the other says 10 and 10 is what runs.  
  *Fix:* Fix the comment.
- [x] **A-L10 Stale "placeholder route" comment**  
  `notify/page.tsx:11-13`  
  Both notification routes are real and both used.  
  *Fix:* Delete.
- [x] **A-L11 An entered 0 silently becomes 60, and invalid nested clickables**  
  `dev-accounts/page.tsx:71,152-160`  
  Math.max/min with a || 60 fallback turns 0 into 60. A clickable span is nested inside a button, which is invalid HTML and not keyboard-reachable.  
  *Fix:* Handle 0 and unnest.
- [x] **A-L12 A brand-new driver renders as 0.0 stars**  
  `drivers/page.tsx:131`  
  Number(null).toFixed(1) reads as a terrible driver rather than "no ratings yet". last-order-compliance handles the same case correctly with a dash.  
  *Fix:* Render a dash.
- [x] **A-L13 A computed super-admin check that is never referenced**  
  `users/[id]/page.tsx:33`  
  See A-H17: the guard was written and not wired.  
  *Fix:* Use it.

---

## Website and platform

HIGH 11/15 closed · MEDIUM 20/28 · LOW 12/13


### HIGH

- [x] **W-1 /dispute-resolution does not exist, linked from two apps legal menus**  
  `customer-app privacy.tsx:246, driver-app privacy.tsx:99`  
  Both open https://seirs.app/dispute-resolution. No such route exists on the site, so a user tapping "Dispute Resolution" from a legal menu gets the 404 page.  
  *Fix:* Both repointed at /terms-of-service, which carries the disputes section.
- [x] **W-2 /terms does not exist, linked from the customer profile menu**  
  `customer-app (tabs)/profile.tsx:123`  
  The real route is /terms-of-service. The .catch fallback does not save it: openURL resolves once the browser opens, so the user sees a 404 rather than the coming-soon alert.  
  *Fix:* Repointed to /terms-of-service.
- [x] **W-3 Referral links 404 for every user who shares one**  
  `customer-app referral.tsx:20`  
  WEB_REFERRAL_BASE is 'https://seirs.app/r/'. No src/app/r/ route exists. The referral system is otherwise fully wired, so the landing page is the only missing piece.  
  *Fix:* Add src/app/r/[code]/page.tsx that stores the code and forwards to the store link.
- [ ] **W-4 Five different names for "the website URL", with conflicting defaults**  
  `launch.ts:78, sitemap.ts:9, deliveries.service.ts:1941, payments.service.ts:527, mail.service.ts:215, statements.service.ts:32, plus ~20 hardcoded literals`  
  NEXT_PUBLIC_SITE_URL and PUBLIC_SITE_URL default to seirs.app; WEBSITE_URL and PUBLIC_WEB_URL default to seirs-website.vercel.app. The two halves already disagree in production: a WhatsApp collect link goes to seirs.app/collect while the password-reset email from the same backend goes to vercel.app/reset-password. The LAUNCH_CHECKLIST claims setting one Vercel env var resolves the split; it resolves one of five. Highest-stakes consequences: the public tracking flow and the collect-fee flow both sit on the unresolved host.  
  *Fix:* Settle the domain, then export one shared constant that all three apps and the backend import. Rewrite the checklist entry to name all five plus the literals.
- [x] **W-5 "NDPR compliant" was still rendered, under a comment saying it was removed**  
  `src/app/page.tsx:855-859,831-845`  
  A 15-line comment above the array explained the badge was removed because NITDA NDPR registration is not started and "that is the kind of unearned compliance claim a regulator acts on". The removal was written and never applied, so it asserted a registration that does not exist on every homepage view. The same comment said "The four below" while the array held three.  
  *Fix:* Deleted the entry and corrected the comment, which now also records that the removal was written and never applied.
- [~] **W-6 The Terms prohibit two things the homepage advertises as real services**  
  `terms-of-service/page.tsx:191,193 vs page.tsx:547,552`  
  Terms strictly prohibit "Live animals" and "Perishable items without prior arrangement". The homepage sells "Live animals: yes, even the Christmas chicken" and "Hot food: amala that arrives still steaming", and states of those tiles that "every one of them is a real option in the app, priced on its own rate card". The backend confirms it: live_animals and food_hot are live category codes the engine prices, and both appear in the customer app category picker. A customer whose live-animal delivery goes wrong is met with a clause saying it was never allowed.  
  *Fix:* FOUNDER DECISION: carve both out of section 4 with the conditions that actually apply, or remove the categories.
- [x] **W-7 "Night pickups carry a night fee that goes to you in full"**  
  `for-drivers/page.tsx:166`  
  The seeded rate card sets night driverSharePercent to 80, and the engine multiplies by that share. The driver gets 80%, not 100%. The homepage comment had it right; this recruitment page did not.  
  *Fix:* Changed to "Night pickups carry a night fee, and most of it is yours", with the card field named in a comment.
- [~] **W-8 The Terms create a prepaid customer-funds balance**  
  `terms-of-service/page.tsx:153-154,222,362-363 plus layout.tsx, page.tsx and all five for-* pages`  
  "Business wallet funds are non-refundable except as stated", "Business wallet top-ups are processed immediately", "Outstanding wallet balances will be refunded to a verified Nigerian bank account within 14 business days". This is deposit-taking language in a binding document and it contradicts the no-business-wallet rule. The backend DOES implement it (business-account walletBalance, business-wallet-tx), so it is a live policy conflict, not a copy error. The existing LEGAL_AUDIT_REPORT flags the same thing.  
  *Fix:* FOUNDER DECISION. This is the single largest legal exposure on the site and should be settled before launch, not at launch.
- [~] **W-9 Price-finality claim contradicted by the Terms and by the product**  
  `how-it-works/page.tsx:163 vs terms-of-service/page.tsx:209`  
  "The price you see is the price you pay. No surcharges at the end." The Terms say prices at order creation are estimates and may vary. The product also sells partner-store storage fees, redirection fees and counter fees. A consumer-protection challenge writes itself.  
  *Fix:* FOUNDER DECISION: recommend "The quote is locked when you book", which the backend quote pin actually does, and dropping the no-surcharges line.
- [x] **W-10 The contact page claims live operations in four cities**  
  `contact/page.tsx:372`  
  "Operations currently active across Lagos and Abuja, with expansion to Port Harcourt and Kano underway." APPS_PUBLISHED is false, the store listings are pending, and the partner directory returns zero stores. Nothing is active anywhere. Not tracked in LAUNCH_CHECKLIST.  
  *Fix:* Remove, or gate on APPS_PUBLISHED and add a checklist entry for the real city list.
- [x] **W-11 The Terms of Service contents was off by one from section 8**  
  `terms-of-service/page.tsx:49-66`  
  16 TOC entries against 17 rendered sections: section 8, Undeliverable Packages, Storage and Disposal, was added on 2026-08-15 and never added to the TOC. Every entry from 8 to 16 landed on the wrong section and section 17 had no entry at all.  
  *Fix:* Inserted the missing entry; all 17 now align.
- [x] **W-12 "Trusted by" displays the SEIRS logo four times as its own social proof**  
  `src/app/page.tsx:178-181, PartnerMarquee.tsx:46,72-76`  
  With no partners signed, the fallback repeats the SEIRS logo four times under a heading reading "Trusted by", with each logo name rendered beside it. The comment argues the stand-in avoids implying a partnership that does not exist, but the heading is itself the implication. Not tracked in LAUNCH_CHECKLIST.  
  *Fix:* Return null when there are no partner logos, and add a checklist entry.
- [x] **W-13 privacy@seirs.co is the statutory rights channel and is untracked**  
  `privacy-policy/page.tsx:117,254,305,333,257`  
  All NDPA data-subject requests route there with a binding promise to respond within 30 days. That address is not in launch.ts CONTACT, which lists only support, business, legal and careers. If the mailbox does not exist, statutory access and deletion requests bounce silently.  
  *Fix:* Verify the mailbox and add it to CONTACT as LIVE, or switch the policy to legal@seirs.co.
- [x] **W-14 The public API hands business partners a 404 tracking URL**  
  `seirs-backend/src/developer-platform/v1.service.ts:174,269,298`  
  Returned https://seirs.app/t/<code> from create-delivery, the sandbox and the test endpoint. The site serves /track/[code]; there is no /t/. Every business integrating over REST receives a dead URL and embeds it in THEIR OWN order-confirmation emails to THEIR customers. It is the one broken link that propagates outside SEIRS entirely, and a partner hits it during sandbox testing before they ever go live.  
  *Fix:* Now builds from PUBLIC_SITE_URL with the /track/ path, matching the rest of the backend.
- [x] **P-2 highValue is null on the rate card, so the premium is not admin-tunable**  
  `rate card v2, pricing.service.ts:947-953`  
  The high-value premium (N500 on a N150,000 declared value, verified live) comes from a CODE FALLBACK of thresholdNgn 50,000 and premiumPct 0.5, because the card has no highValue object at all. The founder cannot change the threshold or the percentage from the dashboard, which breaks the admin-tunable-everything rule on a real money line.  
  *Fix:* Seed highValue onto the card via the self-heal pattern so the dashboard can edit it, keeping the code values as the fallback.

### MEDIUM

- [x] **W-M1 A bad code and a network error are indistinguishable**  
  `track/[code]/page.tsx:132-147,169`  
  One catch covers both the not-ok throw and a fetch rejection, and the render shows "Tracking not found" either way. An offline user is told their code is wrong.  
  *Fix:* Catch TypeError separately and offer a retry.
- [x] **W-M2 awaitingPayment is ignored, so the page invents progress**  
  `track/[code]/page.tsx:42-72`  
  The backend returns awaitingPayment with a comment saying the tracking page uses it to say "waiting for payment" instead of inventing progress. The interface does not declare it and nothing renders it, so an unpaid booking shows pending and reads "Awaiting driver": exactly what the field was added to prevent.  
  *Fix:* Declare and render it, matching the app amber/brand-yellow unpaid state.
- [x] **W-M3 kind is ignored, so a tracked ride renders with package language**  
  `track/[code]/page.tsx`  
  The backend returns kind package|ride; the page shows a Package icon and "Picked up / Drop-off" for a human passenger.  
  *Fix:* Branch the copy and icon on kind.
- [x] **W-M4 A receiver owing a redirect fee hits a dead end**  
  `track/[code]/page.tsx vs deliveries.service.ts:1458-1470`  
  When the fee is locked the backend returns the dropoff as the literal sentence "SEIRS Partner Store (settle the redirect fee to reveal the pickup location)" plus the amount owed. The tracking page renders that sentence under Drop-off and never links to /collect/<code>, the page built for exactly this.  
  *Fix:* Link to /collect/{code} when redirectFeeOwedNgn > 0.
- [x] **W-M5 Reset-password stated the wrong expiry, contradicting the email that sent the user there**  
  `reset-password/page.tsx:202`  
  The page said 30 minutes. The backend sets 15, and email-templates.service.ts:36 tells the user 15. Two surfaces in one flow contradicted each other, and the wrong one was the page the user is looking at when the clock matters.  
  *Fix:* Corrected to 15 minutes.
- [x] **W-M6 The cookie banner describes cookies that do not exist**  
  `CookieBanner.tsx:44,8-10, privacy-policy/page.tsx:265-266`  
  Says "We use essential cookies to make this site work and optional cookies for analytics" while its own comment says only a localStorage flag is persisted and there are no third-party trackers. The privacy policy separately says no tracking or advertising cookies, and never mentions the website at all.  
  *Fix:* Describe what actually happens.
- [x] **W-M7 "Accept all" and "Essential only" do the same thing**  
  `CookieBanner.tsx:25`  
  Both call decide(), which only writes localStorage. Nothing is gated on the value. Two buttons, one outcome.  
  *Fix:* Gate something, or offer one dismissal.
- [x] **W-M8 "You can change your mind anytime in the Privacy Policy" is false**  
  `CookieBanner.tsx:32`  
  The privacy page has no consent control and the banner never reappears once answered. There is no way to change your mind at all.  
  *Fix:* Add a control or remove the sentence.
- [x] **W-M9 The canonical host disagrees three ways and the env var only fixes one**  
  `layout.tsx:26, sitemap.ts:9, launch.ts:78, CookieBanner.tsx:42`  
  layout hardcodes the vercel URL for OpenGraph; sitemap and launch default to seirs.app; the cookie banner hardcodes the string "Cookies on seirs.app". Setting the env var touches none of the hardcoded ones.  
  *Fix:* Import SITE_URL in both hardcoded places. See W-4.
- [x] **W-M10 No metadataBase, no OG image, no robots.txt**  
  `layout.tsx, src/app/`  
  openGraph is set with no images and no metadataBase, so every share renders as bare text. There is no robots.ts or public/robots.txt, so the sitemap is never announced.  
  *Fix:* Add all three.
- [x] **W-M11 Brand casing is split across the site**  
  `layout.tsx:10,27,28,35; Footer.tsx:135; page.tsx:392,468; all four for-* pages; both legal pages; track/[code]:203,354`  
  SEIRS in faq, news, careers, changelog, article footers, reset-password and collect; "Seirs" everywhere else. The two tracking pages ("Seirs Tracking", "Powered by Seirs Logistics") are the highest-traffic public surface.  
  *Fix:* SEIRS everywhere.
- [x] **W-M12 Title template doubles up**  
  `faq/page.tsx:8, news/page.tsx:9, careers/page.tsx:8, changelog/page.tsx:8 and both dynamic routes`  
  Pages set "FAQ - SEIRS" which the layout template renders as "FAQ - SEIRS | Seirs Logistics".  
  *Fix:* Drop the suffix and let the template supply it.
- [x] **W-M13 Both tracking pages have no metadata**  
  `track/page.tsx, track/[code]/page.tsx`  
  Both are 'use client' so neither can export metadata; both inherit the generic default title. Tracking is the highest-intent search term a logistics site gets.  
  *Fix:* Wrap each in a server page that exports metadata.
- [x] **W-M14 Type and lint errors are suppressed in production builds**  
  `next.config.ts:16-21`  
  eslint.ignoreDuringBuilds and typescript.ignoreBuildErrors are both true. This defeats the local-build-before-push rule for this app and is why the dead LangSwitcher and unused imports never surfaced.  
  *Fix:* Turn both off and fix what falls out.
- [x] **W-M15 renderMarkdown is injectable**  
  `src/lib/cms.ts:146,184`  
  esc escapes only & < >, not quotes, and inline() builds an anchor href with no protocol allowlist. A CMS body containing a javascript: link or a quote-breaking href renders live via dangerouslySetInnerHTML on /faq, /changelog, /news/[slug] and /careers/[slug]. Admin-authored content only, so admin-to-visitor stored XSS rather than open, but the guard is one line.  
  *Fix:* Escape quotes and reject any href not starting http://, https://, / or mailto:.
- [ ] **W-M16 Vehicle capacities are hardcoded against a versioned, admin-tunable card**  
  `for-drivers/page.tsx:233-253`  
  States 5 / 20 / 100 / 200 / 800 kg. Currently CORRECT against the seeded card, but the card is versioned and admin-editable and the apps already merge the live card over bundled defaults. These become false the first time an admin edits the card, silently.  
  *Fix:* Fetch from the live card.
- [ ] **W-M17 Two naira amounts remain hardcoded in the Terms**  
  `terms-of-service/page.tsx:213,240`  
  "loyalty points (N10 per point)" and "Maximum liability N50,000 per package", after N500 per package was removed for exactly this reason. Both live in the Fee Catalogue, and the existing legal audit separately flags the N50,000 cap as unsupported.  
  *Fix:* Render from config or remove the figures.
- [x] **W-M18 Both legal pages are dated 30 April but were materially changed in August**  
  `privacy-policy/page.tsx:57, terms-of-service/page.tsx:85,415-416`  
  Terms section 8 carries a 2026-08-15 comment, and section 16 promises at least 14 days notice before material changes. The stale date makes that promise unverifiable and is itself inaccurate.  
  *Fix:* Update both dates whenever the text changes.
- [x] **W-M19 Privacy section 9 does not cover the public website**  
  `privacy-policy/page.tsx:265-266`  
  Addresses only mobile apps and the admin dashboard, while the site sets two localStorage keys and shows a consent banner. Under NDPA the notice should describe the surface the visitor is standing on.  
  *Fix:* Add a website section.
- [x] **W-M20 The homepage hardcodes 11 CMS slugs that 404 if unpublished**  
  `page.tsx:338,543-552, news/[slug]/page.tsx:115`  
  Links one news slug and ten moving-* slugs; the article route calls notFound() when the CMS has no match. Any unpublished slug is a 404 reachable from the homepage.  
  *Fix:* Fetch the article list server-side and only render tiles whose slug resolves.
- [ ] **W-M21 Two pages disagree on partner payouts**  
  `for-business/page.tsx:229, for-partner-stores/page.tsx:174, terms section 3.4`  
  "Weekly automatic payout to your bank" vs "Payout details are agreed at onboarding" vs "Weekly payouts are processed every Monday".  
  *Fix:* Pick one.
- [ ] **W-M22 Contact support status is hardcoded "Currently Online"**  
  `contact/page.tsx:428-431,439,433-434`  
  A pulsing green dot and "Currently Online" render unconditionally, directly above stated hours of Monday to Friday 8am to 6pm. It says online at 3am on a Sunday. It also commits to a 2-hour response for business account holders, of whom there are none.  
  *Fix:* Compute from the hours.
- [x] **W-M23 Every transactional email footer was pinned to the vercel host**  
  `seirs-backend/src/mail/mail.service.ts:13,58,60,62,352,386`  
  The logo image and the Help centre, Contact support and Privacy links were hardcoded, bypassing the WEBSITE_URL the same file already used for reset links. If seirs.app becomes canonical and that deployment is renamed, every SEIRS email renders with a broken logo and four dead links, retroactively, including emails already sitting in inboxes.  
  *Fix:* All six now read from a module-level WEB constant backed by WEBSITE_URL.
- [ ] **W-M24 The contact page ships a placeholder image outside the admin slot system**  
  `contact/page.tsx:352-357,347-350`  
  Hardcodes /placeholders/contact-lagos.jpg. The file exists so it is not broken, but the comment admits the img_contact_lagos slot is not wired here, and HeroBackdrop already solves this. Not in LAUNCH_CHECKLIST.  
  *Fix:* Wire the slot and add a checklist entry.
- [ ] **W-M25 External store URLs go through next/link without target or rel**  
  `how-it-works/page.tsx:138,140,313; for-drivers/page.tsx:122,416`  
  PageHero and PageCta render a Link, while GetAppButton and AppStoreBadges use target blank with rel noopener for the same destinations. Inconsistent, and these navigate away from the site.  
  *Fix:* Match the badge behaviour.
- [x] **P-1 The theme switch read "Light Mode: ON" while the app was plainly dark**  
  `shared/components/Drawer.tsx:185,188`  
  The label named the DESTINATION (tap to go light) while the switch value named the STATE (dark is on), so they contradicted each other in both directions. Shared, so all three apps had it.  
  *Fix:* The row is now always labelled Dark Mode: on means dark, off means light, true in both states. Verified on device in both themes.
- [ ] **P-3 regions is empty, so no city multiplier applies anywhere**  
  `rate card v2 regions[]`  
  Lagos is priced identically to everywhere else. The engine supports a regional multiplier and hotspot circles; the card carries none.  
  *Fix:* FOUNDER INPUT NEEDED on the actual multipliers, then seed them.
- [ ] **P-4 serviceFees are both 0, so the service fee is not live**  
  `rate card v2 serviceFees { rideNgn: 0, packageNgn: 0 }`  
  The fee the founder meant to publish is not being charged on either product. Note this is what exposed C-D2: the client bundled card computes an 18% percentage service fee while the server charges a flat 0.  
  *Fix:* FOUNDER INPUT NEEDED on the amount, then publish through the dashboard.

### LOW

- [x] **W-L1 LangSwitcher is 72 lines of dead code**  
  `Nav.tsx:149-220,92`  
  Defined and never rendered; its only reference is inside a comment. LANGS, LANG_STORAGE_KEY and two icon imports are dead with it.  
  *Fix:* Delete.
- [x] **W-L2 Five stale comments**  
  `news/[slug]:9, careers/[slug]:8, SentryInit.tsx:5, Footer.tsx:122-124, page.tsx:840-845`  
  Two claim a Next.js export mode the config explicitly documents removing; one calls this the static-export marketing site; one says the store badges render in a coming-soon state that was removed on 2026-08-14; one says "the four below" over a three-item array.  
  *Fix:* Rewrite.
- [ ] **W-L3 LEGAL_AUDIT_REPORT.md is stale and violates the em-dash rule**  
  `apps/seirs-website/LEGAL_AUDIT_REPORT.md`  
  States twice that section 6 names Paystack; the current Terms name Flutterwave. It also contains 65 em-dashes, the only em-dashes anywhere in the app.  
  *Fix:* Refresh it or move it out of the app root.
- [x] **W-L4 Two computed colour-contrast failures**  
  `page.tsx:150 and all for-* FeatureCard bodies; Footer.tsx:134,140,147,154`  
  text-muted #6B7280 on off-white #F5F5F0 is 4.42:1, under the 4.5:1 AA threshold, and is used for body copy site-wide. text-white/40 on navy is 3.52:1 at text-xs, used for the footer Privacy Policy, Terms of Service and Careers links: the worst place for it.  
  *Fix:* Darken the muted token and use text-white/55 in the footer.
- [x] **W-L5 not-found.tsx renders a plain letter instead of the logo**  
  `not-found.tsx:8`  
  A bare "S" in a square rather than the SeirsLogo component every other page uses, and it exports no metadata.  
  *Fix:* Use the component.
- [x] **W-L6 The collect page does not encode the code in its fetch URL**  
  `collect/[code]/page.tsx:61`  
  Unlike track/[code], which does.  
  *Fix:* encodeURIComponent.
- [x] **W-L7 The collect page can render fractional naira**  
  `collect/[code]/page.tsx:42`  
  toLocaleString with no options, so a decimal fee renders as N1,500.5.  
  *Fix:* maximumFractionDigits 0.
- [x] **W-L8 Career location always falls back to "Lagos, Nigeria"**  
  `careers/page.tsx:65, careers/[slug]/page.tsx:53`  
  Reads (r as any).meta?.location, but meta is not a field on WebsiteContent, so it is always undefined. Silently non-functional.  
  *Fix:* Add the field or drop the lookup.
- [x] **W-L9 A Phone icon on a mailto link**  
  `contact/page.tsx:57-60`  
  The "Delivery Issues" card uses a Phone icon for a mailto link showing an email address.  
  *Fix:* Use a Mail icon.
- [x] **W-L10 A dead interface field contradicted by its own comment**  
  `track/[code]/page.tsx:54,339-343`  
  proofPhotoUrl is declared but the backend deliberately omits it and nothing renders it.  
  *Fix:* Remove.
- [x] **W-L11 The cookie banner breaks heading order and mislabels its dismiss**  
  `CookieBanner.tsx:47-53`  
  Places an h2 inside a fixed overlay on every page, and labels the X "Dismiss" while it persists a permanent declined.  
  *Fix:* Use a div and relabel.
- [x] **W-L12 A stale out/ directory in the app root**  
  `apps/seirs-website/out/`  
  A static export left from the removed output mode. Untracked, so harmless, but it contains only 6 of the 21 routes and there is no local .gitignore.  
  *Fix:* Delete and gitignore.
- [x] **W-L13 Two soft time claims on pages that otherwise avoid them**  
  `page.tsx:428, how-it-works/page.tsx:281 vs for-drivers/page.tsx:342-345`  
  "dispatched to your pickup in minutes", and "Onboarding takes about ten minutes" sitting oddly beside "Approval usually takes one to three business days".  
  *Fix:* Soften or remove.
