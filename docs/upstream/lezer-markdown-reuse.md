# Upstream: @lezer/markdown incremental parsing

Text for the owner to file with the parser project. Margin ships the same change as an install-time patch (`scripts/patch-lezer-markdown.js`). Remove that patch when a release has the fix.

- Project: `@lezer/markdown`, repository in its `package.json`: https://code.haverbeke.berlin/lezer/markdown
- Unverified assumption: issues and patches go to that repository. Check its page before filing.
- Version tested: 1.8.0, with `@lezer/common` 1.5.3.

## Issue 1: each edit re-walks every top-level block

### Text to file

**Title:** Incremental parse cost grows with the number of top-level blocks

After an edit, `FragmentCursor.takeNodes` reuses the old tree one top-level block at a time. Its cursor is created with the default mode, so balanced groups (anonymous nodes) are entered and every block is copied. `BlockContext.finish` then balances all of them again. In a 1 MB document with about 26,000 top-level blocks, each key press costs about 30 ms, also for an edit at the end of the document.

**Measured** (Node 24, the parser alone, 200 one-character edits, each parsed up to 3 KB after the edit and then to the end, as CodeMirror does):

| Edit position | 1.8.0 | With the patch |
|---|---|---|
| Start | 29.8 ms per key | 1.2 ms per key |
| Middle | 32.7 ms per key | 1.0 ms per key |
| End | 29.5 ms per key | 0.9 ms per key |

In a CodeMirror editor, typing 200 characters in that document went from 4.0 to 6.5 s to about 1.2 s.

**Proposed change:** create the fragment cursor with `IterMode.IncludeAnonymous`. Then `takeNodes` can take a balanced group whole when it fits in the fragment and the current range, and its last block may end the taken content (not in `NotLast`). Other groups are entered, and their blocks are taken one by one, as now. A helper moves out of a group after its last child, so the walk does not stop at a group boundary. `Tree.balance` already splits a reused group that is too large, so the tree stays balanced.

**Tests done:**

- Random documents and edits, with partial parses (`stopAt`) between them: 16,000 edits. After each one, the incremental tree equals a fresh parse, the same as with 1.8.0.
- Tree depth stays bounded over 1,000 edits in one document: 17 levels, against 10 with 1.8.0. Inline nodes are in that count.
- The same check through CodeMirror with `parseMixed` code languages: 900 edits, all equal.
- The TypeScript diff below was checked for syntax only. No type check was run (no TypeScript compiler in the build environment).

### Patch

```diff
--- a/src/markdown.ts
+++ b/src/markdown.ts
@@ -1,5 +1,5 @@
 import {Tree, TreeBuffer, NodeType, NodeProp, NodePropSource, TreeFragment, NodeSet, TreeCursor,
-        Input, Parser, PartialParse, SyntaxNode, ParseWrapper} from "@lezer/common"
+        Input, Parser, PartialParse, SyntaxNode, ParseWrapper, IterMode} from "@lezer/common"
 import {styleTags, tags as t, Tag} from "@lezer/highlight"
 
 class CompositeBlock {
@@ -1864,7 +1864,7 @@
 
     let c = this.cursor
     if (!c) {
-      c = this.cursor = this.fragment.tree.cursor()
+      c = this.cursor = this.fragment.tree.cursor(IterMode.IncludeAnonymous)
       c.firstChild()
     }
 
@@ -1891,6 +1891,20 @@
         break
       }
       let pos = toRelative(cur.from - off, cx.ranges)
+      if (cur.type.isAnonymous) {
+        // A balanced group of blocks is taken whole when it fits in the
+        // current range and its last block may end the taken content.
+        // Else its blocks are taken one by one.
+        if (cur.to - off <= cx.ranges[cx.rangeI].to && endsInBlock(cur.tree!)) {
+          cx.addNode(cur.tree!, pos)
+          end = prevEnd = cur.to - off
+          blockI = prevI = cx.block.children.length
+          if (!nextNode(cur)) break
+          continue
+        }
+        if (cur.firstChild()) continue
+        break
+      }
       if (cur.to - off <= cx.ranges[cx.rangeI].to) { // Fits in current range
         cx.addNode(cur.tree!, pos)
       } else {
@@ -1913,7 +1927,7 @@
         prevEnd = cur.to - off
         prevI = cx.block.children.length
       }
-      if (!cur.nextSibling()) break
+      if (!nextNode(cur)) break
     }
     while (cx.block.children.length > blockI) {
       cx.block.children.pop()
@@ -1923,6 +1937,25 @@
   }
 }
 
+// Whether the last block of a balanced group may end taken content
+// (see NotLast).
+function endsInBlock(tree: Tree) {
+  for (;;) {
+    let last = tree.children[tree.children.length - 1]
+    if (!(last instanceof Tree)) return false
+    if (!last.type.isAnonymous) return last.type.is("Block") && NotLast.indexOf(last.type.id) < 0
+    tree = last
+  }
+}
+
+// Move to the next block, also out of a balanced group, but not out of
+// the block that holds the group.
+function nextNode(cur: TreeCursor) {
+  while (!cur.nextSibling())
+    if (!cur.parent() || !cur.type.isAnonymous) return false
+  return true
+}
+
 // Convert an input-stream-relative position to a
 // Markdown-doc-relative position by subtracting the size of all input
 // gaps before `abs`.
```

## Issue 2: a lazy paragraph line after a quote parses differently after an edit

This is a separate bug. It exists in 1.8.0 without the patch above, and the patch does not change it. Random edit tests found it in 2 of 6,000 edits.

### Text to file

**Title:** Incremental parse leaves a separate paragraph where a fresh parse continues a quote

```js
import { parser, GFM } from "@lezer/markdown"
import { TreeFragment } from "@lezer/common"

const md = parser.configure(GFM)
const before = "# f4]: https://x.y/4\n```js\nlet x = 5;\n\nlet y;\n```\n\n<div>\nhtml 6\n</div>\n\n---\n\n> quote 8\n> - list in quote\n>\n> more\n| a | b |\n|---|---|"
const insert = "\n    code", at = 128
const after = before.slice(0, at) + insert + before.slice(at)
const fragments = TreeFragment.applyChanges(TreeFragment.addTree(md.parse(before)), [{fromA: at, toA: at, fromB: at, toB: at + insert.length}])
console.log(md.parse(after, fragments).toString())
console.log(md.parse(after).toString())
```

The incremental tree ends with `...,QuoteMark,Paragraph),Paragraph)`: a separate top-level paragraph. The fresh tree ends with `...,QuoteMark,Paragraph))`: the lines continue the quote's paragraph. A second case: replace characters 128 to 135 of

```
"```js\nlet y;\n```\n<!-- comment 9 -->\n<!-- comment 10 -->\n[ref11]: https://x.y/11\n> quote 12\n> - list in quote\n>\n> more\n| a | b |\n|---|---|"
```

with a tab. It gives the same difference.
