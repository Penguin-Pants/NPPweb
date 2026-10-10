// Formatting toolbar for Markdown tabs (MDV-9). It shows in both modes. Each
// button adds or removes Markdown marks through markdown-commands.js.
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

  const option = (label, value) => {
    const node = doc.createElement('option');
    node.textContent = label;
    node.value = value;
    return node;
  };
  const heading = doc.createElement('select');
  heading.setAttribute('aria-label', 'Heading level');
  heading.append(option('Heading', ''), option('Normal text', '0'));
  for (let level = 1; level <= 6; level += 1) heading.append(option(`Heading ${level}`, String(level)));
  heading.addEventListener('change', () => {
    if (heading.value !== '') apply(setHeading, Number(heading.value));
    heading.value = '';
  });

  const buttons = BUTTONS.map(({ label, name, key, command, className }) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.textContent = label;
    button.setAttribute('aria-label', name);
    button.title = key ? `${name} (${modName}+${key})` : name;
    if (className) button.className = className;
    // Keep the editor's focus and selection while the button is pressed.
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', () => apply(command));
    return button;
  });
  element.append(heading, ...buttons);
}
