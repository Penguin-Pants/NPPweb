// Dropdown menus (LAY-4): a button opens a panel under it. The panel closes on
// Escape, on a click outside and through close(). Arrow keys move the focus
// between its items. Clicks inside a modal dialog (for example a rename
// dialog opened from the panel) leave it open. Such a dialog can close, or a
// list can re-render, before the click reaches the document, so a target in
// any dialog or no longer in the page does not count as outside.

/**
 * @param {object} options
 * @param {HTMLElement} options.root Holds the button and the panel.
 * @param {HTMLButtonElement} options.button
 * @param {HTMLElement} options.panel
 * @param {() => HTMLElement[]} options.items The focusable items, in order.
 * @param {() => void | Promise<void>} [options.onOpen] Runs on each open. Arrow-key opens wait for it.
 */
export function createDropdown({ root, button, panel, items, onOpen }) {
  const isOpen = () => !panel.hidden;
  const ignored = (target) => !(target instanceof Element) || !target.isConnected || target.closest('dialog') !== null;

  function setOpen(open) {
    panel.hidden = !open;
    button.setAttribute('aria-expanded', String(open));
    return open ? onOpen?.() : undefined;
  }

  function moveFocus(step) {
    const list = items();
    if (list.length === 0) return;
    const index = list.indexOf(/** @type {HTMLElement} */ (document.activeElement));
    const next = index === -1 ? (step > 0 ? 0 : list.length - 1) : (index + step + list.length) % list.length;
    list[next].focus();
  }

  button.addEventListener('click', () => setOpen(!isOpen()));

  document.addEventListener('click', (event) => {
    if (isOpen() && !root.contains(/** @type {Node} */ (event.target)) && !ignored(event.target)) setOpen(false);
  });

  root.addEventListener('keydown', async (event) => {
    if (event.key === 'Escape' && isOpen()) {
      event.preventDefault();
      setOpen(false);
      button.focus();
    } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!isOpen()) await setOpen(true);
      moveFocus(event.key === 'ArrowDown' ? 1 : -1);
    }
  });

  return {
    open: () => setOpen(true),
    close: () => setOpen(false),
    isOpen,
  };
}
