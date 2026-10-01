import { afterEach, describe, expect, it } from 'vitest';
import { getStoredEudicAutoAdd, setStoredEudicAutoAdd } from './wordbook-storage';

describe('Eudic wordbook storage', () => {
  afterEach(() => localStorage.clear());

  it('enables automatic collection by default and persists the opt-out', () => {
    expect(getStoredEudicAutoAdd()).toBe(true);
    setStoredEudicAutoAdd(false);
    expect(getStoredEudicAutoAdd()).toBe(false);
    setStoredEudicAutoAdd(true);
    expect(getStoredEudicAutoAdd()).toBe(true);
  });
});
