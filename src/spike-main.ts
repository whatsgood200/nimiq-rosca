import type { NimiqProvider } from '@nimiq/mini-app-sdk';
import { checkPolygonSupport } from './polygon-check';
import { connectNimiq, sendNim } from './nim-payment';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const polygonBtn = byId<HTMLButtonElement>('polygon-check-btn');
const polygonLog = byId<HTMLPreElement>('polygon-check-log');
const nimiqStatus = byId<HTMLPreElement>('nimiq-status');
const nimRecipient = byId<HTMLInputElement>('nim-recipient');
const nimAmount = byId<HTMLInputElement>('nim-amount');
const nimSendBtn = byId<HTMLButtonElement>('nim-send-btn');
const nimLog = byId<HTMLPreElement>('nim-log');

polygonBtn.addEventListener('click', () => {
  polygonBtn.disabled = true;
  polygonLog.textContent = 'Running...';
  checkPolygonSupport((line) => {
    polygonLog.textContent = line;
  })
    .catch((err) => {
      polygonLog.textContent = `Unexpected error: ${String(err)}`;
    })
    .finally(() => {
      polygonBtn.disabled = false;
    });
});

let nimiqProvider: NimiqProvider | null = null;

connectNimiq((line) => {
  nimiqStatus.textContent = line;
}).then((provider) => {
  nimiqProvider = provider;
});

nimSendBtn.addEventListener('click', () => {
  if (!nimiqProvider) {
    nimLog.textContent = 'Not connected to Nimiq Pay yet — reload inside the Nimiq Pay app.';
    return;
  }
  const recipient = nimRecipient.value.trim();
  const amount = Number(nimAmount.value);
  if (!recipient || !Number.isFinite(amount) || amount <= 0) {
    nimLog.textContent = 'Enter a recipient address and a positive amount.';
    return;
  }

  nimSendBtn.disabled = true;
  nimLog.textContent = 'Sending...';
  sendNim(nimiqProvider, recipient, amount, (line) => {
    nimLog.textContent = line;
  }).finally(() => {
    nimSendBtn.disabled = false;
  });
});
