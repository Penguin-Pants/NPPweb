// The two fixed workspaces (v3 WS-1, TD-20). No route creates, renames or
// deletes one. The documents table CHECK holds the same list (migration 2).
export const WORKSPACES = ['personal', 'work'];

/**
 * The workspace that a request names in its `workspace` query value (TD-23).
 * A missing value gives personal, so a page from before v3 acts on Personal
 * (MIG-3). An unknown or repeated value gives null.
 * @param {Record<string, unknown> | undefined} query
 * @returns {'personal' | 'work' | null}
 */
export function parseWorkspace(query) {
  const value = query?.workspace;
  if (value === undefined) return 'personal';
  return WORKSPACES.includes(/** @type {string} */ (value)) ? /** @type {'personal' | 'work'} */ (value) : null;
}
