---
name: Screenshotting mockup-sandbox previews
description: How to pass the right path to the screenshot tool for mockup-sandbox component previews.
---

# Mockup-sandbox preview path gotcha

The mockup-sandbox artifact's preview base path is `/__mockup/preview`. The
`screenshot` tool composes `localhost:80{previewBasePath}{path}`, so the `path`
argument must be **relative to that base**.

- Correct: `path="/blackpebble-mobile/Portfolio"` → screenshots
  `/__mockup/preview/blackpebble-mobile/Portfolio`.
- Wrong: `path="/__mockup/preview/blackpebble-mobile/Portfolio"` → double-prefixes
  to `/__mockup/preview/__mockup/preview/...` and renders "No component found".

Component preview URL pattern (for canvas iframe `url`):
`{devDomain}/__mockup/preview/<group>/<ComponentName>` (e.g.
`blackpebble-mobile/PositionDetail`). Components are auto-discovered by file name
in `artifacts/mockup-sandbox/src/components/mockups/<group>/`.
