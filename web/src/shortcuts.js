// Keyboard shortcuts (EDT-7, EDT-9, TD-16, T22). One capture-phase listener
// on document. Mod is Ctrl on Windows and Linux and Cmd on macOS. Ctrl+N and
// Ctrl+W reach the page only in the installed app window. Alt+N and Alt+W
// work everywhere.
// Mod shortcuts match the typed letter (event.key), so they follow the
// keyboard layout: on AZERTY, Ctrl+Z stays undo. A key that types no Latin
// letter (a Cyrillic layout, for example) falls back to the key position.
// Alt shortcuts match the key position (event.code), because Option on macOS
// types other characters.

const MOD_KEYS = { n: 'new', w: 'close', s: 'save', f: 'find', h: 'replace' };
const ALT_KEYS = { KeyN: 'new', KeyW: 'close' };

/** The Latin letter of a key press, or null. */
function letterOf(event) {
  const key = event.key?.toLowerCase();
  if (key && /^[a-z]$/.test(key)) return key;
  return /^Key[A-Z]$/.test(event.code) ? event.code.slice(3).toLowerCase() : null;
}

export const isMac = () => typeof navigator !== 'undefined' && /Mac/.test(navigator.platform);

/** "Ctrl" or "Cmd", for tooltips. */
export const modName = () => (isMac() ? 'Cmd' : 'Ctrl');

/**
 * @param {Pick<KeyboardEvent, 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'> & { key?: string }} event
 * @param {boolean} mac
 * @returns {'new' | 'close' | 'save' | 'find' | 'replace' | null}
 */
export function shortcutFor(event, mac) {
  if (event.shiftKey) return null;
  const mod = mac ? event.metaKey && !event.ctrlKey : event.ctrlKey && !event.metaKey;
  if (mod && !event.altKey) return MOD_KEYS[letterOf(event)] ?? null;
  // Alt alone. Ctrl+Alt is AltGr on Windows keyboards, which types characters.
  if (event.altKey && !event.ctrlKey && !event.metaKey) return ALT_KEYS[event.code] ?? null;
  return null;
}

/**
 * @param {Record<'new' | 'close' | 'save' | 'find' | 'replace', () => void>} actions
 * @param {boolean} [mac]
 */
export function setupShortcuts(actions, mac = isMac()) {
  document.addEventListener(
    'keydown',
    (event) => {
      const action = shortcutFor(event, mac);
      if (!action) return;
      // First, before any other work, so an error later cannot let the
      // browser close the app window (R8).
      event.preventDefault();
      event.stopPropagation();
      // A held key acts once. While a modal dialog is open, the key only
      // stays away from the browser.
      if (event.repeat || document.querySelector('dialog[open]')) return;
      actions[action]();
    },
    { capture: true },
  );
}
