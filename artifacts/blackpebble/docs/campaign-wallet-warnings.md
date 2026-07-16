# Campaign Wallet Warnings (Phantom "This dApp could be malicious")

Internal developer notes for the Community Campaigns funding flow. Read this
before "fixing" a Phantom warning that appears during campaign activation or
contribution.

## What users see

When signing the opening contribution (activation) or a public contribution,
Phantom may show a banner such as:

> **This dApp could be malicious.** Proceed with caution.

or a transaction-preview warning. This is expected on unverified origins and is
**not** caused by our transaction being malformed.

## Why Phantom shows it

Phantom's warnings come from **origin/domain reputation and transaction
scanning** (Blowfish/Blowfish-style providers), not from the instruction data
itself. The main triggers, in order of impact:

1. **Unverified / new origin.** Localhost, preview URLs, and freshly deployed
   domains have no reputation. This alone produces the "could be malicious"
   banner regardless of what the transaction does.
2. **First-seen destination.** Our escrow wallets are freshly derived per
   campaign, so the destination has no on-chain history. A plain transfer to a
   brand-new address can raise a caution.
3. **Simulation ambiguity.** If a transaction reaches the wallet without a fee
   payer / recent blockhash, the wallet cannot cleanly simulate/preview it,
   which increases warning likelihood.

## What BlackPebble already does correctly

- The only instruction we send is a single, standard
  `SystemProgram.transfer` from the connected wallet to the campaign escrow
  wallet. No token approvals, no `setAuthority`, no arbitrary program calls.
- We build the transaction with an explicit **`feePayer`** and a fresh
  **`recentBlockhash` + `lastValidBlockHeight`** (see `activate` and
  `contribute` in `src/pages/campaigns.tsx`). This gives Phantom a clean,
  deterministic preview: "send X SOL to <escrow>".
- We confirm against the blockhash window (`confirmTransaction({ signature,
  blockhash, lastValidBlockHeight })`) instead of a bare signature, so a slow
  block does not read as a failure.
- The escrow address is shown to the user (card + detail + contribute box) with
  a shield and "only wallet used for campaign funding" copy, so the destination
  in the wallet preview matches what our UI advertises.

## What still requires production domain reputation

The remaining warning reduction is **not** a code change:

- Serve the app from the **stable production domain** (not localhost/preview).
- Let the domain **accrue reputation** over time / submit it to the wallet's
  security partner (e.g. Blowfish/Phantom domain verification / allowlist)
  where such a program is available.
- Escrow addresses will always be new per campaign; that first-seen caution is
  inherent to the per-campaign escrow design and is acceptable.

## What future developers should NOT attempt

- **Do NOT** add extra instructions, memos, or "verification" transfers to try
  to look more legitimate — more instructions makes the preview *worse*, not
  better, and can trip additional heuristics.
- **Do NOT** route funds through an intermediary/shared wallet to reuse a
  "known" address. That breaks the per-campaign escrow money-safety model
  (deterministic per-campaign wallet, public ledger) for a cosmetic warning.
- **Do NOT** disable or hide the wallet's warning, auto-approve, or coach users
  to ignore all warnings. Wallet trust is a feature, not an obstacle.
- **Do NOT** switch to `signTransaction` + manual `sendRawTransaction` hoping to
  avoid the banner. The banner is origin/simulation-driven; this only removes
  wallet-adapter safety without changing the outcome.

## TL;DR

The transaction is a clean single SOL transfer with an explicit fee payer and
recent blockhash. The residual Phantom warning is domain/first-seen reputation
and is resolved by shipping on the production domain and letting reputation
build — not by changing transaction construction.
