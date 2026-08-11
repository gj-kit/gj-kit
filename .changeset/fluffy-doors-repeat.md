---
"@gj-kit/expo-ui": patch
---

Render the `DialogPanel` and web `Popover` titles as level-2 headings on the web. React Native Web maps `accessibilityRole="header"` without an `aria-level` to `<h1>`, so any page that mounted an open dialog or popover ended up with two `<h1>` elements, breaking its document outline for screen readers and search engines. Both titles now declare `aria-level={2}`, matching the explicit heading levels `Accordion` and `Collapsible` already emit. Native behavior is unchanged.
