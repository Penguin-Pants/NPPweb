// Bundles the browser entry points and copies the static files.
// Usage: node scripts/build-web.js [outDir]   (default: dist/web)
import { copyFile, readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = join(rootDir, 'web');
const outDir = resolve(process.argv[2] ?? join(rootDir, 'dist', 'web'));

await build({
  entryPoints: ['main.js', 'login.js', 'theme-init.js'].map((name) => join(webDir, 'src', name)),
  outdir: outDir,
  bundle: true,
  format: 'esm',
  minify: true,
  sourcemap: true,
});

const pages = (await readdir(webDir)).filter((name) => name.endsWith('.html'));
for (const name of [...pages, 'styles.css']) {
  await copyFile(join(webDir, name), join(outDir, name));
}
