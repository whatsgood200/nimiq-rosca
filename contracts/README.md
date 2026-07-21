# RoscaCircle — pooled custody for the Round ROSCA mini app

Status: **Gate 2 tooling verdict was GO** (Hardhat 3 + Polygon Amoy — see git history for the
`PotEscrow.sol` spike that proved it, now superseded and removed). `RoscaCircle.sol` is the real
N-member rotation contract, fully written and tested against Hardhat's local simulated network,
**and the frontend is wired to it for real** — `index.html`/`join.html`/`ledger.html` deploy, join,
contribute, and refund against a live contract instead of localStorage. Day-to-day dev still points
at a **persistent local node** (`npx hardhat node`, see below) for speed, but **real Amoy deployment
is confirmed working, not on hold anymore** — see "Deployed to Polygon Amoy" below for the live
addresses and a full real-transaction join → contribute → rotate → payout cycle, verified with
Polygonscan links.

This is a Hardhat 3 project, isolated from the frontend's `package.json` on purpose — it has its
own toolchain (Solidity, ethers, mocha) that shouldn't mix with the Vite/browser dependency tree.

## What `RoscaCircle.sol` does

- N members `join()`, in the order they join — join order **is** payout order (round 0 pays
  `members[0]`, round 1 pays `members[1]`, etc.). Fully deterministic, no randomness, no admin
  role, no privileged withdraw — nobody has to trust an organizer, including whoever deployed it.
- Once full, each round every member (including that round's recipient) pays a fixed
  `contributionAmount` of an ERC-20 token via `contribute()`. When all N have paid, the round's pot
  (`contributionAmount * memberCount`) auto-releases to that round's member and the next round's
  deadline starts.
- **Stall handling**: each round has a deadline (`roundDuration`, set at deploy time). If it passes
  without everyone paying, anyone who *did* pay that round can call `refund()` to reclaim their own
  contribution. The round does not auto-resume after that — a non-paying member breaks the cycle,
  same as in an informal ROSCA. No eviction/resume logic beyond the refund escape hatch.
- Currency is an ERC-20 token address passed at deploy time (USDT on mainnet/testnet eventually;
  `contracts/mocks/MockERC20.sol`, 6 decimals to match real USDT, stands in for it locally). The
  frontend (`src/rosca-contract.ts`) sends `approve()` automatically before `contribute()` when
  the allowance is short.

## Commands

```bash
npm install
npx hardhat compile
npx hardhat test
```

13/13 tests passing against Hardhat's local simulated network — join guards, contribute guards,
a full N-round rotation with correct recipient/amount per round, completion after N rounds, and
the deadline-miss + refund flow. No testnet funds or network access needed for any of this.

## Running the frontend against this locally

```bash
npx hardhat node                    # terminal 1 — persistent local JSON-RPC at :8545
node scripts/setup-local.mjs        # terminal 2 — deploys MockERC20, mints to accounts #0-#4
```
Then `npm run dev` in the repo root as usual. The frontend needs a real EIP-1193 `window.ethereum`
pointed at this same local node to do anything beyond viewing an empty state — there's no wallet
extension wired up for manual local use yet (verification so far has used a Playwright-injected
dev-only shim, never shipped in the app). `MockERC20`'s address is deterministic (first tx from
account #0 on a fresh node) and hardcoded in `src/contract-config.ts` as `LOCAL_TOKEN_ADDRESS` —
restarting the node fresh and rerunning the setup script reproduces the same address.

## Burner wallet (done, funded, used for a live Amoy deploy)

`scripts/generate-burner-wallet.mjs` generated a fresh testnet-only wallet and stored its private
key in Hardhat's **development keystore** (`hardhat keystore set --dev`) — a separate, lower-
ceremony keystore Hardhat itself provides for exactly this kind of automated/dev use: the
encryption password is auto-generated and stored locally, so there's no master password to lose
and no interactive prompt. `hardhat.config.ts`'s `configVariable("POLYGON_AMOY_PRIVATE_KEY")`
resolves from it automatically — no further setup needed for that variable.

The private key was never printed, logged, or written to any file this repo tracks — it went
straight from `ethers.Wallet.createRandom()` into the keystore-set child process's stdin. Only the
address was ever shown. `scripts/verify-burner-wallet.mjs <address>` round-trips the stored key
through `hardhat keystore get --dev` and confirms it derives the same address, without printing
the key either — see that script if you want to re-verify.

**Burner address:** `0xca7ab33cCDe39390034949Bc4D1E3b4Be8F5d13d` — funded with 0.105 POL from an
Amoy faucet and used to deploy + run a full cycle below (see "Deployed to Polygon Amoy"); roughly
0.02 POL remains after gas. Testnet-only; treat it as disposable, don't reuse it for anything real.

Re-running `generate-burner-wallet.mjs` overwrites the stored key with a brand new wallet — don't
re-run it after funding the address above, or the funds become unreachable (no key, no repo, no
backup exists anywhere for the old one, by design). Same warning applies to
`scripts/generate-member-b-wallet.mjs`, which generated a second throwaway wallet the same way
(stored as `AMOY_MEMBER_B_PRIVATE_KEY`) purely so a real 2-member cycle could be exercised below.

## Deployed to Polygon Amoy

**Confirmed working — no longer on hold.** `ignition/modules/RoscaCircle.ts` deploys `MockERC20`
(Amoy has no easy-to-get real testnet USDT, so the same 6-decimal mUSDT stand-in used locally
stands in here too) and then `RoscaCircle` pointed at it, with demo-sized constructor params
(10 mUSDT contribution, 2 members, 1 hour round duration).

- `POLYGON_AMOY_RPC_URL` is set to `https://polygon-amoy-bor-rpc.publicnode.com` in the dev
  keystore. The obvious default, `https://rpc-amoy.polygon.technology`, did not respond at all
  when tested (`eth_chainId` request timed out) — `publicnode.com`, `drpc.org`, and Tenderly's
  gateway all answered correctly; publicnode is what's actually configured.
- **MockERC20 (mUSDT):** `0x9c457A45c5B2912c71c40A3f2c03b84A55bE832f`
- **RoscaCircle:** `0x9ec0a17199c8246402cbCFF8f5439EF39bc0D737`
- Deployment tx (MockERC20): https://amoy.polygonscan.com/tx/0x714b47b9173aad9903c942a3334c4a3565d15fc0ff883dc002dd585283e71e06
- Deployment tx (RoscaCircle): https://amoy.polygonscan.com/tx/0x742d7335414cef8ed070f3a40944693da7fcccfe296b3cf07885fc5a2cceb86f

Redeploy with `npx hardhat ignition deploy ignition/modules/RoscaCircle.ts --network polygonAmoy`
(it will prompt for confirmation — pipe `yes` into it for non-interactive use).

### Full cycle, exercised with real transactions

`scripts/amoy-full-cycle.mjs` runs a complete join → contribute → rotate → payout cycle against
the addresses above, using the burner wallet as member A (`members[0]`) and a generated throwaway
"member B" wallet (`members[1]`). Both private keys are pulled from the dev keystore in-memory only
and never printed, same pattern as `verify-burner-wallet.mjs`. It funds member B with a little POL
for gas, mints mUSDT to both (`MockERC20.mint` is unrestricted), approves, joins, then contributes
through both rounds — round 0 pays out to member A, round 1 pays out to member B and completes the
circle. `scripts/amoy-finish-round1.mjs` is a resume script for the one gas hiccup noted below.

**Gas learning:** the member whose `contribute()` call happens to be the *last* one in a round pays
noticeably more gas than everyone else's `contribute()`, because that same call also triggers
`_payout()` — the pot transfer, round-completion bookkeeping, and (on the final round)
`CircleCompleted` — all in one transaction. On the real run here, member B's round-1 contribute
reverted with `insufficient funds for intrinsic transaction cost` after being funded for a plain
contribute; topping it up by another 0.01 POL and resubmitting just that call fixed it. Anything
that funds member wallets for a real demo (this repo's scripts, or eventually the frontend's own
UX copy) should budget headroom for whichever member ends up triggering the payout, not just the
cost of an ordinary `contribute()`.

(`.env.example` documents the RPC/key variables as a plain-env-var alternative to the keystore, if
you prefer that — `.env` itself is gitignored.)
