// Confirms the key stored by generate-burner-wallet.mjs round-trips correctly
// through Hardhat's dev keystore, WITHOUT ever printing the private key: the
// retrieved secret is captured in-memory only, used to derive an address, and
// then discarded — only a MATCH/MISMATCH verdict is printed.
import { spawn } from "node:child_process";
import { Wallet } from "ethers";

function getDevKeystoreSecret(key) {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["hardhat", "keystore", "get", key, "--dev"], {
      stdio: ["ignore", "pipe", "pipe"],
      shell: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(stdout.trim());
      else reject(new Error(`hardhat keystore get exited with code ${code}: ${stderr}`));
    });
  });
}

const expectedAddress = process.argv[2];
if (!expectedAddress) {
  console.error("Usage: node verify-burner-wallet.mjs <expectedAddress>");
  process.exit(1);
}

let verdict;
try {
  const privateKey = await getDevKeystoreSecret("POLYGON_AMOY_PRIVATE_KEY");
  const derivedAddress = new Wallet(privateKey).address;
  verdict = derivedAddress.toLowerCase() === expectedAddress.toLowerCase() ? "MATCH" : "MISMATCH";
} catch {
  verdict = "ERROR";
}

console.log(verdict);
