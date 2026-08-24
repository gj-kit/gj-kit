---
"@gj-kit/expo-media": minor
---

Add `createPendingSelection` to `./core` — a pure, UI-free staged-selection model for "pick now, upload later" screens that mix picker assets and web binaries in one ordered list. The selection owns identity (dedup by `assetId`, falling back to `uri`; binaries by `name:size:lastModified`), a hard cap with per-item rejection reasons (`duplicate` | `over-limit`, duplicates reported before the cap), exactly-once `revoke` of preview resources on `remove`/`clear`/`release`, HEIC/HEIF preview gating for binaries, and capture-time extraction (`capturedAtOf`) through the existing EXIF parsers. State is an immutable `readonly PendingMediaItem[]` owned by the host; unchanged operations return the same reference. `max` must be a positive integer or the factory throws `MediaError('config-invalid')`.

`add` returns a frozen `{ state, added, rejected, releasable }` (the arrays and each `{ item, reason }` entry are frozen too). `rejected` is for messaging; `releasable` is what the host hands to `release` — it excludes any rejected duplicate that is the same object as a staged item (re-adding an item under a StrictMode double effect, re-attaching a cached item), so following the recipe never revokes a live preview. The revoke-once registry lives on `globalThis` under the package's global symbol (like the `MediaError` tag), so the guarantee holds across selection instances and across the `.`/`./core` and ESM/CJS copies of the core within one realm.

Add `pendingItemFromFile(file)` to `./web`, which wraps a DOM `File` as a `PendingBinaryItem` with an object-URL `previewUri` (skipped for HEIC/HEIF and when `URL.createObjectURL` is unavailable) and a matching `revoke` closure.

Documentation fix: the `MediaError` code count is 17 (README intro and §5 said 16).
