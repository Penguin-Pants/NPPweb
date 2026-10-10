// Sets data-theme and data-outline before first paint. Loaded as a blocking
// script in <head>, because the CSP blocks inline scripts. Defaults: dark
// (EDT-6) and an open outline panel (LAY-5).
import { OUTLINE } from './outline-panel.js';
import { readChoice } from './stored-choice.js';
import { THEME } from './theme.js';

const getStorage = () => localStorage;
document.documentElement.dataset.theme = readChoice({ getStorage, ...THEME });
document.documentElement.dataset.outline = readChoice({ getStorage, ...OUTLINE });
