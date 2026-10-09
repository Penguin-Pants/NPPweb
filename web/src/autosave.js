// Autosave scheduler (BUILD_PLAN.md section 2.8). Pure: the save function
// is injected and timers are the global setTimeout, so tests can mock them.
// Status per document: 'saved', 'unsaved', 'saving' or 'error'.
// Reason for 'error': 'network', 'conflict', 'deleted' or 'too-large'.

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
 * @param {number} [options.debounceMs]
 */
export function createAutosave({ save, onStatus = () => {}, onEvent = () => {}, debounceMs = 1000 }) {
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
  }

  function schedule(doc, ms) {
    clearTimer(doc);
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
    if (doc.inFlight || !doc.dirty) return;
    if (!canSave(doc)) {
      settle(doc, false);
      return;
    }
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
        // Edits arrived during the save and no debounce is waiting: save again now.
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
      // Network failure, 5xx or anything unexpected: retry with backoff.
      fail(doc, 'network', null);
      schedule(doc, RETRY_DELAYS_MS[Math.min(doc.failures, RETRY_DELAYS_MS.length - 1)]);
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
      schedule(doc, debounceMs);
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

    status: (id) => docs.get(id)?.status,
    reason: (id) => docs.get(id)?.reason ?? null,
    version: (id) => docs.get(id)?.version,
    /** True while any document is unsaved, saving or in error (beforeunload). */
    hasUnsaved: () => [...docs.values()].some((doc) => doc.status !== 'saved'),
  };
}
