import type { Circle } from './types';

const STORAGE_KEY = 'nimiq-rosca:circle';

export function loadCircle(): Circle | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Circle;
  } catch {
    return null;
  }
}

export function saveCircle(circle: Circle): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(circle));
}

export function clearCircle(): void {
  localStorage.removeItem(STORAGE_KEY);
}
