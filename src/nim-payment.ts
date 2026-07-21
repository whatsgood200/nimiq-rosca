import { init, type NimiqProvider } from '@nimiq/mini-app-sdk';

const LUNA_PER_NIM = 1e5; // confirmed in SDK JSDoc: 1 NIM = 1e5 Lunas

/**
 * Connects to Nimiq Pay's provider. Resolves to null (not throws) if we're
 * not running inside Nimiq Pay, since the SDK doesn't document what init()
 * does in that case — timeout/failure is treated as "not inside Nimiq Pay."
 */
export async function connectNimiq(log: (line: string) => void): Promise<NimiqProvider | null> {
  let nimiq: NimiqProvider;
  try {
    nimiq = await init({ timeout: 5000 });
  } catch (err) {
    log(`init() failed — likely not running inside Nimiq Pay: ${String(err)}`);
    return null;
  }

  try {
    const [accounts, consensus, blockNumber] = await Promise.all([
      nimiq.listAccounts(),
      nimiq.isConsensusEstablished(),
      nimiq.getBlockNumber(),
    ]);
    const accountsText = Array.isArray(accounts)
      ? accounts.join(', ')
      : `error listing accounts — ${accounts.error.type}: ${accounts.error.message}`;
    log(`Connected. accounts: [${accountsText}] | consensus: ${consensus} | block: ${blockNumber}`);
  } catch (err) {
    log(`Connected, but status check threw unexpectedly: ${String(err)}`);
  }

  return nimiq;
}

export async function sendNim(
  nimiq: NimiqProvider,
  recipient: string,
  amountNim: number,
  log: (line: string) => void,
): Promise<void> {
  const value = Math.round(amountNim * LUNA_PER_NIM);
  try {
    const result = await nimiq.sendBasicTransaction({ recipient, value });
    if (typeof result === 'string') {
      log(`Success — response (hash or serialized tx, unconfirmed which): ${result}`);
    } else {
      log(`Payment failed or was cancelled — type: ${result.error.type}, message: ${result.error.message}`);
    }
  } catch (err) {
    log(`sendBasicTransaction threw unexpectedly: ${String(err)}`);
  }
}
