// Theme choice per browser (EDT-6). Default dark. Stored in localStorage
// key pn.theme. theme-init.js uses readTheme before first paint.
export const THEME_KEY = 'pn.theme';

/**
 * @param {() => Pick<Storage, 'getItem'>} getStorage Throws or returns a storage that throws when blocked.
 * @returns {'dark' | 'light'}
 */
export function readTheme(getStorage) {
  try {
    return getStorage().getItem(THEME_KEY) === 'light' ? 'light' : 'dark';
  } catch {
    return 'dark';
  }
}

/**
 * @param {object} options
 * @param {() => Pick<Storage, 'getItem' | 'setItem'>} options.getStorage
 * @param {{ dataset: Record<string, string> }} options.root Usually document.documentElement.
 * @param {(theme: 'dark' | 'light') => void} [options.onChange]
 */
export function createTheme({ getStorage, root, onChange }) {
  let current = readTheme(getStorage);
  root.dataset.theme = current;
  return {
    get: () => current,
    /** Switches between dark and light. Returns the new theme. */
    toggle() {
      current = current === 'dark' ? 'light' : 'dark';
      root.dataset.theme = current;
      try {
        getStorage().setItem(THEME_KEY, current);
      } catch {
        // Storage can be blocked. The choice then lasts until reload.
      }
      onChange?.(current);
      return current;
    },
  };
}
