// Open tabs (section 2.8, T17). Tabs persist per browser in localStorage
// (pn.openTabs.v1). Content loads on first activation. Clean tabs refresh
// from the server on window focus and on tab activation (TD-15).

import { choose } from './dialogs.js';
import { languageSupport, resolveLanguage } from './languages.js';
import { modName } from './shortcuts.js';

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
 * @property {string} [appliedLanguage] The language id the state's parser uses.
 */

/**
 * @param {object} deps
 * @param {ReturnType<typeof import('./editor.js').createEditor>} deps.editor
 * @param {ReturnType<typeof import('./autosave.js').createAutosave>} deps.autosave
 * @param {typeof import('./api.js').api} deps.api
 * @param {() => Storage} deps.getStorage
 * @param {{ strip: HTMLElement, editor: HTMLElement, empty: HTMLElement }} deps.elements
 * @param {() => void} deps.onActiveChange
 * @param {(text: string) => void} deps.showMessage
 */
export function createTabs({ editor, autosave, api, getStorage, elements, onActiveChange, showMessage }) {
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

  // The view's state is the live state of the shown tab. It is copied back
  // into the tab before the view shows anything else.
  function show(tab) {
    if (tab.id === shownId) return;
    const shown = find(shownId);
    if (shown) shown.state = editor.view.state;
    editor.show(tab.state);
    shownId = tab.id;
    syncLanguage(tab);
  }

  /** The language a tab should use now (EDT-4): override, else name extension. */
  const languageOf = (tab) => resolveLanguage(tab.name, tab.language);

  // Brings the shown tab's parser in line with its name and override. A tab
  // that is not shown catches up when show() runs.
  function syncLanguage(tab) {
    if (tab.id !== shownId || tab.appliedLanguage === languageOf(tab)) return;
    tab.appliedLanguage = languageOf(tab);
    editor.setLanguage(languageSupport(tab.appliedLanguage));
  }

  function showBlank() {
    const shown = find(shownId);
    if (shown) shown.state = editor.view.state;
    editor.showBlank();
    shownId = null;
  }

  function render() {
    elements.strip.replaceChildren(
      ...tabs.map((tab) => {
        const node = document.createElement('div');
        node.className = 'tab';
        node.setAttribute('role', 'tab');
        node.setAttribute('aria-label', tab.name);
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
        close.title = `Close (${modName()}+W in the installed app, Alt+W)`;
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
    tab.appliedLanguage = languageOf(tab);
    tab.state = editor.createState(doc.content, languageSupport(tab.appliedLanguage));
    autosave.track(tab.id, { version: doc.version, getContent: () => stateOf(tab).doc.toString() });
  }

  function removeTab(id) {
    const index = tabs.findIndex((tab) => tab.id === id);
    if (index < 0) return;
    autosave.untrack(id);
    tabs.splice(index, 1);
    if (shownId === id) {
      editor.showBlank();
      shownId = null;
    }
    if (activeId === id) {
      activeId = null;
      const next = tabs[index] ?? tabs[index - 1];
      if (next) controller.activate(next.id, { refresh: false });
      else onActiveChange();
    }
    persist();
    render();
  }

  // The tab is already closed, so no pending save can reach the document.
  async function deleteOnServer(id) {
    const { status } = await api.deleteDocument(id);
    if (status !== 204 && status !== 404) showMessage('Delete failed. The document is still in the document list.');
  }

  /** Replaces a tab's state with server content. Resets its autosave. */
  function replaceContent(tab, doc) {
    const wasShown = tab.id === shownId;
    if (wasShown) shownId = null;
    load(tab, doc);
    if (wasShown) show(tab);
    render();
    onActiveChange();
  }

  // Replaces a clean tab's text with the server version. Skips the reload
  // when the user typed while the request was in flight.
  async function reload(tab) {
    const before = autosave.version(tab.id);
    const { status, data } = await api.getDocument(tab.id);
    if (status !== 200 || !find(tab.id) || !isClean(tab) || autosave.version(tab.id) !== before) return;
    replaceContent(tab, data);
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
        showBlank();
        onActiveChange();
        const { status, data } = await api.getDocument(id);
        if (!find(id)) return;
        if (status === 404) {
          removeTab(id);
          return;
        }
        if (status !== 200) {
          // The view stays blank and read-only. Activation, focus and
          // sign-in try the load again.
          if (activeId === id) showMessage('Could not open the document. Click its tab to try again.');
          return;
        }
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
      await controller.addDocument(data, '');
      return true;
    },

    /**
     * Opens a document that was just created with `content` in a new active tab.
     * @param {import('./api.js').DocumentMeta} meta
     * @param {string} content
     */
    async addDocument(meta, content) {
      const tab = { id: meta.id, name: meta.name, language: meta.language, state: null };
      tabs.push(tab);
      load(tab, { ...meta, content });
      await controller.activate(tab.id);
    },

    /**
     * Replaces a tab's text with the server version, whatever its state
     * (conflict choice "Load the other version").
     * @returns {Promise<number>} The HTTP status, 200 on success, 0 on a network failure.
     */
    async reloadFromServer(id) {
      const { status, data } = await api.getDocument(id);
      const tab = find(id);
      if (status === 200 && tab) replaceContent(tab, data);
      return status;
    },

    /**
     * The close flow (section 2.8, DOC-5, DOC-6). An empty "Untitled N"
     * closes and is deleted with no prompt. Otherwise the user chooses Keep
     * (saves first; a failed save keeps the tab open), Delete permanently or
     * Cancel. Returns true when the tab closed.
     */
    async close(id) {
      const tab = find(id);
      if (!tab) return false;
      let content = controller.content(id);
      if (content === null) {
        const { status, data } = await api.getDocument(id);
        if (status === 404) {
          removeTab(id);
          return true;
        }
        if (status !== 200) {
          showMessage('Could not close the document. Try again.');
          return false;
        }
        content = data.content;
      }

      if (content === '' && /^Untitled \d+$/.test(tab.name)) {
        removeTab(id);
        await deleteOnServer(id);
        return true;
      }

      const answer = await choose({
        title: 'Close document',
        message: `Keep "${tab.name}" in the document list, or delete it permanently? A delete cannot be undone.`,
        choices: [
          { value: 'keep', label: 'Keep', kind: 'primary' },
          { value: 'delete', label: 'Delete permanently', kind: 'danger' },
          { value: 'cancel', label: 'Cancel' },
        ],
        defaultValue: 'keep',
        cancelValue: 'cancel',
      });
      if (answer === 'cancel' || !find(id)) return false;
      if (answer === 'keep') {
        if (!(await autosave.flush(id))) return false;
        removeTab(id);
        return true;
      }
      removeTab(id);
      await deleteOnServer(id);
      return true;
    },

    /** Closes a tab without saving (its document is gone). */
    removeTab,

    /** Shows a new name on an open tab. */
    rename(id, name) {
      const tab = find(id);
      if (!tab) return;
      tab.name = name;
      syncLanguage(tab);
      render();
      onActiveChange();
    },

    /**
     * Stores a manual language override, or null for auto (EDT-4).
     * @returns {Promise<boolean>} false when the server did not accept it.
     */
    async setLanguage(id, language) {
      const { status, data } = await api.updateDocument(id, { language });
      const tab = find(id);
      if (status !== 200 || !tab) return false;
      tab.language = data.language;
      syncLanguage(tab);
      onActiveChange();
      return true;
    },

    /** The resolved language id of a tab. */
    languageOf: (id) => {
      const tab = find(id);
      return tab ? languageOf(tab) : null;
    },

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
        if (!tab) continue;
        tab.name = doc.name;
        tab.language = doc.language;
        syncLanguage(tab);
      }
      for (const id of plan.remove) removeTab(id);
      await Promise.all(plan.reload.map((id) => reload(find(id))));
      render();
      onActiveChange();
      // Retry an active tab whose content failed to load.
      const active = find(activeId);
      if (active && !active.state) await controller.activate(active.id, { refresh: false });
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
