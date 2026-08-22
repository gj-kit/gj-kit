# `example/maestro` — device smoke flows

These are **local gates, not CI gates** (design §9.5). Native compilation and real permission UI are
documented and repeatable, but they never run on CI.

| Flow | Platform | What it proves | Status |
|---|---|---|---|
| `00-smoke.yaml` | both | Dev client launches, JS imports do not throw, every function answers with a typed code or a value, no health value reaches the UI | Phase 2: green on both. ⚠ Phase 3 note: `save-workout` now **really writes** `example-smoke-1` to the store and this flow has no delete step, so running it leaves one workout behind |
| `10-android-authorize.yaml` | Android | Health Connect onboarding → data-type screen → past-data screen, end to end | Phase 2: green, every HC screen SKIPPED (the stub rejected first). Phase 3: the contract really launches |
| `11-android-route-consent.yaml` | Android | The per-route consent dialog and its three outcomes | Phase 2: green, dialog SKIPPED. Phase 3: the dialog is reachable — but note it only appears for a route this app may **not** already read, and on this emulator `READ_EXERCISE_ROUTES` is granted, so the measured path is the 151 ms no-dialog one (f111) |
| `12-android-self-verify.yaml` | Android | **The self-verifying loop of §9.5-1**: 3 600-point route write → list → sync own → `getRoute` round trip → re-save v2 → sync → delete → sync removed | **Phase 3, green on `Pixel_9a_hcprobe` (API 36) on 2026-08-22** — all 11 lines PASS, `wrote=3600 read=3600 mismatches=0` |
| `20-ios-authorize.yaml` | iOS | The HealthKit authorization sheet | **Phase 3, green on iPhone 17 (iOS 26.5) on 2026-08-22** — T10-iOS is CLOSED: the sheet was dumped with `maestro hierarchy` and every selector is now a measured `UIA.Health.*` identifier |
| `21-ios-self-verify.yaml` | iOS | **The self-verifying loop of §9.5-1**, plus the two outcomes only iOS produces: a re-save mints a NEW native id, so the batch is one `replaced` removal plus one addition | **Phase 3, green on iPhone 17 (iOS 26.5) on 2026-08-22** — all 12 lines PASS, `wrote=3600 read=3600 mismatches=0` |

The Phase 2 flows were written so that the screens they could not reach were `optional` — they
turned into real gates the moment Phase 3 landed, with no edits to them.

## Running them

Run them from `expo-workouts/example`, with Metro up (`npm start`) and **always naming the target
device** — this machine has had two Android emulators attached, and Maestro otherwise picks one of
them even when you meant the iPhone. Set IDs for your own simulator/emulator; name the Android one
by its **adb serial**, not its AVD name.

```sh
cd expo-workouts/example
export IOS_SIMULATOR_UDID='<booted iPhone simulator UDID>'
export ANDROID_SERIAL='emulator-5556'
maestro --device "$IOS_SIMULATOR_UDID" test maestro/00-smoke.yaml
maestro --device "$ANDROID_SERIAL" test maestro/00-smoke.yaml
./maestro/collect-artifacts.sh                                                     # gather PNGs
```

**Screenshots do not land where the flow says.** Maestro 2.8.0 refuses absolute `takeScreenshot:`
paths outside its own run folder (f131), and a *relative* path is resolved inside that folder too —
measured here, `takeScreenshot: 00-01-boot` writes to

```
~/.maestro/tests/<timestamp>/<flow>/takeScreenshot/00-01-boot.png
```

so the flows use bare names and `maestro/collect-artifacts.sh` copies the newest run's PNGs into
`maestro/artifacts/`, which is gitignored.

## Emulator stability

`Pixel_9a_hcprobe` is a hand-written AVD (f127) and it repeatedly dropped to
`Command failed (host:transport:emulator-5556): device offline` mid-run, usually while Maestro was
installing its own driver APK. `00-smoke` and `10-android-authorize` both went green after
`adb kill-server && adb start-server`, so the recovery is:

```sh
adb kill-server && adb start-server && adb wait-for-device
adb -s emulator-5556 reverse tcp:8081 tcp:8081    # dev client reaches Metro on localhost
```

If it keeps dropping, kill and relaunch the AVD outright — **`adb reboot` is worse than a
relaunch**: after a reboot the device comes back `RUNNING_LOCKED` with a dead surface
(`mCurrentFocus=null`, all-black `screencap`) and never recovers.

```sh
adb -s "$ANDROID_SERIAL" emu kill
$ANDROID_HOME/emulator/emulator -avd "$ANDROID_AVD" -port 5556 -no-snapshot-load &
# it boots RUNNING_LOCKED — unlock it with this test device's locally configured credential
adb -s emulator-5556 shell input keyevent KEYCODE_WAKEUP
adb -s emulator-5556 shell input swipe 540 1900 540 700
adb -s emulator-5556 shell am get-started-user-state 0     # -> RUNNING_UNLOCKED
```

Closing the Gradle and Kotlin daemons (`pkill -f GradleDaemon`) helps — the drops clustered around
builds.

**A blank white screen is a Metro problem, not a flow problem.** Maestro's `launchApp` starts the
app without a URL, so the dev client reuses whatever server address it last saw. If that address is
unreachable the app renders nothing and every `id:` selector "is not found". Re-point it explicitly:

```sh
adb -s emulator-5556 reverse tcp:8081 tcp:8081
adb -s emulator-5556 shell am start -a android.intent.action.VIEW \
  -d "exp+gj-kit-expo-workouts-example://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

The iOS equivalent:

```sh
xcrun simctl openurl F852C6FF-2BA6-40C2-A36F-ED0C9E47AC42 \
  "exp+gj-kit-expo-workouts-example://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8081"
```

Every flow opens with an `extendedWaitUntil id: title, timeout: 60000` for the same reason — a cold
bundle takes seconds, and asserting instantly turns a slow Metro into a fake regression.

## First launch of a dev build

`expo-dev-client` shows a one-time "developer menu" onboarding sheet over the app, and on SDK 57
dismissing it with **Continue** leaves the dev menu itself open (close button `id: xmark`).
`00-smoke.yaml` taps both, both `optional: true`, and asserts neither — they are dev-client
furniture, not this library's UI.

## Prerequisites

### iOS

```sh
open -a Simulator                                          # MANDATORY — see below
xcrun simctl boot "$IOS_SIMULATOR_UDID"
npx expo run:ios --device "$IOS_SIMULATOR_UDID"
```

* **The simulator must be windowed.** On a headless `simctl boot`, the HealthKit sheet never enters
  the app's XCUI hierarchy at all, `requestAuthorization` hangs, and the run dies on timeout (f126).
* If you drive HealthKit from `xcodebuild test` instead of Maestro, pass
  `-parallel-testing-enabled NO -maximum-concurrent-test-simulator-destinations 1`, or the test runs
  on `Clone 1 of iPhone 17` and `simctl get_app_container` reads a **stale** container (f125).
* HealthKit authorization **survives reinstall**, so after the first grant you can iterate with
  `simctl install` + `simctl launch --console-pty` and skip the sheet entirely.
* The Claude Code iOS Simulator MCP tool does not work on this machine — use `xcrun simctl`,
  `xcodebuild` and `maestro` directly (f131).

### Android

```sh
export ANDROID_AVD='<your Health Connect-capable AVD>'
export JDK_17_HOME='<absolute path to a JDK 17 installation>'
$ANDROID_HOME/emulator/emulator -avd "$ANDROID_AVD" -port 5556 &
JAVA_HOME="$JDK_17_HOME" npx expo run:android --device "$ANDROID_AVD"
```

`expo run:android --device` takes the **AVD name**; `maestro --device` takes the **adb serial**.
The two disagree and neither accepts the other's form.

* Use an Android 16 / Health Connect-capable AVD with a screen lock you control. `locksettings
  set-pin` cannot replace an existing unknown credential, and `adb root` is refused on a
  `google_apis_playstore` image — recreate the AVD instead of guessing credentials (f127).
* **Pin a JDK 17.** Homebrew's `gradle` launcher exports `JAVA_HOME=/opt/homebrew/opt/openjdk`
  (Java 26) and Kotlin 2.1.20 dies on it with a bare `java.lang.IllegalArgumentException: 26.0.2`
  (f128). Pin it through the environment or `~/.gradle/gradle.properties` — **never** through a
  committed `expo-workouts/android/gradle.properties`, because that file would carry a
  machine-specific absolute path into the tarball (design §10.1). Exporting `JAVA_HOME` on the
  `expo run:android` line was verified to work here: Gradle picked 17 and the whole build went green
  with no `gradle.properties` in the library at all.
* **The app needs `minSdkVersion 26`.** The library's `android/build.gradle` is `minSdk 26`
  (Health Connect's floor) and design decision **D7** forbids the config plugin from silently
  raising a consumer's. Without the `expo-build-properties` entry in `app.config.ts` the build stops
  at:

  ```
  uses-sdk:minSdkVersion 24 cannot be smaller than version 26 declared in library
  [:gj-kit-expo-workouts] … as the library might be using APIs not available in 24
  ```

## Selector rules (read before editing a flow)

Google ships the Health Connect controller through **Mainline**, so every label below is localised
and **will** drift. Three hazards were measured directly (f124):

| Hazard | Where | Rule |
|---|---|---|
| Non-breaking space (U+00A0) | inside "Health Connect" in every title | never match a title containing it |
| Curly quotes `“ ”` | `Allow “HC Reader” to read` | match the **buttons**, never that title |
| Typographic apostrophe `’` | `Don’t allow` (Android) and `Don’t Allow` (iOS) | write it `Don.t [Aa]llow` |

Two further rules that are easy to get wrong:

* **`Allow all` is a switch, not a button.** On the data-type screen it is
  `id/settingslib_main_switch_bar`, a master toggle over the listed rows (f121). It has nothing to do
  with the route dialog's **`Allow all routes`** button (f117). Anchoring `Allow all` with `$` keeps
  the two apart.
* **One contract call can produce several consecutive full-screen dialogs** (f122). A five-permission
  request rendered the data-type screen and then a separate past-data screen, and took **41.6 s** of
  scripted tapping. Every extra screen is `optional: true` and every wait is generous.

`maestro hierarchy` exposes exactly the same `text` values and `resource-id`s as `uiautomator dump`,
so anything you see in a dump is directly usable as a selector (f124).

## iOS — what Phase 3 measured (T10-iOS is closed)

The HealthKit sheet was dumped with `maestro hierarchy` while it was up. Index f51's guess was right
and there is now no guessing left in `20-ios-authorize.yaml`:

| Element | Measured accessibility identifier |
|---|---|
| the sheet's navigation bar | `Health Access` |
| "Turn On All" | `UIA.Health.AuthSheet.AllCategoryButton` |
| "Allow" — **disabled until a switch is on** | `UIA.Health.Allow.Button` |
| "Don’t Allow" (typographic apostrophe, f124) | `UIA.Health.DoNotAllow.Button` |
| one row per SHARE type | `UIA.Health.Write.<Type>.SwitchCell` |
| one row per READ type | `UIA.Health.Read.<Type>.SwitchCell` |

The identifiers are used in preference to the visible labels because `Turn On All` / `Allow` /
`Don’t Allow` are localised and the `UIA.Health.*` names are not. The raw dump is kept as
`artifacts/ios-p3-health-access-hierarchy.json`.

Four iOS traps that cost real time here, all measured:

* **A cold `launchApp` lands on the dev-client launcher, not on the app.** It starts the client with
  no URL, so "Searching for development servers…" renders and every `id:` selector fails against a
  screen that is not this app. Both iOS flows recover by tapping the most recent
  `http://localhost:<port>` row in "Recently opened".
* **Maestro's `${…}` interpolation is unusable on this machine.** Any `env:`/`-e` substitution fails
  before the command runs with `java.lang.IllegalArgumentException: Could not find option with name
  js.strict` (Maestro 2.8.0, Java 17). Literal values only.
* **Maestro text selectors are WHOLE-STRING regexes.** `text: 'read\.workouts=unknown'` matches
  NOTHING against the label `authorization available read.workouts=unknown routeAccess=all` — and an
  `assertNotVisible` written that way passes vacuously, which is worse. Wrap fragments in `.*`.
* **`assertVisible` needs the element ON SCREEN.** The example's log sits at the bottom of a scroll
  view, so `21-ios-self-verify.yaml` scrolls to `id: log` before asserting on its text. (The two
  Health.app-gate buttons are rendered on iOS only for the same reason: two extra rows on Android
  would push the log below the fold and break `12-android-self-verify.yaml`.)
* **A reinstall can silently attach the dev client to ANOTHER project's Metro.** After
  `npx expo run:ios` the client cold-starts with no URL, discovers a dev server on the LAN and
  connects to it — measured here, it loaded a different repo's bundle and the app died on a red
  `React Native version mismatch. JavaScript version: 0.85.3 / Native version: 0.86.2`. Nothing about
  that screen says "wrong server". The fix is to pin the URL before running any flow:

  ```sh
  xcrun simctl terminate F852C6FF-2BA6-40C2-A36F-ED0C9E47AC42 kit.gj.workouts.example
  xcrun simctl openurl    F852C6FF-2BA6-40C2-A36F-ED0C9E47AC42 \
    "exp+gj-kit-expo-workouts-example://expo-development-client/?url=http%3A%2F%2Flocalhost%3A8083"
  ```
* **The sheet appears only ONCE per simulator.** HealthKit never re-asks about a type it already has
  an answer for, and that answer survives reinstall (f126), so the second run of
  `20-ios-authorize.yaml` sees no sheet at all — correct, not a regression. The only reset is
  `xcrun simctl erase`; `simctl privacy` has no `health` service (f70).

## The Health.app half of §9.5-1

`21-ios-self-verify.yaml` deletes its own artefact in step 7, which is what makes it repeatable and
also what stops it from leaving anything on screen in Health. The two iOS-only buttons
`save-visible` / `delete-visible` cover that half: save one 3 600-point workout and leave it, look at
Health, then delete it and look again.

Health.app on iOS 26.5: **Search → Activity → Workouts → Show All Data → (the workout) → scroll to
Workout Route** (f132). ⚠ Its first launch demands a "Set up Health Details" personal-details screen
(the same wall f86 hit in Fitness.app) — every field is Optional, so tap **Next** through it.

Measured on 2026-08-22, screenshots in `artifacts/ios-p3-0*.png`:

| After | Health.app shows |
|---|---|
| `save-visible` | **exactly one** workout · Workout Type Running · Source `gj-kit workouts example` · `HKMetadataKeySyncIdentifier gjkit-visible-1` · `HKMetadataKeySyncVersion 1` · Elevation Ascended 30 m · Related Samples: Total Active Energy, Total Steps, Total Walking + Running Distance · **Workout Route renders the polyline** with green start and red end pins |
| `delete-visible` | All Recorded Data → **No Data** — the workout, its route and all three associated samples are gone together, with no orphan (design §8.6) |

⚠ **`Indoor Workout: No`, and we never wrote that key.** The payload left `indoor` undefined, which
design §8.1 step 3 says must leave `HKMetadataKeyIndoorWorkout` OUT — but `HKWorkoutBuilder` stamps
it anyway (f76 measured the same thing for `locationType == .unknown`). So on iOS a workout WE write
can never read back as "indoor unknown". The library does not fabricate the key; the platform does,
and there is no API to stop it. Recorded here rather than papered over.

## Known-unverified

* `pendingUnlock` (design §5.7 row 12) is still unreproduced — the simulator has no way to make
  protected data unavailable and no physical iPhone was attached (f70). The write path's
  `isProtectedDataAvailable()` pre-check and the equal-version resume path are exercised by the
  XCTest seam tests, not by a device.
