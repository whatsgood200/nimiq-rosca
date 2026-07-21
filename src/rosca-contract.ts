import { BrowserProvider, Contract, ContractFactory, MaxUint256, type Eip1193Provider } from 'ethers';
import {
  DEFAULT_ROUND_DURATION_SECONDS,
  ERC20_ABI,
  LOCAL_TOKEN_ADDRESS,
  ROSCA_ABI,
  ROSCA_BYTECODE,
} from './contract-config';

export interface CircleState {
  /** Members who have actually joined so far — may be fewer than memberCount. */
  members: string[];
  currentRound: number;
  paidThisRound: Record<string, boolean>;
  roundDeadline: number;
  /** The chain's current block timestamp — compare roundDeadline against
   * THIS, never the browser's own clock. The contract enforces its deadline
   * against block.timestamp, which can diverge from wall-clock time (most
   * obviously under local-network time-travel testing, but real clock drift
   * is possible too). */
  chainTimestamp: number;
  locked: boolean;
  completed: boolean;
  contributionAmount: bigint;
  /** Target/cap — see `members.length` for how many have actually joined. */
  memberCount: number;
  tokenSymbol: string;
  tokenDecimals: number;
}

function getProvider(): BrowserProvider {
  if (!window.ethereum) {
    throw new Error('No wallet found — window.ethereum is unavailable.');
  }
  return new BrowserProvider(window.ethereum as unknown as Eip1193Provider);
}

/** Reads the local token's decimals, so the create-circle form can convert a
 * human-entered amount into the right smallest-unit integer before deploying. */
export async function getTokenDecimals(): Promise<number> {
  const provider = getProvider();
  const token = new Contract(LOCAL_TOKEN_ADDRESS, ERC20_ABI, provider);
  return Number(await token.decimals());
}

async function getSigner() {
  const provider = getProvider();
  await provider.send('eth_requestAccounts', []);
  return provider.getSigner();
}

/** Deploys a new circle, then immediately joins the creator to it. */
export async function deployCircle(params: {
  contributionAmount: bigint;
  memberCount: number;
}): Promise<string> {
  const signer = await getSigner();
  const factory = new ContractFactory(ROSCA_ABI, ROSCA_BYTECODE, signer);
  const contract = await factory.deploy(
    LOCAL_TOKEN_ADDRESS,
    params.contributionAmount,
    params.memberCount,
    DEFAULT_ROUND_DURATION_SECONDS,
  );
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  const rosca = new Contract(address, ROSCA_ABI, signer);
  const joinTx = await rosca.join();
  await joinTx.wait();

  return address;
}

export async function joinCircle(contractAddress: string): Promise<void> {
  const signer = await getSigner();
  const rosca = new Contract(contractAddress, ROSCA_ABI, signer);
  const tx = await rosca.join();
  await tx.wait();
}

/** Approves the exact allowance shortfall (if any), then contributes. */
export async function contribute(contractAddress: string): Promise<void> {
  const signer = await getSigner();
  const memberAddress = await signer.getAddress();
  const rosca = new Contract(contractAddress, ROSCA_ABI, signer);

  const tokenAddress: string = await rosca.token();
  const token = new Contract(tokenAddress, ERC20_ABI, signer);
  const amount: bigint = await rosca.contributionAmount();
  const allowance: bigint = await token.allowance(memberAddress, contractAddress);

  if (allowance < amount) {
    const approveTx = await token.approve(contractAddress, MaxUint256);
    await approveTx.wait();
  }

  const tx = await rosca.contribute();
  await tx.wait();
}

export async function refund(contractAddress: string): Promise<void> {
  const signer = await getSigner();
  const rosca = new Contract(contractAddress, ROSCA_ABI, signer);
  const tx = await rosca.refund();
  await tx.wait();
}

export async function readCircleState(contractAddress: string): Promise<CircleState> {
  const provider = getProvider();
  const rosca = new Contract(contractAddress, ROSCA_ABI, provider);

  const [memberCountRaw, joinedCountRaw, currentRoundRaw, roundDeadlineRaw, locked, completed, contributionAmount, tokenAddress] =
    await Promise.all([
      rosca.memberCount(),
      rosca.joinedCount(),
      rosca.currentRound(),
      rosca.roundDeadline(),
      rosca.locked(),
      rosca.completed(),
      rosca.contributionAmount(),
      rosca.token(),
    ]);

  const memberCount = Number(memberCountRaw);
  const joinedCount = Number(joinedCountRaw);
  const currentRound = Number(currentRoundRaw);

  const members: string[] = await Promise.all(
    Array.from({ length: joinedCount }, (_, i) => rosca.members(i)),
  );

  const paidEntries = await Promise.all(
    members.map(async (member): Promise<[string, boolean]> => [
      member,
      await rosca.hasContributed(currentRound, member),
    ]),
  );
  const paidThisRound = Object.fromEntries(paidEntries);

  const token = new Contract(tokenAddress, ERC20_ABI, provider);
  const [tokenSymbol, tokenDecimalsRaw, latestBlock] = await Promise.all([
    token.symbol(),
    token.decimals(),
    provider.getBlock('latest'),
  ]);

  return {
    members,
    currentRound,
    paidThisRound,
    roundDeadline: Number(roundDeadlineRaw),
    chainTimestamp: latestBlock?.timestamp ?? Math.floor(Date.now() / 1000),
    locked,
    completed,
    contributionAmount,
    memberCount,
    tokenSymbol,
    tokenDecimals: Number(tokenDecimalsRaw),
  };
}

/** Never prompts — returns an address only if the wallet already authorized this
 * origin. Contribute/refund/join still prompt for connection on their own via
 * getSigner(); this is only for opportunistic "is this you" display. */
export async function getConnectedAddress(): Promise<string | null> {
  if (!window.ethereum) return null;
  try {
    const provider = getProvider();
    const accounts: string[] = await provider.send('eth_accounts', []);
    return accounts[0] ?? null;
  } catch {
    return null;
  }
}
