// The active workspace per browser (v3 WS-4, TD-28). Default Personal, also
// when storage is blocked or holds an unknown value. Stored in localStorage
// key pn.workspace and shown as data-workspace on <html>. theme-init.js
// applies it and the window title before first paint (TD-29).
import { WORKSPACES } from '../../shared/contract.js';

/** @type {{ key: string, values: ['personal', 'work'] }} */
export const WORKSPACE = { key: 'pn.workspace', values: WORKSPACES };

export const WORKSPACE_NAMES = { personal: 'Personal', work: 'Work' };

/** @param {'personal' | 'work'} id */
export const titleFor = (id) => `${WORKSPACE_NAMES[id]} - Margin`;

/** @param {'personal' | 'work'} id @returns {'personal' | 'work'} */
export const otherWorkspace = (id) => (id === 'personal' ? 'work' : 'personal');

/**
 * Shows the workspace on the page: data-workspace on <html> and, on the app
 * page only (`<html data-page="app">`), the window title (WS-3). The sign-in
 * page keeps its own title.
 * @param {{ title: string, documentElement: { dataset: Record<string, string> } }} doc
 * @param {'personal' | 'work'} id
 */
export function showWorkspace(doc, id) {
  const root = doc.documentElement;
  root.dataset.workspace = id;
  if (root.dataset.page === 'app') doc.title = titleFor(id);
}
