---
name: feature-flag enforcement
description: Feature flags that hide UI must also gate the execution/submit path, not just rendering.
---

# Feature flags must gate execution, not just render

When a feature flag conditionally renders a UI control, that alone does NOT
disable the feature. The component's local state (toggles, checkboxes, ladder
rungs, planner attachments) survives after the flag flips off, so a stale-state
path can still submit the disabled behavior.

**Why:** An admin can disable a flag mid-session while a user already has the
toggle on. If only the JSX is gated, the next buy/apply still builds and submits
the disabled order type. Architect review flagged this as a correctness/security
gap on the BlackPebble admin feature-flag work.

**How to apply:** Gate the flag at BOTH the render layer and every execution
point that reads that state — spec builders, mutation onSuccess handlers,
immediate-create handlers, and any "apply" that forwards attachments to a
parent. Prefer gating attachments at the source (where they're constructed) so
downstream consumers never see a disabled feature enabled. For
multi-target-style flags, also truncate the data (e.g. slice the ladder to one
rung) rather than only hiding the "add" button.
