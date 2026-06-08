---
name: TP/SL paper order fill semantics
description: How take_profit / stop_loss paper orders apply their stored percent when they fill
---

- A `paper_orders` TP/SL order stores `amount_value` as a percent. When it fills, the
  engine sells `currentPosition.total_tokens * (percent/100)` — i.e. a percent of the
  **current remaining** balance at fill time, NOT a percent of the original position.
  - Server: `executeSell(..., { percent })` in `artifacts/api-server/src/lib/trading.ts`.
  - Guest mirror: `evaluateGuestOrders` in `artifacts/blackpebble/src/lib/guest-store.ts`
    computes `pos.total_tokens * (amount_value/100)`.

**Why:** A multi-target take-profit "ladder" is just N independent take_profit orders.
Because each fills against the live remaining balance, a 50/50/50 ladder naturally
compounds down (100 → 50 → 25 → 12.5). So "% of remaining" is the *built-in* behavior;
the older "% of original, capped at 100%" framing was a UI-only constraint, never the
execution model.

**How to apply:** When changing TP ladder allocation rules (caps, defaults, labels),
edit only the UI (`TpLadder` in `trading.tsx`, order-row detail in `position-orders.tsx`).
Do NOT touch the order engine — fills are already remaining-relative, idempotent
(status `pending`→`filling`→`filled` claim), and refresh-evaluated.
