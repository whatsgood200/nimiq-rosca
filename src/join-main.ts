import { formatUnits } from 'ethers';
import type { Circle, ShareableCircle } from './types';
import { parseShareLink } from './share-link';
import { saveCircle } from './circle-store';
import { renderRing } from './rotation-ring';
import { addLedgerRow } from './ledger-row';
import { joinCircle, readCircleState } from './rosca-contract';
import { joinNimCircle, readNimCircleState } from './nim-circle';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const brokenNotice = byId<HTMLElement>('broken-link-notice');
const joinContent = byId<HTMLElement>('join-content');
const termsList = byId<HTMLDListElement>('terms-list');
const joinError = byId<HTMLElement>('join-error');
const joinBtn = byId<HTMLButtonElement>('join-btn');
const ring = document.getElementById('rotation-ring') as unknown as SVGSVGElement;

const shareable = parseShareLink(location.search);

async function loadTerms(shareable: ShareableCircle): Promise<void> {
  addLedgerRow(termsList, 'Name', shareable.name);
  addLedgerRow(termsList, 'Loading on-chain terms…', '');

  try {
    if (shareable.currency === 'USDT') {
      const state = await readCircleState(shareable.contractAddress);
      const amountDisplay = formatUnits(state.contributionAmount, state.tokenDecimals);
      const potRaw = state.contributionAmount * BigInt(state.memberCount);
      const potDisplay = formatUnits(potRaw, state.tokenDecimals);

      termsList.innerHTML = '';
      addLedgerRow(termsList, 'Name', shareable.name);
      addLedgerRow(termsList, 'Contribution / round', `${amountDisplay} ${state.tokenSymbol}`);
      addLedgerRow(termsList, 'Members', `${state.members.length} of ${state.memberCount} joined`);
      addLedgerRow(termsList, 'Pot per round', `${potDisplay} ${state.tokenSymbol}`);

      renderRing(ring, state.memberCount, { activeIndex: state.currentRound });

      if (state.locked) {
        joinBtn.disabled = true;
        joinBtn.textContent = 'Circle is full';
      }
    } else {
      const state = await readNimCircleState({
        currency: 'NIM',
        circleId: shareable.circleId,
        creatorAddress: shareable.creatorAddress,
        name: shareable.name,
        contributionAmount: shareable.contributionAmount,
        memberCount: shareable.memberCount,
        role: 'member',
      });

      termsList.innerHTML = '';
      addLedgerRow(termsList, 'Name', shareable.name);
      addLedgerRow(termsList, 'Contribution / round', `${shareable.contributionAmount} NIM`);
      addLedgerRow(termsList, 'Members', `${state.members.length} of ${state.memberCount} joined`);
      addLedgerRow(termsList, 'Pot per round', `${state.potThisRound} NIM`);

      renderRing(ring, state.memberCount, { activeIndex: state.currentRound });

      if (state.locked) {
        joinBtn.disabled = true;
        joinBtn.textContent = 'Circle is full';
      }
    }
  } catch (err) {
    termsList.innerHTML = '';
    addLedgerRow(termsList, 'Name', shareable.name);
    addLedgerRow(termsList, 'Status', "Couldn't load on-chain details — check your wallet connection.");
    console.error(err);
  }
}

if (!shareable) {
  brokenNotice.hidden = false;
  joinContent.hidden = true;
} else {
  brokenNotice.hidden = true;
  joinContent.hidden = false;

  void loadTerms(shareable);

  joinBtn.addEventListener('click', () => {
    joinError.textContent = '';
    joinBtn.disabled = true;
    joinBtn.textContent = 'Joining…';

    const action =
      shareable.currency === 'USDT'
        ? joinCircle(shareable.contractAddress)
        : joinNimCircle(shareable.circleId, shareable.creatorAddress);

    action
      .then(() => {
        const circle: Circle =
          shareable.currency === 'USDT'
            ? { currency: 'USDT', contractAddress: shareable.contractAddress, name: shareable.name, role: 'member' }
            : {
                currency: 'NIM',
                circleId: shareable.circleId,
                creatorAddress: shareable.creatorAddress,
                name: shareable.name,
                contributionAmount: shareable.contributionAmount,
                memberCount: shareable.memberCount,
                role: 'member',
              };
        saveCircle(circle);
        location.href = '/';
      })
      .catch((err: unknown) => {
        joinError.textContent = `Couldn't join — ${String(err)}`;
        joinBtn.disabled = false;
        joinBtn.textContent = 'Join circle';
      });
  });
}
