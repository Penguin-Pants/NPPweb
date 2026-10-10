// Sets data-theme and data-outline before first paint. Loaded as a blocking
// script in <head>, because the CSP blocks inline scripts. Defaults: dark
// (EDT-6) and an open outline panel (LAY-5).
import { readOutlineOpen } from './outline-panel.js';
import { readTheme } from './theme.js';

document.documentElement.dataset.theme = readTheme(() => localStorage);
document.documentElement.dataset.outline = readOutlineOpen(() => localStorage) ? 'open' : 'closed';
