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
  /** @type {{ from: number, button: HTMLElement }[]} */
  let entries = [];
  let current = null;

  function setMessage(text) {
    message.hidden = text === null;
    message.textContent = text ?? '';
  }

  return {
    /**
     * Shows headings, null for a tab that is not Markdown, or undefined for
     * no tab (OUT-6).
     * @param {{ level: number, text: string, from: number }[] | null | undefined} items
     */
    show(items) {
      current = null;
      entries = (items ?? []).map(({ level, text, from }) => {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = `outline-entry outline-l${level}`;
        button.textContent = text || '(empty heading)';
        button.addEventListener('click', () => onSelect(from));
        return { from, button };
      });
      list.replaceChildren(
        ...entries.map(({ button }) => {
          const item = doc.createElement('li');
          item.append(button);
          return item;
        }),
      );
      list.hidden = entries.length === 0;
      if (items === undefined) setMessage(null);
      else if (items === null) setMessage('Outline is available for Markdown documents.');
      else setMessage(items.length === 0 ? 'No headings.' : null);
    },

    /** Marks the entry of the section that holds `pos` (OUT-4). */
    setActive(pos) {
      let next = null;
      for (const entry of entries) {
        if (entry.from > pos) break;
        next = entry;
      }
      if (next === current) return;
      current?.button.removeAttribute('aria-current');
      next?.button.setAttribute('aria-current', 'location');
      current = next;
    },
  };
}

const plural = (count, word) => `${count.toLocaleString('en-US')} ${word}${count === 1 ? '' : 's'}`;

/** @param {{ words: number, characters: number }} counts */
export const formatCounts = ({ words, characters }) => `${plural(words, 'word')} · ${plural(characters, 'character')}`;
