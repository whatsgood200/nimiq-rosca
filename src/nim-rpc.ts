// The package root (`@nimiq/mini-app-sdk`) only actually exports init()/
// requestDeviceIdentifier()/getHostLanguage() at runtime — its .d.ts claims
// NimiqProvider too, but that's not true of the shipped JS (confirmed by
// inspecting dist/index.js directly). The real class lives at this subpath.
import { NimiqProvider, type ErrorResponse, type TransactionInfo } from '@nimiq/mini-app-sdk/provider';
import { NIM_RPC_URL } from './nim-config';

function isErrorResponse(value: unknown): value is ErrorResponse {
  return typeof value === 'object' && value !== null && 'error' in value;
}

/**
 * Read-only query against the public NIM RPC — never touches the wallet
 * adapter, works outside Nimiq Pay too (confirmed from SDK source: the
 * request() passthrough for non-wallet methods is a plain fetch()).
 */
export async function getTransactionsByAddress(address: string, max = 500): Promise<TransactionInfo[]> {
  const provider = new NimiqProvider({ rpcUrl: NIM_RPC_URL });
  const result = await provider.request<TransactionInfo[] | ErrorResponse>({
    method: 'getTransactionsByAddress',
    params: [address, max, null],
  });
  if (isErrorResponse(result)) {
    throw new Error(`getTransactionsByAddress failed — ${result.error.type}: ${result.error.message}`);
  }
  return result;
}

/**
 * Extracts a join/payment tag from a transaction's attached data. Checks
 * recipientData first (the historically-expected field for data attached via
 * sendBasicTransactionWithData), falling back to senderData — this pairing is
 * unconfirmed without a real on-device send-then-query round trip, so both
 * are checked defensively rather than assuming one.
 */
export function extractTag(tx: TransactionInfo): string {
  return tx.recipientData || tx.senderData || '';
}
