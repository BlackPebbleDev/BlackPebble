---
name: Lightbox click-outside testing quirk
description: Why a Playwright click on a full-viewport backdrop testid can appear to fail to close a centered modal/lightbox.
---

When a fullscreen backdrop `<div>` (data-testid on the backdrop itself) contains a
centered enlarged `<img>` with its own `onClick={stopPropagation}`, a Playwright
`.click()` targeted at the backdrop's testid clicks the *center* of that locator's
bounding box by default — which is exactly where the centered image sits. The
click lands on the image, not the backdrop, so `stopPropagation` blocks the
close handler and the test reports "click outside didn't close it".

**Why:** Playwright's default click point is the element's bounding-box center,
not a guaranteed-empty area, and a fixed full-viewport backdrop's bounding box
always contains the centered content.

**How to apply:** When writing/asking for an e2e test of "click outside to close"
for a centered modal/lightbox, explicitly instruct the test to click a specific
corner coordinate (e.g. top-left ~20,20) known to be outside the enlarged
content, not just "click the backdrop testid".
