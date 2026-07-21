export type Currency = 'USDT' | 'NIM';

/**
 * A local pointer to the circle this device is following — not a cache of
 * its state. For USDT circles, amount/members/round/paid-status are always
 * read live from the contract (see rosca-contract.ts). For NIM circles,
 * they're always read live from the NIM chain itself (see nim-circle.ts) —
 * neither is ever cached here, so the UI can't show stale numbers.
 */
export interface UsdtCircle {
  currency: 'USDT';
  contractAddress: string;
  name: string;
  role: 'creator' | 'member';
}

export interface NimCircle {
  currency: 'NIM';
  /** Random id tagging this circle's join/payment marker transactions. */
  circleId: string;
  /** The roster itself is reconstructed from this address's tx history. */
  creatorAddress: string;
  name: string;
  /** Human units (NIM), not Luna. */
  contributionAmount: number;
  memberCount: number;
  role: 'creator' | 'member';
}

export type Circle = UsdtCircle | NimCircle;

/** The subset of a Circle that's safe/meaningful to put in a share link. */
export type ShareableCircle =
  | { currency: 'USDT'; contractAddress: string; name: string }
  | {
      currency: 'NIM';
      circleId: string;
      creatorAddress: string;
      name: string;
      contributionAmount: number;
      memberCount: number;
    };
