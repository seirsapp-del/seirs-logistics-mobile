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

| # | App(s) | Change | Why it needs a build |
|---|---|---|---|
| 1 | all three | **The okada logo change** | Icon, splash and adaptive-icon assets are compiled into the APK. Already outstanding before today. |
| 2 | customer-app | **`expo-print` + `expo-sharing`** | Native modules. Needed for the data-export PDF the founder approved on 4 Sept. driver-app and business-app already ship both at `~15.0.8` / `~14.0.8`, so THEY need no rebuild for it. |

Nothing else is queued. If you add a row, say which app and why the APK has
to change, or the next person cannot tell it from a JS change.

## How to run the pass

One app at a time. Claim the lock first, because a build and a Metro bundler
together is what took the machine to 0.35 GB free on 4 September:

```bash
node scripts/heavy.js claim <your-name> "expo run:android (customer)"
cd apps/customer-app && npx expo run:android
node scripts/heavy.js release <your-name>
```

Local builds only. EAS cloud builds are reserved for release candidates when
all three apps are ready: see [[feedback_local_builds_only]].

## After a rebuild

- Check the version actually installed: `adb shell dumpsys package
  co.seirs.customer | grep lastUpdateTime`. The three current APKs were all
  installed 2026-09-02 19:41-19:45, which is how we proved
  `expo-navigation-bar` was genuinely present rather than assuming it.
- Re-verify anything that was blocked on the native module, and say plainly
  which items in this file the build actually cleared.
