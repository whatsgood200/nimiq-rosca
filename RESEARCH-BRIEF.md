# Claude Code Kickoff Brief — Nimiq ROSCA mini app

Paste this as your first instruction to Claude Code AFTER the spike gates pass (see SPIKE-PLAN.md).

## Context
We're building a digital thrift circle (ROSCA) as a Nimiq Pay mini app for the Mini Apps Competition,
Cycle I. It replaces the human organizer of an informal rotating savings group with transparent rules:
members contribute a fixed amount each round, the pot rotates to one member per round until all have
received it, and everyone sees the same ledger. This solves a real, widespread problem — informal
savings circles run on trust and are prone to organizer theft, lost records, and disputes.

## Step 0 — Research before coding (do not skip)
1. Read the Nimiq `mini-apps` AI skill (the Build with AI page) and nimiq.com/developers mini-apps docs
   in full. Confirm the CURRENT provider APIs: Nimiq via @nimiq/mini-app-sdk (init + payment request),
   Ethereum via window.ethereum, and requestDeviceIdentifier for membership.
2. Confirm the pool architecture: verify whether trustless custody should live in an EVM contract
   (Polygon/USDT via the Ethereum provider) because Nimiq L1 isn't a general smart-contract platform.
   Report the exact call sequences before writing app code. Flag anything ambiguous — do not guess.

## Build — one loop, end to end
1. Create circle: name, fixed contribution amount, member count, currency (USDT primary, NIM for bonus).
2. Join: members join via a share link; identify them with requestDeviceIdentifier (no accounts).
3. Contribute: each round, every member pays the fixed amount (USDT via window.ethereum to the ROSCA
   contract; NIM via the SDK). Show each payment as confirmed on a shared ledger.
4. Rotate + payout: once the round is funded, the pot releases to the current-round member by rule,
   and the ledger advances to the next member's turn.
5. Transparent ledger view: everyone sees who has paid, whose turn it is, and full history.

## Scope discipline (10-day sprint)
- ONE circle loop only. No multi-circle dashboards, no notifications system, no extras until the loop is
  flawless. Build the thin vertical slice first (one contribution -> one payout), then harden.
- Seed a small circle and fast-forward rounds for the demo.

## Definition of done
- Full contribute -> rotate -> payout cycle completes on a real phone in Nimiq Pay with testnet txs;
  give me the tx hashes.
- Cancel/error paths handled gracefully (PermissionDeniedError; EIP-1193 codes) — UI never freezes.
- Supports NIM (bonus) + USDT; payments are the core UX. MIT-licensed public GitHub repo. No secrets in bundle.
- Uses the frontend-design skill; looks trustworthy and native on mobile; zero-to-using under 60 seconds.

## Rules
- Verify every claim with evidence (tx hash / on-phone confirmation) — never "it works."
- If blocked on a provider/contract detail, stop and report exactly what's unclear rather than guessing.
- Keep rotation deterministic — no randomness/gambling (competition rule).

## Submission fields to prep (250-word description max)
What it does; who it's for (people who use informal savings circles); how it uses Nimiq Pay (NIM + USDT
as core UX); what's newly built; public GitHub link; demo video link.
