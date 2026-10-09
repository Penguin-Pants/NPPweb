// Bundles the browser entry points and copies the static files.
// Usage: node scripts/build-web.js [outDir]   (default: dist/web)
import { copyFile, cp, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = join(rootDir, 'web');
const outDir = resolve(process.argv[2] ?? join(rootDir, 'dist', 'web'));

const common = { outdir: outDir, bundle: true, minify: true, sourcemap: true };
const entry = (name) => join(webDir, 'src', name);

// main.js and login.js load with type="module". theme-init.js is a classic
// blocking script in <head>, so it is an IIFE and leaks no globals.
await build({ ...common, entryPoints: ['main.js', 'login.js'].map(entry), format: 'esm' });
await build({ ...common, entryPoints: [entry('theme-init.js')], format: 'iife' });

const pages = (await readdir(webDir)).filter((name) => name.endsWith('.html'));
for (const name of [...pages, 'styles.css', 'manifest.webmanifest']) {
  await copyFile(join(webDir, name), join(outDir, name));
}
await cp(join(webDir, 'icons'), join(outDir, 'icons'), { recursive: true });
