// Keyboard shortcuts (EDT-7, EDT-9, TD-16, T22). One capture-phase listener
// on document, matched by event.code. Mod is Ctrl on Windows and Linux and
// Cmd on macOS. Ctrl+N and Ctrl+W reach the page only in the installed app
// window. Alt+N and Alt+W work everywhere.

const MOD_KEYS = { KeyN: 'new', KeyW: 'close', KeyS: 'save', KeyF: 'find', KeyH: 'replace' };
const ALT_KEYS = { KeyN: 'new', KeyW: 'close' };

export const isMac = () => typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

/** "Ctrl" or "Cmd", for tooltips. */
export const modName = () => (isMac() ? 'Cmd' : 'Ctrl');

/**
 * @param {Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>} event
 * @param {boolean} mac
 * @returns {'new' | 'close' | 'save' | 'find' | 'replace' | null}
 */
export function shortcutFor(event, mac) {
  if (event.shiftKey) return null;
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (mod && !event.altKey) return MOD_KEYS[event.code] ?? null;
  // Alt alone. Ctrl+Alt is AltGr on Windows keyboards, which types characters.
  if (event.altKey && !event.ctrlKey && !event.metaKey) return ALT_KEYS[event.code] ?? null;
  return null;
}

/**
 * @param {Record<'new' | 'close' | 'save' | 'find' | 'replace', () => void>} actions
 */
export function setupShortcuts(actions) {
  const mac = isMac();
  document.addEventListener(
    'keydown',
    (event) => {
      const action = shortcutFor(event, mac);
      if (!action) return;
      // First, before any other work, so an error later cannot let the
      // browser close the app window (R8).
      event.preventDefault();
      event.stopPropagation();
      // While a modal dialog is open, the key only stays away from the browser.
      if (document.querySelector('dialog[open]')) return;
      actions[action]();
    },
    { capture: true },
  );
}
