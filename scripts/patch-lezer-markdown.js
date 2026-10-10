// Patches @lezer/markdown 1.8.0 after each npm install (the postinstall
// script), so typing stays fast in long Markdown documents (NFR-2).
//
// After an edit, the parser reuses the old syntax tree. Version 1.8.0 takes
// the old blocks one at a time and balances all of them again, so each key
// press costs time for every top-level block (about 30 ms in 1 MB of dense
// Markdown). The patch takes a balanced group of blocks whole when the group
// fits and its last block may end the reused part. The other rules stay.
// docs/upstream/lezer-markdown-reuse.md has the same change for upstream.
// Remove this script when a release has the fix.
import { readFile, writeFile } from 'node:fs/promises';

const VERSION = '1.8.0';
const MARK = '// NPPweb patch: reuse balanced groups of blocks whole.';
const dir = new URL('../node_modules/@lezer/markdown/', import.meta.url);

/** The edits, as [before, after] pairs. `common` is the module prefix of the build. */
const edits = (common) => [
  [
    '            c = this.cursor = this.fragment.tree.cursor();\n',
    `            ${MARK}\n            c = this.cursor = this.fragment.tree.cursor(${common}IterMode.IncludeAnonymous);\n`,
  ],
  [
    `            let pos = toRelative(cur.from - off, cx.ranges);
            if (cur.to - off <= cx.ranges[cx.rangeI].to) { // Fits in current range
`,
    `            let pos = toRelative(cur.from - off, cx.ranges);
            if (cur.type.isAnonymous) {
                // A balanced group of blocks is taken whole when it fits in the
                // current range and its last block may end the taken content.
                // Else its blocks are taken one by one.
                if (cur.to - off <= cx.ranges[cx.rangeI].to && endsInBlock(cur.tree)) {
                    cx.addNode(cur.tree, pos);
                    end = prevEnd = cur.to - off;
                    blockI = prevI = cx.block.children.length;
                    if (!nextNode(cur))
                        break;
                    continue;
                }
                if (cur.firstChild())
                    continue;
                break;
            }
            if (cur.to - off <= cx.ranges[cx.rangeI].to) { // Fits in current range
`,
  ],
  [
    `            if (!cur.nextSibling())
                break;
        }
        while (cx.block.children.length > blockI) {
`,
    `            if (!nextNode(cur))
                break;
        }
        while (cx.block.children.length > blockI) {
`,
  ],
  [
    '// Convert an input-stream-relative position to a\n',
    `// Whether the last block of a balanced group may end taken content
// (see NotLast).
function endsInBlock(tree) {
    for (;;) {
        let last = tree.children[tree.children.length - 1];
        if (!(last instanceof ${common}Tree))
            return false;
        if (!last.type.isAnonymous)
            return last.type.is("Block") && NotLast.indexOf(last.type.id) < 0;
        tree = last;
    }
}
// Moves to the next block, also out of a balanced group, but not out of
// the block that holds the group.
function nextNode(cur) {
    while (!cur.nextSibling())
        if (!cur.parent() || !cur.type.isAnonymous)
            return false;
    return true;
}
// Convert an input-stream-relative position to a
`,
  ],
];

const pkg = JSON.parse(await readFile(new URL('package.json', dir), 'utf8'));
if (pkg.version !== VERSION) {
  throw new Error(`@lezer/markdown is ${pkg.version}. scripts/patch-lezer-markdown.js is made for ${VERSION}: check whether the new version still needs it.`);
}

const builds = [
  // The ES module also has to import IterMode.
  ['dist/index.js', '', [["import { NodeType, NodeProp, NodeSet, Parser, Tree, parseMixed } from '@lezer/common';\n", "import { NodeType, NodeProp, NodeSet, Parser, Tree, parseMixed, IterMode } from '@lezer/common';\n"]]],
  ['dist/index.cjs', 'common.', []],
];
for (const [file, common, extra] of builds) {
  const url = new URL(file, dir);
  let source = await readFile(url, 'utf8');
  if (source.includes(MARK)) continue;
  for (const [before, after] of [...extra, ...edits(common)]) {
    const at = source.indexOf(before);
    if (at < 0 || source.indexOf(before, at + 1) >= 0) throw new Error(`@lezer/markdown ${file}: the patch does not fit. Expected once: ${before.trim().split('\n')[0]}`);
    source = source.slice(0, at) + after + source.slice(at + before.length);
  }
  await writeFile(url, source);
}
