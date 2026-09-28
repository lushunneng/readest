const DEFAULT_CATEGORY_KEY = 'readest:eudic-default-category';
const BOOK_CATEGORY_PREFIX = 'readest:eudic-book-category:';
const AUTO_ADD_KEY = 'readest:eudic-auto-add';

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;

const keyForBook = (bookKey: string) => `${BOOK_CATEGORY_PREFIX}${bookKey}`;

export const getStoredEudicCategoryId = (bookKey?: string): string => {
  if (!canUseStorage()) return '0';
  const bookCategory = bookKey ? window.localStorage.getItem(keyForBook(bookKey)) : null;
  return bookCategory || window.localStorage.getItem(DEFAULT_CATEGORY_KEY) || '0';
};

export const setStoredEudicCategoryId = (categoryId: string, bookKey?: string): void => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(bookKey ? keyForBook(bookKey) : DEFAULT_CATEGORY_KEY, categoryId);
};

export const getStoredEudicAutoAdd = (): boolean =>
  canUseStorage() && window.localStorage.getItem(AUTO_ADD_KEY) !== 'false';

export const setStoredEudicAutoAdd = (enabled: boolean): void => {
  if (!canUseStorage()) return;
  window.localStorage.setItem(AUTO_ADD_KEY, String(enabled));
};
