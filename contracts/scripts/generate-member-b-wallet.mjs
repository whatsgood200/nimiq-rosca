// Same pattern as generate-burner-wallet.mjs: generates a second throwaway
// testnet wallet ("member B") needed to exercise RoscaCircle's memberCount>=2
// requirement for a real end-to-end Amoy cycle, and stores its key in the
// Hardhat dev keystore without ever printing it. Only the address prints.
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

await setDevKeystoreSecret("AMOY_MEMBER_B_PRIVATE_KEY", wallet.privateKey);

console.log("Member B wallet generated and stored in the Hardhat dev keystore.");
console.log(`Address: ${wallet.address}`);
