// Sets data-theme before first paint. Loaded as a blocking script in <head>,
// because the CSP blocks inline scripts. Default is dark (EDT-6).
let theme = 'dark';
try {
  if (localStorage.getItem('pn.theme') === 'light') theme = 'light';
} catch {
  // Storage can be blocked. Keep the default.
}
document.documentElement.dataset.theme = theme;
