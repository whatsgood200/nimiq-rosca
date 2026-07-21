import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

// Real testnet deploy of RoscaCircle. Amoy has no easy-to-get real testnet
// USDT, so this also deploys MockERC20 (6-decimal mUSDT stand-in, same as
// the local setup — see contracts/README.md) and points RoscaCircle at it.
// Defaults are demo-sized on purpose: 2 members so a full round completes
// with just the funded burner wallet + one funded throwaway member wallet,
// 10 mUSDT contribution, 1 hour round duration (long enough that the demo
// script never races the deadline, short enough to not matter either way).
export default buildModule("RoscaCircle", (m) => {
  const contributionAmount = m.getParameter("contributionAmount", 10_000_000n); // 10 mUSDT @ 6 decimals
  const memberCount = m.getParameter("memberCount", 2n);
  const roundDuration = m.getParameter("roundDuration", 3600n); // 1 hour

  const token = m.contract("MockERC20");
  const rosca = m.contract("RoscaCircle", [
    token,
    contributionAmount,
    memberCount,
    roundDuration,
  ]);

  return { token, rosca };
});
