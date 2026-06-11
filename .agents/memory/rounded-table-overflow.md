---
name: Rounded table wrappers need overflow-x-auto
description: Why table containers must use overflow-x-auto (not overflow-hidden) when given rounded corners
---

Rounded table wrappers must use `overflow-x-auto`, not `overflow-hidden`.

**Why:** A blanket sweep that swapped `border ... overflow-x-auto` table containers to
`rounded-2xl ... overflow-hidden` clipped wide table columns on narrow desktop widths / browser zoom
— a real usability regression, not just cosmetic.

**How to apply:** For any wrapper holding a `<table>` (or other horizontally-wide content), keep
`overflow-x-auto`. Rounded corners still clip correctly because when `overflow-x` is auto and
`overflow-y` is visible, the spec computes `overflow-y` to auto too, so border-radius clipping applies.
Use plain `overflow-hidden` only for vertical/divide-y card lists and collapsible/section wrappers,
never for table scrollers.
