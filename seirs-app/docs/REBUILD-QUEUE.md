# Native rebuild queue

**Rule, from the founder on 2026-09-04: log rebuilds, do not run them.**
A native rebuild takes the phone and a large slice of a 7.9 GB laptop for
15-25 minutes, and this machine is already running two Claude sessions and up
to three Metro bundlers. Batch them into one pass instead.

A JS-only change never belongs here: Metro serves it on reload. This file is
only for things that change the APK.

## What forces a rebuild

Anything that adds, removes or upgrades a **native module**, changes
`app.json` / `app.config.js`, changes an icon, splash or adaptive-icon asset,
or changes a permission.

## Queued now

Nothing. Both rows were cleared by the pass of 2026-09-05, below.

## Cleared

| # | App(s) | Change | Cleared |
|---|---|---|---|
| 1 | all three | The okada logo change (icon, splash, adaptive icon) | 2026-09-05 pass |
| 2 | customer-app | `expo-print` + `expo-sharing` for the data-export PDF | 2026-09-05 pass |

Row 2 was real, not stale: both packages were in `package.json` from 4 Sept,
but the installed APK was built on **2 September 19:43**, so the native modules
were genuinely absent from the device.

## Nothing from the overnight geography work needs a build

Checked on 2026-09-05 before the pass. The per-field "use my location" buttons
use `expo-location`, which all three apps already ship at `~19.0.8`. The
geography dataset, the shared city derivation, the reshaped searches and the
browse redaction are all JavaScript or backend. No new native module, no new
permission, no asset change.

## The audit, so the next rebuild is not a surprise

`scratchpad/native-audit.js` compares every `expo-*` / `react-native-*` import
in each app against that app's `package.json`. Result on 2026-09-05:

```
customer-app   13 native modules imported, none missing
driver-app     13 native modules imported, none missing
business-app   13 native modules imported, none missing
```

So no app is importing something it does not ship, which is the failure mode
that produces a red screen rather than a rebuild.

**Modules that are not in all three**, with why:

| Module | Present in | Note |
|---|---|---|
| `expo-camera` | driver, business | **The one predictable future trigger.** See below. |
| `expo-task-manager` | driver | Background location. Correct: only the rider is tracked. |
| `expo-device` | customer, driver | Business does without it. |
| `expo-image` | customer | Only the customer app has the image-heavy home screen. |
| `react-native-svg-transformer` | customer | Build-time. If driver or business ever import an `.svg` directly, it will fail until this and a `metro.config` change are added. |

### The decision worth taking before the next pass

**customer-app has no `expo-camera`.** The founder-approved special-request
lane is not built yet, and if it asks for photos the way partner documents do
(camera-only, with live location, so a stored photo of somebody else's
transformer cannot be passed off as your own) then the customer app will need
`expo-camera` and that is another full rebuild.

It was deliberately **not** added speculatively on 2026-09-05, because it
declares a CAMERA permission the app does not currently need, and an unused
permission is a real cost at store review. Decide when the special-request
lane is specced: if it is camera-only, add `expo-camera` to customer-app in
the same change and rebuild once.

## How to run the pass

One app at a time. Claim the lock first, because a build and a Metro bundler
together is what took the machine to 0.35 GB free on 4 September:

```bash
node scripts/heavy.js claim <your-name> "gradle assembleDebug (customer)"
cd apps/customer-app && CI=1 npx expo prebuild --platform android --no-install
cd android && ./gradlew assembleDebug --no-daemon -q
MSYS_NO_PATHCONV=1 adb install -r app/build/outputs/apk/debug/app-debug.apk
node scripts/heavy.js release <your-name>
```

**Do not use `npx expo run:android` from a script.** It wants a TTY on stdin,
and without one it prints two lines about the environment and then hangs
forever with no gradle process ever starting, which is indistinguishable from
a slow build. Ten minutes were lost to this on 2026-09-05.

`prebuild` is the step that matters for the logo: `android/` is gitignored in
all three apps, so the launcher icons under `android/app/src/main/res/mipmap-*`
are generated from the `app.json` assets. Skip it and gradle cheerfully builds
an APK carrying the old icons.

Local builds only. EAS cloud builds are reserved for release candidates when
all three apps are ready: see [[feedback_local_builds_only]].

## After a rebuild

- Check the version actually installed: `adb shell dumpsys package
  co.seirs.customer | grep lastUpdateTime`.
- Re-verify anything that was blocked on the native module, and say plainly
  which items in this file the build actually cleared.
