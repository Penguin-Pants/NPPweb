// Syntax highlighting languages (EDT-3, EDT-4, D5, T20). The language comes
// from the name extension unless the document has a manual override.
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
import { EditorView } from '@codemirror/view';

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

const PARSERS = {
  plain: () => [],
  markdown: () => markdown(),
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
 * Language id from the last name extension, case-insensitive. Unknown or
 * missing extensions give 'plain' (EDGE-9).
 * @param {string} name
 */
export function detectLanguage(name) {
  const extension = /\.([^./]+)$/.exec(name ?? '')?.[1].toLowerCase();
  return BY_EXTENSION.get(extension) ?? 'plain';
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
  return [PARSERS[known](), EditorView.contentAttributes.of({ 'data-language': known })];
}
