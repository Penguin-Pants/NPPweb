// Tiny event bus (BUILD_PLAN.md section 2.8). Modules subscribe instead of
// importing each other. Events: session-expired, doc-saved, doc-conflict,
// doc-deleted-remote, doc-renamed, doc-too-large.

/** @type {Map<string, Set<(detail: any) => void>>} */
const handlers = new Map();

/**
 * @param {string} name
 * @param {(detail: any) => void} handler
 * @returns {() => void} Removes the handler.
 */
export function on(name, handler) {
  if (!handlers.has(name)) handlers.set(name, new Set());
  handlers.get(name).add(handler);
  return () => handlers.get(name).delete(handler);
}

/**
 * @param {string} name
 * @param {any} [detail]
 */
export function emit(name, detail) {
  for (const handler of [...(handlers.get(name) ?? [])]) handler(detail);
}
