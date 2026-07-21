import { init, type NimiqProvider } from '@nimiq/mini-app-sdk';
import type { NimCircle } from './types';
import { getTransactionsByAddress, extractTag } from './nim-rpc';
import { buildJoinTag, buildPaymentTag, nimToLuna, NIM_JOIN_MARKER_VALUE_LUNA } from './nim-config';

async function connectWallet(): Promise<NimiqProvider> {
  return init({ timeout: 5000 });
}

/** Resolves to this device's own NIM address, for use as creatorAddress. */
export async function getMyNimAddress(): Promise<string> {
  const nimiq = await connectWallet();
  const accounts = await nimiq.listAccounts();
  if (!Array.isArray(accounts) || accounts.length === 0) {
    throw new Error('No NIM account available from the wallet.');
  }
  return accounts[0];
}

export function createNimCircle(params: {
  name: string;
  contributionAmount: number;
  memberCount: number;
  creatorAddress: string;
}): NimCircle {
  const circleId = crypto.randomUUID().replace(/-/g, '').slice(0, 8);
  return {
    currency: 'NIM',
    circleId,
    creatorAddress: params.creatorAddress,
    name: params.name,
    contributionAmount: params.contributionAmount,
    memberCount: params.memberCount,
    role: 'creator',
  };
}

/** Joining IS the on-chain action: a tagged marker transaction to the
 * creator's address is what every device later reads back to reconstruct
 * the roster. This costs the joiner a small real amount of NIM. */
export async function joinNimCircle(circleId: string, creatorAddress: string): Promise<void> {
  const nimiq = await connectWallet();
  const result = await nimiq.sendBasicTransactionWithData({
    recipient: creatorAddress,
    value: NIM_JOIN_MARKER_VALUE_LUNA,
    data: buildJoinTag(circleId),
  });
  if (typeof result !== 'string') {
    throw new Error(`Join failed — ${result.error.type}: ${result.error.message}`);
  }
}

/** A contribution IS the final payment — no escrow, no separate payout step. */
export async function contributeNim(
  circleId: string,
  round: number,
  recipientAddress: string,
  contributionAmountNim: number,
): Promise<void> {
  const nimiq = await connectWallet();
  const result = await nimiq.sendBasicTransactionWithData({
    recipient: recipientAddress,
    value: nimToLuna(contributionAmountNim),
    data: buildPaymentTag(circleId, round),
  });
  if (typeof result !== 'string') {
    throw new Error(`Contribution failed — ${result.error.type}: ${result.error.message}`);
  }
}

export interface NimCircleState {
  /** NIM addresses, creator first, then join order. */
  members: string[];
  memberCount: number;
  locked: boolean;
  currentRound: number;
  /** null once completed. */
  currentRecipient: string | null;
  /** Everyone except this round's recipient — they don't pay into their own round. */
  requiredPayers: string[];
  paidThisRound: Record<string, boolean>;
  completed: boolean;
  /** NIM, human units — contributionAmount * (memberCount - 1), since the
   * recipient doesn't pay into their own round in this direct-payment model. */
  potThisRound: number;
}

/**
 * Reconstructs the circle's state entirely from the NIM chain — the roster
 * from the creator's tx history, payment status from each round's recipient's
 * tx history — so every device computes the exact same answer independently.
 */
export async function readNimCircleState(circle: NimCircle): Promise<NimCircleState> {
  const creatorHistory = await getTransactionsByAddress(circle.creatorAddress);
  const joinTag = buildJoinTag(circle.circleId);
  const joiners = creatorHistory
    .filter((tx) => tx.to === circle.creatorAddress && extractTag(tx) === joinTag)
    .sort((a, b) => a.blockNumber - b.blockNumber)
    .map((tx) => tx.from);

  const members = [circle.creatorAddress, ...joiners].slice(0, circle.memberCount);
  const locked = members.length === circle.memberCount;
  const potThisRound = circle.contributionAmount * (circle.memberCount - 1);

  if (!locked) {
    return {
      members,
      memberCount: circle.memberCount,
      locked: false,
      currentRound: 0,
      currentRecipient: null,
      requiredPayers: [],
      paidThisRound: {},
      completed: false,
      potThisRound,
    };
  }

  const requiredValueLuna = nimToLuna(circle.contributionAmount);
  let currentRound = 0;
  let paidThisRound: Record<string, boolean> = {};
  let requiredPayers: string[] = [];

  while (currentRound < members.length) {
    const recipient = members[currentRound];
    requiredPayers = members.filter((_, i) => i !== currentRound);
    const recipientHistory =
      recipient === circle.creatorAddress ? creatorHistory : await getTransactionsByAddress(recipient);
    const tag = buildPaymentTag(circle.circleId, currentRound);
    const paidBy = new Set(
      recipientHistory
        .filter((tx) => tx.to === recipient && extractTag(tx) === tag && tx.value >= requiredValueLuna)
        .map((tx) => tx.from),
    );
    paidThisRound = Object.fromEntries(requiredPayers.map((member) => [member, paidBy.has(member)]));
    const allPaid = requiredPayers.every((member) => paidThisRound[member]);
    if (!allPaid) break;
    currentRound += 1;
  }

  const completed = currentRound === members.length;

  return {
    members,
    memberCount: circle.memberCount,
    locked: true,
    currentRound,
    currentRecipient: completed ? null : members[currentRound],
    requiredPayers: completed ? [] : requiredPayers,
    paidThisRound,
    completed,
    potThisRound,
  };
}
