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
