// Autosave scheduler (BUILD_PLAN.md section 2.8). Pure: the save function
// is injected and timers are the global setTimeout, so tests can mock them.
// Status per document: 'saved', 'unsaved', 'saving' or 'error'.

/**
 * @typedef {{ status: number, data: any }} SaveResult
 * @typedef {(id: string, content: string, version: number) => Promise<SaveResult>} SaveFn
 */

/**
 * @param {object} options
 * @param {SaveFn} options.save
 * @param {(id: string, status: string) => void} [options.onStatus]
 * @param {number} [options.debounceMs]
 */
export function createAutosave({ save, onStatus = () => {}, debounceMs = 1000 }) {
  /** @type {Map<string, any>} */
  const docs = new Map();

  function setStatus(doc, status) {
    if (doc.status === status) return;
    doc.status = status;
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

  function start(doc) {
    if (doc.inFlight || !doc.dirty) return;
    doc.dirty = false;
    setStatus(doc, 'saving');
    doc.inFlight = save(doc.id, doc.getContent(), doc.version).then((result) => {
      doc.inFlight = null;
      if (docs.get(doc.id) === doc) handle(doc, result);
    });
  }

  function handle(doc, result) {
    if (result.status !== 200) {
      doc.dirty = true;
      setStatus(doc, 'error');
      settle(doc, false);
      return;
    }
    doc.version = result.data.version;
    if (!doc.dirty) {
      setStatus(doc, 'saved');
      settle(doc, true);
    } else if (doc.flushRequested || doc.timer === null) {
      // Edits arrived during the save and no debounce is waiting: save again now.
      start(doc);
    } else {
      setStatus(doc, 'unsaved');
    }
  }

  return {
    /**
     * Starts tracking a document that is saved at `version`.
     * @param {string} id
     * @param {{ version: number, getContent: () => string }} options
     */
    track(id, { version, getContent }) {
      docs.set(id, {
        id,
        version,
        getContent,
        status: 'saved',
        dirty: false,
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
      setStatus(doc, 'unsaved');
      schedule(doc, debounceMs);
    },

    /**
     * Saves now. Resolves true when everything is saved, false when a save failed.
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

    status: (id) => docs.get(id)?.status,
    version: (id) => docs.get(id)?.version,
  };
}
