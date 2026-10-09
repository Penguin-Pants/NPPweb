// Sets data-theme before first paint. Loaded as a blocking script in <head>,
// because the CSP blocks inline scripts. Default is dark (EDT-6).
import { readTheme } from './theme.js';

document.documentElement.dataset.theme = readTheme(() => localStorage);
