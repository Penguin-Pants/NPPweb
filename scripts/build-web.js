// Bundles the browser entry points and copies the static files.
// Usage: node scripts/build-web.js [outDir]   (default: dist/web)
import { copyFile, cp, readdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const rootDir = fileURLToPath(new URL('..', import.meta.url));
const webDir = join(rootDir, 'web');
const outDir = resolve(process.argv[2] ?? join(rootDir, 'dist', 'web'));

const common = { outdir: outDir, bundle: true, minify: true, sourcemap: true, metafile: true, absWorkingDir: rootDir };
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

// main.js and login.js load with type="module". mermaid-frame.js runs in
// the diagram frame that main.js adds on first use, so Mermaid loads only
// then (MDV-13, NFR-4). It shares a build with main.js, so shared code goes
// into chunks. login.js has no chunks, because the login page has no session
// to fetch them with. theme-init.js is a classic blocking script in <head>,
// so it is an IIFE and leaks no globals.
const results = [
  await build({
    ...common,
    entryPoints: [entry('main.js'), entry('mermaid-frame.js')],
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    plugins: [excludeElk],
  }),
  await build({ ...common, entryPoints: [entry('login.js')], format: 'esm' }),
  await build({ ...common, entryPoints: [entry('theme-init.js')], format: 'iife' }),
];

// C6: the copyright and license notices of each bundled npm package stay
// with the code, in one text file next to the bundles.
const packageDirs = new Set();
for (const { metafile } of results) {
  for (const input of Object.keys(metafile.inputs)) {
    const match = /^(.*node_modules\/(?:@[^/]+\/)?[^/]+)\//.exec(input);
    if (match) packageDirs.add(match[1]);
  }
}
const notices = [];
for (const dir of [...packageDirs].sort()) {
  const pkg = JSON.parse(await readFile(join(rootDir, dir, 'package.json'), 'utf8'));
  const files = (await readdir(join(rootDir, dir))).filter((name) => /^(licen[cs]e|copying|notice)/i.test(name)).sort();
  const texts = await Promise.all(files.map((name) => readFile(join(rootDir, dir, name), 'utf8')));
  notices.push(`${pkg.name} ${pkg.version}\nLicense: ${pkg.license ?? 'see the text below'}\n\n${texts.map((text) => text.trim()).join('\n\n')}`);
}
await writeFile(join(outDir, 'THIRD-PARTY-NOTICES.txt'), `${notices.join(`\n${'-'.repeat(72)}\n`)}\n`);

const pages = (await readdir(webDir)).filter((name) => name.endsWith('.html'));
for (const name of [...pages, 'styles.css', 'manifest.webmanifest']) {
  await copyFile(join(webDir, name), join(outDir, name));
}
await cp(join(webDir, 'icons'), join(outDir, 'icons'), { recursive: true });
