---
"@gj-kit/expo-ui": patch
---

Fix native Menu and Select triggers and options ignoring taps in NativeWind consumers. Render the default press feedback through native styles instead of automatically injecting interaction classes that create a nested Pressable. Web behavior, controlled state, disabled/busy handling, and anchored placement remain unchanged.
