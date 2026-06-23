---
name: Clipboard copy success guard
description: navigator.clipboard?.writeText optional-chaining silently resolves undefined when unavailable
---
`await navigator.clipboard?.writeText(x)` does NOT throw when the Clipboard API
is unavailable — optional chaining short-circuits to `undefined`, which awaits to
`undefined` (a resolved value). Any "Copied!" toast/state in the try block then
fires even though nothing was copied.

**Why:** insecure contexts / older mobile webviews expose no `navigator.clipboard`.
**How to apply:** guard explicitly before the success path —
`if (!navigator.clipboard?.writeText) throw new Error("clipboard unavailable");`
then `await navigator.clipboard.writeText(...)`. Keep the destructive/fallback
toast in catch. Applies to every copy-to-clipboard control (share menus, copy-contract chips).
