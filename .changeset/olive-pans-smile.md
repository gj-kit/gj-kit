---
"@gj-kit/expo-ui": patch
---

Translate every public JSDoc comment to English. The comments ship inside the generated `.d.ts` files, so they are what consumers read on IDE hover and what the documentation site renders in its generated props tables — and until now they were Korean, which made the published API unreadable for most of the people installing the package. All 294 doc comments across 47 source files are now English, with section references, token names, and code identifiers preserved. The only Korean left is the string inside the `{ ...koStrings, retry: '다시 시도' }` customization example, where the Korean text is the point. Implementation comments stay Korean, since they never leave the repository. Runtime behavior, type signatures, and the public surface are unchanged; a `jsdoc-language-guard` unit test keeps new Korean JSDoc from landing.
