# Build Plan: Private Web Notepad

**Status:** Built through P7 on branch `build/v1` (2026-10-09). 25 of 27 tasks are Done. T04 and T26 are blocked on the owner: they need the Railway deploy and the checks in section 9.1. No open plan decisions. U1 and U2 are resolved (D12 and D13). Proposed out-of-scope fixes are in `PLAN_REVIEW.md` section 11.
**Date:** 2026-10-09
**Inputs:** `REQUIREMENTS.md` (copy of `private-notepad-requirements.md`), `REQUIREMENTS_TRACEABILITY.md`, `PLAN_REVIEW.md`
**Codebase:** None yet. This is a new project.

---

## 0. Execution rules for coding agents

1. Read `AGENTS.md` (global and project) before any work. Precedence: `REQUIREMENTS.md` > `AGENTS.md` > conventions in this plan.
2. Execute one task at a time in dependency order. One task = one PR or one commit.
3. Do not start a task until all its dependencies show **Done** in section 9.
4. Each task ends with `npm test` green. From T10 onward, `npm run test:e2e` must also be green.
5. Update the status table in section 9 when a task is done. Record any deviation in `PLAN_REVIEW.md` section 9.
6. Do not build anything listed in Non-goals or Deferred ideas (`REQUIREMENTS.md` sections 8 and 9).
7. Never commit secrets. Use a gitignored `.env` file for local values.
8. If a task needs a product decision that this plan does not give, stop and ask the user.
9. Keep `main` deployable after every task. Railway deploys `main` automatically.

---

## 1. Executive summary

**Product:** A private, single-owner, Notepad++-style text editor in the browser. Documents live on the server and are the same on every device. Dark mode is the default.

**v1 scope:** Password login, install as a desktop app (Chrome and Edge), tabs, autosave, plain text editing, line numbers, syntax highlighting for 11 languages, literal find and replace on the current tab, a document list, a keep-or-delete close prompt, a conflict warning across devices and a 1 MB size limit.

**Architecture in one line:** One Node.js 24 service (Fastify 5) on Railway serves a bundled CodeMirror 6 frontend and a small JSON/text API. Data lives in one SQLite file on a Railway volume. A web app manifest makes it installable in Chrome and Edge.

**Size:** 27 tasks in 8 phases. 15 small (S) and 12 medium (M). No large tasks.

---

## 2. Architecture and technical decisions

### 2.1 System overview

```
Browser (desktop)
  Vanilla JS app + CodeMirror 6 (bundled by esbuild)
        |
        | HTTPS (Railway edge, sets X-Real-IP)
        v
Railway service (1 replica)
  Node.js 24 + Fastify 5
  - static files (dist/web)
  - auth gate (session cookie)
  - /api/* routes
        |
        v
SQLite file via node:sqlite
  /data/notepad.db on a Railway volume
```

### 2.2 Technology stack

| Component | Choice | Rationale |
|-----------|--------|-----------|
| Runtime | Node.js 24 LTS | One language for server and client. Includes `node:sqlite` and `node:test`. |
| Language | Plain JavaScript (ES modules) | No compile step on the server. Smallest toolchain. |
| HTTP server | Fastify 5 | Proven. Built-in `inject()` makes API tests fast without a network. |
| Cookies | `@fastify/cookie` | Proven cookie parsing and serialization. |
| Static files | `@fastify/static` | Serves the built frontend. |
| Database | SQLite via `node:sqlite` | One file on one volume. No native addon to build on Railway. |
| Editor | CodeMirror 6 (custom minimal setup) | Mature, fast on large files, modular. Lets us omit multi-cursor and regex search. |
| Bundler | esbuild | One fast command. No dev server needed. |
| Unit and API tests | `node:test` | Built in. No extra dependency. |
| E2E tests | Playwright | Real browser checks for UI flows and two-device conflicts. |
| Dialogs | Native `<dialog>` | Built-in focus handling and keyboard support. |
| Hosting | Railway, 1 service, 1 volume | Required (C1). Replicas are not possible with volumes. |

### 2.3 Key technical decisions

| ID | Decision | Rationale |
|----|----------|-----------|
| TD-1 | One service serves both frontend and API. | Fewest moving parts. Same origin, so no CORS. |
| TD-2 | Plain JS with JSDoc comments, no TypeScript. | Smaller toolchain for a solo, semi-technical owner. |
| TD-3 | `node:sqlite` with a thin `db.js` wrapper. | No native build. If `node:sqlite` causes problems, swap the wrapper to `better-sqlite3`. |
| TD-4 | Server-side sessions in SQLite. Cookie holds a random token. DB holds its SHA-256 hash. | Logout and "sign out other sessions" work instantly. No JWT revocation problem. |
| TD-5 | Passwords hashed with Node `crypto.scrypt`. | Built in. Memory-hard. No dependency. |
| TD-6 | `version` counts content changes only. Saves use `If-Match`. A mismatch returns 412. | Rename and language changes do not cause false conflicts. |
| TD-7 | Content travels as `text/plain` with a 1,048,576-byte body limit. | The byte limit is exact. JSON escaping would inflate size. |
| TD-8 | Custom CodeMirror setup. Do not use `basicSetup`. `allowMultipleSelections` is off. | `basicSetup` adds multi-cursor and regex search, which are non-goals. |
| TD-9 | Custom literal search panel. Do not use the default `searchKeymap`. | The default panel has regex, whole-word and case toggles. EDT-5 forbids regex and whole-word. |
| TD-10 | Login rate limiter is a small in-memory module with two buckets: per client IP and global. | Single instance, so memory is enough. The global bucket still works if IP data is wrong. |
| TD-11 | Client IP comes from `X-Real-IP`. | Railway docs name this header as the client IP. The edge overwrites it. |
| TD-12 | CSRF defense: `SameSite=Lax` cookie plus an `Origin` check on every state-changing request. | Two simple layers. No token plumbing. |
| TD-13 | In production, the app refuses to start without a volume path. | Prevents silent data loss on the ephemeral container disk. |
| TD-14 | esbuild and CodeMirror packages go in `dependencies`, not `devDependencies`. | The Railway build must install them even when `NODE_ENV=production`. |
| TD-15 | Clean (saved) open tabs refresh from the server on window focus and on tab activation. | Supports DOC-1 and prevents needless conflict dialogs. |
| TD-16 | The app ships a web app manifest and icons so Chrome and Edge can install it in its own window. Shortcut handlers for Ctrl/Cmd+N and Ctrl/Cmd+W call `preventDefault`. Alt+N and Alt+W also work everywhere. | Decisions D12 (U1) and D13 (U2). Normal tabs never receive Ctrl+N and Ctrl+W. Installed Chromium app windows do. |
| TD-18 | No caching service worker. Add a network-only service worker only if Chrome's install check requires one (T27). | Offline use is a non-goal. Server storage stays the single source of truth. |
| TD-19 | Manifest, icons and service worker script are public routes. | Browsers fetch the manifest without cookies by default. These files hold no data. |
| TD-17 | Migrations run at app start, not in a pre-deploy step. | Railway mounts volumes at start, not at build or pre-deploy time. |

### 2.4 Repository layout

```
/
├─ package.json            "type": "module", engines.node ">=24 <25"
├─ package-lock.json       committed
├─ .node-version           24
├─ .gitignore              node_modules, dist, data, .env, test-results, playwright-report
├─ railway.json            build, start and healthcheck config
├─ playwright.config.js
├─ README.md
├─ scripts/
│  └─ build-web.js         esbuild bundle + copy HTML/CSS to dist/web
├─ server/
│  ├─ src/
│  │  ├─ index.js          entry: config, db, bootstrap, listen, shutdown
│  │  ├─ app.js            buildApp({ config, db, clock, logger })
│  │  ├─ config.js
│  │  ├─ db.js             open, pragmas, migrate
│  │  ├─ migrations.js
│  │  ├─ security-headers.js
│  │  ├─ auth/
│  │  │  ├─ password.js    hash, verify, validateNewPassword
│  │  │  ├─ bootstrap.js   seed, reset, refuse
│  │  │  ├─ sessions.js
│  │  │  ├─ rate-limit.js
│  │  │  └─ gate.js        onRequest auth + origin check
│  │  ├─ documents/
│  │  │  ├─ repo.js
│  │  │  └─ routes.js
│  │  └─ routes/
│  │     ├─ auth.js
│  │     └─ health.js
│  └─ test/                *.test.js (node:test)
├─ web/
│  ├─ index.html
│  ├─ login.html
│  ├─ styles.css
│  ├─ manifest.webmanifest  install-as-app metadata (T27)
│  ├─ icons/               icon-192.png, icon-512.png, icon-maskable-512.png (T27)
│  ├─ src/
│  │  ├─ theme-init.js     sets data-theme before first paint
│  │  ├─ login.js
│  │  ├─ main.js
│  │  ├─ api.js
│  │  ├─ events.js         tiny event bus
│  │  ├─ theme.js
│  │  ├─ editor.js
│  │  ├─ autosave.js
│  │  ├─ tabs.js
│  │  ├─ session.js        re-login overlay
│  │  ├─ doclist.js
│  │  ├─ dialogs.js
│  │  ├─ languages.js
│  │  ├─ search-panel.js
│  │  ├─ shortcuts.js
│  │  ├─ conflict.js
│  │  ├─ size-limit.js
│  │  └─ sw.js             only if T27 needs it (network-only)
│  └─ test/                *.test.js for pure modules
├─ e2e/
│  ├─ fixtures.js          fresh server per test
│  └─ *.spec.js
└─ docs/planning/          REQUIREMENTS.md and the planning files
```

### 2.5 Configuration

| Variable | Required | Meaning |
|----------|----------|---------|
| `OWNER_PASSWORD` | Yes for first start and for reset | Seeds the first password. Ignored after an in-app password exists, unless `RESET_PASSWORD` is set. |
| `RESET_PASSWORD` | No | `true` or `1` (case-insensitive). While set, each start replaces the stored password with `OWNER_PASSWORD` and deletes all sessions. |
| `NODE_ENV` | Yes on Railway | `production` enables Secure cookies, HSTS and the volume check. |
| `DATA_DIR` | No | Overrides the data folder. |
| `RAILWAY_VOLUME_MOUNT_PATH` | Set by Railway | Used as the data folder when `DATA_DIR` is not set. |
| `PORT` | Set by Railway | Listen port. Default 3000 locally. |

**Data folder rule:** `DATA_DIR`, else `RAILWAY_VOLUME_MOUNT_PATH`, else `./data`. The `./data` fallback is allowed only when `NODE_ENV` is not `production`.

### 2.6 Data model (migration 1)

```sql
CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);                                  -- key 'password_hash'

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,      -- SHA-256 hex of the cookie token
  created_at INTEGER NOT NULL,      -- Unix ms
  expires_at INTEGER NOT NULL
);
CREATE INDEX sessions_expires_at ON sessions(expires_at);

CREATE TABLE documents (
  id         TEXT PRIMARY KEY,      -- crypto.randomUUID()
  name       TEXT NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  version    INTEGER NOT NULL DEFAULT 1,  -- content changes only
  language   TEXT,                  -- manual override, NULL = auto
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL       -- changes on content save and rename
);
```

- Pragmas: `journal_mode=WAL`, `busy_timeout=5000`, `foreign_keys=ON`.
- Migrations: ordered array in `migrations.js`. Track with `PRAGMA user_version`. Apply in one transaction at start.
- Language values: `plain`, `markdown`, `json`, `html`, `css`, `javascript`, `typescript`, `python`, `sql`, `yaml`, `shell`.
- Name rule: trimmed, 1 to 255 characters, no control characters. Duplicate names are allowed. Documents are identified by `id`.
- "Untitled N" rule: N = 1 + the highest N among names that match `^Untitled (\d+)$`. Use 1 if none match. Compute inside the insert transaction.

### 2.7 HTTP API

All `/api/*` routes except `POST /api/login` need a session. All responses from `/api/*` carry `Cache-Control: no-store`. Errors use `{ "error": "<code>", ...details }`.

| Method and path | Request | Success | Errors |
|-----------------|---------|---------|--------|
| `GET /healthz` | none | 200 `{ok:true}` | none (public) |
| `GET /login` | none | login page | none (public) |
| `POST /api/login` | JSON `{password}` | 204 + `Set-Cookie` | 401 `invalid_credentials`, 429 `rate_limited` + `Retry-After` |
| `POST /api/logout` | none | 204, cookie cleared | 401 |
| `GET /api/session` | none | 200 `{authenticated:true}` | 401 |
| `POST /api/password` | JSON `{currentPassword,newPassword}` | 204 | 400 `wrong_current_password`, 400 `weak_password` |
| `GET /api/documents` | none | 200 `[{id,name,version,language,updatedAt}]`, newest first | 401 |
| `POST /api/documents?name=<optional>` | `text/plain` body (may be empty) | 201 `{id,name,version,language,updatedAt}` | 400 `invalid_name`, 413 `too_large` |
| `GET /api/documents/:id` | none | 200 `{id,name,content,version,language,updatedAt}` | 404 `not_found` |
| `PUT /api/documents/:id/content` | `text/plain` body, header `If-Match: <version>` | 200 `{version,updatedAt}` | 428 `version_required`, 412 `version_conflict` + `currentVersion`, 404, 413 |
| `PATCH /api/documents/:id` | JSON `{name?, language?}` | 200 metadata | 400 `invalid_name` or `invalid_language`, 404 |
| `DELETE /api/documents/:id` | none | 204 | 404 |

**Notes**
- `POST /api/password` uses 400, never 401, for a wrong current password. The client treats 401 as "session expired".
- Save SQL: `UPDATE documents SET content=?, version=version+1, updated_at=? WHERE id=? AND version=?`. Zero changed rows means 404 (row missing) or 412 (version moved).
- Body limit for `text/plain` routes: 1,048,576 bytes. Map Fastify's body-too-large error to 413 `{error:"too_large", limitBytes:1048576}`.

### 2.8 Frontend behavior specifications

**Event bus (`events.js`):** `session-expired`, `doc-saved`, `doc-conflict`, `doc-deleted-remote`, `doc-renamed`, `doc-too-large`. Modules subscribe instead of importing each other.

**Editor (`editor.js`):** One `EditorView`. Each tab keeps its own `EditorState`, so undo history stays per tab. Extensions: `lineNumbers`, `highlightSpecialChars`, `history`, `drawSelection`, `highlightActiveLine`, `EditorState.allowMultipleSelections.of(false)`, keymap (`defaultKeymap`, `historyKeymap`, `indentWithTab`), theme compartment, language compartment, size-limit transaction filter, update listener. Expose `data-language` on the content element for tests.

**Autosave (`autosave.js`):** A pure scheduler with injected timers and an injected save function.
- Edit: status `unsaved`, restart a 1,000 ms debounce.
- Flush (Ctrl+S, tab close, timer): send the latest content. Only one save in flight per document. Edits during a save cause one more save after it.
- 200: store the new version. Status `saved` unless newer edits exist.
- Network error or 5xx: status `error`. Retry after 2, 4, 8, 16 and 30 seconds, then every 30 seconds.
- 401: pause all saves and emit `session-expired`. Resume and flush after re-login.
- 412: pause that document and emit `doc-conflict` with `currentVersion`.
- 404: pause that document and emit `doc-deleted-remote`.
- 413: status `error`, emit `doc-too-large`. No retry until the content changes.
- `beforeunload` warns when any document is `unsaved`, saving or `error`.

**Tabs (`tabs.js`):** Persist `{ids, activeId}` in `localStorage` key `pn.openTabs.v1`. On boot, drop IDs that no longer exist. With no stored tabs, show an empty state with "New document" and "Open document list". Load content on first activation. On window focus and on tab activation, fetch the list. Reload clean tabs whose server version is newer. Close clean tabs whose document is gone.

**Close flow:** Empty content plus a name that matches `^Untitled \d+$`: delete and close with no prompt. Otherwise show a dialog with **Keep** (default focus), **Delete permanently** and **Cancel**. Keep flushes the save first. If that save fails, the tab stays open with status `error`.

**Conflict flow (412):** Dialog "This document changed on another device." Choices:
- **Overwrite with mine:** `PUT` with `If-Match: currentVersion`. Another 412 shows the dialog again.
- **Load the other version:** `GET`, replace the tab state, mark clean.
- **Save mine as a new document:** `POST ?name=<name> (conflict copy)` with my content, open it in a new active tab, then reload the original tab from the server.

**Deleted elsewhere (404):** Dialog "This document was deleted on another device." Choices: **Save mine as a new document** (same name) or **Discard and close**.

**Theme:** `localStorage` key `pn.theme`. Default `dark`. `theme-init.js` loads in `<head>` and sets `data-theme` before first paint (CSP blocks inline scripts).

### 2.9 Security

- Passwords: scrypt, N=32768, r=8, p=1, 64-byte key, 16-byte random salt, `maxmem` 64 MiB. Stored as `scrypt$N$r$p$salt$hash`. Compare with `timingSafeEqual`. New passwords: 12 to 256 characters.
- Session cookie `pn_session`: 32 random bytes (base64url), `HttpOnly`, `SameSite=Lax`, `Path=/`, `Max-Age` 30 days, `Secure` when `NODE_ENV=production`. Lifetime is fixed at 30 days from sign-in.
- Password change deletes all other sessions. Reset deletes all sessions.
- Origin check: `POST`, `PUT`, `PATCH` and `DELETE` need an `Origin` header whose host equals the `Host` header. Otherwise 403 `bad_origin`.
- Rate limit: failed logins only. 5 per client IP per 15 minutes. 30 globally per 15 minutes. Checked before password verification. A successful login clears that IP's bucket.
- Headers on every response: `Content-Security-Policy: default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`. In production also `Strict-Transport-Security: max-age=31536000`.
- Logs never contain passwords, tokens or document content. Redact `cookie` and `authorization` headers.
- Public routes: `GET /login`, login assets (`login.js`, `theme-init.js`, `styles.css`), `GET /manifest.webmanifest`, `GET /icons/*`, `GET /sw.js` (if present), `GET /healthz`, `POST /api/login`. Everything else needs a session.
- Serve the manifest with `Content-Type: application/manifest+json`.

### 2.10 Startup sequence (`index.js`)

1. Load config. Resolve the data folder. Exit 1 on config errors.
2. Open the database and run migrations.
3. Run the password bootstrap. Exit 1 on failure.
4. Delete expired sessions.
5. Build the app and listen on `0.0.0.0:$PORT`.
6. On `SIGTERM` or `SIGINT`: close the app, close the database, exit 0.

---

## 3. Phases, dependencies and parallel work

| Phase | Tasks | Delivers |
|-------|-------|----------|
| P0 Foundation | T01 to T04 | Skeleton deployed on Railway with a persistent database |
| P1 Authentication | T05 to T10 | Working login, sessions, password change and E2E harness |
| P2 Documents API | T11 to T13 | Complete, tested document API |
| P3 Editor core | T14 to T17 | Usable multi-tab editor with reliable autosave |
| P4 Document management | T18 to T19 | Document list and close prompt |
| P5 Language, search, shortcuts | T20 to T22, T27 | Highlighting, find and replace, install-as-app, shortcuts |
| P6 Conflicts and limits | T23 to T24 | Two-device safety and size limit UX |
| P7 Release | T25 to T26 | Performance check, README, production verification |

### 3.1 Execution layers

Tasks in the same layer have no dependency on each other and can run in parallel. Exact dependencies are in each task and in section 9.

| Layer | Tasks |
|-------|-------|
| L0 | T01 |
| L1 | T02, T05 |
| L2 | T03 |
| L3 | T04, T06 |
| L4 | T07 |
| L5 | T08, T09, T11 |
| L6 | T10, T12, T13 |
| L7 | T14 |
| L8 | T15, T27 |
| L9 | T16, T24 |
| L10 | T17 |
| L11 | T18, T21, T23 |
| L12 | T19, T20 |
| L13 | T22, T25 |
| L14 | T26 |

**Sequential by necessity:** T03 before any data work, T07 before any protected route, T15 to T17 in order (each extends the previous editor flow), T26 last.

### 3.2 Critical path

T01 → T02 → T03 → T06 → T07 → T08 → T10 → T14 → T15 → T16 → T17 → T18 → T19 → T22 → T26

A path of equal length runs T18 → T20 → T25 → T26.

---

## 4. Task definitions

Sizes: **S** = one module plus tests. **M** = several files or a UI flow plus E2E tests.

### Phase P0: Foundation

#### T01 Scaffold repository and tooling (S)
- **Objective:** Create the fixed layout, scripts and a passing empty test run.
- **Requirements:** Enabler for all. DEP-1.
- **Implementation:**
  - `package.json`: `"type": "module"`, `engines.node ">=24 <25"`. Scripts: `build` (`node scripts/build-web.js`), `start` (`node server/src/index.js`), `dev` (build, then start with `--watch`), `test` (`node --test "server/test/**/*.test.js" "web/test/**/*.test.js"`), `test:e2e` (`playwright test`).
  - Dependencies: `fastify` (v5), `@fastify/cookie`, `@fastify/static`, `esbuild` (TD-14). Dev dependency: `@playwright/test`. Use the latest stable versions at install time and commit the lockfile.
  - `.node-version` (`24`), `.gitignore`, `README.md` stub.
  - `scripts/build-web.js`: bundle `web/src/main.js`, `web/src/login.js` and `web/src/theme-init.js` to `dist/web/` (ESM, minified, sourcemaps). Copy `web/*.html` and `web/styles.css`.
  - Placeholder files: `web/src/main.js`, `web/src/login.js`, `web/src/theme-init.js`, `web/index.html`, `web/login.html`, `web/styles.css`, one trivial test.
  - Copy the requirements file to `docs/planning/REQUIREMENTS.md`.
- **Dependencies:** None.
- **Acceptance criteria:** On a clean clone, `npm ci`, `npm run build` and `npm test` all succeed. `dist/web/` has the bundles.
- **Validation:** Run the three commands.

#### T02 Config, app factory, health route and entry point (S)
- **Objective:** Start a server that reads config and answers health checks.
- **Requirements:** DEP-1.
- **Implementation:** `config.js` (`loadConfig(env)` returns `{port, nodeEnv, isProduction, dataDir, ownerPassword, resetPassword}`). `app.js` (`buildApp` with `trustProxy: true`, logger with header redaction). `routes/health.js`. `index.js` per section 2.10, steps 1, 5 and 6 only.
- **Dependencies:** T01.
- **Acceptance criteria:** `npm start` serves `GET /healthz` with 200. `SIGTERM` exits with code 0. `RESET_PASSWORD` parses `true`, `TRUE` and `1` as true, all else false.
- **Validation:** `server/test/config.test.js`, `server/test/health.test.js` (inject).

#### T03 Database module and migrations (M)
- **Objective:** Persist data in SQLite with versioned migrations and a safe data folder.
- **Requirements:** DOC-2, DEP-2.
- **Implementation:** `db.js` (`openDatabase(dataDir)`: create folder, open `notepad.db`, set pragmas, run migrations). `migrations.js` (migration 1 per section 2.6). Data folder rule per section 2.5. In production with no `DATA_DIR` and no `RAILWAY_VOLUME_MOUNT_PATH`, throw "No persistent volume configured. Attach a Railway volume." Wire into `index.js` step 2. Close on shutdown.
- **Dependencies:** T02.
- **Acceptance criteria:** A fresh folder gets a DB with `user_version = 1` and the three tables. A second start is a no-op. Production without a volume path exits 1 with the message.
- **Validation:** `server/test/db.test.js` with temp folders. Production case in `config.test.js`.

#### T04 Railway deployment skeleton (M, owner-assisted)
- **Objective:** Prove build, start, volume and redeploy on Railway early.
- **Requirements:** DEP-1, DEP-2, DOC-2.
- **Implementation:**
  - `railway.json`: build command `npm run build`, start command `npm start`, healthcheck path `/healthz`, restart policy on failure. Verify field names against Railway config-as-code docs before committing.
  - **Owner steps** (agent writes them as a checklist; owner or Railway CLI performs them): create the project from the GitHub repo, add a volume with mount path `/data`, keep 1 replica, set `NODE_ENV=production` and a strong `OWNER_PASSWORD`, generate a Railway domain.
  - At this stage the app exposes only `/healthz`. No data is reachable.
- **Dependencies:** T03.
- **Acceptance criteria:** Deploy succeeds. `https://<domain>/healthz` returns 200. Logs show the DB path under `/data`. After a redeploy, `railway volume files list /` still shows `notepad.db`.
- **Validation:** Manual checklist. Record results in section 9 notes.

### Phase P1: Authentication

#### T05 Password hashing module (S)
- **Objective:** Hash and verify passwords safely.
- **Requirements:** ACC-1, ACC-4.
- **Implementation:** `auth/password.js`: `hashPassword`, `verifyPassword`, `validateNewPassword` per section 2.9.
- **Dependencies:** T01.
- **Acceptance criteria:** Round trip works. A wrong password fails. Two hashes of one password differ. Malformed stored values return false. Length rules enforced.
- **Validation:** `server/test/password.test.js`.

#### T06 Startup password bootstrap (M)
- **Objective:** Seed, reset or refuse at startup exactly as decided (D4).
- **Requirements:** ACC-3, ACC-4 (seed-only rule), ACC-5, ACC-8, EDGE-7, EDGE-8.
- **Implementation:** `auth/bootstrap.js` `ensurePassword({db, config, logger})`:
  1. `resetPassword` true: require `ownerPassword`, else fail with "RESET_PASSWORD needs OWNER_PASSWORD". Store its hash. Delete all sessions. Log a warning: "Password reset from OWNER_PASSWORD. Remove RESET_PASSWORD now."
  2. Else a stored hash exists: if `ownerPassword` is set and does not match, log "OWNER_PASSWORD is ignored because an in-app password is in use. Use RESET_PASSWORD to restore it."
  3. Else `ownerPassword` is set: store its hash. Warn if shorter than 12 characters.
  4. Else fail with "No password configured. Set OWNER_PASSWORD."
  - Wire into `index.js` step 3. Never log password values.
- **Dependencies:** T03, T05.
- **Acceptance criteria:** All four branches behave as listed. Failures exit 1. No log line contains a password.
- **Validation:** `server/test/bootstrap.test.js` with a captured logger.

#### T07 Sessions, auth gate, auth API and security headers (M)
- **Objective:** Protect every page and data route behind one password.
- **Requirements:** ACC-1, ACC-2, ACC-6 (server), DEP-4, EDGE-5.
- **Implementation:** `auth/sessions.js` (create, get with expiry check, delete, delete all, delete others, purge expired). `auth/gate.js` (public allowlist per section 2.9; HTML navigation without a session gets 302 to `/login`; other requests get 401; origin check). `routes/auth.js` (`/api/login`, `/api/logout`, `/api/session`). `security-headers.js`. Static serving of `dist/web` behind the gate. `GET /login` sends `login.html`. Add an `onRoute` hook that records all routes for the sweep test. Inject a `clock` for expiry tests. No sign-up or account routes.
- **Dependencies:** T06.
- **Acceptance criteria:** Correct password returns 204 with cookie flags per section 2.9. Wrong password returns 401 `invalid_credentials` with a generic message. Logout invalidates the session. A session is valid at 30 days minus 1 ms and invalid at 30 days plus 1 ms. Missing or foreign `Origin` returns 403. Every non-public route returns 401 or 302 without a session.
- **Validation:** `server/test/auth.test.js`, `server/test/gate.test.js` (route sweep), `server/test/headers.test.js` (production config sets `Secure` and HSTS).

#### T08 Login rate limiting (S)
- **Objective:** Slow down password guessing.
- **Requirements:** ACC-7, EDGE-5.
- **Implementation:** `auth/rate-limit.js` per section 2.9 with an injected clock. Key: `X-Real-IP`, else `request.ip`. Wire into `POST /api/login`. Return 429 with `Retry-After` and `retryAfterSeconds`.
- **Dependencies:** T07.
- **Acceptance criteria:** After 5 failures from one IP, the 6th attempt gets 429 even with the right password. The window resets after 15 minutes. Other IPs work until the global limit of 30. Success clears that IP's count.
- **Validation:** `server/test/rate-limit.test.js` (unit and inject).

#### T09 Change password API (S)
- **Objective:** Let the owner change the password in the app.
- **Requirements:** ACC-4, EDGE-6.
- **Implementation:** `POST /api/password` per section 2.7. Verify the current password, validate the new one, store the hash, delete other sessions, keep the current one.
- **Dependencies:** T07.
- **Acceptance criteria:** After a change, the old password fails and the new one works. Other sessions return 401. The current session still works. After rebuilding the app on the same DB with `OWNER_PASSWORD` still set, the new password still works.
- **Validation:** `server/test/password-route.test.js` including the restart simulation.

#### T10 Login page and E2E harness (M)
- **Objective:** Give the owner a login screen and give later tasks a browser test harness.
- **Requirements:** ACC-1, ACC-2, EDGE-5, EDT-6 (login page is dark by default).
- **Implementation:**
  - `web/login.html`, `web/src/login.js`, base `web/styles.css` with CSS variables for dark and light, `web/src/theme-init.js`. Generic error text. Rate-limit message with wait time. Redirect to `/` on success.
  - `e2e/fixtures.js`: test-scoped fixture that starts the server on a free port with a fresh temp `DATA_DIR`, `OWNER_PASSWORD=e2e-password-123` and `NODE_ENV=test`. Wait for `/healthz`. Stop it after the test. Export a `login(page)` helper and an `api` helper (Playwright request context with the session cookie).
  - `playwright.config.js`: project `chromium` (all specs), projects `firefox` and `webkit` (specs tagged `@smoke`). Global setup runs `npm run build`.
- **Dependencies:** T08.
- **Acceptance criteria:** Visiting `/` without a session lands on `/login`. A wrong password shows a generic error. The right password lands on `/`. Six wrong attempts show the rate-limit message.
- **Validation:** `e2e/login.spec.js` (tagged `@smoke`).

### Phase P2: Documents API

#### T11 Document repository and list, create and get routes (M)
- **Objective:** Store and read documents on the server.
- **Requirements:** DOC-1, DOC-4 (naming), DOC-8 (create path).
- **Implementation:** `documents/repo.js` (`list`, `create`, `get`). `documents/routes.js` for `GET /api/documents`, `POST /api/documents`, `GET /api/documents/:id` per section 2.7. "Untitled N" and name rules per section 2.6. Body-limit error mapping to 413.
- **Dependencies:** T07.
- **Acceptance criteria:** List is newest first and excludes content. Create without a name gives "Untitled 1", then "Untitled 2". With "Untitled 1" renamed away and "Untitled 2" present, the next is "Untitled 3". A body of 1,048,577 bytes returns 413. Invalid names return 400. Unknown IDs return 404. All routes need a session.
- **Validation:** `server/test/documents.test.js`. Include a multi-byte case (for example "é" repeated so the UTF-8 size crosses the limit).

#### T12 Content save with version check (M)
- **Objective:** Save content safely across devices.
- **Requirements:** DOC-1, DOC-3 (server), DOC-8, CON-1 (server), EDGE-1 (server), EDGE-3.
- **Implementation:** `PUT /api/documents/:id/content` per section 2.7 with the conditional `UPDATE`.
- **Dependencies:** T11.
- **Acceptance criteria:** A matching `If-Match` saves and increments the version. A stale version returns 412 with `currentVersion` and leaves content unchanged. A deleted document returns 404. A missing `If-Match` returns 428. Exactly 1,048,576 bytes is accepted. One byte more returns 413 and leaves content unchanged. Empty content is accepted.
- **Validation:** `server/test/documents-save.test.js`.

#### T13 Rename, language override and delete routes (S)
- **Objective:** Manage document metadata and deletion.
- **Requirements:** DOC-4, EDT-4 (override storage).
- **Implementation:** `PATCH /api/documents/:id` and `DELETE /api/documents/:id` per section 2.7. PATCH changes `updated_at` but not `version`.
- **Dependencies:** T11.
- **Acceptance criteria:** Rename keeps the version and updates `updatedAt`. `language` accepts only the 11 values or `null`. Delete returns 204, then GET returns 404.
- **Validation:** `server/test/documents-meta.test.js`.

### Phase P3: Editor core

#### T14 App shell, theme and account menu (M)
- **Objective:** Provide the main layout, theme switch, logout and change-password UI.
- **Requirements:** EDT-6, ACC-4 (UI), ACC-6 (logout button).
- **Implementation:** `web/index.html` layout: top bar (New, Documents, theme toggle, account menu), tab strip, editor area, status bar (save status, language selector slot). `theme.js` (default `dark`, persist `pn.theme`). `api.js` (fetch wrapper; on 401 emit `session-expired`; until T16 the handler redirects to `/login`). `events.js`. `dialogs.js` (helpers for native `<dialog>`). Change-password dialog with current, new and confirm fields and API error messages. Logout calls `/api/logout` and goes to `/login`.
- **Dependencies:** T09, T10.
- **Acceptance criteria:** First visit shows `data-theme="dark"`. The toggle switches to light and survives a reload. Logout returns to `/login`, and `/` then redirects to `/login`. Changing the password works and the new password signs in.
- **Validation:** `e2e/shell.spec.js` (theme part tagged `@smoke`). `web/test/theme.test.js`.

#### T15 Editor with basic autosave (M)
- **Objective:** Edit one document with line numbers and save it automatically.
- **Requirements:** EDT-2, DOC-3 (basic), DOC-1.
- **Implementation:** Add `@codemirror/state`, `@codemirror/view`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/theme-one-dark` and `@lezer/highlight` to `dependencies`. `editor.js` per section 2.8 (language compartment holds plain text for now). `autosave.js` with debounce, single in-flight save and version tracking. Temporary single-document flow: open the newest document, or create one if none exist. T17 replaces this flow.
- **Dependencies:** T12, T14.
- **Acceptance criteria:** Line numbers show. Typing then pausing saves within about 1 second. A reload shows the saved text. Ctrl+click or Alt+click never creates a second cursor.
- **Validation:** `web/test/autosave.test.js` with `node:test` mock timers. `e2e/editor.spec.js` (save and reload tagged `@smoke`; cursor count via `.cm-cursor` elements).

#### T16 Save reliability: status, retry, unload guard and session expiry (M)
- **Objective:** Never lose text silently.
- **Requirements:** DOC-3, EDGE-2, EDGE-4.
- **Implementation:** Complete `autosave.js` per section 2.8. Status label with `aria-live="polite"`. `session.js`: re-login `<dialog>` that calls `/api/login` and then flushes all dirty documents. `beforeunload` guard. Until T23 lands, 412 and 404 show status `error` and keep the text.
- **Dependencies:** T15.
- **Acceptance criteria:** A failed save shows `error`, keeps the text and succeeds after the network returns. With the cookie cleared, an edit opens the re-login dialog. After login, the text saves with no loss. Closing the page with unsaved text triggers the browser warning.
- **Validation:** `web/test/autosave.test.js` (all state transitions). `e2e/save-reliability.spec.js` (Playwright `page.route` to fail PUTs, `context.clearCookies()`, `page.on('dialog')`).

#### T17 Tabs, new document and tab restore (M)
- **Objective:** Work with several documents at once on every device.
- **Requirements:** EDT-1, DOC-7, DOC-1.
- **Implementation:** `tabs.js` per section 2.8. Tab strip with active marker and unsaved dot. New button creates a document and opens it. Temporary close: flush, then close (T19 adds the prompt). Empty state. Refresh of clean tabs on focus and activation (TD-15). Remove the T15 single-document flow.
- **Dependencies:** T16.
- **Acceptance criteria:** Three tabs keep separate content and undo history. A reload restores the open tabs and the active tab. A deleted document is dropped from restored tabs. A change saved in browser context A shows in context B after B regains focus.
- **Validation:** `e2e/tabs.spec.js` (restore case tagged `@smoke`), including a two-context test.

### Phase P4: Document management

#### T18 Document list sidebar (M)
- **Objective:** Find, open, rename and delete documents.
- **Requirements:** DOC-4.
- **Implementation:** `doclist.js`: toggle sidebar, rows with name and last modified date (`toLocaleString`), newest first. Click opens or activates a tab. Rename via a dialog, then `PATCH`, update the tab title and emit `doc-renamed`. Delete via a confirm dialog that says the delete is permanent, then `DELETE` and close the tab if open (no second prompt). Refresh on open, on focus and after changes.
- **Dependencies:** T17, T13.
- **Acceptance criteria:** The list shows name and date, newest first. Open, rename and delete work. A renamed open document shows the new tab title. A deleted document disappears from the list and its tab closes.
- **Validation:** `e2e/doclist.spec.js`.

#### T19 Close prompt and empty untitled rule (S)
- **Objective:** Apply the decided close behavior.
- **Requirements:** DOC-5, DOC-6.
- **Implementation:** Replace the temporary close in `tabs.js` with the close flow in section 2.8.
- **Dependencies:** T18.
- **Acceptance criteria:** Keep leaves the document in the list. Delete removes it (API returns 404). Cancel keeps the tab open. An empty "Untitled N" tab closes with no dialog and leaves no document. An empty document with a custom name shows the dialog. If the Keep save fails, the tab stays open with status `error`.
- **Validation:** `e2e/close.spec.js` (includes a failed PUT through `page.route`).

### Phase P5: Language, search and shortcuts

#### T20 Syntax highlighting and language selection (M)
- **Objective:** Highlight the 11 languages and let the owner override the choice.
- **Requirements:** EDT-3, EDT-4, EDGE-9.
- **Implementation:** Add `@codemirror/lang-markdown`, `lang-json`, `lang-html`, `lang-css`, `lang-javascript` (JS and TS), `lang-python`, `lang-sql`, `lang-yaml` and `@codemirror/legacy-modes` (shell through `StreamLanguage`). `languages.js`: language table and extension map (`.md .markdown`, `.json`, `.html .htm`, `.css`, `.js .mjs .cjs`, `.ts .mts .cts`, `.py`, `.sql`, `.yaml .yml`, `.sh .bash .zsh`; case-insensitive; else `plain`). Pure `resolveLanguage(name, override)`. Status-bar selector: "Auto (detected)" plus the 11 languages. Change sends `PATCH language` (`null` for Auto) and reconfigures the compartment. `doc-renamed` triggers re-resolution when no override is set. Highlight style: one-dark theme in dark mode, `defaultHighlightStyle` in light mode.
- **Dependencies:** T18.
- **Acceptance criteria:** Each listed extension selects its language. Unknown or missing extensions select plain text. Renaming `a.py` to `a.sql` switches to SQL. An override wins over the extension and shows in a second browser context.
- **Validation:** `web/test/languages.test.js` (every extension, case, unknown, override). `e2e/language.spec.js` (checks `data-language` and that keyword tokens get a highlight class). One manual visual check per language.

#### T21 Find and replace panel (M)
- **Objective:** Literal find and replace on the current tab only.
- **Requirements:** EDT-5.
- **Implementation:** Add `@codemirror/search`. `search-panel.js`: `search({ top: true, createPanel })` with find input, replace input, Previous, Next, Replace, Replace all and Close. Use `SearchQuery({ search, replace, literal: true, regexp: false, wholeWord: false, caseSensitive: false })`. Enter = next, Shift+Enter = previous, Escape = close. Export `openFind(view)` and `openReplace(view)`. Do not add `searchKeymap`.
- **Dependencies:** T17.
- **Acceptance criteria:** Searching `a.c` matches only the literal text `a.c`. Replace changes one match. Replace all changes every match in the current tab and none in other tabs. The panel has no regex, whole-word or case controls.
- **Validation:** `e2e/find-replace.spec.js` (asserts no checkbox inputs exist in the panel).

#### T27 Install as a desktop app (S)
- **Objective:** Let Chrome and Edge install the app in its own window, where Ctrl+N and Ctrl+W reach the page.
- **Requirements:** EDT-8, EDT-7 (enabler).
- **Implementation:**
  - `web/manifest.webmanifest`: `name` and `short_name` ("Notepad" until branding is decided), `start_url: "/"`, `scope: "/"`, `display: "standalone"`, `background_color` and `theme_color` from the dark theme, icons 192 px, 512 px and 512 px maskable.
  - `web/icons/`: simple original PNG icons (no third-party logos).
  - `<link rel="manifest">` and `<meta name="theme-color">` in `index.html` and `login.html`. Build script copies the manifest and icons.
  - Add the routes to the public allowlist (TD-19).
  - Check Chrome DevTools > Application > Manifest on the deployed URL. If Chrome reports that a service worker is required, add `web/src/sw.js` with a fetch handler that only calls `fetch(event.request)` (no cache). Register it from `main.js` and `login.js`. Record the result in section 9 notes.
- **Dependencies:** T14.
- **Acceptance criteria:** The manifest and icons load without a session. Chrome and Edge show no installability errors. The installed app opens in its own window at the login page or editor. No response is cached by a service worker.
- **Validation:** `server/test/gate.test.js` (manifest and icons are public, correct content type). `e2e/install.spec.js` (manifest fields, link tag present). Manual install check in Chrome and Edge on the deployed URL.

#### T22 Keyboard shortcuts (S)
- **Objective:** Provide the decided shortcuts. In the installed app window, all five Ctrl shortcuts work.
- **Requirements:** EDT-7, EDT-8, EDT-9.
- **Implementation:** `shortcuts.js`: one capture-phase `keydown` listener on `document`, using `event.code`. Mod = Ctrl on Windows and Linux, Cmd on macOS. Bindings: Mod+N and Alt+N new; Mod+W and Alt+W close (runs the T19 flow); Mod+S flush the active save; Mod+F `openFind`; Mod+H `openReplace`. Call `preventDefault` first, before any other work, on handled keys. Button tooltips show the shortcuts. Alt bindings match by `event.code` so macOS Option characters are not typed.
- **Dependencies:** T19, T21, T27.
- **Acceptance criteria:** In the installed app window: Ctrl+N creates a document and no browser window opens. Ctrl+W starts the close flow and the window stays open. Ctrl+S saves before the 1-second debounce. Ctrl+F focuses the find field. Ctrl+H focuses the replace field. In a normal tab and in Firefox, Ctrl+S, Ctrl+F, Ctrl+H, Alt+N and Alt+W work.
- **Validation:** `e2e/shortcuts.spec.js` (Ctrl+N and Ctrl+W through synthetic events dispatched on `document`. Ctrl+S, Ctrl+F, Ctrl+H, Alt+N and Alt+W through real key presses, with Alt+N and Alt+W tagged `@smoke`). Manual check of all five in the installed app in Chrome and Edge, recorded in section 9.

### Phase P6: Conflicts and limits

#### T23 Conflict and deleted-elsewhere dialogs (M)
- **Objective:** Warn and give choices when two devices disagree.
- **Requirements:** CON-1, EDGE-1.
- **Implementation:** `conflict.js` handles `doc-conflict` and `doc-deleted-remote` per section 2.8. Autosave for that document stays paused until the user chooses.
- **Dependencies:** T17.
- **Acceptance criteria:** Each conflict choice gives the stated server result. "Save mine as a new document" creates "<name> (conflict copy)" and reloads the original. The deleted dialog offers save-as-new and discard, and both work.
- **Validation:** `e2e/conflict.spec.js`: open a document in the page, start typing, bump the version through the `api` helper, wait for the 412 dialog, then test each choice. Same pattern with a delete for the 404 case.

#### T24 Client size limit (S)
- **Objective:** Stop edits that would pass 1 MB before they reach the server.
- **Requirements:** DOC-8, EDGE-3.
- **Implementation:** `size-limit.js`: `utf8ByteLength(str)`. Transaction filter in `editor.js`: when the document is longer than 349,525 characters, compute the exact byte size of the result and reject changes above 1,048,576 bytes. Show "Document limit is 1 MB. The change was not applied." in the status bar.
- **Dependencies:** T15.
- **Acceptance criteria:** A paste or typed text that would pass the limit is rejected. The existing content stays unchanged. The message shows.
- **Validation:** `web/test/size-limit.test.js` (ASCII, multi-byte, surrogate pairs, boundary). `e2e/size-limit.spec.js`.

### Phase P7: Release

#### T25 Performance check for 1 MB documents (S)
- **Objective:** Prove NFR-1 with objective targets.
- **Requirements:** NFR-1.
- **Implementation:** `e2e/perf.spec.js` (chromium only): create a document of about 1,048,000 bytes of Python-like lines through the `api` helper and name it `big.py`. Targets: open and render under 2 seconds. Typing 200 characters under 3 seconds. Ctrl+End under 0.5 seconds. No console errors. If a target fails, profile and fix before marking done.
- **Dependencies:** T20, T24.
- **Acceptance criteria:** All targets pass locally. A manual scroll check feels smooth.
- **Validation:** `e2e/perf.spec.js`. Manual note in section 9.

#### T26 README and production verification (M, owner-assisted)
- **Objective:** Document operations and prove the deployed app meets the requirements.
- **Requirements:** DEP-1, DEP-3, DEP-4, DEP-5, DOC-2, ACC-3, ACC-5, EDGE-7.
- **Implementation:** `README.md`: purpose, local setup, variables (section 2.5), Railway setup (volume at `/data`, one replica, variables, domain), password model (seed, change, ignored variable, reset steps), "Remove `RESET_PASSWORD` after recovery. While it is set, every start resets the password and signs out all devices.", how to install the app in Chrome or Edge, shortcuts with the note that Ctrl+N and Ctrl+W work only in the installed app window and Alt+N and Alt+W work everywhere, known limits (1 MB, LF line endings, desktop only, brief downtime on redeploy), backups note (Railway volume backups exist; the app has no export).
- **Production checklist:**
  1. The domain shows the login page. `/` without a session redirects.
  2. The session cookie has `Secure`, `HttpOnly` and `SameSite=Lax`.
  3. Create a document and redeploy. Sign in again if needed. Confirm the document is still there.
  4. Change the password in the app. Confirm the old one fails.
  5. Set `RESET_PASSWORD=true` and redeploy. Confirm `OWNER_PASSWORD` works. Remove the variable and redeploy.
  6. Six wrong passwords trigger the rate limit.
  7. Smoke-test in current Chrome, Firefox and Safari or Edge on desktop.
  8. Install the app in Chrome and Edge. In the app window, Ctrl+N creates a document and Ctrl+W starts the close flow without closing the window.
  9. In a normal tab and in Firefox, Alt+N creates a document and Alt+W starts the close flow.
- **Dependencies:** All other tasks.
- **Acceptance criteria:** README covers every item above. The checklist passes and is recorded. `npm test` and `npm run test:e2e` (all projects) are green.
- **Validation:** Checklist record in section 9.

---

## 5. Milestones and phase completion criteria

| Milestone | Phase | Completion criteria |
|-----------|-------|---------------------|
| M0 Deployed skeleton | P0 | `/healthz` is live on Railway. The DB file survives a redeploy. `npm test` is green. |
| M1 Locked door | P1 | The deployed app shows only the login page without a session. Login, logout, rate limit and password change pass their tests. E2E harness runs in three browsers. |
| M2 Data layer | P2 | Every document route passes API tests for success, 404, 412, 413 and auth. |
| M3 Usable editor | P3 | The owner can open several tabs, type, see autosave status, recover from failures and survive session expiry with no text loss. |
| M4 Document management | P4 | List, rename, delete and the close prompt behave per DOC-4 to DOC-6. |
| M5 Feature complete | P5 | Highlighting, find and replace, install-as-app and shortcuts pass their tests. |
| M6 Safe across devices | P6 | Conflict, deleted-elsewhere and size-limit flows pass E2E tests. |
| M7 Release | P7 | Performance targets met. README complete. Production checklist passed. |

---

## 6. Testing approach

| Layer | Tool | Scope | When |
|-------|------|-------|------|
| Unit | `node:test` | Pure modules: password, bootstrap, rate limit, languages, autosave scheduler, size limit, config | Every task that adds one |
| API integration | `node:test` + Fastify `inject()` | Every route, with a temp DB per test file and an injected clock | From T02 |
| E2E | Playwright | UI flows, two-context sync and conflicts, session expiry, network failures | From T10 |
| Cross-browser smoke | Playwright Firefox and WebKit | Specs tagged `@smoke` | From T10 |
| Performance | Playwright | 1 MB document targets | T25 |
| Production | Manual checklist | Railway-specific behavior | T04 and T26 |

**Rules**
- Each task adds or updates tests in the same PR. A task is not done until its tests pass.
- E2E tests never depend on order or on data from other tests. Each test gets a fresh server and DB.
- No test-only routes exist in the app.

---

## 7. Deployment approach

- **Platform:** One Railway service built from the GitHub repo. Railway's default builder detects Node from `package.json` and `.node-version`.
- **Config as code:** `railway.json` (T04).
- **Storage:** One volume mounted at `/data`. One replica only, because Railway does not allow replicas with volumes.
- **Downtime:** Railway docs state a brief downtime on redeploy for services with volumes. The client retries saves, so no text is lost.
- **Migrations:** Run at app start (TD-17).
- **Rollback:** Redeploy the previous successful deployment in Railway. Migration 1 is the only migration in v1, so no down-migrations are needed.
- **Secrets:** Only in Railway variables and a local gitignored `.env`.

---

## 8. Risks and assumptions

Full details are in `PLAN_REVIEW.md`. Top items:

| ID | Item | Mitigation |
|----|------|------------|
| R1 | Ctrl+N and Ctrl+W work only in an installed Chrome or Edge app window. Normal tabs, Firefox and Safari keep the browser actions. | TD-16, T27. Alt+N, Alt+W and toolbar buttons work everywhere. |
| R7 | Chrome's install check may require a service worker. | T27 adds a network-only one only if needed (TD-18). |
| R2 | `X-Real-IP` may sometimes carry an edge address, so many clients could share one bucket. | Global bucket still protects. Lockouts last 15 minutes at most. |
| R3 | `node:sqlite` is a release candidate in Node 24. | Thin wrapper (TD-3). Swap to `better-sqlite3` if needed. |
| R4 | CodeMirror stores line endings as LF. CRLF text is saved as LF. | Documented in README. Not a requirement. |
| R5 | Empty "Untitled N" documents remain if the browser closes before the tab closes. | Low impact. They show in the list and can be deleted. |
| A1 | "Current desktop browsers" means current Chrome, Edge, Firefox and Safari. | Smoke tests in Chromium, Firefox and WebKit. |
| A2 | The owner has a Railway plan with volumes and a GitHub repo. | Confirmed in T04. |
| A3 | The owner uses Chrome or Edge for the installed app. | T26 item 8. |

---

## 9. Progress tracker

Update **Status** to `In progress` or `Done`. Add the PR or commit and short notes.

| ID | Title | Phase | Size | Depends on | Status | PR/commit | Notes |
|----|-------|-------|------|------------|--------|-----------|-------|
| T01 | Scaffold repository and tooling | P0 | S | none | Done | 719a632 | Node 24.21.0, npm 11.19.0. fastify 5.12.5, @fastify/cookie 11.1.3, @fastify/static 10.1.6, esbuild 0.28.2, @playwright/test 1.64.0. Build behavior test replaces the trivial test (`PLAN_REVIEW.md` section 9). `REQUIREMENTS.md` was already in place. |
| T02 | Config, app factory, health, entry | P0 | S | T01 | Done | f8543a4 | `start()` is exported from `index.js` with an injected `exit`, so SIGTERM and SIGINT are tested in-process. Extra tests: `app.test.js` (log redaction), `index.test.js`. |
| T03 | Database module and migrations | P0 | M | T02 | Done | b430bdb | `db.js` also exports `transaction()` (BEGIN IMMEDIATE). `node:sqlite` prints an ExperimentalWarning on start (R3). |
| T04 | Railway deployment skeleton | P0 | M | T03 | Blocked (owner) | 97e7a91 | `railway.json` and the owner checklist (README) are done. Deploy, `/healthz` check, DB path log and redeploy check are open: Railway CLI is not logged in on the build machine. `railway volume files list /` needs Railway CLI 5 or later. Only T26 depends on T04. |
| T05 | Password hashing | P1 | S | T01 | Done | cc84ab9 | Salt and hash are base64url. Length counts code points. |
| T06 | Startup password bootstrap | P1 | M | T03, T05 | Done | c624b79 | Warnings for the ignored variable and the short seed use warn level. A reset seed shorter than 12 characters also warns. |
| T07 | Sessions, gate, auth API, headers | P1 | M | T06 | Done | 6dbe61e, eb099f0 | `buildApp` is async. Missing session returns 401 `unauthorized`. Review fixes in eb099f0. |
| T08 | Login rate limiting | P1 | S | T07 | Done | 5f20151 | Each attempt counts before the password check, so parallel guesses cannot pass the limit. A success refunds its global count. |
| T09 | Change password API | P1 | S | T07 | Done | d39c437 | Hash store and other-session delete run in one transaction. |
| T10 | Login page and E2E harness | P1 | M | T08 | Done | cbc74f7, eb099f0 | Global setup runs `scripts/build-web.js` with the current Node binary. 15 E2E tests pass in Chromium, Firefox and WebKit. |
| T11 | Documents list, create, get | P2 | M | T07 | Done | 5d83a19, 9bcd481 | Non-text bodies return 415. Content is stored as UTF-8 bytes (9bcd481). |
| T12 | Content save with version check | P2 | M | T11 | Done | 665ab0e, 9bcd481 | A malformed If-Match also returns 428. A PUT needs a text/plain body. |
| T13 | Rename, language, delete routes | P2 | S | T11 | Done | 5036274 | A language-only PATCH keeps `updatedAt` (section 2.6). A non-object body returns 400 `invalid_request`. |
| T14 | App shell, theme, account menu | P3 | M | T09, T10 | Done | e349ee9, 3db544a | `theme-init.js` reuses `theme.js` and is built as an IIFE. Dialog close guard in 3db544a. |
| T15 | Editor with basic autosave | P3 | M | T12, T14 | Done | 6416f40 | The one-cursor test fails when multiple selections are turned on (checked). |
| T16 | Save reliability | P3 | M | T15 | Done | d12919d, 3db544a | `api.js` emits `session-expired` for every 401. Autosave only pauses. Shared sign-in error texts in `login-errors.js`. |
| T17 | Tabs, new document, tab restore | P3 | M | T16 | Done | 2958c6d, 3db544a | Read-only blank editor while no tab owns the view, and load retry (3db544a). |
| T18 | Document list sidebar | P4 | M | T17, T13 | Done | fe5abd2 | Delete closes the tab before it sends DELETE, so no pending save reaches the deleted document. |
| T19 | Close prompt and empty untitled rule | P4 | S | T18 | Done | 5b2a189 | An unloaded tab is fetched first, so the empty-untitled rule uses real content. |
| T20 | Highlighting and language selection | P5 | M | T18 | Done | 9dbffff, c705aca | Owner-pending: one manual visual check per language. Light mode uses defaultHighlightStyle, dark uses one-dark (screenshots checked). |
| T21 | Find and replace panel | P5 | M | T17 | Done | 4a8eb3e, c705aca | A Find button in the top bar opens the panel. Search state is per tab. |
| T22 | Keyboard shortcuts | P5 | S | T19, T21, T27 | Done | 5df4f3b, c705aca | Includes Alt+N and Alt+W (D13). Held keys act once. Owner-pending: all five shortcuts in the installed app in Chrome and Edge. |
| T27 | Install as a desktop app | P5 | S | T14 | Done | 2c759af | Service worker result: a persistent full Chromium 156.0.8078.4 profile reports no installability errors without a service worker, so no `sw.js` (TD-18). Owner-pending: DevTools Manifest check and install on the deployed URL in Chrome and Edge. |
| T23 | Conflict and deleted-elsewhere dialogs | P6 | M | T17 | Done | 78c36ee, ec94dfb | Choices run while the dialog stays open. Default focus is Save mine as a new document. The dialogs cannot be dismissed with Escape. |
| T24 | Client size limit | P6 | S | T15 | Done | 6ca12d8, ec94dfb | A change that makes an oversized document smaller is allowed. Typing in a 1 MB document stays fast (T25). |
| T25 | Performance check | P7 | S | T20, T24 | Done | 511115a | Chromium, 3 runs: open 75 to 81 ms, 200 typed characters 694 to 747 ms, Ctrl+End 11 to 14 ms, no console errors. Owner-pending: manual scroll check (section 9.1). |
| T26 | README and production verification | P7 | M | all | Blocked (owner) | 77b91ed | README done. The production checklist (section 9.1) needs the deployed app from T04. Extra owner check (P1 review 4): 6 wrong logins with 6 different X-Real-IP headers must get 429 on the 6th. |

**Resume rule:** Find the first task in table order whose status is not `Done` and whose dependencies are all `Done`. Run `npm test` and `npm run test:e2e` to confirm a green baseline before you continue.


### 9.1 Owner checklist record

These checks need the deployed app or a person. Status values: Pending, Passed, Failed. Record the date and result when you run each one.

| # | From | Check | Status |
|---|------|-------|--------|
| 1 | T04 | Deploy succeeds. `https://<domain>/healthz` returns 200. | Pending |
| 2 | T04 | The deploy log shows `Database: /data/notepad.db`. | Pending |
| 3 | T04 | After a redeploy, `railway volume files list /` still shows `notepad.db`. | Pending |
| 4 | T26 item 1 | The domain shows the login page. `/` without a session redirects. Then sign in. If sign-in returns 403 `bad_origin`, the Railway edge sends an `X-Forwarded-Host` that does not match the domain (unverified assumption, medium confidence): `server/src/auth/gate.js` then must compare the Origin with the raw `Host` header. | Pending |
| 5 | T26 item 2 | The session cookie has `Secure`, `HttpOnly` and `SameSite=Lax`. | Pending |
| 6 | T26 item 3 | Create a document and redeploy. Sign in again if needed. The document is still there. | Pending |
| 7 | T26 item 4 | Change the password in the app. The old one fails. | Pending |
| 8 | T26 item 5 | Set `RESET_PASSWORD=true` and redeploy. `OWNER_PASSWORD` works. Remove the variable and redeploy. | Pending |
| 9 | T26 item 6 | Six wrong passwords trigger the rate limit. | Pending |
| 10 | P1 review 4 | Six wrong passwords, each with a different `X-Real-IP` header, get 429 on the sixth. | Pending |
| 11 | T26 item 7 | Smoke test in current Chrome, Firefox and Safari or Edge on desktop. | Pending |
| 12 | T27 | Chrome DevTools > Application > Manifest on the deployed URL shows no installability errors in Chrome and Edge. | Pending |
| 13 | T26 item 8, T22 | Install the app in Chrome and Edge. In the app window, Ctrl+N creates a document, Ctrl+W starts the close flow without closing the window, and Ctrl+S, Ctrl+F and Ctrl+H work. | Pending |
| 14 | T26 item 9 | In a normal tab and in Firefox, Alt+N creates a document and Alt+W starts the close flow. | Pending |
| 15 | T20 | One visual check per language (11 languages) in dark and light themes. | Pending |
| 16 | T25 | Scrolling a 1 MB document feels smooth. | Pending |

---

## 10. Definition of done

- Every requirement and edge case in `REQUIREMENTS_TRACEABILITY.md` has status **Verified**.
- `npm test` and `npm run test:e2e` (Chromium full, Firefox and WebKit smoke) are green.
- The T26 production checklist passed on Railway.
- Nothing from Non-goals or Deferred ideas was built.
- README is complete and accurate.
- Decisions D12 and D13 are applied.
- The app installs in Chrome and Edge, and all five shortcuts work in the installed window.
