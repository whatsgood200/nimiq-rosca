export function addLedgerRow(dl: HTMLDListElement, term: string, description: string): void {
  const row = document.createElement('div');
  row.className = 'row';
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = description;
  row.append(dt, dd);
  dl.appendChild(row);
}
