# RoscaCircle — pooled custody for the Round ROSCA mini app

Status: **Gate 2 tooling verdict was GO** (Hardhat 3 + Polygon Amoy — see git history for the
`PotEscrow.sol` spike that proved it, now superseded and removed). `RoscaCircle.sol` is the real
N-member rotation contract, fully written and tested against Hardhat's local simulated network,
**and the frontend is wired to it for real** — `index.html`/`join.html`/`ledger.html` deploy, join,
contribute, and refund against a live contract instead of localStorage. That's currently pointed at
a **persistent local node** (`npx hardhat node`, see below), not Amoy — **real Amoy deployment is
on hold** — the burner wallet below exists and is funded-and-ready to go once its testnet-POL
faucet access is sorted out; nothing here depends on that to keep moving.

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

## Not done yet (explicitly out of scope for this pass)

- **Real Amoy deploy** — on hold, see the burner wallet section below.

## Burner wallet (done, deploy still on hold)

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

**Burner address:** `0xca7ab33cCDe39390034949Bc4D1E3b4Be8F5d13d` — fund this from any current Amoy
faucet (Alchemy, QuickNode, or GetBlock all have one as of this check) once faucet access is
sorted out. Testnet-only; treat it as disposable, don't reuse it for anything real.

Re-running `generate-burner-wallet.mjs` overwrites the stored key with a brand new wallet — don't
re-run it after funding the address above, or the funds become unreachable (no key, no repo, no
backup exists anywhere for the old one, by design).

## Deploying to Polygon Amoy for real (on hold)

Still needed: `POLYGON_AMOY_RPC_URL` (not secret — a public default like
`https://rpc-amoy.polygon.technology` is fine; set it the same way if you want it out of the repo:
`npx hardhat keystore set POLYGON_AMOY_RPC_URL --dev`), testnet POL in the burner address above,
and an Ignition deploy module for `RoscaCircle` (the old `PotEscrow` one was removed with it —
write a new one when this is actually ready to deploy, since it needs a real token address and
round duration decided first).

(`.env.example` documents the RPC/key variables as a plain-env-var alternative to the keystore, if
you prefer that — `.env` itself is gitignored.)
