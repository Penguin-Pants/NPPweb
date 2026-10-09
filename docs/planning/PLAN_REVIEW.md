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
| 2026-10-09 | All | Phase reviews use the two-pass method in section 1 (Confirmed, Risk or Rejected). Results go to section 10. | The execution prompt names a "TWO-PASS REVIEW" with a finding classification in `AGENTS.md`. Neither `AGENTS.md` nor the installed skills define one. | Agent, not yet approved |
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
| P1 | 1 | `Cache-Control: no-store` was missing when the router decoded a percent-encoded `/api/` path. | Confirmed | Fixed in eb099f0. The check also reads the route pattern. Test added. |
| P1 | 2 | Malformed URLs returned 400 from Fastify without the security headers. | Confirmed | Fixed in eb099f0 with `frameworkErrors`. Test added. |
| P1 | 3 | With `trustProxy: true`, the Origin check uses `X-Forwarded-Host` when present. | Rejected | T02 requires `trustProxy`. The Origin check is a CSRF defense, and a browser cannot send that header cross-site without a preflight. A non-browser client can send any Origin anyway. |
| P1 | 4 | TD-11 assumes the Railway edge overwrites `X-Real-IP`. If it passes client values through, rotating the header defeats the per-IP bucket. | Risk | R2. Owner check added to the T26 notes: 6 wrong logins with 6 different `X-Real-IP` values must get 429 on the 6th. |
| P1 | 5 | No test proved the Origin check for PUT, PATCH and DELETE. | Confirmed | Test added in eb099f0. |
| P1 | 6 | No test asserted the startup log line when no password is configured (EDGE-8). | Confirmed | Test added in eb099f0. |
| P1 | 7 | No test covered paths next to the public allowlist (`/login/`, `/%6cogin.js`, `//login`). | Confirmed | Test added in eb099f0. The gate already failed closed. |
| P1 | 8 | The E2E fixture left the server running when startup failed. | Confirmed | Fixed in eb099f0. |
| P1 | 9 | `import.meta.main` needs Node 24.2, but engines allowed 24.0. | Confirmed | Fixed in eb099f0 (`>=24.2 <25`). |
| P1 | 10 | The app is built before the bootstrap and not closed when the bootstrap fails. | Rejected | The process exits 1 right after. Logged as a deviation. |
| P1 | 11 | `POST /api/password` has no limit on wrong current-password attempts. A stolen session cookie allows unlimited online guessing. | Risk | The plan limits failed logins only. Proposed out-of-scope fix in section 11. |
| P2 | 1 | The over-limit tests used Content-Length only, so the chunked byte counter was untested. | Confirmed | Chunked test added in 9bcd481. |
| P2 | 2 | The list-order test could not tell `updated_at` from `created_at`. | Confirmed | Test added in 9bcd481: a save and a rename move a document to the top. A language change does not. |
| P2 | 3 | A `charset` other than UTF-8 was decoded as UTF-8. | Confirmed | Fixed in 9bcd481: 415. |
| P2 | 4 | A JSON string body was accepted as content. | Confirmed | Fixed in 9bcd481: only `text/plain` is accepted. |
| P2 | 5 | Fastify parse errors did not use the `{ error: "<code>" }` shape. | Confirmed | Fixed in 9bcd481 with one root error handler. |
| P2 | 6 | T13 and section 2.6 disagree on `updated_at` for a language-only PATCH. | Rejected | Not a defect. Section 2.6 followed. Logged as a deviation. |
| P2 | 7 | A PUT with no body saved empty content. | Confirmed | Fixed in 9bcd481: 415. |
| P2 | 8 | (Pass 2) `node:sqlite` cut content at the first NUL character. | Confirmed | Found while checking the review note on NUL. Fixed in 9bcd481. Test added. |
| P3 | 1 | Clicking the active tab showed a stale copy of its state, and the next save could overwrite typed text. | Confirmed | Fixed in 3db544a. E2E test added. |
| P3 | 2 | The editor stayed editable while no tab owned it (during a load, after a failed load, after a close). | Confirmed | Fixed in 3db544a: read-only blank state, load error message and retry. E2E test added. |
| P3 | 3 | A browser can close the non-cancellable re-login dialog on a second Escape, which would leave saves paused for good. | Confirmed | Fixed in 3db544a: the dialog opens again. E2E test added. |
| P3 | 4 | A PUT that commits but loses its response is retried with the old version and gets 412 against the user's own save. | Risk | Follows section 2.8. The T23 conflict dialog resolves it (Overwrite with mine). |
| P3 | 5 | `createTabs` and the active-tab and load-race paths had no tests. | Confirmed | E2E tests added in 3db544a. |
| P3 | 6 | The error texts for conflict, deleted and too-large were untested. | Confirmed | Covered in the T23 and T24 specs. |
| P3 | 7 | No test covered `resumeAll` with a held document. | Confirmed | Unit test added in 3db544a. |
| P3 | 8 | The restore test waited for the active tab only, so it did not prove that the other tabs persisted. | Confirmed | Fixed in 3db544a: waits for no unsaved tab, then checks every tab. |
| P3 | 9 | The 2.5 s bound in the autosave timing test may be tight under load. | Rejected | No flake seen. "About 1 second" allows the margin. |
| P4 | 1 | Two document list refreshes can overlap, and an older response can render last. | Risk | Low impact: the next open or focus corrects the list. No change. |
| P4 | 2 | A document deleted elsewhere keeps its list row until the next refresh. Opening it closes its new tab on the 404. | Rejected | Refresh on open and on focus is the specified behavior. |
| P4 | 3 | Deleting from the list discards unsaved text in the open tab without a second prompt. | Rejected | T18 specifies one confirm dialog that says the delete is permanent. |
| P4 | 4 | Window focus sends two list requests (tabs and document list). | Rejected | One owner, small JSON. Not worth shared state. |
| P5 | 1 | Enter in the search panel ran Next even on a focused button, so keyboard users could not press Replace all. | Confirmed | Fixed in c705aca. E2E test added. |
| P5 | 2 | On non-QWERTY layouts, Mod shortcuts matched by `event.code` fire on the wrong letters (AZERTY Ctrl+Z opens the close dialog). | Risk | T22 specifies `event.code`. Proposed out-of-scope fix 2 in section 11. |
| P5 | 3 | A rename did not refresh the language tooltip of the active tab. | Confirmed | Fixed in c705aca. E2E test added. |
| P5 | 4 | Opening the panel again with a selection cleared the replace field. | Confirmed | Fixed in c705aca. E2E test added. |
| P5 | 5 | A held shortcut key repeated its action. | Confirmed | Fixed in c705aca. Unit test added. |
| P5 | 6 | No test proved that `preventDefault` runs before an action that throws, or the dialog guard for N, S, F and H. | Confirmed | Unit tests added in c705aca. |
| P5 | 7 | No test covered a hidden tab catching up on a rename, per-tab search state or Cmd+W, Cmd+F and Cmd+H. | Confirmed | Tests added in c705aca. |
| P6 | 1 | Text typed while a choice's request was in flight could be lost, because the dialog had already closed. | Confirmed | Fixed in ec94dfb: the choice runs with the dialog open. E2E test checks that no PUT happens while it is open. |
| P6 | 2 | A failed step inside a choice re-queued the dialog over the sign-in dialog and looped. | Confirmed | Fixed in ec94dfb: error in the dialog, sign-in on top. E2E tests for a network failure and a 401. |
| P6 | 3 | When the copy saved but the reload of the original failed, the tab stayed held with no way out. | Confirmed | Fixed in ec94dfb: a retry only reloads. A 404 closes the original because the copy has the text. |
| P6 | 4 | The conflict dialog focused Overwrite with mine, so Enter while typing could overwrite the other version. | Confirmed | Fixed in ec94dfb: focus on Save mine as a new document. E2E test added. |
| P6 | 5 | The last size-limit E2E assertion could not fail (the earlier message was still visible). | Confirmed | Fixed in ec94dfb: the message is cleared first, and the test checks that no PUT happens and the stored size is still 1 MB. |
| P6 | 6 | No test covered failed choices, two queued conflicts or typing during a choice. | Confirmed | E2E tests added in ec94dfb. |
| P7 | 1 | The perf "open" time includes the page reload and the 1 MB GET, so it is an end-to-end number, not render time alone. | Rejected | That matches the target ("open and render under 2 seconds"). |
| P7 | 2 | The README menu paths for installing in Chrome and Edge were from memory. | Confirmed | Replaced with the address bar install icon and a generic menu entry before 77b91ed. |
| P7 | 3 | The README said `npm run dev` reads `.env`, but the script did not. | Confirmed | Fixed in 77b91ed with `--env-file-if-exists=.env`. Checked with a temporary `.env`. |

## 11. Proposed out-of-scope fixes

Not built. Each one needs a user decision.

| # | From | Proposal | Reason |
|---|------|----------|--------|
| 1 | P1 review 11 | Count wrong current passwords on `POST /api/password` in the login limiter. | A stolen session cookie would otherwise allow unlimited password guessing. |
| 2 | P5 review 2 | Match the Mod shortcuts (N, W, S, F, H) by `event.key` and keep `event.code` for Alt+N and Alt+W. | On AZERTY and other layouts, `event.code` maps Ctrl+Z to KeyW, so undo opens the close dialog, and Ctrl+W can reach the browser and close the installed window. T22 specifies `event.code`. |
