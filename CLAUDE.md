# CLAUDE.md

## Project
Digital thrift circle (ROSCA / "ajo" / "esusu" / "tanda" / "susu") — a Nimiq Pay mini app that
replaces the fallible human organizer of an informal rotating savings group with transparent rules.
Members contribute a fixed amount each round; the pot rotates to one member per round until everyone
has received it. Everyone sees the same ledger. Nimiq Mini Apps Competition, Cycle I (ends ~July 30).
Optimize for ONE flawless loop + polish + a great demo, not feature breadth.

## The one demoable moment (protect it above all)
A circle is live; each member's contribution shows as paid on a shared ledger; the pot auto-releases
to whoever's turn it is; nobody has to trust an organizer. Show a full round completing on a phone.

## Scoring reality (build to this)
105 pts: Design & UX 25, Functionality 25, Usefulness & originality 25, Marketing & distribution 25,
Bonus 5. Depth is NOT scored. Win on: looks trustworthy at first glance, works on first tap on mobile,
solves a real problem, and is marketable. Support NIM for the bonus.

## Stack
- Nimiq Pay Mini Apps Framework. Nimiq provider via @nimiq/mini-app-sdk (`init()`); Ethereum provider
  via window.ethereum (EIP-1193). Frontend: your choice (framework-agnostic); TypeScript strict, no `any`.
- Trustless pool: minimal ROSCA smart contract on an EVM testnet (Polygon), USDT rails. NIM path added
  for the bonus. Confirm this architecture against the Nimiq mini-apps skill + nimiq.com/developers.
- Member identity without accounts: use requestDeviceIdentifier for circle membership / anti-double-join.

## Definition of done
- Works flawlessly on first try inside Nimiq Pay's WebView on a real phone.
- A full contribute -> rotate -> payout cycle completes with real (testnet) transactions.
- Ledger is transparent and consistent for all members.
- Handles cancel/error paths gracefully (PermissionDeniedError; EIP-1193 codes) — never freezes the UI.
- Supports NIM (bonus) and USDT. Displaying a logo is NOT integration — payments are the core UX.
  **NIM path is built**: no smart contract (NIM isn't EVM) — instead a coordinated,
  chain-as-ledger design (`src/nim-circle.ts`, `src/nim-rpc.ts`). Joining and contributing are real
  NIM transactions tagged via `sendBasicTransactionWithData`; the roster and per-round paid status
  are reconstructed by any device independently via `getTransactionsByAddress` against the
  creator's/recipient's own address history — no backend, no relay link, no per-device drift.
  Structurally verified (real mainnet RPC calls through the actual shipped code, plus the
  roster/round logic against realistic synthetic chain data — all passing). **Not yet verified
  end-to-end with real sends on a real device** — see gotchas below for the two blockers.
- Public GitHub repo, MIT licensed. No secrets/keys in the bundle; any keyed API call goes via backend.

## Design bar (money app = must look trustworthy)
Use the frontend-design skill. This handles people's savings — it must read as safe, clean, and
professional at a glance, native on mobile, zero-to-using in under 60 seconds. Not a generic template.

## Never touch / gotchas (append after every bug)
- No secrets or private keys in the repo, ever.
- No gambling mechanics — rotation is deterministic, keep it that way (competition rule).
- WebView + provider quirks: log them here as you hit them.
- NIM payment send/cancel path (`nimiq.sendBasicTransaction` in `src/nim-payment.ts`) is
  UNCONFIRMED with a real transaction — built from `.d.ts` types only, never exercised inside
  Nimiq Pay on a phone. Specifically unverified: whether the success string is a broadcast tx hash
  or a serialized-tx hex blob; whether cancel/failure ever throws vs. only resolves as
  `ErrorResponse` (no `PermissionDeniedError` class exists in the SDK, despite earlier docs
  mentioning one). Do not trust this path or build an explorer link off it until it's been run on
  a real device and the result reported back with a tx hash.
- `@nimiq/mini-app-sdk`'s package root only actually exports `init`/`requestDeviceIdentifier`/
  `getHostLanguage` at runtime — its own `.d.ts` claims `NimiqProvider` too, but the shipped
  `dist/index.js` doesn't provide it (confirmed by reading the compiled JS directly; Vite throws
  `does not provide an export named 'NimiqProvider'` at runtime if you trust the types). The real
  class is at the `@nimiq/mini-app-sdk/provider` subpath — import it from there, not the root, for
  anything beyond a type-only reference.
- NIM contribution path (`src/nim-circle.ts`, `src/nim-rpc.ts`) has two real open gaps before it
  can be verified end-to-end on a device:
  1. **No confirmed testnet NIM RPC endpoint.** `NIM_RPC_URL` in `src/nim-config.ts` currently
     points at a mainnet endpoint (`rpc.nimiqwatch.com`) that's confirmed working (live-tested:
     CORS-friendly from a real browser, correct `getTransactionsByAddress` responses) — but this
     project runs on testnet NIM throughout, and no public testnet RPC endpoint could be found
     (Nimiq's docs describe testnet RPC access as token-gated, request-from-team-member, not
     casually public). Same class of blocker as the USDT burner wallet's faucet access — resolve
     before the real demo, swap the one constant, nothing else changes.
  2. Whether `sendBasicTransactionWithData`'s `data` comes back as `recipientData` or `senderData`
     on read is inferred (from `TransactionInfo`'s shape), not confirmed — `extractTag()` in
     `src/nim-rpc.ts` checks both defensively. Needs one real send-then-query round trip on a real
     device to confirm which field it actually lands in.
  3. Joining a NIM circle costs the joiner a small real amount of NIM (0.01, the join-marker
     transaction) — unlike USDT's free `join()` call. Minor, but worth having in the demo script.
- **Real Amoy deploy is confirmed working** (RoscaCircle `0x9ec0a17199c8246402cbCFF8f5439EF39bc0D737`,
  MockERC20 `0x9c457A45c5B2912c71c40A3f2c03b84A55bE832f` — see `contracts/README.md` for tx links).
  Gas learning from that run: whichever member's `contribute()` call happens to be the *last* one
  in a round costs noticeably more gas than a plain `contribute()`, because that same call also
  triggers `_payout()` (pot transfer + round bookkeeping, and on the final round `CircleCompleted`)
  in one transaction. A wallet funded only for an ordinary `contribute()` can revert with
  `insufficient funds for intrinsic transaction cost` if it happens to be the one closing out a
  round — budget gas headroom for the payout-triggering case, not just the average case, anywhere
  members get funded for a demo (scripts here, or eventually frontend UX copy about expected fees).

## Verification loop
- Never accept "it works" — require the tx hash / on-phone confirmation.
- Two failed fixes in a row -> stop, diagnose root cause, then continue.
