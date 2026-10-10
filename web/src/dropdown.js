// Dropdown menus (LAY-4): a button opens a panel under it. One dropdown is
// open at a time. The panel closes on Escape, on a press outside and through
// close(). Arrow keys move the focus between its items. Presses and keys in a
// modal dialog (for example a rename dialog opened from the panel) leave it
// open. Outside presses are read on pointerdown in the capture phase, before
// any click handler opens the panel or re-renders the target.

const FOLLOWING = 4; // Node.DOCUMENT_POSITION_FOLLOWING

/** @type {(() => void) | null} Closes the dropdown that is open now. */
let closeCurrent = null;

/**
 * @param {object} options
 * @param {HTMLElement} options.root Holds the button and the panel.
 * @param {HTMLButtonElement} options.button
 * @param {HTMLElement} options.panel
 * @param {() => HTMLElement[]} options.items The focusable items, in order.
 * @param {() => void | Promise<void>} [options.onOpen] Runs on each open. Arrow-key opens wait for it.
 * @param {Document} [options.doc] Tests pass a fake.
 */
export function createDropdown({ root, button, panel, items, onOpen, doc = document }) {
  const isOpen = () => !panel.hidden;
  const inDialog = (target) => typeof target?.closest === 'function' && target.closest('dialog') !== null;

  function close() {
    panel.hidden = true;
    button.setAttribute('aria-expanded', 'false');
    if (closeCurrent === close) closeCurrent = null;
  }

  function open() {
    if (closeCurrent && closeCurrent !== close) closeCurrent();
    closeCurrent = close;
    panel.hidden = false;
    button.setAttribute('aria-expanded', 'true');
    return onOpen?.();
  }

  // From an item, go to the next or previous one. From another control in
  // the panel (a Rename or Delete button), go to the next item after it or
  // the last item before it.
  function moveFocus(step) {
    const list = items();
    if (list.length === 0) return;
    const active = /** @type {HTMLElement} */ (doc.activeElement);
    const index = list.indexOf(active);
    let next;
    if (index !== -1) {
      next = (index + step + list.length) % list.length;
    } else {
      const after = list.findIndex((item) => (active?.compareDocumentPosition?.(item) ?? 0) & FOLLOWING);
      if (step > 0) next = after === -1 ? 0 : after;
      else next = after <= 0 ? list.length - 1 : after - 1;
    }
    list[next].focus();
  }

  button.addEventListener('click', () => (isOpen() ? close() : open()));

  doc.addEventListener(
    'pointerdown',
    (event) => {
      if (isOpen() && !root.contains(event.target) && !inDialog(event.target)) close();
    },
    true,
  );

  // Escape works wherever the focus is, because a list refresh or a delete
  // can move it out of the panel. The focus returns to the button only when
  // it was in the panel or nowhere.
  doc.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || !isOpen() || inDialog(event.target)) return;
    event.preventDefault();
    const active = doc.activeElement;
    close();
    if (active === null || active === doc.body || root.contains(active)) button.focus();
  });

  root.addEventListener('keydown', async (event) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    if (!isOpen()) await open();
    moveFocus(event.key === 'ArrowDown' ? 1 : -1);
  });

  return { open, close, isOpen };
}
