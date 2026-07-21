import { formatUnits } from 'ethers';
import type { Circle, NimCircle } from './types';
import { loadCircle } from './circle-store';
import { renderRing } from './rotation-ring';
import { addLedgerRow } from './ledger-row';
import { contribute, getConnectedAddress, readCircleState, refund, type CircleState } from './rosca-contract';
import { contributeNim, getMyNimAddress, readNimCircleState, type NimCircleState } from './nim-circle';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const noCircleNotice = byId<HTMLElement>('no-circle-notice');
const ledgerContent = byId<HTMLElement>('ledger-content');
const roundList = byId<HTMLDListElement>('round-list');
const membersList = byId<HTMLDListElement>('members-list');
const actionError = byId<HTMLElement>('action-error');
const contributeBtn = byId<HTMLButtonElement>('contribute-btn');
const refundBtn = byId<HTMLButtonElement>('refund-btn');
const ring = document.getElementById('rotation-ring') as unknown as SVGSVGElement;

function shortenAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function sameAddress(a: string | null, b: string): boolean {
  return a !== null && a.toLowerCase() === b.toLowerCase();
}

const circle = loadCircle();

if (!circle) {
  noCircleNotice.hidden = false;
  ledgerContent.hidden = true;
} else {
  noCircleNotice.hidden = true;
  ledgerContent.hidden = false;
  void refresh(circle);

  contributeBtn.addEventListener('click', () => {
    if (circle.currency === 'USDT') {
      void runAction(contributeBtn, 'Contributing…', () => contribute(circle.contractAddress));
    } else {
      void runAction(contributeBtn, 'Contributing…', async () => {
        const state = await readNimCircleState(circle);
        if (!state.locked || state.currentRecipient === null) {
          throw new Error('This round is not open for contributions right now.');
        }
        await contributeNim(circle.circleId, state.currentRound, state.currentRecipient, circle.contributionAmount);
      });
    }
  });

  refundBtn.addEventListener('click', () => {
    if (circle.currency !== 'USDT') return; // never shown for NIM — nothing pooled to refund
    void runAction(refundBtn, 'Refunding…', () => refund(circle.contractAddress));
  });
}

async function runAction(button: HTMLButtonElement, busyLabel: string, action: () => Promise<void>): Promise<void> {
  actionError.textContent = '';
  const originalLabel = button.textContent;
  button.disabled = true;
  button.textContent = busyLabel;

  try {
    await action();
    if (circle) await refresh(circle);
  } catch (err) {
    actionError.textContent = `That didn't go through — ${String(err)}`;
  } finally {
    button.disabled = false;
    button.textContent = originalLabel;
  }
}

async function refresh(circle: Circle): Promise<void> {
  try {
    if (circle.currency === 'USDT') {
      const state = await readCircleState(circle.contractAddress);
      const connected = await getConnectedAddress();
      renderUsdt(state, connected);
    } else {
      const state = await readNimCircleState(circle);
      const connected = await getMyNimAddress().catch(() => null);
      renderNim(state, connected, circle);
    }
  } catch (err) {
    roundList.innerHTML = '';
    addLedgerRow(roundList, 'Status', "Couldn't load on-chain details — check your wallet connection.");
    console.error(err);
  }
}

function renderUsdt(state: CircleState, connected: string | null): void {
  const amountDisplay = formatUnits(state.contributionAmount, state.tokenDecimals);
  const potRaw = state.contributionAmount * BigInt(state.memberCount);
  const potDisplay = formatUnits(potRaw, state.tokenDecimals);
  // Compare against the chain's own clock, never the browser's — the
  // contract enforces the deadline against block.timestamp, which can
  // diverge from wall-clock time (local time-travel testing; real drift).
  const deadlinePassed = state.chainTimestamp > state.roundDeadline;

  roundList.innerHTML = '';
  addLedgerRow(roundList, 'Round', state.completed ? 'Complete' : `${state.currentRound + 1} of ${state.memberCount}`);
  addLedgerRow(roundList, 'Contribution / round', `${amountDisplay} ${state.tokenSymbol}`);
  addLedgerRow(roundList, 'Pot this round', `${potDisplay} ${state.tokenSymbol}`);
  if (!state.completed && state.locked) {
    addLedgerRow(roundList, 'Round closes', new Date(state.roundDeadline * 1000).toLocaleString());
  }

  renderRing(ring, state.memberCount, {
    activeIndex: state.currentRound,
    paidIndexes: state.members.map((member) => state.paidThisRound[member] === true),
    centerLabel: state.completed ? '✓' : String(state.currentRound + 1),
    subLabel: state.completed ? 'COMPLETE' : 'ROUND',
  });

  membersList.innerHTML = '';
  let youPaidThisRound = false;
  let youAreMember = false;
  state.members.forEach((member, index) => {
    const isYou = sameAddress(connected, member);
    if (isYou) youAreMember = true;
    const paid = state.paidThisRound[member] === true;
    if (isYou && paid) youPaidThisRound = true;
    const isTurn = index === state.currentRound;
    const label = `${shortenAddress(member)}${isYou ? ' (you)' : ''}${isTurn ? ' — this round' : ''}`;
    addLedgerRow(membersList, label, paid ? 'Paid' : 'Not yet');
  });

  const roundActive = state.locked && !state.completed;
  contributeBtn.hidden = !roundActive;
  contributeBtn.disabled = !roundActive || deadlinePassed || (youAreMember && youPaidThisRound);
  if (!roundActive) {
    // leave label alone — button is hidden
  } else if (deadlinePassed) {
    contributeBtn.textContent = 'Round deadline passed';
  } else if (youAreMember && youPaidThisRound) {
    contributeBtn.textContent = "You've paid this round";
  } else {
    contributeBtn.textContent = 'Contribute';
  }

  refundBtn.hidden = !(roundActive && deadlinePassed && youAreMember && youPaidThisRound);
}

function renderNim(state: NimCircleState, connected: string | null, circle: NimCircle): void {
  const roundActive = state.locked && !state.completed;

  roundList.innerHTML = '';
  const roundLabel = !state.locked
    ? `Waiting for members (${state.members.length} of ${state.memberCount})`
    : state.completed
      ? 'Complete'
      : `${state.currentRound + 1} of ${state.memberCount}`;
  addLedgerRow(roundList, 'Round', roundLabel);
  addLedgerRow(roundList, 'Contribution / round', `${circle.contributionAmount} NIM`);
  addLedgerRow(roundList, 'Pot this round', `${state.potThisRound} NIM`);

  renderRing(ring, state.memberCount, {
    activeIndex: state.currentRound,
    paidIndexes: state.members.map((member) => state.paidThisRound[member] === true),
    centerLabel: state.completed ? '✓' : String(state.currentRound + 1),
    subLabel: state.completed ? 'COMPLETE' : 'ROUND',
  });

  membersList.innerHTML = '';
  state.members.forEach((member, index) => {
    const isYou = sameAddress(connected, member);
    const isRecipient = roundActive && index === state.currentRound;
    const paid = state.paidThisRound[member] === true;
    const label = `${shortenAddress(member)}${isYou ? ' (you)' : ''}${isRecipient ? " — this round’s turn" : ''}`;
    const status = isRecipient ? 'Receiving' : paid ? 'Paid' : 'Not yet';
    addLedgerRow(membersList, label, status);
  });

  const youMustPay = roundActive && connected !== null && state.requiredPayers.some((m) => sameAddress(connected, m));
  const youPaid = youMustPay && state.requiredPayers.some((m) => sameAddress(connected, m) && state.paidThisRound[m]);

  contributeBtn.hidden = !roundActive;
  contributeBtn.disabled = !youMustPay || youPaid;
  if (roundActive) {
    if (connected && !youMustPay && sameAddress(connected, state.currentRecipient ?? '')) {
      contributeBtn.textContent = "It's your turn to receive";
    } else if (youPaid) {
      contributeBtn.textContent = "You've paid this round";
    } else {
      contributeBtn.textContent = 'Contribute';
    }
  }

  // No escrow in the direct-payment NIM model — nothing to refund from.
  refundBtn.hidden = true;
}
