// Outline of the active Markdown tab in the left panel (OUT-1 to OUT-6), and
// the count text for the status bar (CNT-1). The headings come from
// markdown-text.js, so the outline is the same in both modes (OUT-5).

/**
 * @param {object} options
 * @param {HTMLElement} options.element The panel body.
 * @param {(pos: number) => void} options.onSelect Moves the cursor to a heading (OUT-3).
 * @param {Document} [options.doc] Tests pass a fake.
 */
export function createOutline({ element, onSelect, doc = document }) {
  const message = doc.createElement('p');
  message.className = 'outline-message';
  const list = doc.createElement('ul');
  list.className = 'outline-list';
  element.append(message, list);
  /** @typedef {{ from: number, level: number, label: string, item: HTMLElement, button: HTMLElement }} Entry */
  /** @type {Entry[]} */
  const entries = [];
  /** @type {Entry | null} The entry of the section that holds the cursor. */
  let current = null;
  /** @type {Entry | null} The one entry in the tab order. */
  let stop = null;

  function setMessage(text) {
    message.hidden = text === null;
    message.textContent = text ?? '';
  }

  function setStop(entry) {
    if (entry === stop) return;
    stop?.button.setAttribute('tabindex', '-1');
    entry?.button.setAttribute('tabindex', '0');
    stop = entry;
  }

  function addEntry() {
    const item = doc.createElement('li');
    const button = doc.createElement('button');
    button.type = 'button';
    button.setAttribute('tabindex', '-1');
    item.append(button);
    list.append(item);
    /** @type {Entry} */
    const entry = { from: 0, level: 0, label: '', item, button };
    button.addEventListener('click', () => onSelect(entry.from));
    button.addEventListener('focus', () => setStop(entry));
    entries.push(entry);
    return entry;
  }

  // The list is one tab stop. The arrow keys, Home and End move between
  // entries, so a long outline does not fill the tab order (NFR-5).
  list.addEventListener('keydown', (event) => {
    const index = entries.indexOf(stop);
    const target = { ArrowDown: index + 1, ArrowUp: index - 1, Home: 0, End: entries.length - 1 }[event.key];
    if (target === undefined) return;
    event.preventDefault();
    entries[target]?.button.focus();
  });

  return {
    /**
     * Shows headings, null for a tab that is not Markdown, or undefined for
     * no tab (OUT-6). Entries are changed in place, so the focus stays and
     * the list does not flicker.
     * @param {{ level: number, text: string, from: number }[] | null | undefined} items
     */
    show(items) {
      const next = items ?? [];
      while (entries.length > next.length) {
        const entry = entries.pop();
        entry.item.remove();
        if (entry === current) current = null;
        if (entry === stop) stop = null;
      }
      next.forEach(({ level, text, from }, i) => {
        const entry = entries[i] ?? addEntry();
        entry.from = from;
        if (entry.level !== level) {
          entry.level = level;
          entry.button.className = `outline-entry outline-l${level}`;
        }
        const label = text || '(empty heading)';
        if (entry.label !== label) {
          entry.label = label;
          entry.button.textContent = label;
        }
      });
      if (!stop) setStop(current ?? entries[0] ?? null);
      list.hidden = entries.length === 0;
      if (items === undefined) setMessage(null);
      else if (items === null) setMessage('Outline is available for Markdown documents.');
      else setMessage(items.length === 0 ? 'No headings.' : null);
    },

    /**
     * Moves the entries with an edit, so they point at their headings until
     * the next show (OUT-3).
     * @param {(pos: number) => number} mapPos
     */
    map(mapPos) {
      for (const entry of entries) entry.from = mapPos(entry.from);
    },

    /** Marks the entry of the section that holds `pos` (OUT-4). */
    setActive(pos) {
      let next = null;
      for (const entry of entries) {
        if (entry.from > pos) break;
        next = entry;
      }
      if (next !== current) {
        current?.button.removeAttribute('aria-current');
        next?.button.setAttribute('aria-current', 'location');
        current = next;
      }
      // The tab stop follows the cursor while the focus is outside the list.
      if (!list.contains(doc.activeElement)) setStop(current ?? entries[0] ?? null);
    },
  };
}

const plural = (count, word) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;

/** @param {{ words: number, characters: number }} counts */
export const formatCounts = ({ words, characters }) => `${plural(words, 'word')} · ${plural(characters, 'character')}`;
