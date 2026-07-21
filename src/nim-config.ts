// CONFIRMED this session via a live browser fetch() test: this mainnet endpoint
// responds correctly to getTransactionsByAddress and its CORS policy allows
// browser calls. NOT yet confirmed for testnet — no public testnet NIM RPC
// endpoint could be found or verified (Nimiq's own docs describe testnet
// RPC/dev access as token-gated, not casually public like this one). Swap this
// once a real testnet endpoint is available; nothing else in the NIM path
// needs to change.
export const NIM_RPC_URL = 'https://rpc.nimiqwatch.com';

const LUNA_PER_NIM = 1e5;

/** Legacy (PoW-era, not reconfirmed for current Albatross PoS) minimum
 * transferable value — zero-value transfers aren't allowed. Used as the
 * join-marker transaction's value since it isn't a real contribution. */
export const NIM_JOIN_MARKER_VALUE_LUNA = 1000; // 0.01 NIM

const JOIN_TAG_PREFIX = 'j:';
const PAYMENT_TAG_PREFIX = 'p:';

export function buildJoinTag(circleId: string): string {
  return `${JOIN_TAG_PREFIX}${circleId}`;
}

export function buildPaymentTag(circleId: string, round: number): string {
  return `${PAYMENT_TAG_PREFIX}${circleId}:${round}`;
}

export function nimToLuna(amountNim: number): number {
  return Math.round(amountNim * LUNA_PER_NIM);
}
