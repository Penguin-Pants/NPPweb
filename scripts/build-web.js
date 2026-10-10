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

// Mermaid's ELK layout imports elkjs, which is EPL-2.0 (C6). It is replaced
// by a stub, so its code is never shipped. Mermaid creates an ELK object when
// it loads, so the stub only fails when a layout is asked of it.
// mermaid-render.js selects the dagre layout (MIT) instead.
const excludeElk = {
  name: 'exclude-elk',
  setup(builder) {
    builder.onResolve({ filter: /^elkjs(\/|$)/ }, ({ path }) => ({ path, namespace: 'excluded' }));
    builder.onLoad({ filter: /.*/, namespace: 'excluded' }, () => ({
      contents:
        'export default class ELK { layout() { return Promise.reject(new Error("The ELK layout is not included.")); } }',
    }));
  },
};

// main.js and login.js load with type="module". main.js splits Mermaid into
// chunks that load on demand (MDV-13, NFR-4). login.js has no chunks, because
// the login page has no session to fetch them with. theme-init.js is a
// classic blocking script in <head>, so it is an IIFE and leaks no globals.
await build({
  ...common,
  entryPoints: [entry('main.js')],
  format: 'esm',
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  plugins: [excludeElk],
});
await build({ ...common, entryPoints: [entry('login.js')], format: 'esm' });
await build({ ...common, entryPoints: [entry('theme-init.js')], format: 'iife' });

const pages = (await readdir(webDir)).filter((name) => name.endsWith('.html'));
for (const name of [...pages, 'styles.css', 'manifest.webmanifest']) {
  await copyFile(join(webDir, name), join(outDir, name));
}
await cp(join(webDir, 'icons'), join(outDir, 'icons'), { recursive: true });
