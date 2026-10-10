// Outline panel on the left (LAY-2, LAY-5). Its open or closed state is
// stored per browser in localStorage key pn.outline. Open on the first visit.
export const OUTLINE_KEY = 'pn.outline';

/**
 * @param {object} options
 * @param {() => Pick<Storage, 'getItem' | 'setItem'>} options.getStorage Throws or returns a storage that throws when blocked.
 * @param {{ hidden: boolean }} options.panel
 * @param {Pick<HTMLElement, 'setAttribute' | 'addEventListener'>} options.toggle The button that opens and closes the panel.
 */
export function createOutlinePanel({ getStorage, panel, toggle }) {
  let open;
  try {
    open = getStorage().getItem(OUTLINE_KEY) !== 'closed';
  } catch {
    open = true;
  }

  function apply() {
    panel.hidden = !open;
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

  return { isOpen: () => open };
}
