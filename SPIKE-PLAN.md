# Spike Plan — 10-day sprint, de-risk before building (Day 1–2)

The riskiest thing here is handling other people's pooled money flawlessly inside the Nimiq Pay
WebView. Prove the money path works BEFORE building any UI. Don't build features until Gate 1 passes.

## Gate 1 — Payment round-trip in the WebView (make-or-break)
1. Register, join the Skool community, install Nimiq Pay on your phone.
2. Switch Nimiq Pay to testnet (hidden dev menu: long-press the settings button ~10s) and claim
   free testnet NIM (the "Get free NIM" button, 110,000 per request).
3. Run a hello-world mini app locally with network access; open it in Nimiq Pay via the Custom URL
   field on the same Wi-Fi.
4. Prove BOTH rails end to end on your actual phone:
   - NIM: a transfer via @nimiq/mini-app-sdk (init the provider, request a payment, get user approval).
   - USDT: a transfer via window.ethereum on a testnet (Polygon Amoy or Sepolia), EIP-1193 flow.
5. PASS = both a NIM and a USDT payment complete + confirm from inside the WebView, and you've
   handled the cancel case (Nimiq throws PermissionDeniedError; Ethereum uses EIP-1193 codes, e.g. 4902).

## Gate 2 — Pooled custody decision (decide by Day 2–3)
Try the trustless version first:
1. Have Claude Code write a minimal ROSCA contract (fixed contribution, N members, round counter,
   rotation payout, contribution tracking) and deploy to an EVM testnet.
2. From the mini app, run ONE full cycle: two seed members contribute USDT -> contract releases the
   pot to the current-round member -> ledger reflects it.
3. PASS = the contract holds contributions and pays out the right member by rule, driven from the app.

If Gate 2 is fighting you within the sprint window, take the FALLBACK immediately:
- Coordinated-P2P version: the app enforces the rotation and shows a transparent, verifiable ledger,
  but each round members pay the current recipient directly (no custody contract). Weaker on
  trustlessness, far faster to make flawless. Still solves the transparency/record-keeping problem.
  Decide by Day 3 so you never lose momentum.

## After gates pass
Lock scope to the single circle loop in RESEARCH-BRIEF.md. One circle, seeded with a few members,
fast-forward the rounds for the demo. Resist every feature that isn't that loop.
