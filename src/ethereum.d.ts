interface EthereumProviderError extends Error {
  code: number;
}

interface EthereumProvider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
}

interface Window {
  ethereum?: EthereumProvider;
}
