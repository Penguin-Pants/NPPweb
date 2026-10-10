# NPPweb

A private, single-owner text editor in the browser, inspired by Notepad++. Documents live on the server, so they are the same on every device. One password protects the app. It runs as one service on Railway with a persistent volume.

Features: tabs, autosave, plain text editing with line numbers, syntax highlighting for 11 languages, literal find and replace in the current tab, a document list, a keep-or-delete prompt when you close a tab, a warning when another device changed the same document, dark and light themes, and install as a desktop app in Chrome or Edge.

For Markdown: a Visual mode (live preview) with one Visual/Raw toggle, a formatting toolbar, an outline of the headings, word and character counts, Mermaid diagrams, export to `.md`, `.txt`, `.html` and PDF, and drag and drop to open `.md`, `.txt` and `.html` files.

## Local setup

Needs Node.js 24.2 or later (24.x).

1. `npm ci`
2. Create a `.env` file (it is gitignored) with at least `OWNER_PASSWORD=<a password of 12 or more characters>`.
3. `npm run dev` builds the frontend and starts the server on http://localhost:3000. It reads `.env` and restarts when server files change. Run `npm run build` again after frontend changes.

Data goes to `./data/notepad.db` unless `DATA_DIR` is set.

## Tests

1. `npm test` runs the unit and API tests.
2. `npx playwright install chromium firefox webkit` installs the test browsers (once per Playwright version).
3. `npm run test:e2e` builds the frontend and runs the browser tests. Chromium runs every spec. Firefox and WebKit run the specs tagged `@smoke`. The performance spec runs last and alone, after the others pass, because tests running beside it change its times. `npx playwright test --project=perf --no-deps` runs only the performance spec. Each test starts its own server with a fresh data folder.

## Configuration

| Variable | Required | Meaning |
|----------|----------|---------|
| `OWNER_PASSWORD` | Yes for the first start and for a reset | Seeds the first password. Ignored after you change the password in the app, unless `RESET_PASSWORD` is set. |
| `RESET_PASSWORD` | No | `true` or `1` (any case). While it is set, every start replaces the stored password with `OWNER_PASSWORD` and signs out all devices. |
| `NODE_ENV` | Yes on Railway | `production` turns on Secure cookies, HSTS and the volume check. |
| `DATA_DIR` | No | Data folder. Default: `RAILWAY_VOLUME_MOUNT_PATH`, else `./data`. |
| `RAILWAY_VOLUME_MOUNT_PATH` | Set by Railway | Used as the data folder when `DATA_DIR` is not set. |
| `PORT` | Set by Railway | Listen port. Default 3000. |

In production the app refuses to start without `DATA_DIR` or `RAILWAY_VOLUME_MOUNT_PATH`, so documents never land on the temporary container disk.

## Deploy on Railway

`railway.json` sets the build command, start command, health check (`/healthz`) and restart policy.

Owner checklist for the first deploy:

1. Create a Railway project from this GitHub repo.
2. Add a volume to the service with mount path `/data`.
3. Keep the service at 1 replica. Railway does not allow replicas with a volume.
4. Set the variables `NODE_ENV=production` and a strong `OWNER_PASSWORD`.
5. Generate a Railway domain.
6. Open `https://<domain>/healthz`. It must return `{"ok":true}`.
7. In the deploy logs, find the line `Database: /data/notepad.db`.
8. Redeploy. Then run `railway volume files list /` and confirm that `notepad.db` is still there. This command needs Railway CLI 5 or later (`npm i -g @railway/cli`).

Railway deploys `main` automatically. A redeploy has a short downtime because the service has a volume. Unsaved text stays in the browser and saves when the server is back.

## Password

- **First start:** the app stores a hash of `OWNER_PASSWORD`. A password shorter than 12 characters works but logs a warning.
- **Change:** Account > Change password. It needs the current password. The new one needs 12 to 256 characters. All other devices are signed out.
- **After a change:** the in-app password wins. Changing `OWNER_PASSWORD` in Railway then does nothing, and the log says so at every start.
- **Reset (forgotten password):**
  1. Set `OWNER_PASSWORD` to the new password and set `RESET_PASSWORD=true`.
  2. Redeploy. Sign in with `OWNER_PASSWORD`.
  3. Delete `RESET_PASSWORD` and redeploy.

Remove `RESET_PASSWORD` after recovery. While it is set, every start resets the password and signs out all devices.

- **No password at all:** with no `OWNER_PASSWORD` and no stored password, the app refuses to start and logs `No password configured. Set OWNER_PASSWORD.`
- **Sessions** last 30 days per device. Sign out is in the Account menu.
- **Wrong passwords:** after 5 failures from one address, or 30 in total, sign-in is blocked for up to 15 minutes.

## Install as a desktop app

In Chrome or Edge, open the app URL and sign in. Then click the install icon at the right end of the address bar, or use the install entry in the browser menu.

The installed app opens in its own window. Firefox and Safari use the app in a normal tab.

## Keyboard shortcuts

| Action | Windows and Linux | macOS |
|--------|-------------------|-------|
| New document | Ctrl+N or Alt+N | Cmd+N or Option+N |
| Close tab | Ctrl+W or Alt+W | Cmd+W or Option+W |
| Save now | Ctrl+S | Cmd+S |
| Find | Ctrl+F | Cmd+F |
| Replace | Ctrl+H | Cmd+H |
| Undo, redo | Ctrl+Z, Ctrl+Y | Cmd+Z, Cmd+Shift+Z |

Ctrl+N and Ctrl+W (Cmd+N and Cmd+W) work only in the installed app window. In a normal browser tab the browser keeps them for itself. Alt+N and Alt+W work everywhere, also in Firefox. On macOS, Cmd+H can hide the window instead (a system shortcut). If it does, use the Find button and its replace field.

In the find panel, Enter goes to the next match, Shift+Enter to the previous one and Escape closes the panel. Search is literal text and ignores case.

In a Markdown tab, Ctrl+B (Cmd+B) makes text bold, Ctrl+I (Cmd+I) italic and Ctrl+K (Cmd+K) a link. The outline list is one Tab stop: the arrow keys, Home and End move in it and Enter goes to the heading. In menus, the arrow keys move between the items and Escape closes the menu. In the editor, Tab indents: press Escape and then Tab to move the focus out of the editor.

## Markdown

- **Visual and Raw:** the toggle in the top bar switches every Markdown tab. Visual mode hides the Markdown marks and shows the formatting. The line with the cursor shows its marks, so you can edit them. The choice is stored in this browser.
- **Toolbar:** heading level, bold, italic, lists, link, quote, inline code and code block. Each button also removes the format when it is there.
- **Outline:** the left panel lists the headings. Click one to go to it. The Outline button hides or shows the panel.
- **Counts:** the status bar shows words and characters for the tab and for the selection. "Count syntax" switches between rendered text (default) and the raw Markdown.
- **Images:** a remote `https:` image shows a Load button and loads only after a click, until the page reloads. `data:` images show at once.
- **Diagrams:** a code block tagged `mermaid` shows as a diagram in Visual mode. Put the cursor in it (click it, or the arrow keys) to edit the source. Diagrams never load remote images in the editor.

## Export and drag and drop

- **Export menu:** exports the active tab with its current text, also unsaved edits. Markdown offers `.md`, `.txt` (Markdown marks removed), `.html` (one self-contained page, light theme, no scripts) and PDF (opens the print dialog; choose Save as PDF). Other documents offer their original source, when the name has an extension other than `.txt`, and `.txt`.
- **Drop files:** drop `.md`, `.markdown`, `.txt`, `.html` or `.htm` files on the page. Each becomes a new document with the file name, and opens in a tab. A taken name gets ` (2)`, ` (3)` and so on. Files over 1 MB, other types and text that is not UTF-8 are not opened, and a message names them. While a dialog is open, dropped files are not opened.

## Settings

Account > Settings sets the autosave delay: a whole number of seconds from 1 to 60, default 5. A document saves that many seconds after the last edit, and during nonstop typing no later than that many seconds after the first unsaved edit. The server stores the value, so it applies on every device after a reload.

## Known limits

- A document can hold at most 1 MB (1,048,576 bytes of UTF-8). A larger edit or paste is rejected with a message.
- Line endings are stored as LF. CRLF text becomes LF.
- Desktop browsers only. There is no phone or tablet layout.
- No offline use. The browser must reach the server to save.
- A redeploy causes a short downtime (the service has a volume). Text typed meanwhile saves when the server is back.
- Two devices editing one document get a conflict warning, not live sync.
- New documents are named "Untitled N" and start as Markdown. To change the type, use the language list in the status bar. An empty "Untitled N" tab closes without a prompt and its document is deleted.
- Visual mode shows diagrams as images, so diagram text cannot be selected there. The Mermaid ELK layout is not included; diagrams use the dagre layout.
- In PDF export, `http:` images do not load. `https:` images do.
- In the performance test, typing 200 characters in a 1 MB Markdown document of notes takes less than 3 seconds. In very dense Markdown (a heading, list, table or code block every few lines, all the way through 1 MB) each key takes longer, because the Markdown parser's work grows with the number of blocks.
- Notion sync is not built yet.

## Backups

Export saves one document at a time. Use Railway volume backups to protect `/data/notepad.db`.

## Third-party notices

The build writes `THIRD-PARTY-NOTICES.txt` next to the bundles, with the license text of each npm package that ships to the browser. Signed in, it is at `/THIRD-PARTY-NOTICES.txt`.
