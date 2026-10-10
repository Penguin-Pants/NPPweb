// Open files by dropping them on the page (DRP-1 to DRP-6, EDGE-10 to
// EDGE-14). Each accepted file becomes a new server document named as the
// file, and opens in a new tab. A drag of text inside the editor is not a
// file drag, so the editor keeps its own behavior (DRP-5).
import { LIMIT_BYTES } from './size-limit.js';

const ACCEPTED = /\.(md|markdown|txt|html|htm)$/i;

/**
 * The name, or the first free "name (n).ext" when another document has it
 * (DRP-2). `taken` holds the names in lower case.
 * @param {string} name
 * @param {Set<string>} taken
 */
export function uniqueName(name, taken) {
  if (!taken.has(name.toLowerCase())) return name;
  const [, base, extension = ''] = /^(.+?)(\.[^./]+)?$/.exec(name);
  for (let n = 2; ; n += 1) {
    const candidate = `${base} (${n})${extension}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
}

/**
 * The text of a dropped file, or why it is rejected. Line breaks become LF
 * and a UTF-8 byte order mark goes (DRP-6).
 * @param {{ name: string, bytes: Uint8Array }} file
 * @returns {{ text: string } | { error: string }}
 */
export function droppedText({ name, bytes }) {
  if (!ACCEPTED.test(name)) return { error: 'only .md, .txt and .html files' };
  if (bytes.length > LIMIT_BYTES) return { error: 'larger than 1 MB' };
  try {
    // The decoder drops a byte order mark, and fatal rejects invalid UTF-8.
    return { text: new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/\r\n?/g, '\n') };
  } catch {
    return { error: 'not UTF-8 text' };
  }
}

/**
 * Reads a dropped File, without reading one that is too large (EDGE-10). A
 * folder or a file that moved away cannot be read.
 */
async function readFile(file) {
  if (!ACCEPTED.test(file.name)) return droppedText({ name: file.name, bytes: new Uint8Array() });
  if (file.size > LIMIT_BYTES) return { error: 'larger than 1 MB' };
  let bytes;
  try {
    bytes = new Uint8Array(await file.arrayBuffer());
  } catch {
    return { error: 'could not be read' };
  }
  return droppedText({ name: file.name, bytes });
}

const CANNOT_REACH = 'Could not open the dropped files. Check the connection or sign in, then drop them again.';

/**
 * Creates and opens the dropped files in drop order, so the last one is the
 * active tab (DRP-4). Rejected files are named in one message. When the
 * server cannot be reached or the session ended, the rest is not created
 * (EDGE-14).
 * @param {object} options
 * @param {File[]} options.files
 * @param {Pick<import('./api.js').api, 'listDocuments' | 'createDocument'>} options.api
 * @param {(meta: object, text: string) => Promise<void>} options.open Opens a created document in a new tab.
 * @param {(text: string) => void} options.showMessage
 */
export async function openDropped({ files, api, open, showMessage }) {
  const list = await api.listDocuments();
  if (list.status !== 200) {
    showMessage(CANNOT_REACH);
    return;
  }
  const taken = new Set(list.data.map((doc) => doc.name.toLowerCase()));
  const rejected = [];
  for (const file of files) {
    const read = await readFile(file);
    if ('error' in read) {
      rejected.push(`${file.name} (${read.error})`);
      continue;
    }
    const name = uniqueName(file.name, taken);
    const { status, data } = await api.createDocument(read.text, name);
    if (status === 0 || status === 401) {
      showMessage(CANNOT_REACH);
      return;
    }
    if (status !== 201) {
      rejected.push(`${file.name} (${status === 413 ? 'larger than 1 MB' : 'not accepted by the server'})`);
      continue;
    }
    taken.add(name.toLowerCase());
    await open(data, read.text);
  }
  if (rejected.length > 0) showMessage(`Not opened: ${rejected.join(', ')}.`);
}

const isFileDrag = (event) => [...(event.dataTransfer?.types ?? [])].includes('Files');

/**
 * Shows the overlay while files are dragged over the page and hands dropped
 * files to `onFiles` (DRP-5). Other drags, such as text inside the editor,
 * pass through. While a modal dialog is open, files cannot be dropped, so
 * nothing opens behind it. A file drag is still stopped there, so the
 * browser never opens the file in place of the app.
 * @param {object} options
 * @param {Window} options.win
 * @param {HTMLElement} options.overlay Covers the page while shown.
 * @param {(files: File[]) => void} options.onFiles
 */
export function setupDrop({ win, overlay, onFiles }) {
  let timer = 0;
  const hide = () => {
    win.clearTimeout(timer);
    overlay.hidden = true;
  };
  const inDialog = () => win.document.querySelector('dialog:modal') !== null;
  // dragover repeats while a drag moves over the page. A drag that leaves
  // the window or is cancelled can end with no event at all, so the overlay
  // goes 1 second after the last dragover. The next dragover shows it again.
  const show = (event) => {
    if (!isFileDrag(event) || inDialog()) return;
    overlay.hidden = false;
    win.clearTimeout(timer);
    timer = win.setTimeout(hide, 1000);
  };
  win.addEventListener('dragenter', show, true);
  win.addEventListener(
    'dragover',
    (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = inDialog() ? 'none' : 'copy';
      show(event);
    },
    true,
  );
  // Capture phase, so the editor never inserts a dropped file as text.
  win.addEventListener(
    'drop',
    (event) => {
      if (!isFileDrag(event)) return;
      event.preventDefault();
      event.stopPropagation();
      hide();
      if (!inDialog()) onFiles([...event.dataTransfer.files]);
    },
    true,
  );
}
