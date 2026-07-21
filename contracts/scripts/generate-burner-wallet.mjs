// Generates a fresh testnet-only burner wallet and stores its private key in
// Hardhat's *development* keystore (auto-managed password, no prompts ever),
// which `configVariable("POLYGON_AMOY_PRIVATE_KEY")` in hardhat.config.ts
// resolves from automatically. The private key never touches argv, a file we
// write, or this script's own stdout — it's generated in memory and piped
// directly to the `hardhat keystore set` child process over stdin, whose
// stdout is discarded rather than forwarded. Only the public address prints.
import { spawn } from "node:child_process";
import { Wallet } from "ethers";

function setDevKeystoreSecret(key, secretValue) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["hardhat", "keystore", "set", key, "--dev", "--force"],
      { stdio: ["pipe", "ignore", "pipe"], shell: true },
    );

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`hardhat keystore set exited with code ${code}: ${stderr}`));
    });

    child.stdin.write(secretValue + "\n");
    child.stdin.end();
  });
}

const wallet = Wallet.createRandom();

await setDevKeystoreSecret("POLYGON_AMOY_PRIVATE_KEY", wallet.privateKey);

console.log("Burner wallet generated and stored in the Hardhat dev keystore.");
console.log(`Address: ${wallet.address}`);
