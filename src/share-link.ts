import type { Circle, ShareableCircle } from './types';

export function buildShareLink(circle: Circle): string {
  const shareable: ShareableCircle =
    circle.currency === 'USDT'
      ? { currency: 'USDT', contractAddress: circle.contractAddress, name: circle.name }
      : {
          currency: 'NIM',
          circleId: circle.circleId,
          creatorAddress: circle.creatorAddress,
          name: circle.name,
          contributionAmount: circle.contributionAmount,
          memberCount: circle.memberCount,
        };
  const encoded = encodeURIComponent(JSON.stringify(shareable));
  return `${location.origin}/join.html?c=${encoded}`;
}

const ETH_ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/;
const NIM_ADDRESS_PATTERN = /^NQ\d{2}[0-9A-Z]{32}$/i;

/** Untrusted input from a URL a user could hand-edit — validate the shape, never throw. */
export function parseShareLink(search: string): ShareableCircle | null {
  const raw = new URLSearchParams(search).get('c');
  if (!raw) return null;

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }

  if (typeof data !== 'object' || data === null) return null;
  const candidate = data as Record<string, unknown>;

  if (candidate.currency === 'USDT') {
    const { contractAddress, name } = candidate;
    if (typeof contractAddress !== 'string' || !ETH_ADDRESS_PATTERN.test(contractAddress)) return null;
    if (typeof name !== 'string' || name.trim().length === 0) return null;
    return { currency: 'USDT', contractAddress, name };
  }

  if (candidate.currency === 'NIM') {
    const { circleId, creatorAddress, name, contributionAmount, memberCount } = candidate;
    if (typeof circleId !== 'string' || circleId.length === 0) return null;
    if (typeof creatorAddress !== 'string' || !NIM_ADDRESS_PATTERN.test(creatorAddress.replace(/\s+/g, ''))) {
      return null;
    }
    if (typeof name !== 'string' || name.trim().length === 0) return null;
    if (typeof contributionAmount !== 'number' || !Number.isFinite(contributionAmount) || contributionAmount <= 0) {
      return null;
    }
    if (typeof memberCount !== 'number' || !Number.isInteger(memberCount) || memberCount < 2) return null;
    return { currency: 'NIM', circleId, creatorAddress, name, contributionAmount, memberCount };
  }

  return null;
}
