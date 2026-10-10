// Autosave scheduler (BUILD_PLAN.md section 2.8, REQUIREMENTS_V2.md SAV-1 to
// SAV-5). Pure: the save function is injected and timers are the global
// setTimeout and Date.now, so tests can mock them.
// Status per document: 'saved', 'unsaved', 'saving' or 'error'.
// Reason for 'error': 'network', 'conflict', 'deleted' or 'too-large'.
import { AUTOSAVE_DEFAULT_SECONDS } from '../../shared/contract.js';

const RETRY_DELAYS_MS = [2000, 4000, 8000, 16000, 30000];

/**
 * @typedef {{ status: number, data: any }} SaveResult
 * @typedef {(id: string, content: string, version: number) => Promise<SaveResult>} SaveFn
 */

/**
 * @param {object} options
 * @param {SaveFn} options.save
 * @param {(id: string, status: string) => void} [options.onStatus]
 * @param {(type: string, detail: object) => void} [options.onEvent] doc-saved, doc-conflict,
 *   doc-deleted-remote and doc-too-large.
 * @param {number} [options.delayMs] The autosave delay N (SAV-1). setDelay changes it later.
 */
export function createAutosave({ save, onStatus = () => {}, onEvent = () => {}, delayMs = AUTOSAVE_DEFAULT_SECONDS * 1000 }) {
  let delay = delayMs;
  /** @type {Map<string, any>} */
  const docs = new Map();
  // A 401 pauses every document until resumeAll (after re-login).
  let sessionPaused = false;

  function setStatus(doc, status, reason = null) {
    if (doc.status === status && doc.reason === reason) return;
    doc.status = status;
    doc.reason = reason;
    onStatus(doc.id, status);
  }

  function clearTimer(doc) {
    clearTimeout(doc.timer);
    doc.timer = null;
    doc.dueAt = null;
  }

  // dueAt is when the next save should start. It stays set when its timer
  // fires during a save in flight, so that save's reply starts the next one.
  function schedule(doc, ms) {
    clearTimer(doc);
    doc.dueAt = Date.now() + ms;
    doc.timer = setTimeout(() => {
      doc.timer = null;
      start(doc);
    }, ms);
  }

  function settle(doc, ok) {
    doc.flushRequested = false;
    for (const resolve of doc.waiters.splice(0)) resolve(ok);
  }

  // A held document waits for the user (conflict or deleted) or for new
  // content (too-large) before it saves again.
  const canSave = (doc) => !sessionPaused && doc.hold === null;

  function start(doc) {
    if (doc.inFlight) return;
    if (!doc.dirty) {
      doc.dueAt = null;
      return;
    }
    if (!canSave(doc)) {
      // The deadline is used up. An edit after the hold ends sets a new one.
      doc.dueAt = null;
      settle(doc, false);
      return;
    }
    clearTimer(doc);
    doc.dirty = false;
    setStatus(doc, 'saving');
    doc.inFlight = save(doc.id, doc.getContent(), doc.version).then((result) => {
      doc.inFlight = null;
      if (docs.get(doc.id) === doc) handle(doc, result);
    });
  }

  function fail(doc, reason, hold) {
    doc.dirty = true;
    doc.hold = hold;
    setStatus(doc, 'error', reason);
    settle(doc, false);
  }

  function handle(doc, { status, data }) {
    if (status === 200) {
      doc.version = data.version;
      doc.failures = 0;
      onEvent('doc-saved', { id: doc.id, version: doc.version });
      if (!doc.dirty) {
        setStatus(doc, 'saved');
        settle(doc, true);
      } else if (doc.flushRequested || doc.timer === null) {
        // Edits arrived during the save and their deadline passed (or a flush
        // asked for it): save again now.
        start(doc);
      } else {
        setStatus(doc, 'unsaved');
      }
      return;
    }
    if (status === 401) {
      sessionPaused = true;
      doc.dirty = true;
      setStatus(doc, 'unsaved');
      settle(doc, false);
    } else if (status === 412) {
      fail(doc, 'conflict', 'conflict');
      onEvent('doc-conflict', { id: doc.id, currentVersion: data?.currentVersion });
    } else if (status === 404) {
      fail(doc, 'deleted', 'deleted');
      onEvent('doc-deleted-remote', { id: doc.id });
    } else if (status === 413) {
      fail(doc, 'too-large', 'too-large');
      onEvent('doc-too-large', { id: doc.id });
    } else {
      // Network failure, 5xx or anything unexpected: retry with backoff. An
      // edit during the save may have set an earlier deadline, which stays.
      fail(doc, 'network', null);
      const retry = RETRY_DELAYS_MS[Math.min(doc.failures, RETRY_DELAYS_MS.length - 1)];
      if (doc.dueAt === null || doc.dueAt > Date.now() + retry) schedule(doc, retry);
      doc.failures += 1;
    }
  }

  return {
    /**
     * Starts (or restarts) tracking a document that is saved at `version`.
     * @param {string} id
     * @param {{ version: number, getContent: () => string }} options
     */
    track(id, { version, getContent }) {
      const old = docs.get(id);
      if (old) {
        // The old text was replaced, not saved.
        clearTimer(old);
        settle(old, false);
      }
      docs.set(id, {
        id,
        version,
        getContent,
        status: 'saved',
        reason: null,
        dirty: false,
        hold: null,
        failures: 0,
        timer: null,
        dueAt: null,
        inFlight: null,
        flushRequested: false,
        waiters: [],
      });
    },

    /** Stops tracking. A pending timer is cancelled. */
    untrack(id) {
      const doc = docs.get(id);
      if (!doc) return;
      clearTimer(doc);
      docs.delete(id);
      settle(doc, true);
    },

    /** Call after every content change. */
    edited(id) {
      const doc = docs.get(id);
      if (!doc) return;
      doc.dirty = true;
      if (doc.hold === 'too-large') doc.hold = null;
      if (doc.hold) return;
      setStatus(doc, 'unsaved');
      // SAV-1: save N seconds after the last edit, but no later than N seconds
      // after the first unsaved edit. The second bound always comes first, so
      // an edit keeps any earlier deadline (a pending save, one that passed
      // during a save in flight, or a retry) and else sets one N from now.
      if (doc.dueAt === null || doc.dueAt > Date.now() + delay) schedule(doc, delay);
    },

    /**
     * Sets the autosave delay (SAV-4). A pending save that is due later than
     * the new delay moves to it. Retries keep their backoff.
     * @param {number} ms
     */
    setDelay(ms) {
      delay = ms;
      for (const doc of docs.values()) {
        if (doc.timer !== null && doc.status !== 'error' && doc.dueAt > Date.now() + ms) schedule(doc, ms);
      }
    },

    /**
     * Saves now. Resolves true when everything is saved, false when the save
     * failed or the document is paused.
     * @returns {Promise<boolean>}
     */
    flush(id) {
      const doc = docs.get(id);
      if (!doc) return Promise.resolve(true);
      if (!doc.dirty && !doc.inFlight) return Promise.resolve(doc.status === 'saved');
      clearTimer(doc);
      doc.flushRequested = true;
      const done = new Promise((resolve) => doc.waiters.push(resolve));
      start(doc);
      return done;
    },

    /** Ends a 401 pause and saves every document with unsaved changes. */
    resumeAll() {
      sessionPaused = false;
      for (const doc of docs.values()) {
        if (doc.dirty && doc.hold === null) {
          clearTimer(doc);
          start(doc);
        }
      }
    },

    /**
     * Ends a conflict or deleted hold after the user chose to keep their text,
     * and saves it on top of `version`.
     * @param {string} id
     * @param {{ version: number }} options
     */
    resume(id, { version }) {
      const doc = docs.get(id);
      if (!doc) return Promise.resolve(false);
      doc.hold = null;
      doc.version = version;
      doc.dirty = true;
      return this.flush(id);
    },

    /** The tracked document ids (v3: the save before a workspace switch). */
    ids: () => [...docs.keys()],
    status: (id) => docs.get(id)?.status,
    reason: (id) => docs.get(id)?.reason ?? null,
    version: (id) => docs.get(id)?.version,
    /** True while any document is unsaved, saving or in error (beforeunload). */
    hasUnsaved: () => [...docs.values()].some((doc) => doc.status !== 'saved'),
  };
}
