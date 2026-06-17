---
name: Generic FilterPills onChange inference
description: Why passing a useState setter directly to a generic <FilterPills onChange> breaks type inference, and the fix.
---

A generic component like `FilterPills<T extends string>({ options, value, onChange })`
infers `T` from all of its prop argument sites at once. Passing a `useState`
setter (`Dispatch<SetStateAction<Tab>>`) **directly** to `onChange` poisons the
inference: TS widens `T` to `string`, then reports the setter isn't assignable to
`(id: string) => void`.

**Fix:** wrap the setter in an arrow — `onChange={(id) => setTab(id)}`. The arrow
contributes no `T` candidate, so `T` infers cleanly from `options`/`value` (the
literal union), and `id` lands as the union type inside the body.

**Why:** the `Dispatch` candidate competes with the `options`/`value` candidates
and TS picks the widest (`string`).

**How to apply:** any generic tablist/select/pills component whose `onChange`
receives a state setter — wrap in an arrow rather than passing the setter by
reference.
