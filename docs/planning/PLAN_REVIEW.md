# Plan Review

**Scope:** `BUILD_PLAN.md` against `REQUIREMENTS.md`.
**Date:** 2026-10-09
**Codebase:** None yet. The review checks the plan against the requirements and against current platform and browser behavior.
**Result:** 19 confirmed issues, all corrected in the plan. 7 findings kept as possible risks (section 4 lists 8 risks, including R1 from F1). 7 findings rejected. U1 and U2 are resolved. No open decisions.

---

## 1. Method

- **Pass 1:** List every potential problem: missing or misread requirements, architecture and security weaknesses, overengineering, ordering errors, vague tasks, weak tests and deployment risks.
- **Pass 2:** Recheck each finding against the requirements and verified sources. Classify each one as **Confirmed** (fix in the plan), **Risk** (document, no scope change) or **Rejected** (remove with a reason).
- **Sources checked on 2026-10-09:**
  - Railway volumes: https://docs.railway.com/volumes/reference and https://docs.railway.com/volumes
  - Railway request headers: https://docs.railway.com/networking/public-networking/specs-and-limits
  - Railway client-IP guidance: https://station.railway.com/questions/need-authoritative-client-ip-proxy-tru-090eac86
  - Reserved browser shortcuts: https://lists.w3.org/Archives/Public/public-webapps-github/2016Jan/0255.html and https://bugzil.la/1052569
  - `node:sqlite` status: https://better-auth.com/docs/adapters/sqlite

---

## 2. Pass 1 and Pass 2 results

| # | Pass 1 finding | Pass 2 verdict | Evidence | Action in plan |
|---|----------------|----------------|----------|----------------|
| F1 | Ctrl+N and Ctrl+W cannot be intercepted by a web page in a normal browser tab. | **Confirmed** | Chrome on Windows does not dispatch Ctrl+N, Ctrl+W or Ctrl+T to pages. Firefox reserves tab and window shortcuts the same way. | U1 resolved: install-as-app (D12, TD-16, T27, T22). U2 covers normal tabs. |
| F2 | CodeMirror `basicSetup` and the default search panel add multi-cursor, regex and whole-word options. | **Confirmed** | Conflicts with EDT-5 and the non-goals. | TD-8, TD-9, T15, T21. Guards NG-1 and NG-2. |
| F3 | Without a volume, documents go to the container disk and vanish on redeploy. | **Confirmed** | Volumes are separate from the container filesystem. | TD-13, T03: production refuses to start without a volume path. |
| F4 | Migrations in a pre-deploy step would not see the volume. | **Confirmed** | Railway mounts volumes at container start, not during build or pre-deploy. | TD-17: migrations run at app start. |
| F5 | Replicas or zero-downtime deploys were implied by "Railway". | **Confirmed** | Railway does not allow replicas with volumes, and redeploys with a volume have brief downtime. | One replica (section 7). Autosave retry covers the gap. README notes it. |
| F6 | A rate limiter keyed on the socket address would put every client in one bucket. | **Confirmed** | The socket peer is a Railway proxy address. Railway recommends `X-Real-IP` and says the edge overwrites it. | TD-10, TD-11, T08: key on `X-Real-IP` plus a global bucket. |
| F7 | Changing `OWNER_PASSWORD` in Railway after the first start does nothing, which will confuse the owner. | **Confirmed** | This is decision D4 working as designed. | T06 logs a clear message. T26 README explains it. |
| F8 | If rename bumps `version`, a rename on one device causes a false conflict on another. | **Confirmed** | CON-1 is about content changes. | TD-6, INT-4: version counts content only. |
| F9 | A clean tab opened yesterday on device B shows stale text until a conflict fires. | **Confirmed** | Weakens DOC-1 and causes needless conflict dialogs. | TD-15, INT-5, T17: refresh clean tabs on focus and activation. |
| F10 | JSON bodies make the 1 MB limit inexact, because escaping can grow content up to six times. | **Confirmed** | DOC-8 needs a precise limit. | TD-7: `text/plain` bodies with a byte limit. INT-1 defines 1 MB. |
| F11 | "Every page needs a session" contradicts the login page itself. | **Confirmed** | The login page must be public to be usable. | INT-3 lists the exact public routes. Route sweep test in T07. |
| F12 | `POST /api/password` returning 401 for a wrong current password would trigger the session-expired dialog. | **Confirmed** | The client treats 401 as session expiry (EDGE-4). | Section 2.7: use 400 `wrong_current_password`. |
| F13 | Setting `NODE_ENV=production` as a Railway variable makes `npm ci` skip dev dependencies, so the frontend build fails. | **Confirmed** | npm omits dev dependencies when `NODE_ENV=production`. | TD-14: esbuild and CodeMirror go in `dependencies`. |
| F14 | The CSP blocks inline scripts, so an inline theme script would fail and cause a light flash. | **Confirmed** | `script-src` falls back to `default-src 'self'`. | `theme-init.js` as an external file loaded in `<head>`. |
| F15 | The first draft had a large "editor shell" milestone mixing tabs, autosave and theme. | **Confirmed** | Too large to review and test as one unit. | Split into T14 to T17. |
| F16 | E2E tests that share one database would depend on test order. | **Confirmed** | Breaks resumability and parallel runs. | T10 fixture: fresh server and DB per test. No test-only routes. |
| F17 | `X-Real-IP` sometimes carries an edge address according to community reports. | **Risk** | Railway staff say the edge overwrites it. Some users report edge IPs during incidents. | Documented as R2. The global bucket still limits guessing. |
| F18 | `node:sqlite` is a release candidate in Node 24, not fully stable. | **Risk** | It no longer needs a flag. Several projects use it on Node 24. | Documented as R3. Thin wrapper allows a swap to `better-sqlite3`. |
| F19 | CodeMirror stores text with LF line endings, so CRLF files are saved as LF. | **Risk** | No requirement covers line endings. | Documented as R4 and in README. No scope change. |
| F20 | Empty "Untitled N" documents remain if the browser closes before the tab closes. | **Risk** | DOC-6 covers the close action only. | Documented as R5. The owner can delete them from the list. |
| F21 | A global login cap lets an attacker lock the owner out for 15 minutes. | **Risk** | Trade-off between brute-force protection and availability. | Documented as R6. Accepted for a single-owner tool. |
| F22 | Ctrl+F and Ctrl+H need the editor to have focus with CodeMirror's default keymap. | **Confirmed** | Shortcuts should work anywhere in the app. | T22 uses one document-level capture listener. |
| F23 | The ASCII dependency graph in the first draft did not match the task dependencies. | **Confirmed** | The critical path was also wrong (it skipped T08, T10 and T14). | Replaced with execution layers. Critical path corrected. |
| F31 | Browsers fetch the web app manifest without cookies, so a gated manifest breaks installation. | **Confirmed** | MDN: same-origin manifests still need `crossorigin="use-credentials"` to send credentials. | TD-19: manifest, icons and service worker script are public. Gate test covers them. |
| F32 | Chrome's install check may require a service worker with a fetch handler. Sources disagree on whether desktop Chrome still requires it. | **Risk** | Older and newer guidance differ. | TD-18, T27: check DevTools on the deployed URL. Add a network-only worker only if required. |
| F33 | In the installed window, a JavaScript error in the shortcut handler would let Ctrl+W close the window. | **Risk** | `preventDefault` never runs if the handler throws first. | The `beforeunload` guard (T16) still warns when text is unsaved. Handler calls `preventDefault` before any other work. |
| F24 | Missing CI pipeline. | **Rejected** | Not a requirement. Each task already runs the full test suite locally. | None. Possible deferred idea. |
| F25 | Documents should be encrypted at rest. | **Rejected** | Not a requirement. Single owner, private volume. Speculative. | None. |
| F26 | Add a local draft backup in `localStorage` for unsaved text. | **Rejected** | EDGE-2 is met by retry and the unload warning. Adds a second sync source. | None. Could be a deferred idea. |
| F27 | Add a service worker for offline editing. | **Rejected** | Not a requirement. Conflicts with "server storage" as the single source of truth. | None. |
| F28 | Block startup when the seed password is shorter than 12 characters. | **Rejected** | Adds a startup failure mode the user did not ask for. A warning is enough. | INT-9: warn only. |
| F29 | Use `@fastify/rate-limit` instead of a custom limiter. | **Rejected** | It needs two instances for per-IP and global buckets on one route. The custom module is about 40 lines and fully unit tested. | TD-10 stands. |
| F30 | Add a migration framework. | **Rejected** | One migration in v1. `PRAGMA user_version` is enough. | None. |

---

## 3. Confirmed issues and corrections

All 19 **Confirmed** rows above (F1 to F16, F22, F23, F31) are corrected in `BUILD_PLAN.md`. Where to find each fix:

| Finding | Correction location |
|---------|--------------------|
| F1 | TD-16, T22, U1 |
| F2 | TD-8, TD-9, T15, T21 |
| F3 | TD-13, T03 |
| F4 | TD-17, section 2.10 |
| F5 | Section 7, T26 README |
| F6 | TD-10, TD-11, T08 |
| F7 | T06 step 2, T26 README |
| F8 | TD-6, section 2.6 |
| F9 | TD-15, T17 |
| F10 | TD-7, section 2.7 |
| F11 | Section 2.9 public routes, T07 |
| F12 | Section 2.7 notes |
| F13 | TD-14, T01 |
| F14 | Section 2.8 theme, T10 |
| F15 | Phase P3 tasks T14 to T17 |
| F16 | T10 fixture, section 6 rules |
| F22 | T22 |
| F23 | Sections 3.1 and 3.2 |
| F31 | TD-19, section 2.9, T27 |

---

## 4. Remaining risks

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Ctrl+N and Ctrl+W work only in an installed Chrome or Edge window. | Certain | Low | Install-as-app (T27). Alt+N, Alt+W and toolbar buttons everywhere (D13). |
| R2 | `X-Real-IP` carries an edge address during a Railway incident. | Low | Medium | Global bucket. Lockout capped at 15 minutes. |
| R3 | `node:sqlite` behavior changes or has a bug. | Low | Medium | Pin Node 24. Swap the `db.js` wrapper to `better-sqlite3` if needed. |
| R4 | CRLF line endings become LF. | Medium | Low | README note. |
| R5 | Orphan empty "Untitled N" documents. | Medium | Low | Visible in the list. Delete manually. |
| R6 | An attacker triggers the global login cap and blocks the owner for 15 minutes. | Low | Low | Accepted. Owner can wait or redeploy (the limiter is in memory). |
| R7 | Chrome requires a service worker for install. | Medium | Low | Network-only worker, no cache (T27). |
| R8 | A handler error lets Ctrl+W close the installed window. | Low | Low | `preventDefault` first. `beforeunload` guard. |

## 5. Assumptions

| ID | Assumption | How it is checked |
|----|------------|-------------------|
| A1 | "Current desktop browsers" means current Chrome, Edge, Firefox and Safari. | Playwright Chromium, Firefox and WebKit smoke tests. T26 manual check. |
| A2 | The owner has a Railway plan with volumes and a GitHub repo for deploys. | T04. |
| A3 | Railway's default builder detects Node 24 from `package.json` and `.node-version`. | T04 deploy log. Pin with a Railway variable if not. |
| A4 | The `railway.json` field names match current Railway config-as-code docs. | T04 checks the docs before committing. |
| A5 | The owner runs Playwright locally (Windows is supported). | T10. |
| A7 | The owner uses Chrome or Edge for the installed app. | T26 item 8. |
| A6 | Performance targets in T25 (2 s open, 3 s for 200 characters, 0.5 s jump) are fair readings of "smooth". | T25 plus a manual scroll check. Adjust only with user approval. |

---

## 6. Deferred or rejected alternatives

| Area | Alternative | Status | Reason |
|------|-------------|--------|--------|
| Language | Python (FastAPI) | Rejected | The frontend needs JavaScript anyway. One language is simpler. |
| Language | TypeScript | Rejected | Adds a compile step. JSDoc gives enough guidance. |
| Server | Express 5 | Rejected | Works, but Fastify `inject()` gives faster route tests without extra libraries. |
| Database | `better-sqlite3` | Deferred (fallback) | Native addon. Use only if `node:sqlite` fails (R3). |
| Database | Postgres on Railway | Rejected | A second service for one user's text files. |
| Database | One file per document | Rejected | Harder atomic version checks and renames. |
| Sessions | JWT | Rejected | Hard to revoke on logout and password change. |
| Editor | Monaco | Rejected | Much larger bundle. Harder to strip features. |
| Editor | CodeMirror 5 | Rejected | Legacy line. |
| Editor | Load CodeMirror from a CDN | Rejected | Adds an outside runtime dependency to a private tool and widens the CSP. |
| Frontend | React with Vite | Rejected | Not needed for one screen with a few dialogs. |
| Sync | WebSockets or polling | Rejected | Live sync is a non-goal. |
| Shortcuts | Install-as-app window so Ctrl+N and Ctrl+W reach the page | **Adopted** (U1, D12) | User decision. |
| Shortcuts | Alt+N and Alt+W only, no install | Rejected (U1) | User chose install-as-app. Alt bindings kept as a fallback (D13). |
| Offline | Caching service worker | Rejected | Offline use is a non-goal. Any service worker stays network-only. |
| Ops | CI pipeline | Deferred | Not required. Local test runs gate each task. |
| Ops | Backups and export | Deferred | Listed in REQ deferred ideas. Railway volume backups exist outside the app. |

---

## 7. Decisions

### U1. Shortcuts for new and close: RESOLVED

- **Decision (2026-10-09):** Add install-as-app support so Ctrl+N and Ctrl+W work in the app's own window. Recorded as D12 in `REQUIREMENTS.md`.
- **Applied in:** TD-16, TD-18, TD-19, T27, T22, T26 item 8.
- **Verified behavior:** In installed Chromium app windows (Chrome, Edge), pages receive Ctrl+N and Ctrl+W and can call `preventDefault`. Normal tabs do not. Firefox has no built-in desktop install of this kind. Sources:
  - https://kasmweb.atlassian.net/wiki/spaces/KCS/pages/7307285/Keyboard+Shortcuts
  - https://github.com/filips123/PWAsForFirefox/issues/443
  - https://github.com/microsoft/vscode/pull/204499

### U2. Alt+N and Alt+W fallback in normal tabs: RESOLVED

- **Decision (2026-10-09):** Bind Alt+N and Alt+W everywhere, in addition to Ctrl+N and Ctrl+W. Recorded as D13 in `REQUIREMENTS.md`.
- **Applied in:** TD-16, T22, T26 items 8 and 9.

No open decisions remain. Items in `BUILD_PLAN.md` TD-1 to TD-19 and INT-1 to INT-11 are builder decisions within the scope that `REQUIREMENTS.md` section 6 leaves to the builder, or precise readings of confirmed requirements.

---

## 8. Final quality check

| Check | Result |
|-------|--------|
| Every requirement mapped to a task and a validation method | Yes. 58 of 58 in `REQUIREMENTS_TRACEABILITY.md`. |
| Tasks clear enough to implement without reinterpretation | Yes. Each task names files, behavior and pass conditions. Shared behavior is specified once in `BUILD_PLAN.md` section 2. |
| Dependencies and order correct | Yes. Verified layer by layer in section 3.1. |
| Each phase has objective completion criteria | Yes. Section 5. |
| Testing integrated into every task | Yes. Every task has a validation item. E2E starts at T10. |
| No unnecessary complexity or scope expansion | Yes. Rejected items F24 to F30. Interpretations trace to parent requirements. |
| Resumable after any completed task | Yes. Status table, resume rule and isolated tests in `BUILD_PLAN.md` section 9. |

---

## 9. Implementation log

Coding agents record deviations from the plan here.

| Date | Task | Deviation | Reason | Approved by |
|------|------|-----------|--------|-------------|
| 2026-10-09 | T01 | `web/test/build-web.test.js` replaces "one trivial test". It builds into a temp folder and checks the 3 bundles, their sourcemaps and the copied HTML and CSS. `scripts/build-web.js` takes an optional output folder argument for this test. | `AGENTS.md` Testing rule 3: no assertion may pass when the requirement is inverted. A trivial test always passes. | User (chat, 2026-10-09) |
| 2026-10-09 | All | Phase reviews use the two-pass method in section 1 (Confirmed, Risk or Rejected). Results go to section 10. | The execution prompt names a "TWO-PASS REVIEW" with a finding classification in `AGENTS.md`. Neither `AGENTS.md` nor the installed skills define one. | User (chat, 2026-10-10), also for V2 |
| 2026-10-09 | T20, T22, T25, T27 | When all automated acceptance checks pass, the task is marked Done for dependency purposes. Its manual checks (visual check, installed-app shortcuts, deployed install check, scroll feel) are listed as owner-pending in section 9 of `BUILD_PLAN.md` and in T26. | These manual checks need a deployed URL or a human. Without this rule, T22 and T26 stall behind T04. | Agent, not yet approved |
| 2026-10-09 | T02 | `index.js` exports `start({ env, exit, logger })` and runs it only when it is the main module (`import.meta.main`). | Windows cannot deliver SIGTERM to a child process handler, so the shutdown test emits the signal in-process. | Agent, not yet approved |
| 2026-10-09 | T04 | The owner deploy checklist lives in `README.md` ("Deploy on Railway"). T26 extends that section. | One place for operations notes. | Agent, not yet approved |
| 2026-10-09 | T07 | `buildApp` is async. It awaits `@fastify/cookie` so the cookie parser runs before the gate hook. | Fastify loads registered plugins after hooks that are added directly, so the gate would see no cookies. | Agent, not yet approved |
| 2026-10-09 | T07 | `index.js` builds the app before the password bootstrap, so the bootstrap logs through `app.log`. Listen still runs after the bootstrap and the session purge. | One logger for all startup lines. No request is served before step 5. | Agent, not yet approved |
| 2026-10-09 | T07, T11, T13 | Error codes the plan does not name: 401 `unauthorized` (no session), 415 `unsupported_media_type` (non-text content body), 400 `invalid_request` (PATCH body is not a JSON object), 400 `bad_request` (malformed URL). | Section 2.7 requires `{ "error": "<code>" }` for every error. | Agent, not yet approved |
| 2026-10-09 | T08 | The limiter counts each attempt before the password check. A correct password clears the IP bucket and refunds one global count. | scrypt takes about 50 ms, so parallel requests could all pass a check-then-count limiter. | Agent, not yet approved |
| 2026-10-09 | T10 | Playwright global setup runs `node scripts/build-web.js`, not `npm run build`. | Spawning npm from Node fails on Windows (npm is a `.cmd` file). Same script, same output. | Agent, not yet approved |
| 2026-10-09 | P1 review | `engines.node` is `>=24.2 <25`. | `import.meta.main` needs Node 24.2. On 24.0 and 24.1, `npm start` would exit without listening. | Agent, not yet approved |
| 2026-10-09 | T11, T12 | Content is bound as UTF-8 bytes (a BLOB in the TEXT column `content`) and decoded on read. | R3 happened: `node:sqlite` in Node 24.13 cuts a bound TEXT value at its first NUL character. The schema is unchanged. | Agent, not yet approved |
| 2026-10-09 | T13 | A language-only PATCH does not change `updated_at`. A rename does. | Section 2.6 says `updated_at` changes on content save and rename. The T13 line says PATCH changes it. Sort order is left to the builder (REQUIREMENTS section 6), and a language change should not move a document to the top of the list. | Agent, not yet approved |
| 2026-10-09 | T12 | `PUT /api/documents/:id/content` needs a `text/plain` body. A request with no body returns 415. `POST` still accepts no body. | A bodyless PUT would otherwise replace the content with an empty string. | Agent, not yet approved |
| 2026-10-09 | T14 | `scripts/build-web.js` builds `theme-init.js` as an IIFE and the two module entries as ESM. | `theme-init.js` is a classic script. An ESM bundle that imports `theme.js` leaks minified globals. | Agent, not yet approved |
| 2026-10-09 | T16 | `api.js` emits `session-expired` for every 401 except from `/api/login`. Autosave pauses on 401 and does not emit the event itself. | One place for the event, so a list refresh or a load that gets 401 also opens the re-login dialog. | Agent, not yet approved |
| 2026-10-09 | T17 | The editor shows a read-only blank state whenever no tab owns the view: while a tab loads, after a failed load, and with no tab open. | P3 review: otherwise typing went into the previous tab or nowhere. | Agent, not yet approved |
| 2026-10-09 | T21 | A Find button in the top bar opens the search panel. | T21 comes before T22, so the panel needed a way to open. It also makes find and replace visible to the owner. | Agent, not yet approved |
| 2026-10-09 | T27 | The installability test runs in a persistent full Chromium profile (`channel: chromium`), not the headless shell. | The headless shell returns no installability errors even for a page with no manifest, and an incognito-like context always reports `in-incognito`. The test also proves it reports a missing manifest. | Agent, not yet approved |
| 2026-10-09 | T22 | A held shortcut key is blocked from the browser but acts only once. | P5 review: holding Alt+N created many documents. | Agent, not yet approved |
| 2026-10-09 | T23 | The conflict dialog focuses Save mine as a new document and styles Overwrite with mine as dangerous. The deleted dialog focuses Save mine as a new document. | The plan names no default. P6 review: Enter or Space while typing would otherwise overwrite the other device's text with no history. | Agent, not yet approved |
| 2026-10-09 | T23 | Each choice runs while its dialog stays open (buttons disabled). A failed step shows its error in the dialog. After a 401, the sign-in dialog opens on top and the user chooses again. | P6 review: text typed during the request was lost, and a failed step looped over the sign-in dialog. | Agent, not yet approved |

## 10. Phase review log

Two-pass review of each phase diff. Pass 1 lists findings. Pass 2 classifies each one.

| Phase | # | Finding | Verdict | Action |
|-------|---|---------|---------|--------|
| P0 | 1 | `npm start` as the Railway start command puts npm between the signal and Node. | Risk | npm forwards SIGTERM to the child. Check the shutdown log line in T04. |
| P0 | 2 | A failed `listen` (port in use) leaves the database open. | Rejected | The top-level await rejects and the process exits 1, which closes the file. |
| P0 | 3 | `migrate` ignores a database newer than the code (`user_version` above the migration count). | Rejected | v1 has one migration and no rollback across migrations (section 7). |
| P0 | 4 | `node:sqlite` prints an ExperimentalWarning. | Rejected | Known (R3). No behavior impact. |
| P0 | 5 | `./data` resolves from the working folder. | Rejected | `npm start` and `npm run dev` run from the repo root. Production requires a volume path. |
| P0 | 6 | `buildApp` takes `config` but does not read it yet. | Rejected | T07 uses it for cookies and headers. |
| P0 | 7 | Shutdown does not force an exit if `app.close()` hangs. | Rejected | Railway sends SIGKILL after its drain period. |
| P0 | 8 | `railway.json` sets no `healthcheckTimeout`. | Rejected | The Railway default applies. The app starts in under a second. |
| P1 | 1 | `Cache-Control: no-store` was missing when the router decoded a percent-encoded `/api/` path. | Confirmed | Fixed in a492bb2. The check also reads the route pattern. Test added. |
| P1 | 2 | Malformed URLs returned 400 from Fastify without the security headers. | Confirmed | Fixed in a492bb2 with `frameworkErrors`. Test added. |
| P1 | 3 | With `trustProxy: true`, the Origin check uses `X-Forwarded-Host` when present. | Rejected | T02 requires `trustProxy`. The Origin check is a CSRF defense, and a browser cannot send that header cross-site without a preflight. A non-browser client can send any Origin anyway. |
| P1 | 4 | TD-11 assumes the Railway edge overwrites `X-Real-IP`. If it passes client values through, rotating the header defeats the per-IP bucket. | Risk | R2. Owner check added to the T26 notes: 6 wrong logins with 6 different `X-Real-IP` values must get 429 on the 6th. |
| P1 | 5 | No test proved the Origin check for PUT, PATCH and DELETE. | Confirmed | Test added in a492bb2. |
| P1 | 6 | No test asserted the startup log line when no password is configured (EDGE-8). | Confirmed | Test added in a492bb2. |
| P1 | 7 | No test covered paths next to the public allowlist (`/login/`, `/%6cogin.js`, `//login`). | Confirmed | Test added in a492bb2. The gate already failed closed. |
| P1 | 8 | The E2E fixture left the server running when startup failed. | Confirmed | Fixed in a492bb2. |
| P1 | 9 | `import.meta.main` needs Node 24.2, but engines allowed 24.0. | Confirmed | Fixed in a492bb2 (`>=24.2 <25`). |
| P1 | 10 | The app is built before the bootstrap and not closed when the bootstrap fails. | Rejected | The process exits 1 right after. Logged as a deviation. |
| P1 | 11 | `POST /api/password` has no limit on wrong current-password attempts. A stolen session cookie allows unlimited online guessing. | Risk | The plan limits failed logins only. Proposed out-of-scope fix in section 11. |
| P2 | 1 | The over-limit tests used Content-Length only, so the chunked byte counter was untested. | Confirmed | Chunked test added in fdb1d8f. |
| P2 | 2 | The list-order test could not tell `updated_at` from `created_at`. | Confirmed | Test added in fdb1d8f: a save and a rename move a document to the top. A language change does not. |
| P2 | 3 | A `charset` other than UTF-8 was decoded as UTF-8. | Confirmed | Fixed in fdb1d8f: 415. |
| P2 | 4 | A JSON string body was accepted as content. | Confirmed | Fixed in fdb1d8f: only `text/plain` is accepted. |
| P2 | 5 | Fastify parse errors did not use the `{ error: "<code>" }` shape. | Confirmed | Fixed in fdb1d8f with one root error handler. |
| P2 | 6 | T13 and section 2.6 disagree on `updated_at` for a language-only PATCH. | Rejected | Not a defect. Section 2.6 followed. Logged as a deviation. |
| P2 | 7 | A PUT with no body saved empty content. | Confirmed | Fixed in fdb1d8f: 415. |
| P2 | 8 | (Pass 2) `node:sqlite` cut content at the first NUL character. | Confirmed | Found while checking the review note on NUL. Fixed in fdb1d8f. Test added. |
| P3 | 1 | Clicking the active tab showed a stale copy of its state, and the next save could overwrite typed text. | Confirmed | Fixed in 5f30925. E2E test added. |
| P3 | 2 | The editor stayed editable while no tab owned it (during a load, after a failed load, after a close). | Confirmed | Fixed in 5f30925: read-only blank state, load error message and retry. E2E test added. |
| P3 | 3 | A browser can close the non-cancellable re-login dialog on a second Escape, which would leave saves paused for good. | Confirmed | Fixed in 5f30925: the dialog opens again. E2E test added. |
| P3 | 4 | A PUT that commits but loses its response is retried with the old version and gets 412 against the user's own save. | Risk | Follows section 2.8. The T23 conflict dialog resolves it (Overwrite with mine). |
| P3 | 5 | `createTabs` and the active-tab and load-race paths had no tests. | Confirmed | E2E tests added in 5f30925. |
| P3 | 6 | The error texts for conflict, deleted and too-large were untested. | Confirmed | Covered in the T23 and T24 specs. |
| P3 | 7 | No test covered `resumeAll` with a held document. | Confirmed | Unit test added in 5f30925. |
| P3 | 8 | The restore test waited for the active tab only, so it did not prove that the other tabs persisted. | Confirmed | Fixed in 5f30925: waits for no unsaved tab, then checks every tab. |
| P3 | 9 | The 2.5 s bound in the autosave timing test may be tight under load. | Rejected | No flake seen. "About 1 second" allows the margin. |
| P4 | 1 | Two document list refreshes can overlap, and an older response can render last. | Risk | Low impact: the next open or focus corrects the list. No change. |
| P4 | 2 | A document deleted elsewhere keeps its list row until the next refresh. Opening it closes its new tab on the 404. | Rejected | Refresh on open and on focus is the specified behavior. |
| P4 | 3 | Deleting from the list discards unsaved text in the open tab without a second prompt. | Rejected | T18 specifies one confirm dialog that says the delete is permanent. |
| P4 | 4 | Window focus sends two list requests (tabs and document list). | Rejected | One owner, small JSON. Not worth shared state. |
| P5 | 1 | Enter in the search panel ran Next even on a focused button, so keyboard users could not press Replace all. | Confirmed | Fixed in 35de628. E2E test added. |
| P5 | 2 | On non-QWERTY layouts, Mod shortcuts matched by `event.code` fire on the wrong letters (AZERTY Ctrl+Z opens the close dialog). | Risk | T22 specifies `event.code`. Proposed out-of-scope fix 2 in section 11. |
| P5 | 3 | A rename did not refresh the language tooltip of the active tab. | Confirmed | Fixed in 35de628. E2E test added. |
| P5 | 4 | Opening the panel again with a selection cleared the replace field. | Confirmed | Fixed in 35de628. E2E test added. |
| P5 | 5 | A held shortcut key repeated its action. | Confirmed | Fixed in 35de628. Unit test added. |
| P5 | 6 | No test proved that `preventDefault` runs before an action that throws, or the dialog guard for N, S, F and H. | Confirmed | Unit tests added in 35de628. |
| P5 | 7 | No test covered a hidden tab catching up on a rename, per-tab search state or Cmd+W, Cmd+F and Cmd+H. | Confirmed | Tests added in 35de628. |
| P6 | 1 | Text typed while a choice's request was in flight could be lost, because the dialog had already closed. | Confirmed | Fixed in 7e9895e: the choice runs with the dialog open. E2E test checks that no PUT happens while it is open. |
| P6 | 2 | A failed step inside a choice re-queued the dialog over the sign-in dialog and looped. | Confirmed | Fixed in 7e9895e: error in the dialog, sign-in on top. E2E tests for a network failure and a 401. |
| P6 | 3 | When the copy saved but the reload of the original failed, the tab stayed held with no way out. | Confirmed | Fixed in 7e9895e: a retry only reloads. A 404 closes the original because the copy has the text. |
| P6 | 4 | The conflict dialog focused Overwrite with mine, so Enter while typing could overwrite the other version. | Confirmed | Fixed in 7e9895e: focus on Save mine as a new document. E2E test added. |
| P6 | 5 | The last size-limit E2E assertion could not fail (the earlier message was still visible). | Confirmed | Fixed in 7e9895e: the message is cleared first, and the test checks that no PUT happens and the stored size is still 1 MB. |
| P6 | 6 | No test covered failed choices, two queued conflicts or typing during a choice. | Confirmed | E2E tests added in 7e9895e. |
| P7 | 1 | The perf "open" time includes the page reload and the 1 MB GET, so it is an end-to-end number, not render time alone. | Rejected | That matches the target ("open and render under 2 seconds"). |
| P7 | 2 | The README menu paths for installing in Chrome and Edge were from memory. | Confirmed | Replaced with the address bar install icon and a generic menu entry before 716fb31. |
| P7 | 3 | The README said `npm run dev` reads `.env`, but the script did not. | Confirmed | Fixed in 716fb31 with `--env-file-if-exists=.env`. Checked with a temporary `.env`. |

## 11. Proposed out-of-scope fixes

Not built. Each one needs a user decision.

| # | From | Proposal | Reason |
|---|------|----------|--------|
| 1 | P1 review 11 | Count wrong current passwords on `POST /api/password` in the login limiter. | A stolen session cookie would otherwise allow unlimited password guessing. |
| 2 | P5 review 2 | Match the Mod shortcuts (N, W, S, F, H) by `event.key` and keep `event.code` for Alt+N and Alt+W. | On AZERTY and other layouts, `event.code` maps Ctrl+Z to KeyW, so undo opens the close dialog, and Ctrl+W can reach the browser and close the installed window. T22 specifies `event.code`. |

## 12. V2 phase review log

Two-pass review of each V2 phase diff (`REQUIREMENTS_V2.md` section 9). Same method and verdicts as section 10. Rows marked PR log the Codex review threads on PR #4, one row per thread.

| Phase | # | Finding | Verdict | Action |
|-------|---|---------|---------|--------|
| M9 | 1 | The Cancel button of a dialog opened from the Documents dropdown closed the dropdown. | Confirmed | Fixed in the review commit: outside presses are read on capture-phase `pointerdown`, before the dialog closes. |
| M9 | 2 | "Open document list" in the empty state opened the dropdown, then the same click closed it. | Confirmed | Fixed by the same `pointerdown` change. `doclist.spec.js` and `layout.spec.js` now assert the dropdown is visible. |
| M9 | 3 | A click on a tab left the dropdown open, because the tab strip re-renders and the target was treated as inside. | Confirmed | Fixed by the same change. The `isConnected` exemption is gone. E2E test added. |
| M9 | 4 | Escape did nothing once the focus left the dropdown: after a rename refresh, after a delete, after a window focus refresh, or after a mouse open in browsers that do not focus a clicked button. | Confirmed | Fixed: Escape is read on the document while a dropdown is open, except inside a dialog. A refresh puts the focus back on the same button of the same row. E2E and unit tests added. |
| M9 | 5 | The added Escape in `language.spec.js` could land in the rename dialog while it was still saving. | Confirmed | Fixed: the test waits for the dialog to close, then asserts the dropdown closes. |
| M9 | 6 | The one-row tab test was flaky (`boundingBox` during a re-render) and could not fail. | Confirmed | Rewritten: 12 restored tabs share one top and the strip scrolls. The list must sit in the top bar, not the outline panel. |
| M9 | 7 | `createDropdown` had no unit test (AGENTS.md Testing rule 2). | Confirmed | `web/test/dropdown.test.js` with an injected fake document. Three mutations each fail a test. |
| M9 | 8 | The dialog test did not press Escape afterwards or cover the delete dialog. | Confirmed | Extended to rename, delete Cancel, delete and Escape. |
| M9 | 9 | The fixed 360 px dropdown was clipped in a narrow window. | Confirmed | Width is `min(360px, 100vw - 16px)`. |
| M9 | 10 | A stored closed panel showed until `main.js` ran. | Confirmed | `theme-init.js` sets `data-outline` before first paint and the CSS hides the panel. Build test extended. |
| M9 | 11 | Two dropdowns could be open at once (ArrowDown on one while the other was open). | Confirmed | One dropdown is open at a time. Unit test added. |
| M9 | 12 | ArrowDown from a Rename or Delete button jumped to the first row. | Confirmed | Arrows go to the next item after, or the last item before, the focused control. Unit test added. |
| M9 | 13 | Unused exports: `OUTLINE_KEY` and `isOpen`. `#outline-body` has no reader yet. | Confirmed (exports) and Rejected (`#outline-body`) | Exports removed. M12 fills `#outline-body` in this build. |
| M9 | 14 | The Account button kept `aria-haspopup="true"` with no menu role, unlike the Documents button. | Confirmed | Removed. Both buttons use `aria-expanded` and `aria-controls`. |
| M9 | 15 | `BUILD_PLAN.md` T18 still says "toggle sidebar". | Rejected | v1 history. `REQUIREMENTS_V2.md` section 10 records the change. |
| M9 | 16 | The open dropdown covers part of the tab strip. | Rejected | Expected for a dropdown (D19). A press outside closes it. |
| M9 | 17 | The account menu kept its own open and close code. | Confirmed | Both menus use `dropdown.js` (AGENTS.md Edits rule 6). |
| M10 | 1 | SAV-1 asks for "N after the last edit, but no later than N after the first unsaved edit". The second bound always comes first. | Confirmed (design note) | Each document keeps one save deadline (`dueAt`). An edit keeps an earlier deadline and else sets one N from now. |
| M10 | 2 | A deadline that passed while a save was in flight was lost. The next edit started a new N window (save 2.1 s after the first unsaved edit with N = 1). | Confirmed | Fixed in the review commit: the deadline stays set, so the reply starts the next save at once. Unit test added. |
| M10 | 3 | An edit pushed a sooner retry back to N (N = 30: a 2-second retry moved to 30 s). | Confirmed | Fixed by the same deadline rule: an edit keeps a sooner retry. Unit test added. |
| M10 | 4 | A smaller new N left a pending save at the old N (SAV-4 wording). | Confirmed | The same rule lets the next edit move the save earlier. No owner question needed. Unit test added. |
| M10 | 5 | The startup settings read could finish after the dialog saved a new delay and set the old one back. | Confirmed | The newest read or save wins (request counter). |
| M10 | 6 | A failed startup read was never repeated, and the dialog's fresh value was not applied. | Confirmed | Settings are read again after a re-login and when the dialog opens. Both apply the value. |
| M10 | 7 | The cross-device E2E test only read the dialog value on device B. | Confirmed | Device B now types and must save within 4.5 s with N = 2. |
| M10 | 8 | With the 1-second fixture, a broken Ctrl+S passed the 700 ms check by about 200 ms. | Confirmed | That test runs with a 60-second delay. |
| M10 | 9 | The Settings dialog error paths had no tests. The 1 to 60 rule was in the client and the server. | Confirmed | E2E test for a failed load, a network failure, a 500 and Cancel. The rule is only on the server. |
| M10 | 10 | v1 tests could type before the startup settings read finished. | Confirmed | `login()` in the fixtures waits for that read. |
| M10 | 11 | A corrupt stored value became NaN, so the client saved on almost every keystroke. | Confirmed | A stored value that breaks the rule reads as the default. Server test added. |
| M10 | 12 | Stale comments and docs said "debounce" or "1 second". `BUILD_PLAN.md` and `REQUIREMENTS_TRACEABILITY.md` had no pointer to V2. | Confirmed | Comments fixed. Both v1 docs point to the V2 docs. README Settings text comes in M16. |
| M10 | 13 | Unused exports, and a session test that the gate sweep already covers and that passes even without the route. | Confirmed | Exports removed. The test is replaced by the stored-value test. |
| M10 | 14 | The default of 5 seconds is in the client and the server. | Rejected | The client needs it before its first read. A comment links the two. |
| M10 | 15 | The fixture signs in once more to set the delay. | Rejected | No test counts sessions. Each test has its own server. |
| M10 | 16 | Perf typing was about 170 ms slower than `main` in 3 back-to-back runs. Cause: SAV-1 saves during nonstop typing, and with the 1-second test delay the 1 MB document saved 2 or 3 times inside the measured 3 seconds. The v1 debounce never saved during typing. | Confirmed | `perf.spec.js` now runs with the 5-second production default. Then 4 alternating runs gave 2771 to 2937 ms against 2625 to 3237 ms on `main`. Both stay near the 3000 ms limit in this container (section 13). |
| M10 | 17 | Each save of a 1 MB document costs main-thread time while the user keeps typing (SAV-1 makes this happen every N seconds). | Risk | Unverified estimate: about 60 ms per save in this container, from M10 16. M16 measures typing during a save in Visual mode (NFR-2). |
| M11 | 1 | A click on the mode toggle moved the focus to the button, so text typed right after a toggle was lost. MDV-6 keeps the cursor. | Confirmed | Fixed before commit: the toggle gives the focus back to the editor, as the toolbar does. E2E test (undo and cursor) covers it. |
| M11 | 2 | No test proved that each toolbar button runs its own command. | Confirmed | E2E test applies all eight buttons. Unit tests for `createToolbar` and `run` with a fake document. A swapped Italic command fails a test. |
| M11 | 3 | MDV-10 needs Ctrl+K to reach the page in Firefox and Safari. Only Chromium runs here. | Risk | Unverified assumption. Owner check in Firefox and Safari (section 13). |
| M11 | 4 | Visual mode uses the interface font for prose, so line widths change on a toggle. | Rejected | Expected for a visual mode. Code, tables and inline code keep the mono font. |
| M11 | 5 | Replace decorations that crossed a line break (an image whose alt text wraps, a link whose title is on the next line, a split reference label) made CodeMirror throw. The editor stopped taking text until a reload. | Confirmed | Fixed in the review commit: hides split at line breaks and widgets stay on one line. A unit test checks that no replace spec holds a line break. An E2E test types after a multi-line image. |
| M11 | 6 | A long fenced block walked all its lines on every rebuild (2044 ms for 40 ArrowDown in a 1 MB block), and the reveal check built a Set of all selected lines. | Confirmed | Only the lines in the visible range are walked. The reveal check compares line bounds. Unit test added. M16 measures Visual mode on 1 MB (NFR-2). |
| M11 | 7 | Every [text] was styled as a link. Reference links had no URL, so Ctrl+click and image loading failed. | Confirmed | A link is styled only with its own URL or a matching definition (`markdown-syntax.js`). Unit and E2E tests added. |
| M11 | 8 | The heading select applied a level on the first ArrowDown, so keyboard users could not pick one (NFR-5). | Confirmed | The heading level is a dropdown menu built on `dropdown.js`. Keyboard E2E test added. |
| M11 | 9 | Any mouse button toggled a task, and Ctrl+click opened links on macOS, where it means right-click. | Confirmed | Left button only. Cmd on macOS, Ctrl elsewhere. E2E test checks a right-click. |
| M11 | 10 | The code block button merged two blocks or split one, and put the cursor before the fence. | Confirmed | It uses the syntax tree: inside a block it removes that block's fences, else it fences the lines and keeps the cursor inside. Unit tests added. |
| M11 | 11 | Line commands included the line where the selection ended at column 0. | Confirmed | That line is left out. Unit tests added. |
| M11 | 12 | Inline toggles stripped the outer marks of a selection over two emphases, and the Link button never removed a link. | Confirmed | Unwrap only an exact emphasis, code span or link from the syntax tree, else wrap. Link inside a link removes it. Unit tests added. |
| M11 | 13 | setHeading changed blank lines and put the heading before list and quote marks. | Confirmed | Blank lines are skipped and the heading goes after the marks. |
| M11 | 14 | A heading or a fence inside a quote got overlapping hides. Quote marks inside a fenced block were not hidden. | Confirmed | Fixed. Unit test checks that hides never overlap. |
| M11 | 15 | The MDV-10 shortcut test did not run in Firefox and WebKit. | Confirmed | Tagged `@smoke`. Those browsers are not installed here (section 13). |
| M11 | 16 | Link targets kept angle brackets, escapes and entities. E-mail autolinks had no mailto:. | Confirmed | `linkTarget` normalizes them. Unit tests added. |
| M11 | 17 | Test gaps: no http: image test, a scroll test that passed at the end of the document, no html, css, ts or yaml fence tests. Dead branches (`Autolink` in LINK_PARENTS, a CodeMark check) and FENCE twice. | Confirmed | Tests added. Dead code removed. FENCE lives in `markdown-syntax.js`. Widget DOM and the click handler stay covered by E2E tests, as for other DOM wiring. |
| M12 | 1 | A fresh Markdown parse of 1 MB takes 485 ms here, too slow for CNT-7 (300 ms). | Confirmed (design note) | Outline and counts read the editor's own incremental syntax tree. They retry every 100 ms while it still parses. |
| M12 | 2 | Counting on tab open blocked the first paint (perf open time 424 ms against about 220 ms). | Confirmed | Fixed before commit: outline and counts follow 100 ms after the tab shows. |
| M12 | 3 | Each pause in typing recounted the whole document. Perf typing was about 600 ms slower than M11. | Confirmed | Fixed before commit: `createCounter` caches counts per line. Words never span a line break, so the sum equals the full count. A warm recount of 1 MB takes 12 ms against 86 ms. Then 4 alternating runs gave 2497 to 2787 ms against 2402 to 2690 ms for M11. |
| M12 | 4 | E2E helpers wrote `pn.openTabs.v1` while the app's startup could still overwrite it (`tabs.js` boot), so a test could open no tabs. | Confirmed | Pre-existing race, seen once under load. `login()` in the fixtures now waits until the startup has shown tabs or the empty state. |
| M12 | 5 | Only common named entities and numeric entities become characters (EXP-3). Others stay as written. | Risk | Superseded by row 15: the review found that EXP-3 names all entities. |
| M12 | 6 | A [text] with no URL or definition keeps its brackets in plain text, and definition lines ([r]: url) stay. | Rejected | Same as Visual mode (CNT-6). EXP-3 does not name definition lines. |
| M12 | 7 | `markdown-mode.js` and a counts mode would have been two copies of the same stored choice. | Confirmed | One `stored-choice.js` serves both (AGENTS.md Edits rule 6). |
| M12 | 8 | Independent review, Pass 1 (rows 8 to 19). Code and HTML blocks in a quote kept their quote marks and the closing fence. | Confirmed | These blocks remove only their quote marks. The closing fence comes from the closing CodeMark. Unit tests added. |
| M12 | 9 | An empty table cell dropped its column. | Confirmed | The pipes (TableDelimiter) set the tabs, also around an empty cell. Unit tests added. |
| M12 | 10 | 1 MB of Markdown missed CNT-7: 323 to 512 ms from a key press to the counts. Each parse step caused one more full refresh. Each pause rebuilt 4490 outline buttons. No perf case for Markdown. | Confirmed | `createSummary` caches counts and headings per top-level block. A fuzz check of 300 random documents matched the full count. Tree changes alone no longer refresh. Parse steps repeat at once. A new perf case measured 202 to 218 ms for counts and 235 to 275 ms for the outline (targets 300 and 500). |
| M12 | 11 | A click on an outline entry before the next refresh could throw a RangeError. | Confirmed | Entries move with each edit (`outline.map`). Unit and E2E tests added. |
| M12 | 12 | The counts of the previous tab stayed after a tab switch. | Confirmed | A different document clears the outline and both counts at once. E2E test added. |
| M12 | 13 | A refresh on window focus or activation dropped the keyboard focus and the list flickered. Each entry was a tab stop (NFR-5). | Confirmed | Entries change in place. The list is one tab stop with the arrow keys, Home and End. Unit and E2E tests added. |
| M12 | 14 | Indented or quoted setext underlines, a quoted delimiter row, indented fences and fences in lists left text behind. An unclosed fence lost a last line that looked like a fence. | Confirmed | Removal works on whole lines and on the marks in the tree. Unit tests added. |
| M12 | 15 | Only 22 named entities were decoded. `&constructor;` became "function Object() ...". | Confirmed | The full HTML list from `character-entities` 2.0.2 (MIT, about 36 KB minified), own keys only. Numeric entities follow CommonMark. Unit tests added. |
| M12 | 16 | A Prepend character (U+0600) counted as a separate character. | Confirmed | Text with non-ASCII characters is segmented as a whole. Lines and blocks are cached. Unit test added. |
| M12 | 17 | Leftovers: a space from `> # T`, a tab after `>`, hard-break spaces and backslash, code-span padding. Definition lines count as words. | Confirmed, except definition lines: Rejected | Fixed with unit tests. Definition lines: as row 6. EXP-3 is the exact rule list and does not name them. |
| M12 | 18 | `theme.js` and `outline-panel.js` kept their own copies of the stored choice (AGENTS.md Edits rule 6). `openDocs` was copied in 3 specs. | Confirmed | Both use `stored-choice.js`. `theme-init.js` uses `readChoice`. `openDocs` is in `e2e/fixtures.js`, also used by `layout.spec.js`. The v1 specs keep their helpers, which do other steps. |
| M12 | 19 | Test gaps: nested constructs, empty cells, unclosed fences, collapsed references, rows without cells, `setActive` before the first heading, OUT-2 and CNT-7 timing, a keyboard run, counts after a tab or language change. | Confirmed | All added. The 4 new E2E tests fail on the M13 code. |
| M12 | 20 | Found during the perf work: the 1 MB size check (`size-limit.js`, v1) measured the whole document on each key press, about 8 ms per key. | Confirmed | Sizes are cached per shared document part. Python typing went from 3315 to 3629 ms to 1577 to 2100 ms here. |
| M12 | 21 | Found during the perf work: typing 200 characters in 1 MB of Markdown in Visual mode took 10.7 s (target 3 s). Profile per key: Markdown parse 13 to 20 ms, Mermaid field walk about 11 ms (M13), size check about 8 ms (row 20). | Risk | NFR-2 typing is M16 work. The M13 review handles the Mermaid walk. The parse cost comes from `@lezer/markdown`, which re-parses about 1 µs per top-level block, so it can stay over the target in this container. |
| M13 | 1 | Mermaid 12 lays out with ELK by default and creates an ELK object when it loads. With elkjs left out (C6), every diagram failed. | Confirmed | Fixed before commit: the build replaces elkjs with an inert stub and the config selects the dagre layout (MIT). A build test checks that no chunk holds ELK code. |
| M13 | 2 | A diagram that asks for the ELK layout in its own config shows "The ELK layout is not included." | Risk | Superseded by row 18: `layout` is a secure key, so dagre stays. |
| M13 | 3 | Diagrams inside quotes or lists stay code, because a drawn block must cover whole lines. | Risk | Top-level diagrams draw. Others keep their source. |
| M13 | 4 | The theme switch stores the choice in the view transition, one frame after the click. A reload in that frame keeps the old theme. | Rejected | One frame. `shell.spec.js` waits for the switch before it reloads. |
| M13 | 5 | A 620-byte esbuild runtime chunk loads with main.js. | Rejected | It is not Mermaid. MDV-13 and NFR-4 are about the Mermaid chunks, which load only for a drawn diagram (E2E test). |
| M13 | 6 | The E2E image test passed for the wrong reason with an empty image body: the diagram failed to draw. | Confirmed | The route serves a valid PNG. With the source guard removed, the test now fails on 2 image requests. |
| M13 | 7 | THM-1 is checked in Chromium only. | Risk | Firefox 144+ and Safari 18+ are owner checks (section 13). |
| M13 | 8 | Independent review, Pass 1 (rows 8 to 19). Diagrams still loaded remote images and stylesheets: CSS from init directives, label HTML (`img`, `srcset`, `style`) and image nodes with unquoted or quoted keys. The loads happen while Mermaid measures, before any filter. | Confirmed | Mermaid runs in a hidden frame whose own CSP allows only `data:` images and no stylesheets, fonts or connections. The page shows each diagram as an SVG image, which loads nothing. Diagram text is then not selectable. The regex filters are deleted. An E2E test with 8 vectors sees 0 requests. |
| M13 | 9 | A syntax error left Mermaid's error SVG in the page body, and the workspace shrank. | Confirmed | `suppressErrorRendering`, and Mermaid draws into a box in the frame that is emptied after each render. An E2E test checks that no Mermaid SVG stays in the page. |
| M13 | 10 | A failed chunk load was kept until reload and showed as a diagram error. | Confirmed | A failed load is not kept. It shows "Could not load the diagram tool. It tries again when the diagram shows again." The next render loads again. Unit and E2E tests added. |
| M13 | 11 | A large diagram blocks the page: 2.0 s for 200 edges and 13 s for 500 here. Renders also ran for widgets that were gone. | Confirmed (gone widgets), Risk (large diagrams) | Renders for removed widgets are skipped (unit test). The frame shares the page's thread, so a large diagram still blocks for its render time. A lower edge limit is a product decision: proposed follow-up. |
| M13 | 12 | The Mermaid field walked every top-level block on each change, about 11 ms per key press on 1 MB (M12 row 21). | Confirmed | The field keeps the list of lines that can open a mermaid block and reads only changed lines again. A unit test compares it with a fresh scan after 8 edits. |
| M13 | 13 | ArrowUp and ArrowDown jumped over a drawn diagram. | Confirmed | An arrow key next to a diagram moves into its block, which shows the source. E2E test added. |
| M13 | 14 | Two quick theme switches gave an unhandled rejection ("Transition was skipped"). | Confirmed | The rejection is handled. Unit and E2E tests added. |
| M13 | 15 | An unclosed mermaid fence hid the rest of the document behind one diagram. | Confirmed | Only closed blocks are drawn. Unit test added. |
| M13 | 16 | One SVG shown twice gave duplicate ids. The result cache had no limit. | Confirmed | Each diagram is its own image, so its ids stay inside it. The cache keeps the last 32 results. Unit test added. |
| M13 | 17 | Licenses (C6): the bundles shipped about 100 npm packages without their notices. Mermaid brings 33 ISC packages (d3 and others) and `robust-predicates` (Unlicense). The server already runs ISC and BlueOak-1.0.0 packages from v1 (Fastify, `@fastify/static`). C6 names none of these licenses. | Confirmed (notices), Blocker (ISC, Unlicense, BlueOak-1.0.0), resolved | The build writes `THIRD-PARTY-NOTICES.txt` with the license text of each bundled package. A build test checks each license. The owner decides: add ISC, Unlicense and BlueOak-1.0.0 to C6, or remove Mermaid (MDV-12). Resolved 2026-10-10: the owner allowed ISC, Unlicense and BlueOak-1.0.0, and C6 names them. |
| M13 | 18 | Minor: a diagram's own `layout: elk` gave an error. The image URL regex changed plain text. Each page load checked the hashed chunks again (`public, max-age=0`). | Confirmed | `layout` is a secure key, so dagre stays. The regex is deleted. Chunks are served with `private, max-age=31536000, immutable`. Server test added. |
| M13 | 19 | Test gaps: one MDV-14 vector, unit tests of a filter that cannot meet MDV-14, no tests for a theme switch with a diagram, keyboard entry, stray page elements or a failed load. | Confirmed | All added. |
| M14 | 1 | Section 11 left the export renderer to the builder: Marked with DOMPurify, or `@lezer/markdown`. | Confirmed (decision) | `markdown-html.js` walks the editor's Lezer tree, so export agrees with Visual mode, the outline and the counts, and needs no new library. All text is escaped, raw HTML stays text (MDV-8) and URLs pass a scheme allow-list after spaces and control characters are removed. A hostile-input test checks that only known tags and attributes come out. |
| M14 | 2 | A refresh whose list was read before a new document closed that new tab. Seen as a flaky drop test; the same race existed in v1 for New during a focus refresh. | Confirmed | `tabs.refresh` judges only tabs that were open when it read the list. A deterministic E2E test holds a stale list. |
| M14 | 3 | One diagram shown twice in an export repeated its SVG ids. | Confirmed | Each later copy gets its own ids. Unit test. |
| M14 | 4 | The exported page could run a script if a future change let one through. | Confirmed (defense) | The export page carries its own CSP: no scripts, connections or fonts; images may load (EXP-4). |
| M14 | 5 | HTML export of 1 MB of Markdown takes about 430 ms here, .txt about 110 ms. The page waits that long. | Risk | A one-off action with no time target. |
| M14 | 6 | `http:` images do not load in the PDF, because the page CSP allows only `https:` images. | Risk | Same rule as Visual mode (C7). The HTML file keeps the tags. |
| M14 | 7 | Headless Chromium has no print dialog, so the E2E test checks that the frame prints the rendered page, not the saved PDF. | Risk | Save as PDF is an owner check in a real browser (section 13). |
| M14 | 8 | Independent review, Pass 1 (rows 8 to 21). Export rendered any `html` or `pdf` format as Markdown, also for a non-Markdown tab. An `.html` tab downloaded an empty page, and a plain tab named `scan.pdf` opened the print dialog. | Confirmed | Each format has an id. Only Markdown tabs get `html` and `pdf`. Other tabs get `source` ("Original (.ext)"), which is the raw text. Unit and E2E tests. |
| M14 | 9 | The drop overlay could stay over the page: a cancelled drag fires no event in Chromium, and under a modal dialog the inert overlay never got `dragleave`. Drops also opened tabs behind a modal dialog. | Confirmed | The overlay goes 1 second after the last `dragover`, and each `dragover` shows it again. While a modal dialog is open, a file drag shows no overlay and a drop opens nothing. The drag is still stopped, so the browser never opens the file in place of the app. E2E tests with real browser drag events. |
| M14 | 10 | HTML export time grew with the square of the image count in one paragraph: each alt text walked the whole paragraph. 1 MB took 89.5 s. | Confirmed | `renderedText` can walk only the image node, with the same result. Export and Visual mode use it. 1 MB of images (30,000) now takes 140 ms here. Unit tests. |
| M14 | 11 | After an export choice, the focus went to the page body (NFR-5). | Confirmed | The focus goes back to the Export button. Keyboard E2E test. |
| M14 | 12 | The export CSP blocked a relative image next to a saved `.html` file. | Confirmed | `img-src` adds `file:`. Images cannot run script. E2E test opens a saved export from disk. |
| M14 | 13 | The PDF name did not follow EXP-6: the print page was titled `p.md`, so a browser suggests `p.md.pdf`. | Confirmed | The PDF page is titled with the name without its extension. While printing, the app page has that title too. After printing, the title comes back. Which title a browser uses is an unverified assumption: part of the Save as PDF owner check (section 13). |
| M14 | 14 | Export drew Mermaid blocks in lists and quotes. Visual mode draws only top-level blocks (EXP-4). The rule was in two places. | Confirmed | One `isDrawnMermaid` in `markdown-syntax.js` serves both. Unit tests. |
| M14 | 15 | A dropped file that could not be read (a folder, or a file moved away) stopped the drop with no message. | Confirmed | It is named in the message as "could not be read". The other files still open. Unit test. |
| M14 | 16 | A fenced block indented by 1 to 3 spaces keeps that indentation in its exported code. CommonMark removes it. | Rejected | Visual mode shows the same indentation, and EXP-4 asks for the Visual mode look. |
| M14 | 17 | `\|` in inline code in a table cell keeps its backslash. GFM removes it. | Rejected | Same as Visual mode (EXP-4). |
| M14 | 18 | The print frame stayed in the page after printing, with up to about 13 MB. | Confirmed | The frame goes after printing (row 13). |
| M14 | 19 | Relative images in the print frame request app URLs with the session cookie. | Rejected | GET requests to the app's own origin only. They change nothing. |
| M14 | 20 | The name extension rule was in 3 places. | Confirmed in part | `export.js` uses `extensionOf` from `languages.js`. `drop.js` keeps its own split, because its base name can never be empty. |
| M14 | 21 | Test gaps: no export test for a non-Markdown `.html` tab, no keyboard test for Export, no overlay test for a cancelled drag, no HTML export speed test. | Confirmed | All added. A PDF with Mermaid uses the same page as `.html` export, which has its test. |
| PR | 1 | Codex review of PR #4 (rows 1 to 32, one per thread). Documents panel past the right edge in a narrow window. | Confirmed | Below 600 px the panel hangs from the top bar. E2E test at 480 px. |
| PR | 2 | Keyboard activation outside an open dropdown (a click without a press) left it open. | Confirmed | Outside clicks close it too, also in the capture phase. Unit test. |
| PR | 3 | EDGE-26 had a fourth table cell, which GFM drops. | Confirmed | Merged into the Behavior cell. |
| PR | 4 | `setDelay` left a pending save on the old deadline (SAV-4). | Confirmed | A pending save due later than the new delay moves to it. Retries keep their backoff. Unit tests; the old test encoded the bug. |
| PR | 5 | A failed save replaced an earlier edit deadline with the retry delay (SAV-1). | Confirmed | The earlier deadline stays. Unit test. |
| PR | 6 | Two Settings dialogs could open while the first read was slow. | Confirmed | One Settings dialog at a time. E2E test. |
| PR | 7 | Cancel or Escape during a slow save closed the dialog, and the save still applied. | Confirmed | `formDialog` ignores cancel while a submit runs, also for Change password. E2E test. |
| PR | 8 | Reference links were not styled in Visual mode. | Rejected | Fixed before, in M11 review (`7e1b40e`): links resolve their definition. |
| PR | 9 | Relative links did not open with Ctrl+click (MDV-7). | Confirmed (`//host`), Rejected (anchors and paths) | `//host` opens with https. A document has no base URL, so `#x` or `a.html` would open app routes. |
| PR | 10 | Setext headings could not be changed or removed from the toolbar. | Confirmed | The underline goes and the heading becomes ATX or plain text. Unit tests. |
| PR | 11 | A remote image that failed to load loaded again in a later widget without a click. | Confirmed | A failed image needs another click. |
| PR | 12 | A selection that holds the fences added a second pair. A quoted block kept its closing fence. | Confirmed | Fences on the first and last selected lines count. The closing fence comes from the tree. Unit tests. |
| PR | 13 | Plain text kept closing hashes (`## T ##`). | Confirmed | Removed with the heading. Unit test. |
| PR | 14 | Space on a focused task box changed only the box. | Confirmed | The box is out of the tab order. From the keyboard, the task text is edited. |
| PR | 15 | After a 413 hold, a passed deadline blocked every later save. | Confirmed | A held start clears the deadline. Unit test. |
| PR | 16 | An arrow-key open that Escape closed during the list load still moved the focus. | Confirmed | The focus moves only while the panel is open. Unit test. |
| PR | 17 | Top-bar controls were cut off in a narrow window. | Confirmed | The top bar wraps. E2E test at 480 px. Phone layouts stay a non-goal. |
| PR | 18 | Only 22 named entities were decoded. | Rejected | Fixed before, in M12 review (`f1ea3ca`). |
| PR | 19 | Inline code with a backtick in the selection closed early. | Confirmed | A longer backtick run and padding. Unit tests; an old test encoded the bug. |
| PR | 20 | `markdown` fences had no highlighting (MDV-11). | Confirmed | GFM Markdown parses inside them. Unit test. |
| PR | 21 | An image whose description spans lines shows as source in Visual mode. | Risk | A widget cannot replace a line break. The source stays and nothing loads (MDV-14). Rare. |
| PR | 22 | Raw counts waited for the Markdown parse. | Confirmed | Raw counts show at once, the outline waits for the tree. |
| PR | 23 | Mermaid packages under ISC, BlueOak-1.0.0 and Unlicense. | Confirmed | As M13 row 17: notices added, owner decision open. `lru-cache` (BlueOak) is a server package from v1, not in the bundles. |
| PR | 24 | Stars or backticks in code were removed as marks. | Confirmed | Only marks in the syntax tree go. Unit tests. |
| PR | 25 | List and quote marks were not found after other container marks (`> - item`). | Confirmed | Unit tests. |
| PR | 26 | A failed Mermaid load was kept until reload. | Rejected | Fixed before, in M13 review (`02f434a`). |
| PR | 27 | Quote marks stayed in fenced code in plain text. | Rejected | Fixed before, in M12 review (`f1ea3ca`). |
| PR | 28 | A skipped view transition rejected unhandled. | Rejected | Fixed before, in M13 review (`02f434a`). |
| PR | 29 | Removing the fences of an empty block was said to throw. | Confirmed (in part) | It did not throw here, but it left a blank line. One deletion now. Unit test. |
| PR | 30 | Reference labels used `toLowerCase`, so `[ẞ]` did not match `[SS]`. | Confirmed | Lower then upper case, as the CommonMark reference code. Unit tests. |
| PR | 31 | Image descriptions showed their Markdown marks. | Confirmed | The plain-text rules render them (`renderedText` reads the editor's Text). Unit test. |
| PR | 32 | Entities showed as source in Visual mode. | Confirmed | Shown as their characters, except on the cursor line. Unit test. |
| M16 | 1 | Found during the NFR-2 work: with a long outline (about 5,200 headings in the dense perf document), the browser laid out and painted the outline panel again on each key press. PrePaint and Paint took about 1.5 s of 200 key presses. | Confirmed | `.outline-panel` has `contain: strict`. Its size comes from the row, so its entries are not laid out or painted again. PrePaint went away and Paint fell to about 0.2 s. |
| M16 | 2 | The perf spec ran with trace recording (`retain-on-failure`). Each trace snapshot of the page with a long outline took 165 to 200 ms, inside the measured times. Ctrl+End in dense Markdown measured 242 to 559 ms, with about 25 ms in app code. | Confirmed | The perf spec turns tracing off. Ctrl+End in dense Markdown is now 54 to 302 ms. |
| M16 | 3 | NFR-2 typing in dense Markdown: 200 characters take 4.0 to 6.5 s here (target 3 s). The document has a top-level block every 40 bytes, about 26,000 in all. Per key, `@lezer/markdown` 1.8.0 reuses the old tree one top-level block at a time (`FragmentCursor.takeNodes`) and then balances all of them again: about 14 ms. App code adds about 1 ms. The same test on 1 MB of notes (about 4,900 blocks) takes 2.0 to 2.8 s. | Blocker (owner decision) | The perf test holds 1 MB of notes to the NFR-1 targets, and the dense document to CNT-7, OUT-2, open and Ctrl+End. Dense typing is logged, not asserted, and README names the limit. The owner decides: accept NFR-2 for documents like notes, or ask for a parser change that reuses whole subtrees (upstream in `@lezer/markdown`, or a patched copy here). A patched dependency is not built without that decision. |
| M16 | 4 | 31 requirement IDs were in no test title, and NFR-5 had no keyboard-only run. | Confirmed | Test titles name the IDs they cover. A keyboard-only E2E test reaches each top-bar control, the outline, the toolbar and the status bar, and opens the menus. The Notion IDs wait for M15. EDGE-24 (cancel in the print dialog) is an owner check: headless Chromium has no print dialog. |
| M16 | 5 | README had no V2 content. | Confirmed | New sections: Markdown, Export and drag and drop, Settings and Third-party notices. Known limits name the V2 limits. |
| M16 | 6 | Independent review, Pass 1 (rows 6 to 14). The NFR-5 keyboard test did not prove that each control is reachable: a script focused New, and it named only 2 of the 9 toolbar controls. It did not work the Visual toggle or the Heading menu. | Confirmed | Shift+Tab from Outline must reach New. The expected list comes from the page: each visible button and select in the top bar, the toolbar and the status bar. The run presses the Visual toggle twice and opens and closes the Heading menu. With `tabindex="-1"` on New, the test now fails. |
| M16 | 7 | The measurements did not agree between the rows, section 13 and `REQUIREMENTS_V2.md`. The notes document has about 4,900 top-level blocks, not 4,000. | Confirmed | One set of ranges from all runs alone (section 13) in every place. |
| M16 | 8 | README stated the notes typing result as certain, but the margin is small (one review run took 2802 ms). `npm run test:e2e` ran `perf.spec.js` beside the other specs (v1 config), so its times could fail under load. | Confirmed | `playwright.config.js` has a `perf` project that runs after the others, one test at a time. README says how to run it alone, and names the result as a test result. |
| M16 | 9 | README did not say how to leave the editor with the keyboard. Tab indents there. | Confirmed | README: press Escape and then Tab. |
| M16 | 10 | README said every other document offers its original source. A `.txt` file or a name without an extension offers only `.txt`. | Confirmed | Text fixed. |
| M16 | 11 | Some tests did not name the IDs they cover: EDGE-13, NFR-2 (dense document), LAY-3 (open, rename and delete) and LAY-4 (arrow keys). | Confirmed | Titles fixed. |
| M16 | 12 | The perf document builder's slack went from 200 to 2000 bytes with no record. It changed the v1 Python document: its last line went from 114 to 1,954 characters. | Confirmed | The builder now adds a block only while it fits in the target less 200 bytes. Each last line has 199 characters or more (Python 229). |
| M16 | 13 | The editor tabs (`role="tab"`) have no tab stop, so the Tab key skips them. A keyboard user switches tabs only through the Documents dropdown. | Confirmed (outside M16) | v1 and M9 code. NFR-5 does not list the tabs. Proposed follow-up: the tab strip as one tab stop with arrow keys, as the outline does. |
| M16 | 14 | No test guards the `contain: strict` fix (row 1): with dense typing only logged, all perf tests passed without it. | Risk | A/B in the review: 6.8 to 7.2 s without it, 4.0 to 6.5 s with it. A time limit cannot separate these ranges without false failures. The perf log shows each run's dense typing time. |

## 13. V2 validation environment

- Node.js 24.21.0 from nodejs.org (checksum verified), outside the repo. The container default is Node 22.
- Chromium e2e only. Firefox and WebKit are not installed, so the `@smoke` runs in those browsers are owner-pending.
- The perf spec runs alone. Its 200-character typing time was 2790 to 3258 ms before any V2 change (limit 3000 ms), so this container is near the limit. After the size-check fix (section 12, M12 row 20) it was 1577 to 2100 ms. The Markdown perf case (CNT-7, OUT-2) failed once right after the full parallel suite. Reruns gave 181 to 216 ms for counts and 199 to 246 ms for the outline.
- M16, without trace recording (section 12, M16 row 2), perf alone, 13 runs including the review's: Python typing 856 to 1448 ms and Ctrl+End 21 to 40 ms. Markdown notes typing 1966 to 2802 ms and Ctrl+End 49 to 93 ms. Dense Markdown typing 4043 to 6457 ms (logged only, M16 row 3), Ctrl+End 54 to 302 ms, counts 176 to 212 ms and outline 190 to 242 ms. The notes margin to 3000 ms is small here. One run right after the full parallel suite (load average 4.7) gave counts 332 ms, over CNT-7. The repo's `playwright.config.js` (v1) ran `perf.spec.js` next to the other specs. The M16 review moved it to a `perf` project that runs after the others, one test at a time (section 12, M16 row 8).
- `api.notion.com` is not reachable from this container: the network policy denies it (proxy 403). No Notion token or parent page is set here either. M15 starts with the C10 test call, so M15 waits for both. The owner can allow the host under the environment's Network access setting and add the token as an environment secret.
