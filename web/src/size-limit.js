// Client side of the 1 MB limit (DOC-8, EDGE-3, T24): a CodeMirror
// transaction filter rejects a change that would make the document larger
// than 1,048,576 bytes of UTF-8.
import { EditorState } from '@codemirror/state';

export const LIMIT_BYTES = 1_048_576;

// A UTF-16 code unit is at most 3 UTF-8 bytes, so a document with at most
// this many code units cannot pass the limit and needs no measuring.
const SAFE_LENGTH = Math.floor(LIMIT_BYTES / 3);

/**
 * UTF-8 size of a string. A lone surrogate counts as U+FFFD (3 bytes), as
 * the browser encodes it when it sends the text.
 * @param {string} text
 */
export function utf8ByteLength(text) {
  let bytes = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
      const next = text.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else {
        bytes += 3;
      }
    } else bytes += 3;
  }
  return bytes;
}

// UTF-8 sizes of document parts. Versions of a document share their
// unchanged parts, so an edit measures only its new parts.
/** @type {WeakMap<import('@codemirror/state').Text, number>} */
const partBytes = new WeakMap();

/**
 * UTF-8 size of a document.
 * @param {import('@codemirror/state').Text} doc
 */
export function docBytes(doc) {
  let bytes = partBytes.get(doc);
  if (bytes !== undefined) return bytes;
  if (doc.children) {
    // Children hold whole lines, with one line break between two children.
    bytes = doc.children.length - 1;
    for (const child of doc.children) bytes += docBytes(child);
  } else {
    // A part holds whole lines, so a surrogate pair never spans two parts.
    bytes = utf8ByteLength(doc.sliceString(0));
  }
  partBytes.set(doc, bytes);
  return bytes;
}

/**
 * @param {() => void} onReject Runs when a change is rejected.
 * @returns {import('@codemirror/state').Extension}
 */
export function sizeLimit(onReject) {
  return EditorState.transactionFilter.of((tr) => {
    if (!tr.docChanged || tr.newDoc.length <= SAFE_LENGTH) return tr;
    const bytes = docBytes(tr.newDoc);
    // A change that makes an oversized document smaller is still allowed.
    if (bytes <= LIMIT_BYTES || bytes <= docBytes(tr.startState.doc)) return tr;
    onReject();
    return [];
  });
}
