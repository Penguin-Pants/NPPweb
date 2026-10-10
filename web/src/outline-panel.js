// Outline panel on the left (LAY-2, LAY-5). Its open or closed state is
// stored per browser in localStorage key pn.outline and shown as
// data-outline on <html>, which the CSS reads. Open on the first visit.
// theme-init.js applies it before first paint, so a closed panel never shows.
import { createStoredChoice } from './stored-choice.js';

/** @type {{ key: string, values: ['open', 'closed'] }} */
export const OUTLINE = { key: 'pn.outline', values: ['open', 'closed'] };

/**
 * @param {object} options
 * @param {() => Pick<Storage, 'getItem' | 'setItem'>} options.getStorage
 * @param {{ dataset: Record<string, string> }} options.root Usually document.documentElement.
 * @param {Pick<HTMLElement, 'setAttribute' | 'addEventListener'>} options.toggle The button that opens and closes the panel.
 */
export function createOutlinePanel({ getStorage, root, toggle }) {
  const apply = (value) => {
    root.dataset.outline = value;
    toggle.setAttribute('aria-expanded', String(value === 'open'));
  };
  const panel = createStoredChoice({ getStorage, ...OUTLINE, onChange: apply });
  toggle.addEventListener('click', () => panel.toggle());
  apply(panel.get());
}
