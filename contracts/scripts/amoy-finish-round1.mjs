// Resumes amoy-full-cycle.mjs after it stopped mid-round-1: member A already
// contributed for round 1, member B ran short on gas for its own contribute
// (the call that also triggers the round-1 payout). Tops up member B with a
// bit more POL, then submits just that one remaining contribute() call.
import { readFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { JsonRpcProvider, Wallet, Contract, formatUnits, parseEther, formatEther } from "ethers";

const RPC_URL = "https://polygon-amoy-bor-rpc.publicnode.com";
const TOPUP = parseEther("0.01");

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

function explorerTx(hash) {
  return `https://amoy.polygonscan.com/tx/${hash}`;
}

async function logTx(label, txPromise) {
  const tx = await txPromise;
  const receipt = await tx.wait();
  console.log(`${label}: ${explorerTx(receipt.hash)} (block ${receipt.blockNumber}, status ${receipt.status === 1 ? "success" : "FAILED"})`);
  return receipt;
}

const deployed = JSON.parse(
  await readFile(new URL("../ignition/deployments/chain-80002/deployed_addresses.json", import.meta.url)),
);
const tokenAddress = deployed["RoscaCircle#MockERC20"];
const roscaAddress = deployed["RoscaCircle#RoscaCircle"];

const roscaArtifact = JSON.parse(
  await readFile(new URL("../artifacts/contracts/RoscaCircle.sol/RoscaCircle.json", import.meta.url)),
);
const tokenArtifact = JSON.parse(
  await readFile(new URL("../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json", import.meta.url)),
);

const provider = new JsonRpcProvider(RPC_URL);
const keyA = await getDevKeystoreSecret("POLYGON_AMOY_PRIVATE_KEY");
const keyB = await getDevKeystoreSecret("AMOY_MEMBER_B_PRIVATE_KEY");
const memberA = new Wallet(keyA, provider);
const memberB = new Wallet(keyB, provider);

console.log(`Topping up member B with ${formatEther(TOPUP)} POL...`);
await logTx("Top up member B", memberA.sendTransaction({ to: memberB.address, value: TOPUP }));

const tokenB = new Contract(tokenAddress, tokenArtifact.abi, memberB);
const roscaA = new Contract(roscaAddress, roscaArtifact.abi, memberA);
const roscaB = new Contract(roscaAddress, roscaArtifact.abi, memberB);

console.log(`Pre-contribute state: currentRound=${await roscaA.currentRound()}, completed=${await roscaA.completed()}`);
const balBefore = await tokenB.balanceOf(memberB.address);

await logTx("Contribute round 1 (member B, triggers payout + completion)", roscaB.contribute());

const balAfter = await tokenB.balanceOf(memberB.address);
const contributionAmount = await roscaA.contributionAmount();
const memberCount = await roscaA.memberCount();
console.log(`Member B mUSDT balance: ${formatUnits(balBefore, 6)} -> ${formatUnits(balAfter, 6)} (pot = ${formatUnits(contributionAmount * memberCount, 6)})`);
console.log(`Post-contribute state: currentRound=${await roscaA.currentRound()}, completed=${await roscaA.completed()}`);
console.log();
console.log(`RoscaCircle: https://amoy.polygonscan.com/address/${roscaAddress}`);
console.log(`MockERC20:   https://amoy.polygonscan.com/address/${tokenAddress}`);
