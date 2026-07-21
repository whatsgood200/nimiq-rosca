const POLYGON_AMOY_CHAIN_ID = '0x13882'; // 80002

const POLYGON_AMOY_CHAIN_PARAMS = {
  chainId: POLYGON_AMOY_CHAIN_ID,
  chainName: 'Polygon Amoy Testnet',
  nativeCurrency: { name: 'POL', symbol: 'POL', decimals: 18 },
  rpcUrls: ['https://rpc-amoy.polygon.technology'],
  blockExplorerUrls: ['https://amoy.polygonscan.com'],
};

function isEthereumProviderError(err: unknown): err is EthereumProviderError {
  return typeof err === 'object' && err !== null && 'code' in err;
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
