// Syntax highlighting languages (EDT-3, EDT-4, D5, T20). The language comes
// from the name extension unless the document has a manual override.
// Markdown uses GitHub Flavored Markdown (MDV-4), highlights fenced code with
// the same 11 languages (MDV-11) and has the formatting keys (MDV-10).
import { css } from '@codemirror/lang-css';
import { html } from '@codemirror/lang-html';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { markdown } from '@codemirror/lang-markdown';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { yaml } from '@codemirror/lang-yaml';
import { StreamLanguage } from '@codemirror/language';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { Facet, Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { GFM } from '@lezer/markdown';
import { markdownKeymap } from './markdown-commands.js';

export const LANGUAGES = [
  { id: 'plain', label: 'Plain text' },
  { id: 'markdown', label: 'Markdown' },
  { id: 'json', label: 'JSON' },
  { id: 'html', label: 'HTML' },
  { id: 'css', label: 'CSS' },
  { id: 'javascript', label: 'JavaScript' },
  { id: 'typescript', label: 'TypeScript' },
  { id: 'python', label: 'Python' },
  { id: 'sql', label: 'SQL' },
  { id: 'yaml', label: 'YAML' },
  { id: 'shell', label: 'Shell' },
];

const IDS = new Set(LANGUAGES.map((entry) => entry.id));

const BY_EXTENSION = new Map([
  ['md', 'markdown'],
  ['markdown', 'markdown'],
  ['json', 'json'],
  ['html', 'html'],
  ['htm', 'html'],
  ['css', 'css'],
  ['js', 'javascript'],
  ['mjs', 'javascript'],
  ['cjs', 'javascript'],
  ['ts', 'typescript'],
  ['mts', 'typescript'],
  ['cts', 'typescript'],
  ['py', 'python'],
  ['sql', 'sql'],
  ['yaml', 'yaml'],
  ['yml', 'yaml'],
  ['sh', 'shell'],
  ['bash', 'shell'],
  ['zsh', 'shell'],
]);

/** The resolved language id of an editor state. Visual mode reads it. */
export const languageId = Facet.define({ combine: (values) => values[0] ?? 'plain' });

/** @type {Map<string, import('@codemirror/language').Language>} */
const codeLanguages = new Map();

/**
 * The parser for a fenced code block, from the first word of its info string:
 * a language id or one of its extensions. Others stay plain code text.
 * @param {string} info
 */
export function codeLanguage(info) {
  const word = info.trim().split(/\s+/, 1)[0].toLowerCase();
  const id = IDS.has(word) ? word : BY_EXTENSION.get(word);
  if (!id || id === 'plain') return null;
  if (!codeLanguages.has(id)) {
    // Markdown in a fence gets GFM without the editor keys. Its own fences stay plain.
    const support = id === 'markdown' ? markdown({ extensions: GFM }) : PARSERS[id]();
    codeLanguages.set(id, 'language' in support ? support.language : support);
  }
  return codeLanguages.get(id);
}

const PARSERS = {
  plain: () => [],
  markdown: () => [markdown({ extensions: GFM, codeLanguages: codeLanguage }), Prec.high(keymap.of(markdownKeymap))],
  json: () => json(),
  html: () => html(),
  css: () => css(),
  javascript: () => javascript(),
  typescript: () => javascript({ typescript: true }),
  python: () => python(),
  sql: () => sql(),
  yaml: () => yaml(),
  shell: () => StreamLanguage.define(shell),
};

/**
 * The last name extension as written, without the dot, or ''.
 * @param {string | null | undefined} name
 */
export const extensionOf = (name) => /\.([^./]+)$/.exec(name ?? '')?.[1] ?? '';

/**
 * Language id from the last name extension, case-insensitive. Unknown or
 * missing extensions give 'plain' (EDGE-9).
 * @param {string} name
 */
export function detectLanguage(name) {
  return BY_EXTENSION.get(extensionOf(name).toLowerCase()) ?? 'plain';
}

/**
 * @param {string} name
 * @param {string | null | undefined} override The stored manual choice.
 */
export function resolveLanguage(name, override) {
  return override && IDS.has(override) ? override : detectLanguage(name);
}

/**
 * The editor extension for a language: its parser plus data-language on the
 * content element, which tests read.
 * @param {string} id
 * @returns {import('@codemirror/state').Extension}
 */
export function languageSupport(id) {
  const known = IDS.has(id) ? id : 'plain';
  return [PARSERS[known](), languageId.of(known), EditorView.contentAttributes.of({ 'data-language': known })];
}
