// Outline panel on the left (LAY-2, LAY-5). Its open or closed state is
// stored per browser in localStorage key pn.outline and shown as
// data-outline on <html>, which the CSS reads. Open on the first visit.
// theme-init.js applies it before first paint, so a closed panel never shows.
const OUTLINE_KEY = 'pn.outline';

/**
 * @param {() => Pick<Storage, 'getItem'>} getStorage Throws or returns a storage that throws when blocked.
 */
export function readOutlineOpen(getStorage) {
  try {
    return getStorage().getItem(OUTLINE_KEY) !== 'closed';
  } catch {
    return true;
  }
}

/**
 * @param {object} options
 * @param {() => Pick<Storage, 'getItem' | 'setItem'>} options.getStorage
 * @param {{ dataset: Record<string, string> }} options.root Usually document.documentElement.
 * @param {Pick<HTMLElement, 'setAttribute' | 'addEventListener'>} options.toggle The button that opens and closes the panel.
 */
export function createOutlinePanel({ getStorage, root, toggle }) {
  let open = readOutlineOpen(getStorage);

  function apply() {
    root.dataset.outline = open ? 'open' : 'closed';
    toggle.setAttribute('aria-expanded', String(open));
  }

  toggle.addEventListener('click', () => {
    open = !open;
    apply();
    try {
      getStorage().setItem(OUTLINE_KEY, open ? 'open' : 'closed');
    } catch {
      // Storage can be blocked. The state then lasts until reload.
    }
  });
  apply();
}
