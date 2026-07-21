import { AMOY_CHAIN_ID } from './contract-config';

const POLYGON_AMOY_CHAIN_ID = `0x${AMOY_CHAIN_ID.toString(16)}`; // 0x13882

const POLYGON_AMOY_CHAIN_PARAMS = {
  chainId: POLYGON_AMOY_CHAIN_ID,
  chainName: 'Polygon Amoy Testnet',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  // Reliable public endpoint — the official rpc-amoy.polygon.technology did
  // not respond at all when checked (see contracts/README.md); publicnode did.
  rpcUrls: ['https://polygon-amoy-bor-rpc.publicnode.com'],
  blockExplorerUrls: ['https://amoy.polygonscan.com'],
};

function isEthereumProviderError(err: unknown): err is EthereumProviderError {
  return typeof err === 'object' && err !== null && 'code' in err;
}

/**
 * Gets the wallet onto Polygon Amoy, prompting a switch (and an add, if the
 * wallet doesn't know the chain yet) when it isn't already there. Throws with
 * a message safe to surface to the user if it can't get there — callers that
 * need Amoy for a contract call (rosca-contract.ts) should await this before
 * resolving addresses or sending transactions.
 */
export async function ensureAmoyChain(): Promise<void> {
  if (!window.ethereum) {
    throw new Error('No wallet found — window.ethereum is unavailable.');
  }

  const currentChainId = await window.ethereum.request({ method: 'eth_chainId' });
  if (currentChainId === POLYGON_AMOY_CHAIN_ID) return;

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_AMOY_CHAIN_ID }],
    });
  } catch (err) {
    if (isEthereumProviderError(err) && err.code === 4902) {
      await window.ethereum.request({
        method: 'wallet_addEthereumChain',
        params: [POLYGON_AMOY_CHAIN_PARAMS],
      });
    } else if (isEthereumProviderError(err)) {
      throw new Error(`Could not switch your wallet to Polygon Amoy — code ${err.code}: ${err.message}`);
    } else {
      throw err;
    }
  }

  const chainIdAfter = await window.ethereum.request({ method: 'eth_chainId' });
  if (chainIdAfter !== POLYGON_AMOY_CHAIN_ID) {
    throw new Error(`Wallet did not switch to Polygon Amoy — still on chainId ${String(chainIdAfter)}.`);
  }
}

/**
 * Fastest possible on-device check for whether Nimiq Pay's window.ethereum
 * actually exposes Polygon Amoy — Nimiq's own docs contradict each other on
 * this, so this must be observed live rather than assumed.
 */
export async function checkPolygonSupport(log: (line: string) => void): Promise<void> {
  if (!window.ethereum) {
    log('No window.ethereum found — not running inside Nimiq Pay, or no EVM support at all.');
    return;
  }

  try {
    await window.ethereum.request({ method: 'eth_requestAccounts' });
  } catch (err) {
    if (isEthereumProviderError(err)) {
      log(`eth_requestAccounts rejected — code ${err.code}: ${err.message}`);
    } else {
      log(`eth_requestAccounts threw an unexpected error: ${String(err)}`);
    }
    return;
  }

  try {
    await window.ethereum.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: POLYGON_AMOY_CHAIN_ID }],
    });
  } catch (err) {
    if (isEthereumProviderError(err) && err.code === 4902) {
      log('Chain not recognized (4902) — trying wallet_addEthereumChain...');
      try {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [POLYGON_AMOY_CHAIN_PARAMS],
        });
      } catch (addErr) {
        if (isEthereumProviderError(addErr)) {
          log(`wallet_addEthereumChain failed — code ${addErr.code}: ${addErr.message}. Polygon Amoy is NOT reachable.`);
        } else {
          log(`wallet_addEthereumChain threw an unexpected error: ${String(addErr)}`);
        }
        return;
      }
    } else if (isEthereumProviderError(err)) {
      log(`wallet_switchEthereumChain failed — code ${err.code}: ${err.message}. Polygon Amoy is NOT reachable.`);
      return;
    } else {
      log(`wallet_switchEthereumChain threw an unexpected error: ${String(err)}`);
      return;
    }
  }

  const chainIdAfter = await window.ethereum.request({ method: 'eth_chainId' });
  if (chainIdAfter === POLYGON_AMOY_CHAIN_ID) {
    log('Polygon Amoy reachable — chainId confirmed as 0x13882 after switch.');
  } else {
    log(`Switch call did not throw, but chainId after switch was "${String(chainIdAfter)}", not ${POLYGON_AMOY_CHAIN_ID} — switch was silently ignored.`);
  }
}
