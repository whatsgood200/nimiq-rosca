// Proves the fix for the phone bug (decimals() BAD_DATA — the frontend was
// calling LOCAL_TOKEN_ADDRESS, a Hardhat-local-node address, regardless of
// which network the wallet was actually on). This script extracts the exact
// ROSCA_BYTECODE / ROSCA_ABI / AMOY_TOKEN_ADDRESS / ERC20_ABI /
// DEFAULT_ROUND_DURATION_SECONDS constants straight out of
// src/contract-config.ts (not a hand-copied duplicate that could drift) and
// replicates exactly what getTokenDecimals() and deployCircle() in
// src/rosca-contract.ts do, against the real Polygon Amoy network: a
// decimals() read on the real deployed MockERC20, then a full circle deploy
// + join using the frontend's own embedded bytecode. This is the strongest
// verification possible without literally running inside Nimiq Pay's WebView
// on a phone — that on-device confirmation still has to happen separately.
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { JsonRpcProvider, Wallet, Contract, ContractFactory, formatUnits } from "ethers";

const RPC_URL = "https://polygon-amoy-bor-rpc.publicnode.com";

function getDevKeystoreSecret(key) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["hardhat", "keystore", "get", key, "--dev"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk.toString(); });
    child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`hardhat keystore get exited with code ${code}: ${stderr}`));
    });
  });
}

function extractConst(source, name) {
  // Non-greedy up to the FIRST ';' — correct here because every constant this
  // script extracts (numbers, single string literals, arrays of string
  // literals) never contains an embedded ';' itself, so the first ';' is
  // always the real end of the statement, trailing same-line comments (like
  // DEFAULT_ROUND_DURATION_SECONDS's "// 7 days") included or not.
  const match = source.match(new RegExp(`export const ${name} =\\s*([\\s\\S]*?);`));
  if (!match) throw new Error(`Could not find "export const ${name}" in contract-config.ts`);
  // eslint-disable-next-line no-new-func -- trusted local source file, not user input
  return new Function(`return (${match[1]});`)();
}

const configSrc = await readFile(new URL("../../src/contract-config.ts", import.meta.url), "utf8");
const AMOY_TOKEN_ADDRESS = extractConst(configSrc, "AMOY_TOKEN_ADDRESS");
const ROSCA_ABI = extractConst(configSrc, "ROSCA_ABI");
const ROSCA_BYTECODE = extractConst(configSrc, "ROSCA_BYTECODE");
const ERC20_ABI = extractConst(configSrc, "ERC20_ABI");
const DEFAULT_ROUND_DURATION_SECONDS = extractConst(configSrc, "DEFAULT_ROUND_DURATION_SECONDS");

console.log(`Extracted from src/contract-config.ts:`);
console.log(`  AMOY_TOKEN_ADDRESS = ${AMOY_TOKEN_ADDRESS}`);
console.log(`  DEFAULT_ROUND_DURATION_SECONDS = ${DEFAULT_ROUND_DURATION_SECONDS}`);
console.log(`  ROSCA_BYTECODE length = ${ROSCA_BYTECODE.length} chars`);
console.log();

const provider = new JsonRpcProvider(RPC_URL);
const privateKey = await getDevKeystoreSecret("POLYGON_AMOY_PRIVATE_KEY");
const wallet = new Wallet(privateKey, provider);
console.log(`Using burner wallet: ${wallet.address}`);
console.log();

// --- Step 1: replicate getTokenDecimals() exactly ---
console.log("Step 1 — replicating getTokenDecimals() against AMOY_TOKEN_ADDRESS...");
const token = new Contract(AMOY_TOKEN_ADDRESS, ERC20_ABI, provider);
const decimals = await token.decimals();
const symbol = await token.symbol();
console.log(`  decimals() = ${decimals}`);
console.log(`  symbol()   = ${symbol}`);
if (Number(decimals) !== 6) throw new Error(`Expected 6 decimals, got ${decimals}`);
console.log("  OK — no BAD_DATA, real contract, real response.");
console.log();

// --- Step 2: replicate deployCircle() exactly (deploy + join) ---
console.log("Step 2 — replicating deployCircle() (ContractFactory(ROSCA_ABI, ROSCA_BYTECODE).deploy + join)...");
const contributionAmount = 5_000_000n; // 5 mUSDT @ 6 decimals — arbitrary demo value
const memberCount = 2;

const factory = new ContractFactory(ROSCA_ABI, ROSCA_BYTECODE, wallet);
const deployTxRequest = await factory.getDeployTransaction(
  AMOY_TOKEN_ADDRESS,
  contributionAmount,
  memberCount,
  DEFAULT_ROUND_DURATION_SECONDS,
);
deployTxRequest.from = wallet.address;

const feeData = await provider.getFeeData();
const gasEstimate = await provider.estimateGas(deployTxRequest);
const requiredCost = gasEstimate * (feeData.maxFeePerGas ?? feeData.gasPrice);
const balance = await provider.getBalance(wallet.address);

console.log(`  eth_estimateGas for this exact deploy call (real network, real state, no revert): ${gasEstimate} gas`);
console.log(`  Burner wallet balance: ${formatUnits(balance, 18)} POL — needs ~${formatUnits(requiredCost, 18)} POL for deploy+join`);

if (balance < requiredCost) {
  console.log("  Balance is short for a full real broadcast right now (earlier runs spent most of the funded 0.105 POL).");
  console.log("  estimateGas succeeding only proves the constructor's own require()s pass (nonzero token address, positive");
  console.log("  amount, memberCount>=2, positive duration) — RoscaCircle's constructor never calls the token contract, so");
  console.log("  this alone does NOT prove AMOY_TOKEN_ADDRESS behaves as a real ERC-20. Step 1's decimals() call above already");
  console.log("  proved that directly. For \"deploy+join actually succeeds against this token\", see the already-completed real");
  console.log("  run at RoscaCircle 0x9ec0a17199c8246402cbCFF8f5439EF39bc0D737 (token() == AMOY_TOKEN_ADDRESS, join + 2 full");
  console.log("  contribute/payout rounds all real transactions — see contracts/README.md for those tx links).");
} else {
  const contract = await factory.deploy(
    AMOY_TOKEN_ADDRESS,
    contributionAmount,
    memberCount,
    DEFAULT_ROUND_DURATION_SECONDS,
  );
  const deployTx = contract.deploymentTransaction();
  console.log(`  Deploy tx: https://amoy.polygonscan.com/tx/${deployTx.hash}`);
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`  Deployed RoscaCircle: https://amoy.polygonscan.com/address/${address}`);

  const rosca = new Contract(address, ROSCA_ABI, wallet);
  const joinTx = await rosca.join();
  const joinReceipt = await joinTx.wait();
  console.log(`  Join tx: https://amoy.polygonscan.com/tx/${joinReceipt.hash} (status ${joinReceipt.status === 1 ? "success" : "FAILED"})`);

  const onChainToken = await rosca.token();
  const isMember = await rosca.isMember(wallet.address);
  console.log(`  On-chain token address on the new circle: ${onChainToken}`);
  console.log(`  Matches AMOY_TOKEN_ADDRESS: ${onChainToken.toLowerCase() === AMOY_TOKEN_ADDRESS.toLowerCase()}`);
  console.log(`  Creator successfully joined (isMember): ${isMember}`);

  if (onChainToken.toLowerCase() !== AMOY_TOKEN_ADDRESS.toLowerCase()) {
    throw new Error("Deployed circle's token address does not match AMOY_TOKEN_ADDRESS — fix did not take effect!");
  }
  if (!isMember) {
    throw new Error("Creator did not successfully join the new circle!");
  }
}

console.log();
console.log("=== Fix verified against real Polygon Amoy ===");
