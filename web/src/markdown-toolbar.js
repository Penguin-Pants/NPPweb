// Formatting toolbar for Markdown tabs (MDV-9). It shows in both modes. Each
// button adds or removes Markdown marks through markdown-commands.js. The
// heading level is a dropdown menu, so it works from the keyboard (NFR-5).
import { createDropdown } from './dropdown.js';
import {
  insertLink,
  run,
  setHeading,
  toggleBold,
  toggleBulletList,
  toggleCodeBlock,
  toggleInlineCode,
  toggleItalic,
  toggleNumberedList,
  toggleQuote,
} from './markdown-commands.js';

const BUTTONS = [
  { label: 'B', name: 'Bold', key: 'B', command: toggleBold, className: 'md-bold' },
  { label: 'I', name: 'Italic', key: 'I', command: toggleItalic, className: 'md-italic' },
  { label: '• List', name: 'Bulleted list', command: toggleBulletList },
  { label: '1. List', name: 'Numbered list', command: toggleNumberedList },
  { label: 'Link', name: 'Link', key: 'K', command: insertLink },
  { label: 'Quote', name: 'Quote', command: toggleQuote },
  { label: 'Code', name: 'Inline code', command: toggleInlineCode },
  { label: 'Code block', name: 'Code block', command: toggleCodeBlock },
];

/**
 * @param {object} options
 * @param {HTMLElement} options.element The toolbar container.
 * @param {() => import('@codemirror/view').EditorView | null} options.getView The view when a tab is shown.
 * @param {string} options.modName "Ctrl" or "Cmd", for the tooltips.
 * @param {Document} [options.doc] Tests pass a fake.
 */
export function createToolbar({ element, getView, modName, doc = document }) {
  const apply = (command, ...args) => {
    const view = getView();
    if (!view) return;
    run(command, ...args)(view);
    view.focus();
  };

  // Keep the editor's focus and selection while a mouse button is down.
  const keepFocus = (button) => button.addEventListener('mousedown', (event) => event.preventDefault());

  const headingRoot = doc.createElement('span');
  headingRoot.className = 'menu';
  const headingButton = doc.createElement('button');
  headingButton.type = 'button';
  headingButton.textContent = 'Heading';
  headingButton.setAttribute('aria-expanded', 'false');
  const headingMenu = doc.createElement('div');
  headingMenu.className = 'menu-list heading-menu';
  headingMenu.setAttribute('aria-label', 'Heading level');
  headingMenu.hidden = true;
  const levels = ['Normal text', 'Heading 1', 'Heading 2', 'Heading 3', 'Heading 4', 'Heading 5', 'Heading 6'].map((label, level) => {
    const item = doc.createElement('button');
    item.type = 'button';
    item.textContent = label;
    keepFocus(item);
    item.addEventListener('click', () => {
      dropdown.close();
      apply(setHeading, level);
    });
    return item;
  });
  headingMenu.append(...levels);
  headingRoot.append(headingButton, headingMenu);
  keepFocus(headingButton);
  const dropdown = createDropdown({ root: headingRoot, button: headingButton, panel: headingMenu, items: () => levels, doc });

  const buttons = BUTTONS.map(({ label, name, key, command, className }) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', name);
    button.title = key ? `${name} (${modName}+${key})` : name;
    if (className) button.className = className;
    keepFocus(button);
    button.addEventListener('click', () => apply(command));
    return button;
  });
  element.append(headingRoot, ...buttons);
}
