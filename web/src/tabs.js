// Open tabs (section 2.8, T17). Tabs persist per browser in localStorage
// (pn.openTabs.v1). Content loads on first activation. Clean tabs refresh
// from the server on window focus and on tab activation (TD-15).

const STORAGE_KEY = 'pn.openTabs.v1';

/**
 * @param {() => Pick<Storage, 'getItem'>} getStorage
 * @returns {{ ids: string[], activeId: string | null }}
 */
export function readOpenTabs(getStorage) {
  try {
    const parsed = JSON.parse(getStorage().getItem(STORAGE_KEY) ?? 'null');
    if (!Array.isArray(parsed?.ids)) return { ids: [], activeId: null };
    const ids = [...new Set(parsed.ids.filter((id) => typeof id === 'string'))];
    return { ids, activeId: ids.includes(parsed.activeId) ? parsed.activeId : null };
  } catch {
    return { ids: [], activeId: null };
  }
}

/**
 * @param {() => Pick<Storage, 'setItem'>} getStorage
 * @param {{ ids: string[], activeId: string | null }} state
 */
export function writeOpenTabs(getStorage, state) {
  try {
    getStorage().setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage can be blocked. Tabs then last until reload.
  }
}

/**
 * Decides what a refresh does (TD-15). Only clean tabs change: a dirty tab
 * keeps its text, and its next save reports the conflict or the delete.
 * @param {{ id: string, loaded: boolean, clean: boolean, version: number | null }[]} tabs
 * @param {import('./api.js').DocumentMeta[]} list
 */
export function planRefresh(tabs, list) {
  const byId = new Map(list.map((doc) => [doc.id, doc]));
  const remove = [];
  const reload = [];
  const meta = new Map();
  for (const tab of tabs) {
    const doc = byId.get(tab.id);
    if (!doc) {
      if (tab.clean) remove.push(tab.id);
      continue;
    }
    meta.set(tab.id, doc);
    if (tab.loaded && tab.clean && doc.version > tab.version) reload.push(tab.id);
  }
  return { remove, reload, meta };
}

/**
 * @typedef {object} Tab
 * @property {string} id
 * @property {string} name
 * @property {string | null} language Manual override, null = auto.
 * @property {import('@codemirror/state').EditorState | null} state Null until loaded.
 */

/**
 * @param {object} deps
 * @param {ReturnType<typeof import('./editor.js').createEditor>} deps.editor
 * @param {ReturnType<typeof import('./autosave.js').createAutosave>} deps.autosave
 * @param {typeof import('./api.js').api} deps.api
 * @param {() => Storage} deps.getStorage
 * @param {{ strip: HTMLElement, editor: HTMLElement, empty: HTMLElement }} deps.elements
 * @param {(tab: Tab) => import('@codemirror/state').Extension} deps.languageFor
 * @param {() => void} deps.onActiveChange
 */
export function createTabs({ editor, autosave, api, getStorage, elements, languageFor, onActiveChange }) {
  /** @type {Tab[]} */
  let tabs = [];
  /** @type {string | null} */
  let activeId = null;
  // The tab whose state is in the editor view. It can lag behind activeId
  // while a tab's content loads.
  /** @type {string | null} */
  let shownId = null;

  const find = (id) => tabs.find((tab) => tab.id === id);
  const isClean = (tab) => tab.state === null || autosave.status(tab.id) === 'saved';
  const persist = () => writeOpenTabs(getStorage, { ids: tabs.map((tab) => tab.id), activeId });

  /** The live state of a tab: the view's state when the view shows it. */
  const stateOf = (tab) => (tab.id === shownId ? editor.view.state : tab.state);

  function show(tab) {
    const shown = find(shownId);
    if (shown && shown !== tab) shown.state = editor.view.state;
    editor.show(tab.state);
    shownId = tab.id;
  }

  function render() {
    elements.strip.replaceChildren(
      ...tabs.map((tab) => {
        const node = document.createElement('div');
        node.className = 'tab';
        node.setAttribute('role', 'tab');
        node.dataset.id = tab.id;
        node.setAttribute('aria-selected', String(tab.id === activeId));
        if (!isClean(tab)) node.classList.add('dirty');
        node.title = tab.name;
        const name = document.createElement('span');
        name.className = 'tab-name';
        name.textContent = tab.name;
        const dot = document.createElement('span');
        dot.className = 'tab-dirty';
        dot.setAttribute('aria-label', 'Unsaved changes');
        const close = document.createElement('button');
        close.type = 'button';
        close.className = 'tab-close';
        close.textContent = '×';
        close.setAttribute('aria-label', `Close ${tab.name}`);
        close.title = 'Close (Alt+W)';
        close.addEventListener('click', (event) => {
          event.stopPropagation();
          controller.close(tab.id);
        });
        node.addEventListener('click', () => controller.activate(tab.id));
        node.append(name, dot, close);
        return node;
      }),
    );
    const empty = tabs.length === 0;
    elements.empty.hidden = !empty;
    elements.editor.hidden = empty;
  }

  /** Makes the tab's state from server content and starts autosave for it. */
  function load(tab, doc) {
    tab.name = doc.name;
    tab.language = doc.language;
    tab.state = editor.createState(doc.content, languageFor(tab));
    autosave.track(tab.id, { version: doc.version, getContent: () => stateOf(tab).doc.toString() });
  }

  function removeTab(id) {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    autosave.untrack(id);
    tabs.splice(index, 1);
    if (shownId === id) shownId = null;
    if (activeId === id) {
      activeId = null;
      const next = tabs[index] ?? tabs[index - 1];
      if (next) controller.activate(next.id, { refresh: false });
      else onActiveChange();
    }
    persist();
    render();
  }

  // Replaces a clean tab's text with the server version. Skips the reload
  // when the user typed while the request was in flight.
  async function reload(tab) {
    const before = autosave.version(tab.id);
    const { status, data } = await api.getDocument(tab.id);
    if (status !== 200 || !find(tab.id) || !isClean(tab) || autosave.version(tab.id) !== before) return;
    const wasShown = tab.id === shownId;
    if (wasShown) shownId = null;
    load(tab, data);
    if (wasShown) show(tab);
  }

  const controller = {
    /** Restores the stored tabs, dropping documents that no longer exist. */
    async boot() {
      const stored = readOpenTabs(getStorage);
      const list = await api.listDocuments();
      const byId = list.status === 200 ? new Map(list.data.map((doc) => [doc.id, doc])) : null;
      tabs = stored.ids
        .filter((id) => !byId || byId.has(id))
        .map((id) => ({ id, name: byId?.get(id).name ?? 'Loading', language: byId?.get(id).language ?? null, state: null }));
      persist();
      render();
      const first = find(stored.activeId) ?? tabs[0];
      if (first) await controller.activate(first.id, { refresh: false });
      else onActiveChange();
    },

    /**
     * Shows a tab. Loads its content the first time.
     * @param {string} id
     * @param {{ refresh?: boolean }} [options]
     */
    async activate(id, { refresh = true } = {}) {
      const tab = find(id);
      if (!tab) return;
      activeId = id;
      persist();
      render();
      if (!tab.state) {
        const { status, data } = await api.getDocument(id);
        if (!find(id)) return;
        if (status === 404) {
          removeTab(id);
          return;
        }
        if (status !== 200) return;
        if (!tab.state) load(tab, data);
        if (activeId !== id) return;
      }
      show(tab);
      editor.focus();
      onActiveChange();
      render();
      if (refresh) controller.refresh();
    },

    /** Opens a document in a tab, or activates its tab when it is open. */
    async open(id, name) {
      if (!find(id)) tabs.push({ id, name: name ?? 'Loading', language: null, state: null });
      await controller.activate(id);
    },

    /** Creates an "Untitled N" document and opens it. */
    async newDocument() {
      const { status, data } = await api.createDocument();
      if (status !== 201) return false;
      const tab = { id: data.id, name: data.name, language: data.language, state: null };
      tabs.push(tab);
      load(tab, { ...data, content: '' });
      await controller.activate(tab.id);
      return true;
    },

    /** Saves the tab, then closes it. A failed save keeps the tab open. */
    async close(id) {
      if (!(await autosave.flush(id))) return false;
      removeTab(id);
      return true;
    },

    /** Closes a tab without saving (its document is gone). */
    removeTab,

    /** Applies server metadata and reloads clean tabs that changed elsewhere. */
    async refresh() {
      const { status, data } = await api.listDocuments();
      if (status !== 200) return;
      const plan = planRefresh(
        tabs.map((tab) => ({ id: tab.id, loaded: tab.state !== null, clean: isClean(tab), version: autosave.version(tab.id) ?? null })),
        data,
      );
      for (const [id, doc] of plan.meta) {
        const tab = find(id);
        if (tab) tab.name = doc.name;
      }
      for (const id of plan.remove) removeTab(id);
      await Promise.all(plan.reload.map((id) => reload(find(id))));
      render();
      onActiveChange();
    },

    render,
    active: () => find(activeId) ?? null,
    /** The id of the document in the editor view, for autosave. */
    shownId: () => shownId,
    get: find,
    content: (id) => {
      const tab = find(id);
      return tab?.state ? stateOf(tab).doc.toString() : null;
    },
  };
  return controller;
}
