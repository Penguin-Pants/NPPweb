# NPPweb v2 Markdown Features: Requirements

**Status:** Decision-complete. Open questions: none.
**Date:** 2026-10-10
**Purpose:** Single source of truth for a coding agent to turn into a build plan. This file does not include an implementation.
**Builds on:** `docs/planning/REQUIREMENTS.md` (v1). v1 requirements stay in force unless section 10 says otherwise.

---

## 1. Summary

- **Problem:** NPPweb edits Markdown as plain source only. The owner wants to write Markdown visually, see its structure, export it, open local files fast and copy documents to Notion.
- **User:** The one owner of the private NPPweb instance (ACC-1).
- **Outcome:** NPPweb keeps all v1 behavior and adds, for Markdown documents, a visual editing mode with one toggle, an outline panel, a formatting toolbar, highlighted code blocks and Mermaid diagrams. All documents get live counts, export, drag and drop open, a configurable autosave delay and opt-in push to Notion.

---

## 2. Decision log

Numbering continues from v1 (D1 to D13).

| # | Topic | Decision | Rejected |
|---|-------|----------|----------|
| D14 | Product | Extend NPPweb. Keep server storage, login, tabs, conflict handling and the 11 languages. | Markdown-first rework, new separate app |
| D15 | Scope of visual mode and outline | Markdown documents only. Other types keep the code editor. | Markdown and HTML, all documents |
| D16 | Autosave trigger | Save N seconds after the last edit. During nonstop editing, save at least every N seconds. Default N = 5. | Pause only, fixed timer only |
| D17 | Autosave setting storage | On the server. One value for all devices. | Per browser |
| D18 | Dropped files | Each file becomes a new server document. | Local-only tab, ask each time |
| D19 | Layout | Open documents stay as tabs at the top. The left panel shows the outline. The Documents list moves to a top-bar dropdown. | Shared left panel, two left columns, list on the right, modal dialog |
| D20 | Mode toggle | One mode for all Markdown tabs. Visual first. The choice is remembered. | Raw first, per document |
| D21 | Counts | Words and characters. A toggle switches between syntax excluded and syntax included. Selection counts too. | Second character count without spaces |
| D22 | Notion direction | Push only. NPPweb is the source of truth. | Push plus import, two-way sync |
| D23 | Notion trigger | Opt-in per document. Each successful save pushes. | Manual button, all documents |
| D24 | Notion location | Child pages under one parent page. | Database rows, Private top level |
| D25 | Notion token | Railway variable. | In-app settings screen |
| D26 | Notion page lifecycle | Rename updates the title. Delete moves the page to Notion trash. Sync off leaves the page. | Never delete, ask on delete |
| D27 | Notion document types | All types. | Markdown only, Markdown and .txt |
| D28 | New syntax highlighting | Fenced code blocks in visual mode and in HTML and PDF export. | More code-editor languages |
| D29 | .txt export of Markdown | Markdown syntax removed. | Raw Markdown |
| D30 | Export of other types | Own extension and .txt. | All four formats, own extension plus .pdf |
| D31 | Drop name clash | Keep both. Add a number suffix. | Ask each time, open the existing document |
| D32 | Visual mode engine | Live preview inside the current CodeMirror 6 editor. The source never changes on toggle. | True rich-text editor (Milkdown, Tiptap), Monaco |
| D33 | PDF export | Browser print dialog with Save as PDF. Selectable text. One extra click. | html2pdf.js image download, server-side PDF |
| D34 | Optional extras | Mermaid diagrams and an animated theme switch. | Math formulas (deferred) |
| D35 | Formatting input | Toolbar and keyboard shortcuts. | Shortcuts only, typed Markdown only |
| D36 | Remote images | Click to load in Visual mode. Exports keep image tags. | Always load, never load |
| D37 | Proposed defaults | Accepted in full. | None |

---

## 3. Requirements

"Markdown document" means a tab whose resolved language is Markdown (EDT-4). A `.txt` document with a manual Markdown override counts. A `.md` document with a manual plain-text override does not.

### 3.1 Layout

| ID | Requirement | Done when |
|----|-------------|-----------|
| LAY-1 | Open documents stay as tabs in one horizontal row at the top. | Tab behavior in EDT-1 is unchanged. |
| LAY-2 | A collapsible left panel shows the outline (section 3.3). One top-bar button opens and closes it. | The button toggles the panel. The editor gets the freed width. |
| LAY-3 | The Documents list moves into a dropdown under its top-bar button. It keeps open, rename and delete (DOC-4). | All three actions work from the dropdown. The left panel no longer holds the list. |
| LAY-4 | The dropdown closes on Escape, on a click outside and after Open. Arrow keys move through it. | Each close path and keyboard navigation work. |
| LAY-5 | The panel open or closed state is remembered per browser. The first visit shows it open. | The state survives a reload. |

### 3.2 Markdown visual mode

| ID | Requirement | Done when |
|----|-------------|-----------|
| MDV-1 | Markdown documents have two modes: Visual and Raw. One toggle button switches them. Other documents show no toggle. | The toggle switches the mode. It is absent on a `.py` tab. |
| MDV-2 | The mode applies to all Markdown tabs. A first visit starts in Visual. The choice is remembered per browser, like the theme in EDT-6. | A reload keeps the last mode. |
| MDV-3 | Visual mode is a live preview inside the CodeMirror 6 editor. It hides Markdown marks and shows the styles in place. A toggle never changes the document text and never starts a save. | Raw, Visual, Raw on a file with setext headings, reference links, `*` and `+` lists, `1)` lists, HTML blocks, 3 blank lines and `~~~` fences gives identical bytes. |
| MDV-4 | Visual mode styles GitHub Flavored Markdown: headings, bold, italic, strikethrough, inline code, links, images, bulleted, numbered and task lists, block quotes, horizontal rules, tables and fenced code blocks. | Each element shows styled in Visual mode. |
| MDV-5 | Marks show again on each line that the cursor or the selection touches. | Moving the cursor onto a heading line shows its `#` marks. |
| MDV-6 | Undo history, cursor position and scroll position stay the same across a toggle. | Undo after a toggle reverts the last edit made before it. |
| MDV-7 | A click on a task-list checkbox switches `[ ]` and `[x]`. Ctrl+click (Cmd+click on macOS) on a link opens it in a new browser tab. A plain click places the cursor. | All three click actions work. |
| MDV-8 | Raw HTML inside Markdown stays visible as source text in Visual mode. It is not rendered. | A `<script>` or `<img onerror>` in a document runs nothing. |
| MDV-9 | A formatting toolbar shows on Markdown tabs: bold, italic, heading level, bulleted list, numbered list, link, quote, inline code and code block. It shows in both modes. Each button adds or removes Markdown marks. | Each button changes the selection or current line as named. |
| MDV-10 | Shortcuts on Markdown tabs: Ctrl+B bold, Ctrl+I italic, Ctrl+K link (Cmd on macOS). | All three work in normal tabs in Chrome, Edge, Firefox and Safari. Unverified assumption: each browser lets a page take Ctrl+K. Verify in the E2E suite. |
| MDV-11 | Fenced code blocks show syntax highlighting in Visual mode, HTML export and PDF for the 11 languages of EDT-3. An unknown or missing language tag shows plain monospace text. | A `python` block shows colored tokens in all three places. |
| MDV-12 | Code blocks tagged `mermaid` show as diagrams in Visual mode, HTML export and PDF. Raw mode shows the source. Visual mode also shows the source while the cursor is inside the block. | A flowchart block shows as a diagram in all three places. |
| MDV-13 | Mermaid loads only when an export or the active tab in Visual mode holds a `mermaid` block. It runs with `securityLevel: 'strict'`. The ELK layout is not included (C6). | A page load whose active tab holds no `mermaid` block does not fetch Mermaid. A restored active tab with a `mermaid` block in Visual mode does fetch it. |
| MDV-14 | Visual mode does not load remote `https:` images by itself. Each one shows its alt text and a Load button. A click on Load shows that image until the page reloads. `data:` images show at once. | No request goes to an image host before a click. After the click, the image shows. |

### 3.3 Outline

| ID | Requirement | Done when |
|----|-------------|-----------|
| OUT-1 | The outline lists the headings of the active Markdown tab in document order, indented by level H1 to H6. | A file with 6 levels shows 6 indent steps. |
| OUT-2 | The outline updates while the user types, within 500 ms after the last change. | A new heading shows in the outline. |
| OUT-3 | A click on an entry moves the cursor to that heading and scrolls it into view. | The heading is visible and holds the cursor. |
| OUT-4 | The entry of the section that holds the cursor is highlighted. | Moving the cursor moves the highlight. |
| OUT-5 | It reads ATX (`#`) and setext (`===`, `---`) headings. It ignores `#` lines inside code blocks. It is the same in both modes. | Code-block `#` lines do not show. |
| OUT-6 | A non-Markdown tab shows "Outline is available for Markdown documents." A Markdown tab without headings shows "No headings." | Both messages show in their cases. |

### 3.4 Counts

| ID | Requirement | Done when |
|----|-------------|-----------|
| CNT-1 | The status bar shows live word and character counts for the active tab. | Typing changes the counts. |
| CNT-2 | On Markdown tabs, a toggle switches between syntax excluded (rendered text) and syntax included (raw text). The default is excluded. The choice is remembered per browser. | `**bold**` counts 4 characters excluded and 8 included. |
| CNT-3 | With a non-empty selection, the status bar also shows counts for the selection, in the same mode. | Selecting one word shows 1 word for the selection. |
| CNT-4 | Non-Markdown tabs count raw text and show no toggle. | A `.py` tab shows counts and no toggle. |
| CNT-5 | A word is a word-like segment from `Intl.Segmenter`. A character is a user-perceived character (grapheme cluster). Spaces count. Line breaks do not. | One emoji counts 1 character. |
| CNT-6 | Syntax-excluded text uses the same rules as `.txt` export (EXP-3). | Both give the same text for the same input. |
| CNT-7 | Counts update within 300 ms after the last change, also in a 1 MB document. | Measured in the performance test. |

### 3.5 Autosave

| ID | Requirement | Done when |
|----|-------------|-----------|
| SAV-1 | A document with unsaved changes saves N seconds after the last edit. During nonstop editing it saves no later than N seconds after the first unsaved edit. | Typing nonstop for 3N seconds gives at least 2 saves. A pause gives one save N seconds later. |
| SAV-2 | N is an owner setting. Default 5. The server stores it, so it applies on every device. | A change on device A shows on device B after a reload. |
| SAV-3 | N is a whole number from 1 to 60. A Settings dialog in the Account menu edits it. An invalid value is rejected with a message. | 0, 61 and 2.5 are rejected. |
| SAV-4 | A new N applies to the next scheduled save on the device that changed it. Other devices read it at the next page load. | Behavior matches on both devices. |
| SAV-5 | Ctrl+S, the status label, retries, conflict handling and the close warning stay as in v1. | The v1 status, retry, conflict and close-warning tests pass. The v1 1-second timing tests (`web/test/autosave.test.js:44`) change to SAV-1 timing. |

### 3.6 Export

| ID | Requirement | Done when |
|----|-------------|-----------|
| EXP-1 | An Export menu in the top bar exports the active tab. Each choice downloads a file at once, except PDF (EXP-5). | Each format downloads without a further prompt. |
| EXP-2 | Markdown tabs offer `.md`, `.txt`, `.html` and `.pdf`. Other tabs offer their own extension and `.txt`. | A `.py` tab offers `.py` and `.txt` only. |
| EXP-3 | `.md` export is the raw source. `.txt` export of Markdown removes Markdown syntax by these rules: remove heading, emphasis, quote and fence marks; a link becomes its text; an image becomes its alt text; list items keep `-` or `1.`; table cells are separated by tabs; a horizontal rule becomes a blank line. `.txt` export of other types is the raw source. | A sample file gives the expected text. |
| EXP-4 | `.html` export is one self-contained file: inline CSS, light theme, highlighted code, Mermaid as inline SVG, no scripts, sanitized output and the document name as `<title>`. It keeps remote image tags. | With no network, the file opens and looks like Visual mode, except remote images. |
| EXP-5 | `.pdf` export opens the browser print dialog with the rendered document. The user picks Save as PDF. The text is selectable. It uses the light theme and the same rendering as `.html` export, so remote images load. | The saved PDF has selectable, searchable text. |
| EXP-6 | The file name is the document name with its extension replaced (`notes.md` becomes `notes.html`). A name without an extension gets one. Characters that are invalid in file names become `_`. | `a/b.md` exports as `a_b.md`. |
| EXP-7 | Export uses the current editor content, also unsaved changes. | An edit typed 1 second before export is in the file. |

### 3.7 Drag and drop

| ID | Requirement | Done when |
|----|-------------|-----------|
| DRP-1 | Files dropped on the page with the extensions `.md`, `.txt` or `.html` each become a new server document named as the file. Each opens in a new tab. | A dropped `notes.md` shows in the Documents list and on another device. |
| DRP-2 | If a document with the same name exists, the new one gets ` (2)`, ` (3)` and so on before the extension. Nothing is overwritten. The name compare ignores case. | Dropping `notes.md` twice gives `notes.md` and `notes (2).md`. |
| DRP-3 | `.markdown` and `.htm` are also accepted. The extension check ignores case. | `README.MD` is accepted. |
| DRP-4 | Several files open in drop order. The last one becomes the active tab. A rejected file shows a message with its name. The other files still open. | Dropping 3 valid files and 1 `.pdf` opens 3 tabs and shows 1 message. |
| DRP-5 | An overlay shows while files are dragged over the page. Dragging text inside the editor keeps the current editor behavior. | Both cases behave as stated. |
| DRP-6 | The language comes from the extension (EDT-4). An HTML file opens as HTML source in the code editor. CRLF becomes LF. A UTF-8 byte order mark is removed. | A dropped `.html` file shows HTML highlighting. |

### 3.8 Notion sync

| ID | Requirement | Done when |
|----|-------------|-----------|
| NOT-1 | Sync is push only. NPPweb is the source of truth. The next push overwrites edits made in Notion. | An edit made in Notion is gone after the next push. |
| NOT-2 | Sync is off for each document by default. The owner turns it on or off per document. All document types can sync. | New documents are not synced. Any type can be turned on. |
| NOT-3 | Turning sync on creates a child page under the configured parent page. Its title is the document name. Its content is the saved document content. | The page shows in Notion under the parent. |
| NOT-4 | After each successful save of a synced document, the server pushes the saved content to its Notion page. | A saved edit shows in Notion. |
| NOT-5 | The Notion token and the parent page come from Railway variables. The token never reaches the browser. All Notion calls run on the server. | No response to the browser holds the token. |
| NOT-6 | Rename updates the Notion page title. Delete moves the Notion page to Notion trash. Sync off stops pushes and leaves the page as it is. | Each action has the stated effect in Notion. |
| NOT-7 | Markdown documents push as Markdown. Other types push as one code block with the matching Notion language. `.txt` uses plain text. | A `.py` document shows as a Python code block. |
| NOT-8 | Each document has a sync status: off, synced, pending or error. The status bar shows it for the active tab. The Documents dropdown shows it per row. A click on the status bar item offers: turn sync on or off, open in Notion and retry now. | Each status shows in its case. |
| NOT-9 | At most one push runs per document. Saves during a push cause one more push with the newest content. A push never blocks or delays the NPPweb save. | Ten fast saves never have more than one push in flight. The last push holds the final content. |
| NOT-10 | Pending Notion jobs (content push, title update and archive) are stored in the database. They survive a server restart and run after start. | A restart during a pending push ends in synced. A restart during a pending archive still moves the page to Notion trash. |
| NOT-11 | Turning sync on again reuses the stored page if it exists and is not in trash. Else it creates a new page. | No duplicate page appears after off and on. |
| NOT-12 | Without the Railway variables, the sync control is disabled and names the missing variables. | The control shows the note. |
| NOT-13 | The token can be a personal access token or an internal integration token. The README explains both, including how to share the parent page with an internal integration. | The README has both setups. |

### 3.9 Theme

| ID | Requirement | Done when |
|----|-------------|-----------|
| THM-1 | Switching between dark and light animates as a circle reveal from the toggle button, by the View Transitions API. | The animation shows in Chrome, Edge, Firefox 144+ and Safari 18+. |
| THM-2 | Browsers without the API switch at once. With `prefers-reduced-motion: reduce`, the switch is instant. | Both cases switch with no animation. |

### 3.10 Quality

| ID | Requirement | Done when |
|----|-------------|-----------|
| NFR-2 | Visual mode, the outline and counts stay responsive in a 1 MB Markdown document. This extends NFR-1. | The performance test covers Visual mode. |
| NFR-3 | All libraries come from npm through the current esbuild build. No CDN scripts. `script-src` and `connect-src` stay `'self'`. | The CSP keeps those two values. |
| NFR-4 | Large libraries such as Mermaid load on demand, only when the active tab or an export needs them (MDV-13). | A page load whose active tab needs none of them fetches none of them. |
| NFR-5 | The toggle, toolbar, outline, Export menu, Documents dropdown and Notion menu have accessible names and work from the keyboard. The toggle uses `aria-pressed`. | A keyboard-only run reaches each control. |

---

## 4. Edge cases and failure behavior

Numbering continues from v1 (EDGE-1 to EDGE-9).

| ID | Situation | Behavior |
|----|-----------|----------|
| EDGE-10 | A dropped file is larger than 1 MB. | Reject it with the size message and its name. Create nothing. |
| EDGE-11 | A dropped file has another extension. | Reject it with a message and its name. |
| EDGE-12 | A dropped file is not valid UTF-8. | Reject it with a message and its name. |
| EDGE-13 | A dropped file is empty. | Create an empty document with the file name. |
| EDGE-14 | A drop happens while the server is unreachable or the session has expired. | Create nothing. Show a message. The user drops again later. |
| EDGE-15 | A Mermaid block has a syntax error. | Show the error text in place of the diagram. Keep the source. Exports show the source as a code block. |
| EDGE-16 | The Notion token is missing, wrong or expired. | Pause all pushes. Status error "Notion token rejected". NPPweb saves continue. |
| EDGE-17 | The Notion page was deleted or moved to trash in Notion. | The next push creates a new page and shows a message. |
| EDGE-18 | The parent page is not found or not shared with the integration. | Turning sync on fails with a message that names the cause. |
| EDGE-19 | Notion returns a rate limit error. | Wait for `Retry-After`, then retry. Status stays pending. |
| EDGE-20 | Content is too large for Notion. | Status error "Too large for Notion". The Notion page keeps its last pushed content. |
| EDGE-21 | Notion is down or the network fails during a content push, title update or archive. | Retry after 2, 4, 8, 16 and 30 seconds, then every 30 seconds, as autosave does (`web/src/autosave.js:6`). These writes set a full state, so a repeat gives the same result. |
| EDGE-22 | A synced document is deleted while Notion is unreachable. | The NPPweb delete completes. The archive job retries in the background and survives a restart (NOT-10). |
| EDGE-23 | Notion changes some formatting on push. | Accepted. Headings 5 and 6 become heading 4. Mermaid shows as a code block. Raw HTML can change. |
| EDGE-24 | The user cancels the print dialog. | Nothing happens. No error. |
| EDGE-25 | An image cannot load (relative path, `http:` URL or broken link). | Show its alt text in a placeholder box. No Load button for relative or `http:` URLs. |
| EDGE-26 | A Notion page create times out or returns 500, 502, 503 or 504. The page can exist even though the call failed. | Do not repeat the create blindly. First find out whether the page exists (from Notion retry guidance or a lookup under the parent page). Create again only when it does not. A retried create never leaves a duplicate page. |

---

## 5. Constraints

- **C5:** Extend the current stack: vanilla JavaScript, CodeMirror 6, esbuild, Fastify 5, `node:sqlite` and Node.js 24 (`package.json`).
- **C6:** The repo license is AGPL-3.0 (`LICENSE:1`). Code under MIT, BSD-3-Clause, Apache-2.0 or AGPL-3.0 can be used if its copyright and license notices stay. Mermaid's ELK layout depends on elkjs (EPL-2.0), which needs a legal check, so it is excluded. Confidence: medium (secondary sources).
- **C7:** The CSP is in `server/src/security-headers.js:3-11`. `img-src` adds `https:` for MDV-14. Nothing else changes.
- **C8:** The 1 MB document limit (`server/src/documents/routes.js:14`) applies to dropped files.
- **C9:** Database migrations are append-only (`server/src/migrations.js:2`).
- **C10:** Notion API limits. Confidence: medium (search excerpts of official pages, page fetch failed). Verify with one test call before the build.
  - About 3 requests per second per integration (180 per minute on non-Business plans).
  - Markdown page create fails above 5,000 blocks.
  - 2,000 characters per rich text object. 100 child blocks per append request.
  - Latest `Notion-Version` found: `2026-03-11`. Native Markdown create, read and replace endpoints exist.
  - Retry 429 and 529 responses. Retry 500, 502, 503 and 504 only for idempotent requests, unless the app has its own idempotency protection (EDGE-26). The response fields `retry_guidance` and `committed_resource_id` are unverified.
- **C11:** Notion calls run only on the server, because a browser cannot hold the token safely.
- **C12:** Railway runs one replica with a volume (README). One in-process worker that reads the stored Notion jobs (NOT-10) is enough.

---

## 6. Preferences and examples (not requirements)

### 6.1 Stack table from the request

The table matches the MarkTide-Viewer README word for word. It is one possible implementation, not a requirement.

| Row | Status |
|-----|--------|
| Vanilla JavaScript, HTML5, CSS3 | Kept. The app already uses them. |
| Monaco Editor | Not adopted (D32). It has no WYSIWYG mode, is about 4.6 MB minified and needs a CSP change for workers. |
| Marked.js | Builder choice (section 11). It does not sanitize, so DOMPurify is required if it is used. |
| Highlight.js | Not needed by default. The current Lezer grammars can render static highlighted HTML. |
| html2pdf.js | Not adopted (D33). Its PDFs are images with no selectable text. MarkTide also does not call it. |
| MathJax | Not adopted. Math is deferred (D34). |
| Mermaid.js | Adopted (D34, MDV-12). |
| View Transitions API + ripple fallback | Adopted (THM-1). A plain switch replaces the ripple fallback (THM-2). |

### 6.2 Reference projects

All four are sources of ideas. Code may be copied only with its notices (C6).

| Project | License | What to borrow |
|---------|---------|----------------|
| MarkTide-Viewer | Apache-2.0 (LICENSE file; the README says MIT) | Blob and `<a download>` export, PDF through an iframe print view, circle reveal theme switch, drop handler |
| StackEdit | Apache-2.0. Last release 2023-05-27. Vue 2. | Outline from headings, status bar counts |
| Chronicle | AGPL-3.0-or-later. A novel-writing tool, not a Markdown editor. | Save only when there are changes, single-file drop handler |
| allein | AGPL-3.0. Tauri, React and Monaco desktop app. | 1-second debounce autosave pattern. Its local AI features are not adopted. |

### 6.3 Other wording

- "Triggers auto download" for PDF: replaced by the print dialog (D33).
- "Notion integration": read as push sync only (D22).
- "All files auto-saved": every open document with unsaved changes, as v1 does now.

---

## 7. Non-goals

- Two-way Notion sync, Notion import, Notion webhooks and Notion database targets
- A true rich-text editor (Milkdown, Tiptap, ProseMirror) or Monaco
- Image-only PDFs or server-side PDF rendering
- Visual mode, outline, toolbar or Mermaid for non-Markdown documents
- Rendered `.md`, `.html` or `.pdf` export of non-Markdown documents. Their raw download in their own extension stays (EXP-2).
- New code-editor languages
- Rendering raw HTML inside Markdown in Visual mode
- Image upload, paste or storage
- Other sync targets (Google Drive, Dropbox, GitHub, WebDAV)
- AI features
- From v1, still out: multiple users, live sync, phone or tablet layout and offline use

---

## 8. Deferred ideas

- Math formulas (MathJax or KaTeX)
- Notion import or two-way sync
- Outline folding and a resizable left panel
- Image upload
- PDF or HTML export of code
- Drop support for code files such as `.py` or `.js`
- Backups (from v1)

---

## 9. Proposed build sequence

**This section is a proposal for the planning step. It adds no product decisions.**

| Milestone | Work | Covers |
|-----------|------|--------|
| M9 | Layout: tabs, left panel, Documents dropdown | LAY-1 to LAY-5 |
| M10 | Settings API and autosave timing | SAV-1 to SAV-5 |
| M11 | Visual mode, toggle, toolbar, shortcuts, code block highlighting, remote images | MDV-1 to MDV-10, MDV-14, the Visual mode part of MDV-11 |
| M12 | Outline, counts and the syntax-stripping rules that EXP-3 reuses | OUT-1 to OUT-6, CNT-1 to CNT-7 |
| M13 | Mermaid in Visual mode and theme animation | MDV-13, the Visual mode part of MDV-12, THM-1, THM-2 |
| M14 | Export and drag and drop | EXP-1 to EXP-7, DRP-1 to DRP-6, the export parts of MDV-11 and MDV-12 |
| M15 | Notion: test call first (C10), then sync | NOT-1 to NOT-13 |
| M16 | Hardening, README, performance | NFR-2 to NFR-5 |

---

## 10. Changes to v1

| v1 item | Change |
|---------|--------|
| Section 8, "Markdown preview or comments" | Markdown Visual mode is now in scope. Comments stay out. |
| Section 8, "local disk file access" | Drop to open reads local files into server documents. The app writes to local disk only through downloads. |
| Section 9, "Export, download and backups" | Export and download are in scope. Backups stay deferred. |
| DOC-3, "about 1 second after typing stops" | Replaced by SAV-1 to SAV-4. |
| DOC-4, list in the left panel | The list moves to the top-bar dropdown (LAY-3). Its actions do not change. |
| README, "The app has no export" | Update at build time. |

---

## 11. Left to the builder

- The Markdown-to-HTML renderer for export: Marked with DOMPurify or `@lezer/markdown`. Constraint: Visual mode, the outline, counts, `.txt` export and HTML and PDF export must agree on document structure.
- Whether to use an existing CodeMirror 6 live preview package or own decorations.
- Environment variable names. The README documents them.
- Settings API shape and the database schema for Notion links and the push queue.
- Notion language mapping and the pinned `Notion-Version`.
- Placement of the toggle, Export menu and toolbar.

---

## 12. Sources

- MarkTide-Viewer: https://github.com/zigzag-007/MarkTide-Viewer (README.md lines 105-114, LICENSE, `assets/js/print-handler.js`, `assets/js/theme-manager.js`)
- StackEdit: https://github.com/benweet/stackedit
- Chronicle: https://github.com/pazvanti/Chronicle
- allein: https://github.com/szilarddoro/allein
- Monaco: https://github.com/microsoft/monaco-editor/blob/main/README.md
- CodeMirror 6 decorations: `@codemirror/view` 6.43.14, `dist/index.d.ts`
- html2pdf.js: https://github.com/eKoopmans/html2pdf.js (README)
- Marked sanitizing: https://github.com/markedjs/marked (docs/INDEX.md)
- Mermaid security: https://github.com/mermaid-js/mermaid (docs/community/security.md)
- View Transitions support: https://github.com/Fyrd/caniuse (features-json/view-transitions.json)
- Notion Markdown API: https://developers.notion.com/guides/data-apis/working-with-markdown-content
- Notion limits: https://developers.notion.com/reference/request-limits
- Notion tokens: https://developers.notion.com/guides/get-started/personal-access-tokens

---

## 13. Open questions

None.
