// Export of the active tab (EXP-1 to EXP-7). The content comes from the
// editor state, so unsaved changes are in it (EXP-7). Each format downloads
// at once, except PDF, which opens the print dialog (EXP-5).
import { ensureSyntaxTree } from '@codemirror/language';
import { languageId } from './languages.js';
import { exportPage, markdownToHtml } from './markdown-html.js';
import { renderedText } from './markdown-text.js';

const EXTENSION = /\.([^./]+)$/;

/**
 * The formats a tab offers (EXP-2): Markdown gets md, txt, html and pdf.
 * Other types get their own extension and txt, or txt only.
 * @param {string} name
 * @param {string} language The resolved language id.
 * @returns {string[]}
 */
export function exportFormats(name, language) {
  if (language === 'markdown') return ['md', 'txt', 'html', 'pdf'];
  const extension = EXTENSION.exec(name)?.[1];
  return extension && extension.toLowerCase() !== 'txt' ? [extension, 'txt'] : ['txt'];
}

/**
 * The download name (EXP-6): the extension replaced or added, and characters
 * that file systems reject replaced by _.
 * @param {string} name
 * @param {string} extension
 */
export function exportFileName(name, extension) {
  const base = name.replace(EXTENSION, '') || name;
  return `${base.replace(/[<>:"/\\|?*\x00-\x1f\x7f]/g, '_')}.${extension}`;
}

const TYPES = { md: 'text/markdown', html: 'text/html' };

/**
 * The state's whole syntax tree. Export can wait for a parse, which takes
 * about half a second for 1 MB.
 * @param {import('@codemirror/state').EditorState} state
 */
export function fullTree(state) {
  const tree = ensureSyntaxTree(state, state.doc.length, 10_000);
  if (!tree) throw new Error('The document could not be read in time. Try again.');
  return tree;
}

/**
 * The file for one format of a tab (EXP-3, EXP-4). PDF uses the HTML page.
 * @param {object} options
 * @param {string} options.name The document name.
 * @param {string} options.format From exportFormats.
 * @param {import('@codemirror/state').EditorState} options.state The tab's editor state.
 * @param {Map<string, string>} [options.diagrams] Rendered Mermaid SVG by source.
 * @returns {{ fileName: string, type: string, content: string }}
 */
export function exportContent({ name, format, state, diagrams }) {
  const text = state.doc.toString();
  let content = text;
  if (format === 'txt' && state.facet(languageId) === 'markdown') content = renderedText(text, fullTree(state));
  else if (format === 'html' || format === 'pdf') content = exportPage(name, markdownToHtml(text, fullTree(state), { diagrams }));
  const extension = format === 'pdf' ? 'html' : format;
  return { fileName: exportFileName(name, extension), type: `${TYPES[extension] ?? 'text/plain'};charset=utf-8`, content };
}

/**
 * Downloads a file at once (EXP-1).
 * @param {{ fileName: string, type: string, content: string }} file
 */
export function download({ fileName, type, content }) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Opens the print dialog for an export page (EXP-5). The page loads in a
 * hidden frame, so its images load before the dialog. Cancel does nothing
 * (EDGE-24).
 * @param {string} html From exportContent.
 */
export function printPage(html) {
  document.getElementById('print-frame')?.remove();
  const frame = document.createElement('iframe');
  frame.id = 'print-frame';
  frame.className = 'print-frame';
  frame.setAttribute('aria-hidden', 'true');
  frame.tabIndex = -1;
  frame.addEventListener('load', () => frame.contentWindow?.print(), { once: true });
  frame.srcdoc = html;
  document.body.append(frame);
}
