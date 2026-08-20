---
'@gj-kit/toss-payments': patch
'@gj-kit/toss-payments-nestjs': patch
---

Ship a package-owned immutable provenance stamp in both Toss artifacts and reject packing from a dirty checkout. The release gate now installs the packed core and Nest tarballs into fresh Nest 10 and Nest 11 consumers, verifies their ESM/CJS public exports, and boots a named-kit DI context.
