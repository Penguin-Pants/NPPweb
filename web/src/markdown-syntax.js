// Small Markdown helpers that Visual mode, the commands and the plain-text
// rules share: fences, entities, link targets and reference definitions.

/** A line that opens or closes a fenced code block. */
export const FENCE = /^\s*(```|~~~)/;

const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', copy: '©', reg: '®', trade: '™',
  hellip: '…', mdash: '—', ndash: '–', lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', laquo: '«',
  raquo: '»', deg: '°', euro: '€', pound: '£', times: '×',
};

/**
 * The character for an entity such as &amp; or &#65;, or null for an
 * unknown one.
 * @param {string} entity
 */
export function decodeEntity(entity) {
  const body = entity.slice(1, -1);
  const hex = /^#x([0-9a-f]+)$/i.exec(body)?.[1];
  const decimal = /^#(\d+)$/.exec(body)?.[1];
  if (hex !== undefined || decimal !== undefined) {
    const value = hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(decimal, 10);
    return value > 0 && value <= 0x10ffff ? String.fromCodePoint(value) : null;
  }
  return ENTITIES[body] ?? null;
}

/**
 * The URL a link opens: without angle brackets, backslash escapes and
 * entities. A bare e-mail address gets mailto: and a www. address https://.
 * @param {string} raw
 */
export function linkTarget(raw) {
  let url = raw.trim();
  if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1);
  url = url.replace(/\\([!-/:-@[-`{-~])/g, '$1');
  url = url.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity) => decodeEntity(entity) ?? entity);
  if (/^www\./i.test(url)) return `https://${url}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && /^[^\s@]+@[^\s@]+$/.test(url)) return `mailto:${url}`;
  return url;
}

/** A reference label as CommonMark compares them: no case, one space. */
export const normalizeLabel = (label) => label.replace(/^\[|\]$/g, '').trim().replace(/\s+/g, ' ').toLowerCase();

const CONTAINERS = new Set(['Document', 'Blockquote', 'BulletList', 'OrderedList', 'ListItem']);
/** @type {WeakMap<import('@lezer/common').Tree, Map<string, string>>} */
const definitionCache = new WeakMap();

/**
 * Link reference definitions ([label]: url) by normalized label. The first
 * one wins. Only block containers are walked, so it is quick on long
 * documents, and the result is cached per tree.
 * @param {import('@lezer/common').Tree} tree
 * @param {(from: number, to: number) => string} slice Reads the document text.
 */
export function referenceDefinitions(tree, slice) {
  const cached = definitionCache.get(tree);
  if (cached) return cached;
  const defs = new Map();
  tree.iterate({
    enter({ name, node }) {
      if (name === 'LinkReference') {
        const label = node.getChild('LinkLabel');
        const url = node.getChild('URL');
        if (label && url) {
          const key = normalizeLabel(slice(label.from, label.to));
          if (!defs.has(key)) defs.set(key, linkTarget(slice(url.from, url.to)));
        }
        return false;
      }
      return CONTAINERS.has(name);
    },
  });
  definitionCache.set(tree, defs);
  return defs;
}
