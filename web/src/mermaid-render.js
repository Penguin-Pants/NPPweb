// Mermaid diagrams (MDV-12, MDV-13). Mermaid runs in a hidden frame
// (mermaid-frame.js) that loads on first use. The frame's CSP blocks every
// network load, so nothing in a diagram loads while Mermaid draws and
// measures it. The page shows the result as an SVG image, which browsers
// never let load anything either (MDV-14).

/**
 * The Mermaid settings for a theme. Mermaid 12 lays out with ELK by default,
 * which is not shipped (C6), so dagre is set. A diagram's own settings
 * (directive or front matter) cannot change the keys in `secure`.
 * @param {'dark' | 'light'} theme
 */
export const mermaidConfig = (theme) => ({
  startOnLoad: false,
  securityLevel: 'strict',
  layout: 'dagre',
  theme: theme === 'dark' ? 'dark' : 'default',
  suppressErrorRendering: true,
  secure: ['secure', 'securityLevel', 'startOnLoad', 'maxTextSize', 'suppressErrorRendering', 'maxEdges', 'layout'],
});

/** @typedef {{ svg: string, width: number, height: number } | { error: string }} Result */
/** @typedef {(source: string, config: object) => Promise<Result>} Draw */

const LOAD_ERROR = 'Could not load the diagram tool. It tries again when the diagram shows again.';

/**
 * Renders diagrams one at a time, because Mermaid has one global
 * configuration. Results are kept per source and theme, the most recent
 * `limit` of them. A failed load is not kept, so the next render loads again.
 * @param {object} options
 * @param {() => Promise<Draw>} options.load
 * @param {number} [options.limit]
 */
export function createRenderer({ load, limit = 32 }) {
  /** @type {Promise<Draw> | null} */
  let loading = null;
  let queue = Promise.resolve();
  /** @type {Map<string, { result: Promise<Result | null>, wanted: (() => boolean)[], value?: Result }>} */
  const entries = new Map();

  function keep(key, entry) {
    entries.delete(key);
    entries.set(key, entry);
    while (entries.size > limit) entries.delete(entries.keys().next().value);
  }

  /**
   * Resolves with the result, or with null when nobody wanted it any more
   * at its turn.
   * @param {string} source
   * @param {'dark' | 'light'} theme
   * @param {() => boolean} [isWanted]
   * @returns {Promise<Result | null>}
   */
  function render(source, theme, isWanted = () => true) {
    const key = `${theme}\n${source}`;
    let entry = entries.get(key);
    if (entry) {
      entry.wanted.push(isWanted);
      keep(key, entry);
      return entry.result;
    }
    entry = { result: Promise.resolve(null), wanted: [isWanted] };
    const own = entry;
    entry.result = queue.then(async () => {
      if (!own.wanted.some((wanted) => wanted())) {
        if (entries.get(key) === own) entries.delete(key);
        return null;
      }
      let result;
      try {
        const draw = await (loading ??= load());
        result = await draw(source, mermaidConfig(theme));
      } catch {
        // The tool did not load, or its frame went away. Load it again next time.
        loading = null;
        if (entries.get(key) === own) entries.delete(key);
        return { error: LOAD_ERROR };
      }
      own.value = 'error' in result ? { error: `Diagram error: ${result.error}` } : result;
      return own.value;
    });
    queue = entry.result.then(() => undefined);
    keep(key, entry);
    return entry.result;
  }

  /** The kept result, or undefined while there is none yet. */
  const peek = (source, theme) => entries.get(`${theme}\n${source}`)?.value;

  return { render, peek };
}

// The frame's own CSP. The page's CSP applies too.
const FRAME_CSP = "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; img-src data:; font-src data:";

/**
 * Adds the hidden frame and resolves with its draw function. Rejects when
 * its script did not load, for example after the session ended.
 * @returns {Promise<Draw>}
 */
function loadFrame() {
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.className = 'mermaid-frame';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    const script = new URL('mermaid-frame.js', import.meta.url).href;
    frame.srcdoc = `<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}"><script type="module" src="${script}"></script>`;
    frame.addEventListener(
      'load',
      () => {
        const draw = frame.contentWindow?.drawDiagram;
        if (typeof draw === 'function') resolve(draw);
        else {
          frame.remove();
          reject(new Error('The diagram frame did not load.'));
        }
      },
      { once: true },
    );
    document.body.append(frame);
  });
}

/** Renders diagrams for the page (MDV-12, EDGE-15). */
export const mermaidRenderer = createRenderer({ load: loadFrame });
