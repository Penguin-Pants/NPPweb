// A choice between two values, stored per browser in localStorage: the
// Markdown mode (MDV-2) and whether counts include Markdown syntax (CNT-2).
// The first value is the default, also when storage is blocked or holds an
// unknown value.

/**
 * @template {string} T
 * @param {object} options
 * @param {() => Pick<Storage, 'getItem' | 'setItem'>} options.getStorage Throws or returns a storage that throws when blocked.
 * @param {string} options.key
 * @param {[T, T]} options.values
 * @param {(value: T) => void} [options.onChange]
 */
export function createStoredChoice({ getStorage, key, values, onChange }) {
  const [first, second] = values;
  let current = first;
  try {
    if (getStorage().getItem(key) === second) current = second;
  } catch {
    // Blocked storage: keep the default.
  }
  return {
    get: () => current,
    /** Switches to the other value. Returns the new value. */
    toggle() {
      current = current === first ? second : first;
      try {
        getStorage().setItem(key, current);
      } catch {
        // Storage can be blocked. The choice then lasts until reload.
      }
      onChange?.(current);
      return current;
    },
  };
}
