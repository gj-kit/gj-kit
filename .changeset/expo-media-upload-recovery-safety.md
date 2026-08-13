---
'@gj-kit/expo-media': minor
---

Harden local, deferred, and binary upload boundaries: validate backend intents before transport; reject local uploads on web before side effects; enforce main and poster limits before costly work; and normalize presign, PUT, and finalizer failures into safe `MediaError`s. Add `mediaUploadFailureInfo()` with URL-free orphan cleanup metadata, including poster/main partial-success cases.

Normalize public picker and device-library adapter failures to the new `picker-failed` and `device-library-failed` codes. Successful adapter values are snapshotted before use so mutable getters or Proxy results cannot leak signed URLs after validation.
