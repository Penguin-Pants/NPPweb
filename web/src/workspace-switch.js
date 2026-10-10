// The workspace switch (v3 TD-33) and the lock that keeps a switch, a drop
// and a move apart (TD-42). No text is lost: the tabs close only after every
// document saved, in one synchronous step with the workspace change.
import { WORKSPACE_NAMES } from './workspace.js';

const ROUNDS = 3;

/**
 * Runs one named operation at a time. While one runs, another shows a wait
 * message and does nothing.
 * @param {(text: string) => void} showMessage
 */
export function createExclusive(showMessage) {
  /** @type {string | null} */
  let running = null;
  /**
   * @template T
   * @param {string} name For the message, for example "drop".
   * @param {() => Promise<T>} fn
   * @returns {Promise<T | undefined>} undefined when another operation runs.
   */
  return async function exclusive(name, fn) {
    if (running !== null) {
      showMessage(`Wait until the ${running} ends, then try again.`);
      return undefined;
    }
    running = name;
    try {
      return await fn();
    } finally {
      running = null;
    }
  };
}

/**
 * @typedef {{ ok: true } | { ok: false, reason: 'conflict' | 'network' | 'session' | 'too-large' | 'changing' }} SaveAllResult
 */

/**
 * Saves every tracked document. Repeats while text is still unsaved and the
 * last round saved (text typed during a round), at most 3 rounds.
 * @param {Pick<ReturnType<typeof import('./autosave.js').createAutosave>, 'ids' | 'flush' | 'hasUnsaved' | 'status' | 'reason'>} autosave
 * @returns {Promise<SaveAllResult>} ok only when nothing is unsaved.
 */
export async function saveAll(autosave) {
  for (let round = 0; round < ROUNDS; round += 1) {
    const results = await Promise.all(autosave.ids().map((id) => autosave.flush(id)));
    if (!autosave.hasUnsaved()) return { ok: true };
    if (results.includes(false)) return { ok: false, reason: failureReason(autosave) };
  }
  return { ok: false, reason: 'changing' };
}

// A conflict or a delete has its own dialog (CON-1, EDGE-1). A 401 pauses a
// document as unsaved with no reason, and the sign-in dialog opens (EDGE-4).
function failureReason(autosave) {
  const reasons = new Set(autosave.ids().map((id) => autosave.reason(id)));
  if (reasons.has('conflict') || reasons.has('deleted')) return 'conflict';
  if (reasons.has('too-large')) return 'too-large';
  if (reasons.has('network')) return 'network';
  return 'session';
}

const CAUSES = {
  network: 'the server cannot be reached',
  session: 'your session ended',
  'too-large': 'a document is larger than 1 MB',
};

/** @param {SaveAllResult & { ok: false }} result @param {(text: string) => void} showMessage */
function reportSaveFailure({ reason }, showMessage) {
  if (reason === 'conflict') return; // The CON-1 or EDGE-1 dialog explains it (EDGE-29).
  if (reason === 'changing') showMessage('Text is still changing. Try the switch again.');
  else showMessage(`Unsaved changes could not be saved: ${CAUSES[reason]}. The workspace did not change.`);
}

/**
 * Switches to `target` (WS-7, WS-8, EDGE-28 to EDGE-30):
 * 1. Save everything. A failure keeps the workspace.
 * 2. Read the target list. A failure keeps the workspace. All text is saved.
 * 3. Save again, for text typed during step 2.
 * 4. With nothing unsaved, in one synchronous step: close the tabs, apply the
 *    workspace and start the target tabs from the list.
 * @param {object} deps
 * @param {'personal' | 'work'} deps.target
 * @param {Parameters<typeof saveAll>[0]} deps.autosave
 * @param {{ listDocuments: (target: 'personal' | 'work') => Promise<{ status: number, data: any }> }} deps.api
 * @param {{ closeAllSaved: () => void, boot: (options: { list: any[] }) => Promise<void> }} deps.tabs
 * @param {(target: 'personal' | 'work') => void} deps.apply Stores and shows the workspace and points the API at it.
 * @param {(text: string) => void} deps.showMessage
 * @returns {Promise<boolean>} true when the workspace changed.
 */
export async function switchWorkspace({ target, autosave, api, tabs, apply, showMessage }) {
  const first = await saveAll(autosave);
  if (!first.ok) {
    reportSaveFailure(first, showMessage);
    return false;
  }
  const list = await api.listDocuments(target);
  if (list.status !== 200) {
    showMessage(`Could not open the ${WORKSPACE_NAMES[target]} documents. Try again.`);
    return false;
  }
  const second = await saveAll(autosave);
  if (!second.ok) {
    reportSaveFailure(second, showMessage);
    return false;
  }
  // saveAll is ok only when nothing is unsaved, and only microtasks run from
  // that check to here: no keystroke can land in a tab that then closes.
  tabs.closeAllSaved();
  apply(target);
  await tabs.boot({ list: list.data });
  return true;
}
