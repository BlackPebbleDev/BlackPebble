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
EXISTS), matching the codebase's read-path ensure*Schema convention. **Two-place rule:**
every recovery_events column the POST/verify code writes (incl. V2 capture columns
tx_signatures/network_fee_sol/bp_fee_sol/net_sol and the verification columns) AND the
recovery_credited_signatures table must be (a) self-healed in ensureRecoverySchema and
(b) mirrored in lib/db/src/schema/index.ts. Missing the mirror is what review flags as a
"persistence/bootstrap gap" — a fresh/un-migrated env can fail inserts at runtime.

**Recovery fee = DISABLED scaffolding (Phase G):** BlackPebble recovery is free. The
fee policy lives in ONE frozen place (recovery-fee.ts RECOVERY_FEE_CONFIG, enabled:false,
feeBps:0, pipeline Recovery Fee→Treasury→Buybacks→Burns all disabled, no treasury/token
addresses). calculateRecoveryFee() returns a 0 fee on the live path; the non-zero branch
is unreachable while disabled. bp_fee_sol is sourced from this helper (not a literal) so
the "fee is 0" guarantee is centralized; netSol/payouts are unchanged. Admin sees a
read-only disabled status via getRecoveryFeeStatus() in /admin/recovery-stats. **Why:** a
non-zero charge can only ever appear by deliberately editing the frozen config — there is
no hidden/runtime path. If fees are ever enabled, compute netSol from the same helper.
