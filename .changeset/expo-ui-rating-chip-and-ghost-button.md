---
"@gj-kit/expo-ui": minor
---

Add an accessible controlled Rating component, a static Chip mode, and the ghost Button variant. Rating defaults now come from `UiProvider` strings, bounds `maxRating` to 10, and preserves half-step native accessibility ranges. Add the pure SSR-safe `resolveTheme` helper; the legacy active-theme snapshot APIs remain available but are deprecated as client-only.

Strengthen Button and IconButton contracts: enabled controls require `onPress`, and rich Button children require a non-empty `accessibilityLabel`. Disabled and loading controls may omit the handler because they are inert.
