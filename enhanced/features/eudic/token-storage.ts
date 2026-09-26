const EUDIC_TOKEN_KEY = 'readest:eudic-token';

/** Read the Eudic token from app-local storage without touching SSR globals. */
export function getStoredEudicToken(): string | null {
  if (typeof localStorage === 'undefined') return null;
  const token = localStorage.getItem(EUDIC_TOKEN_KEY)?.trim();
  return token || null;
}

/** Store the token locally. It is intentionally excluded from synced settings. */
export function setStoredEudicToken(token: string): void {
  if (typeof localStorage === 'undefined') return;
  const normalized = token.trim();
  if (normalized) localStorage.setItem(EUDIC_TOKEN_KEY, normalized);
  else localStorage.removeItem(EUDIC_TOKEN_KEY);
}

export function clearStoredEudicToken(): void {
  if (typeof localStorage !== 'undefined') localStorage.removeItem(EUDIC_TOKEN_KEY);
}
