import { formatUnits, parseUnits } from 'ethers';
import type { Circle, Currency } from './types';
import { clearCircle, loadCircle, saveCircle } from './circle-store';
import { renderRing } from './rotation-ring';
import { buildShareLink } from './share-link';
import { addLedgerRow } from './ledger-row';
import { deployCircle, getTokenDecimals, readCircleState } from './rosca-contract';
import { createNimCircle, getMyNimAddress, readNimCircleState } from './nim-circle';

function byId<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const formSection = byId<HTMLElement>('create-form-section');
const summarySection = byId<HTMLElement>('summary-section');
const form = byId<HTMLFormElement>('create-form');
const nameInput = byId<HTMLInputElement>('circle-name');
const amountInput = byId<HTMLInputElement>('contribution-amount');
const memberInput = byId<HTMLInputElement>('member-count');
const currencySelect = byId<HTMLSelectElement>('currency');
const nameError = byId<HTMLElement>('name-error');
const amountError = byId<HTMLElement>('amount-error');
const memberError = byId<HTMLElement>('member-error');
const potPreview = byId<HTMLElement>('pot-preview');
const createBtn = byId<HTMLButtonElement>('create-btn');
const deployStatus = byId<HTMLElement>('deploy-status');
const summaryList = byId<HTMLDListElement>('summary-list');
const startOverBtn = byId<HTMLButtonElement>('start-over-btn');
const stampSeal = byId<HTMLElement>('stamp-seal');
const inviteSection = byId<HTMLElement>('invite-section');
const inviteLinkInput = byId<HTMLInputElement>('invite-link');
const copyLinkBtn = byId<HTMLButtonElement>('copy-link-btn');
const ring = document.getElementById('rotation-ring') as unknown as SVGSVGElement;

let hasAttemptedSubmit = false;

function clearErrors(): void {
  nameError.textContent = '';
  amountError.textContent = '';
  memberError.textContent = '';
}

function validateName(): boolean {
  const valid = nameInput.value.trim().length > 0;
  nameError.textContent = valid ? '' : 'Enter a circle name.';
  return valid;
}

function validateAmount(): boolean {
  const amount = Number(amountInput.value);
  const valid = Number.isFinite(amount) && amount > 0;
  amountError.textContent = valid ? '' : 'Enter a positive contribution amount.';
  return valid;
}

function validateMemberCount(): boolean {
  const memberCount = Number(memberInput.value);
  const valid = Number.isInteger(memberCount) && memberCount >= 2;
  memberError.textContent = valid ? '' : 'Enter at least 2 members.';
  return valid;
}

function revalidateIfAttempted(validator: () => boolean): void {
  if (hasAttemptedSubmit) validator();
}

async function renderSummary(circle: Circle): Promise<void> {
  formSection.hidden = true;
  summarySection.hidden = false;

  const isCreator = circle.role !== 'member';
  inviteSection.hidden = !isCreator;
  if (isCreator) {
    inviteLinkInput.value = buildShareLink(circle);
  }
  stampSeal.innerHTML = isCreator ? 'CIRCLE<br />CREATED' : "YOU'RE<br />IN";
  startOverBtn.textContent = isCreator ? 'Void this entry — start over' : 'Leave this circle';

  summaryList.innerHTML = '';
  addLedgerRow(summaryList, 'Name', circle.name);
  addLedgerRow(summaryList, 'Loading on-chain terms…', '');

  try {
    if (circle.currency === 'USDT') {
      const state = await readCircleState(circle.contractAddress);
      const amountDisplay = formatUnits(state.contributionAmount, state.tokenDecimals);
      const potRaw = state.contributionAmount * BigInt(state.memberCount);
      const potDisplay = formatUnits(potRaw, state.tokenDecimals);

      summaryList.innerHTML = '';
      addLedgerRow(summaryList, 'Name', circle.name);
      addLedgerRow(summaryList, 'Contribution / round', `${amountDisplay} ${state.tokenSymbol}`);
      addLedgerRow(summaryList, 'Members', `${state.members.length} of ${state.memberCount} joined`);
      addLedgerRow(summaryList, 'Pot per round', `${potDisplay} ${state.tokenSymbol}`);
      addLedgerRow(summaryList, 'Your role', isCreator ? 'Creator' : 'Member');

      renderRing(ring, state.memberCount, { activeIndex: state.currentRound });
    } else {
      const state = await readNimCircleState(circle);

      summaryList.innerHTML = '';
      addLedgerRow(summaryList, 'Name', circle.name);
      addLedgerRow(summaryList, 'Contribution / round', `${circle.contributionAmount} NIM`);
      addLedgerRow(summaryList, 'Members', `${state.members.length} of ${state.memberCount} joined`);
      addLedgerRow(summaryList, 'Pot per round', `${state.potThisRound} NIM`);
      addLedgerRow(summaryList, 'Your role', isCreator ? 'Creator' : 'Member');

      renderRing(ring, state.memberCount, { activeIndex: state.currentRound });
    }
  } catch (err) {
    summaryList.innerHTML = '';
    addLedgerRow(summaryList, 'Name', circle.name);
    addLedgerRow(summaryList, 'Status', "Couldn't load on-chain details — check your wallet connection.");
    console.error(err);
  }
}

function updatePotPreview(): void {
  const amount = Number(amountInput.value);
  const members = Number(memberInput.value);
  if (Number.isFinite(amount) && amount > 0 && Number.isInteger(members) && members >= 2) {
    potPreview.innerHTML = `Pot per round: <strong>${amount * members} ${currencySelect.value}</strong>`;
  } else {
    potPreview.textContent = '';
  }
}

function updateRing(): void {
  renderRing(ring, Number(memberInput.value));
}

function renderForm(): void {
  formSection.hidden = false;
  summarySection.hidden = true;
  form.reset();
  hasAttemptedSubmit = false;
  clearErrors();
  deployStatus.hidden = true;
  createBtn.disabled = false;
  updatePotPreview();
  updateRing();
}

const existing = loadCircle();
if (existing) {
  void renderSummary(existing);
} else {
  renderForm();
}

memberInput.addEventListener('input', updateRing);
memberInput.addEventListener('input', updatePotPreview);
amountInput.addEventListener('input', updatePotPreview);
currencySelect.addEventListener('change', updatePotPreview);

nameInput.addEventListener('input', () => revalidateIfAttempted(validateName));
amountInput.addEventListener('input', () => revalidateIfAttempted(validateAmount));
memberInput.addEventListener('input', () => revalidateIfAttempted(validateMemberCount));

form.addEventListener('submit', (event) => {
  event.preventDefault();
  hasAttemptedSubmit = true;

  const nameValid = validateName();
  const amountValid = validateAmount();
  const memberValid = validateMemberCount();
  if (!nameValid || !amountValid || !memberValid) return;

  const name = nameInput.value.trim();
  const memberCount = Number(memberInput.value);
  const rawAmount = amountInput.value;
  const currency = currencySelect.value as Currency;

  createBtn.disabled = true;
  deployStatus.hidden = false;

  if (currency === 'USDT') {
    deployStatus.textContent = 'Creating your circle — confirm up to two prompts in your wallet…';
    void (async () => {
      try {
        const decimals = await getTokenDecimals();
        const contributionAmount = parseUnits(rawAmount, decimals);
        const contractAddress = await deployCircle({ contributionAmount, memberCount });

        const circle: Circle = { currency: 'USDT', contractAddress, name, role: 'creator' };
        saveCircle(circle);
        deployStatus.hidden = true;
        await renderSummary(circle);
      } catch (err) {
        deployStatus.textContent = `Couldn't create the circle — ${String(err)}`;
        createBtn.disabled = false;
      }
    })();
  } else {
    deployStatus.textContent = 'Connecting to your NIM wallet…';
    void (async () => {
      try {
        const creatorAddress = await getMyNimAddress();
        const circle = createNimCircle({
          name,
          contributionAmount: Number(rawAmount),
          memberCount,
          creatorAddress,
        });
        saveCircle(circle);
        deployStatus.hidden = true;
        await renderSummary(circle);
      } catch (err) {
        deployStatus.textContent = `Couldn't create the circle — ${String(err)}`;
        createBtn.disabled = false;
      }
    })();
  }
});

startOverBtn.addEventListener('click', () => {
  clearCircle();
  renderForm();
});

copyLinkBtn.addEventListener('click', () => {
  inviteLinkInput.select();
  if (!navigator.clipboard) return; // input is already selected for manual copy
  navigator.clipboard.writeText(inviteLinkInput.value).then(
    () => {
      copyLinkBtn.textContent = 'Copied';
      setTimeout(() => {
        copyLinkBtn.textContent = 'Copy';
      }, 1500);
    },
    () => {
      // Clipboard write denied — the input is already selected for manual copy.
    },
  );
});
