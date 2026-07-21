// Run against a freshly started `npx hardhat node`. Deploys MockERC20 (as the
// very first transaction from account #0, so its address is deterministic —
// see contracts/README.md) and mints test tokens to Hardhat's well-known
// default local accounts #0-#4, for the frontend's local-network dev/testing.
import { readFile } from "node:fs/promises";
import { JsonRpcProvider, formatUnits } from "ethers";

const RPC_URL = "http://127.0.0.1:8545";
const MINT_AMOUNT = 1_000_000_000n; // 1000 mUSDT at 6 decimals, per account

const artifact = JSON.parse(
  await readFile(
    new URL(
      "../artifacts/contracts/mocks/MockERC20.sol/MockERC20.json",
      import.meta.url,
    ),
  ),
);

const provider = new JsonRpcProvider(RPC_URL);
const accounts = await provider.send("eth_accounts", []);
const recipients = accounts.slice(0, 5);

const deployer = await provider.getSigner(0);

const { ContractFactory } = await import("ethers");
const factory = new ContractFactory(artifact.abi, artifact.bytecode, deployer);
const token = await factory.deploy();
await token.waitForDeployment();
const tokenAddress = await token.getAddress();

for (const recipient of recipients) {
  const tx = await token.mint(recipient, MINT_AMOUNT);
  await tx.wait();
}

console.log(`MockERC20 deployed at: ${tokenAddress}`);
console.log(`Minted ${formatUnits(MINT_AMOUNT, 6)} mUSDT to each of:`);
for (const recipient of recipients) {
  console.log(`  ${recipient}`);
}
