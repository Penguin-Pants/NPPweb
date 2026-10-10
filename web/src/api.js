// Fetch wrapper for /api/* (section 2.7). Calls never throw: a network
// failure returns status 0. Any 401 except from login emits session-expired.
// Every /api/documents call acts on the active workspace (v3 TD-30). A switch
// starts a new generation: a document call from an older generation comes
// back stale, so a reply from before the switch cannot change the new
// workspace (TD-41). Callers check `stale` first and then stop quietly.
import { emit } from './events.js';

/**
 * @typedef {{ status: number, data: any, stale?: true }} ApiResult
 * @typedef {{ id: string, name: string, version: number, language: string | null, updatedAt: number }} DocumentMeta
 */

/** @type {'personal' | 'work'} */
let workspace = 'personal';
let generation = 0;

/**
 * @param {string} method
 * @param {string} path
 * @param {{ json?: unknown, text?: string, headers?: Record<string, string>, scoped?: boolean }} [options]
 *   scoped: the reply is stale when the workspace changed meanwhile.
 * @returns {Promise<ApiResult>}
 */
async function call(method, path, { json, text, headers = {}, scoped = false } = {}) {
  const started = generation;
  const stale = () => scoped && generation !== started;
  const init = { method, headers: { ...headers } };
  if (json !== undefined) {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(json);
  } else if (text !== undefined) {
    init.headers['Content-Type'] = 'text/plain; charset=utf-8';
    init.body = text;
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    return stale() ? { status: 0, data: null, stale: true } : { status: 0, data: null };
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (stale()) return { status: 0, data: null, stale: true };
  if (res.status === 401 && path !== '/api/login') emit('session-expired');
  return { status: res.status, data };
}

/**
 * Adds the workspace to a /api/documents path. Personal is the server
 * default (TD-23), so its paths stay as in v1 and v2.
 */
const inWorkspace = (path, id = workspace) =>
  id === 'personal' ? path : `${path}${path.includes('?') ? '&' : '?'}workspace=${id}`;
/** A call on the active workspace's documents. */
const docCall = (method, path, options) => call(method, inWorkspace(path), { ...options, scoped: true });
const docPath = (id) => `/api/documents/${encodeURIComponent(id)}`;

export const api = {
  /** The active workspace. */
  workspace: () => workspace,
  /**
   * Makes every later document call act on `id`. Replies to earlier ones
   * come back stale.
   * @param {'personal' | 'work'} id
   */
  setWorkspace(id) {
    workspace = id;
    generation += 1;
  },
  /** @param {string} password */
  login: (password) => call('POST', '/api/login', { json: { password } }),
  logout: () => call('POST', '/api/logout'),
  /** @param {string} currentPassword @param {string} newPassword */
  changePassword: (currentPassword, newPassword) =>
    call('POST', '/api/password', { json: { currentPassword, newPassword } }),
  /**
   * @param {'personal' | 'work'} [target] Reads that workspace's list instead,
   *   for the switch (TD-33). That read is never stale.
   */
  listDocuments: (target) =>
    target ? call('GET', inWorkspace('/api/documents', target)) : docCall('GET', '/api/documents'),
  /**
   * @param {string} [content]
   * @param {string} [name] Omit for "Untitled N".
   * @param {string | null} [language] Omit or null for auto.
   */
  createDocument: (content = '', name, language) => {
    const query = [];
    if (name !== undefined) query.push(`name=${encodeURIComponent(name)}`);
    if (language) query.push(`language=${encodeURIComponent(language)}`);
    return docCall('POST', `/api/documents${query.length ? `?${query.join('&')}` : ''}`, { text: content });
  },
  /** @param {string} id */
  getDocument: (id) => docCall('GET', docPath(id)),
  /** @param {string} id @param {string} content @param {number} version */
  saveContent: (id, content, version) =>
    docCall('PUT', `${docPath(id)}/content`, { text: content, headers: { 'If-Match': String(version) } }),
  /** @param {string} id @param {{ name?: string, language?: string | null }} changes */
  updateDocument: (id, changes) => docCall('PATCH', docPath(id), { json: changes }),
  /** @param {string} id */
  deleteDocument: (id) => docCall('DELETE', docPath(id)),
  getSettings: () => call('GET', '/api/settings'),
  /** @param {{ autosaveSeconds: number }} settings */
  saveSettings: (settings) => call('PUT', '/api/settings', { json: settings }),
};
