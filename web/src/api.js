// Fetch wrapper for /api/* (section 2.7). Calls never throw: a network
// failure returns status 0. Any 401 except from login emits session-expired.
import { emit } from './events.js';

/**
 * @typedef {{ status: number, data: any }} ApiResult
 * @typedef {{ id: string, name: string, version: number, language: string | null, updatedAt: number }} DocumentMeta
 */

/**
 * @param {string} method
 * @param {string} path
 * @param {{ json?: unknown, text?: string, headers?: Record<string, string> }} [options]
 * @returns {Promise<ApiResult>}
 */
async function call(method, path, { json, text, headers = {} } = {}) {
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
    return { status: 0, data: null };
  }
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const data = isJson ? await res.json().catch(() => null) : null;
  if (res.status === 401 && path !== '/api/login') emit('session-expired');
  return { status: res.status, data };
}

const docPath = (id) => `/api/documents/${encodeURIComponent(id)}`;

export const api = {
  /** @param {string} password */
  login: (password) => call('POST', '/api/login', { json: { password } }),
  logout: () => call('POST', '/api/logout'),
  /** @param {string} currentPassword @param {string} newPassword */
  changePassword: (currentPassword, newPassword) =>
    call('POST', '/api/password', { json: { currentPassword, newPassword } }),
  listDocuments: () => call('GET', '/api/documents'),
  /**
   * @param {string} [content]
   * @param {string} [name] Omit for "Untitled N".
   * @param {string | null} [language] Omit or null for auto.
   */
  createDocument: (content = '', name, language) => {
    const query = [];
    if (name !== undefined) query.push(`name=${encodeURIComponent(name)}`);
    if (language) query.push(`language=${encodeURIComponent(language)}`);
    return call('POST', `/api/documents${query.length ? `?${query.join('&')}` : ''}`, { text: content });
  },
  /** @param {string} id */
  getDocument: (id) => call('GET', docPath(id)),
  /** @param {string} id @param {string} content @param {number} version */
  saveContent: (id, content, version) =>
    call('PUT', `${docPath(id)}/content`, { text: content, headers: { 'If-Match': String(version) } }),
  /** @param {string} id @param {{ name?: string, language?: string | null }} changes */
  updateDocument: (id, changes) => call('PATCH', docPath(id), { json: changes }),
  /** @param {string} id */
  deleteDocument: (id) => call('DELETE', docPath(id)),
  getSettings: () => call('GET', '/api/settings'),
  /** @param {{ autosaveSeconds: number }} settings */
  saveSettings: (settings) => call('PUT', '/api/settings', { json: settings }),
};
