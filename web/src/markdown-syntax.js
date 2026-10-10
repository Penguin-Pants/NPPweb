// Small Markdown helpers that Visual mode, the commands, export and the
// plain-text rules share: entities, link targets, reference definitions and
// fenced block languages.

import { characterEntities } from 'character-entities';

/**
 * The character for an entity such as &eacute; or &#65;, or null when it is
 * not one. Named entities are the full HTML list. Numeric ones follow
 * CommonMark: at most 7 decimal or 6 hex digits, and U+0000 or an invalid
 * code point becomes U+FFFD.
 * @param {string} entity
 */
export function decodeEntity(entity) {
  const body = entity.slice(1, -1);
  const hex = /^#x([0-9a-f]{1,6})$/i.exec(body)?.[1];
  const decimal = /^#(\d{1,7})$/.exec(body)?.[1];
  if (hex !== undefined || decimal !== undefined) {
    const value = hex !== undefined ? Number.parseInt(hex, 16) : Number.parseInt(decimal, 10);
    const valid = value > 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff);
    return valid ? String.fromCodePoint(value) : '\uFFFD';
  }
  return Object.hasOwn(characterEntities, body) ? characterEntities[body] : null;
}

/**
 * The URL a link opens: without angle brackets, backslash escapes and
 * entities. A bare e-mail address gets mailto:, and a www. or // address https:.
 * @param {string} raw
 */
export function linkTarget(raw) {
  let url = raw.trim();
  if (url.startsWith('<') && url.endsWith('>')) url = url.slice(1, -1);
  url = url.replace(/\\([!-/:-@[-`{-~])/g, '$1');
  url = url.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (entity) => decodeEntity(entity) ?? entity);
  if (/^www\./i.test(url)) return `https://${url}`;
  if (url.startsWith('//')) return `https:${url}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && /^[^\s@]+@[^\s@]+$/.test(url)) return `mailto:${url}`;
  return url;
}

/**
 * A reference label as CommonMark compares them: one space, and case folded.
 * Lower then upper case folds like Unicode case folding, so ẞ matches SS, as
 * the CommonMark reference code does.
 */
export const normalizeLabel = (label) =>
  label.replace(/^\[|\]$/g, '').trim().replace(/\s+/g, ' ').toLowerCase().toUpperCase();

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

/**
 * The first word of a fenced block's info string, in lower case, or ''.
 * @param {import('@lezer/common').SyntaxNode} node
 * @param {(from: number, to: number) => string} slice Reads the document text.
 */
export function fenceLanguage(node, slice) {
  const info = node.getChild('CodeInfo');
  return info ? slice(info.from, info.to).trim().split(/\s+/, 1)[0].toLowerCase() : '';
}

/**
 * A closed fenced block tagged mermaid at the top level, which Visual mode
 * draws as a diagram and export too (MDV-12, EXP-4). Blocks in quotes or
 * lists stay code. An unclosed block stays code, so it never hides the rest
 * of the document.
 * @param {import('@lezer/common').SyntaxNode} node
 * @param {(from: number, to: number) => string} slice Reads the document text.
 */
export function isDrawnMermaid(node, slice) {
  return (
    node.name === 'FencedCode' &&
    node.parent?.name === 'Document' &&
    node.getChildren('CodeMark').length > 1 &&
    fenceLanguage(node, slice) === 'mermaid'
  );
}
