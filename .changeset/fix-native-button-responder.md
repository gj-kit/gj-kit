---
"@gj-kit/expo-ui": patch
---

Fix Button and IconButton taps in compiled NativeWind consumers on iOS and Android, including EmptyState actions and ErrorState retries. Native controls no longer inject hover/active classes that can upgrade the inner View to a second Pressable without an action handler. Keep native pressed opacity, caller className, disabled/loading behavior and web feedback unchanged.
