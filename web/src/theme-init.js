// Sets data-theme, data-outline and data-workspace before first paint, and
// on the app page the window title. Loaded as a blocking script in <head>,
// because the CSP blocks inline scripts. Defaults: dark (EDT-6), an open
// outline panel (LAY-5) and Personal (v3 WS-4).
import { OUTLINE } from './outline-panel.js';
import { readChoice } from './stored-choice.js';
import { THEME } from './theme.js';
import { showWorkspace, WORKSPACE } from './workspace.js';

const getStorage = () => localStorage;
document.documentElement.dataset.theme = readChoice({ getStorage, ...THEME });
document.documentElement.dataset.outline = readChoice({ getStorage, ...OUTLINE });
showWorkspace(document, readChoice({ getStorage, ...WORKSPACE }));
