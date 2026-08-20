---
'@gj-kit/expo-media': patch
---

Forward the optional `collectionId` to presign requests as well as completion requests. This lets hosts enforce collection-scoped upload permission and quota checks before issuing an upload URL, while keeping existing unscoped adapters compatible.
