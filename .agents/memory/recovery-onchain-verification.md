---
name: Recovery on-chain verification integrity
description: Invariants for proving recovery_events from chain before they become public truth
---

Recovery feed/history/admin headline totals/badges (and future achievements) must only
reflect on-chain-PROVEN recovery. The `POST /recovery/events` beacon is untrusted
telemetry: its numbers are stored only in `client_*` columns; canonical
accounts_closed/recovered_sol are recomputed from chain before a row is marked
`verified`. All public reads gate on `verified = true`; admin "recent" intentionally
shows all rows (with verification_status + client_*) for review.

**Attribution rule:** a CloseAccount instruction is credited to a wallet ONLY when its
rent `destination === wallet`. Being the tx fee payer is NOT sufficient — rent can be
routed elsewhere, so fee-payer crediting let users claim recovery they didn't receive.

**Why:** any client-controllable quantity that becomes public truth is fabricable; the
whole point is that public numbers are independently re-derived from the chain.

**Atomicity rule:** signature crediting (recovery_credited_signatures, signature PK =
replay protection) and the verified row UPDATE MUST commit in ONE transaction. Do the
slow Helius fetch/validate in a network-only phase FIRST (no DB writes), then open the
tx. If you credit a signature but the row update fails separately, the signature is
consumed forever and a legitimate retry is permanently blocked.

**How to apply:** within the tx, INSERT...ON CONFLICT DO NOTHING RETURNING event_id; if
conflict, SELECT the owner — same event_id ⇒ idempotently ours (count it); different
event_id ⇒ replay/duplicate beacon (skip, mark row failed if nothing newly credited).

Other decisions: commitment `confirmed` (not `finalized`) to avoid a post-cleanup race.
`verified_partial` when some closed accounts' rent is unresolvable on-chain — accounts
proven but recovered_sol is a verified LOWER BOUND (still safe to surface). Historical
rows stay verified=false; never backfilled by fabrication — only via the admin
re-verify-pending endpoint that re-runs the same on-chain proof. Verification is
identity-independent (guests included); X identity only governs feed attribution.
Schema self-heals at runtime via ensureRecoverySchema() (ADD COLUMN/CREATE TABLE IF NOT
EXISTS), matching the codebase's read-path ensure*Schema convention.
