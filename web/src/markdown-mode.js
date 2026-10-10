// Markdown mode per browser (MDV-1, MDV-2): 'visual' or 'raw', one mode for
// every Markdown tab. Stored in localStorage key pn.markdownMode. Visual on
// the first visit.
const MODE_KEY = 'pn.markdownMode';

/**
 * @param {object} options
 * @param {() => Pick<Storage, 'getItem' | 'setItem'>} options.getStorage Throws or returns a storage that throws when blocked.
 * @param {(mode: 'visual' | 'raw') => void} [options.onChange]
 */
export function createMarkdownMode({ getStorage, onChange }) {
  /** @type {'visual' | 'raw'} */
  let current;
  try {
    current = getStorage().getItem(MODE_KEY) === 'raw' ? 'raw' : 'visual';
  } catch {
    current = 'visual';
  }
  return {
    get: () => current,
    /** Switches between visual and raw. Returns the new mode. */
    toggle() {
      current = current === 'visual' ? 'raw' : 'visual';
      try {
        getStorage().setItem(MODE_KEY, current);
      } catch {
        // Storage can be blocked. The choice then lasts until reload.
      }
      onChange?.(current);
      return current;
    },
  };
}
