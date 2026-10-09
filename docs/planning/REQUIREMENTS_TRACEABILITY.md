# Requirements Traceability

**Source:** `docs/planning/REQUIREMENTS.md` (REQ). Section numbers refer to that file.
**Plan:** `docs/planning/BUILD_PLAN.md` (task IDs T01 to T27).
**Status values:** `Planned` (mapped, not built), `Implemented` (task done, tests pass), `Verified` (also checked in production where noted).

Update the Status column when the mapped tasks are done.

---

## 1. Coverage summary

| Group | Count | Mapped to tasks | Has validation |
|-------|-------|-----------------|----------------|
| Access and security (ACC) | 8 | 8 | 8 |
| Editor (EDT) | 9 | 9 | 9 |
| Documents and storage (DOC) | 8 | 8 | 8 |
| Multi-device conflict (CON) | 1 | 1 | 1 |
| Deployment and quality (DEP, NFR) | 6 | 6 | 6 |
| Edge cases (EDGE) | 9 | 9 | 9 |
| Plan interpretations (INT) | 11 | 11 | 11 |
| Non-goal guards (NG) | 6 | 6 | 6 |
| **Total** | **58** | **58** | **58** |

No requirement is unmapped.

---

## 2. Access and security

| ID | Source | Summary | Tasks | Acceptance criteria | Validation | Status |
|----|--------|---------|-------|---------------------|------------|--------|
| ACC-1 | REQ 3.1 | One owner, one password, no other accounts | T05, T07, T10 | Login accepts the one password. No sign-up or account route exists. | `auth.test.js`, `gate.test.js` route sweep, `e2e/login.spec.js` | Implemented |
| ACC-2 | REQ 3.1 | Every page and data route needs a session | T07, T10 | Without a session, HTML navigation gets 302 to `/login`, other requests get 401 with no data. Only the documented public routes are open. | `gate.test.js` sweeps every registered route, `e2e/login.spec.js` | Implemented |
| ACC-3 | REQ 3.1 | First password from a Railway variable | T06, T26 | A fresh deploy accepts `OWNER_PASSWORD`. | `bootstrap.test.js` seed branch, T26 checklist item 1 | Implemented |
| ACC-4 | REQ 3.1, D4 | Change-password screen; needs current password; in-app password wins; variable only seeds | T05, T06, T09, T14 | Old password fails and new one works, also after restart with `OWNER_PASSWORD` still set. | `password-route.test.js` restart case, `bootstrap.test.js` ignored-variable branch, `e2e/shell.spec.js`, T26 item 4 | Implemented |
| ACC-5 | REQ 3.1, D4 | Reset variable restores the Railway password on start | T06, T26 | With `RESET_PASSWORD` set, a restart makes `OWNER_PASSWORD` work and the in-app password fail. | `bootstrap.test.js` reset branch, T26 item 5 | Implemented |
| ACC-6 | REQ 3.1 | 30-day sessions per device; logout button | T07, T14 | Valid at 30 days minus 1 ms, invalid at 30 days plus 1 ms. Logout ends the session. | `auth.test.js` with injected clock, `e2e/shell.spec.js` | Implemented |
| ACC-7 | REQ 3.1 | Failed logins are rate limited | T08, T10, T26 | 6th failure from one IP in 15 minutes gets 429. Global cap 30. | `rate-limit.test.js`, `e2e/login.spec.js`, T26 item 6 | Implemented |
| ACC-8 | REQ 3.1 | Refuse to start with no variable and no stored password | T06 | Exit 1 with "No password configured. Set OWNER_PASSWORD." | `bootstrap.test.js` refuse branch | Implemented |

## 3. Editor

| ID | Source | Summary | Tasks | Acceptance criteria | Validation | Status |
|----|--------|---------|-------|---------------------|------------|--------|
| EDT-1 | REQ 3.2 | Tabs for open documents | T17 | Open, switch and close tabs. Each tab keeps its own content and undo history. | `e2e/tabs.spec.js` | Implemented |
| EDT-2 | REQ 3.2 | Plain text editing, line numbers always on | T15 | Line numbers show for every document. | `e2e/editor.spec.js` | Implemented |
| EDT-3 | REQ 3.2, D5 | Highlighting for 11 languages | T20 | Each language selects its parser and shows highlight classes. | `languages.test.js`, `e2e/language.spec.js`, manual visual check | Implemented |
| EDT-4 | REQ 3.2, D7 | Language from extension; unknown = plain; manual override | T13, T20 | Rename switches language. Override wins and syncs across devices. | `languages.test.js`, `documents-meta.test.js`, `e2e/language.spec.js` | Implemented |
| EDT-5 | REQ 3.2, D6 | Literal find and replace, current tab only, replace and replace all | T21 | `a.c` matches only literal `a.c`. Replace all touches only the current tab. No regex or whole-word controls. | `e2e/find-replace.spec.js` | Implemented |
| EDT-6 | REQ 3.2, D10 | Dark default, light toggle, remembered per browser | T10, T14 | First visit is dark. Toggle survives reload. | `theme.test.js`, `e2e/shell.spec.js`, `e2e/login.spec.js` | Implemented |
| EDT-7 | REQ 3.2, D12 | Shortcuts Ctrl+N, Ctrl+W, Ctrl+S, Ctrl+F, Ctrl+H | T22, T27 | All five work in the installed Chrome and Edge window. Ctrl+S, Ctrl+F and Ctrl+H also work in normal tabs. | `e2e/shortcuts.spec.js`, manual check in installed app, T26 item 8 | Implemented |
| EDT-8 | REQ 3.2, D12 | Installable as a desktop app in Chrome and Edge | T27, T26 | No installability errors. Installed app opens in its own window. | `gate.test.js`, `e2e/install.spec.js`, manual install, T26 item 8 | Implemented |
| EDT-9 | REQ 3.2, D13 | Alt+N new and Alt+W close everywhere | T22 | Both work in normal tabs, Firefox and the installed app. | `e2e/shortcuts.spec.js` (`@smoke`), T26 item 9 | Implemented |

## 4. Documents and storage

| ID | Source | Summary | Tasks | Acceptance criteria | Validation | Status |
|----|--------|---------|-------|---------------------|------------|--------|
| DOC-1 | REQ 3.3, D1 | Server storage, same documents on every device | T11, T12, T15, T17 | A change saved in context A shows in context B after focus. | `documents.test.js`, `e2e/tabs.spec.js` two-context test | Implemented |
| DOC-2 | REQ 3.3 | Documents survive restarts and redeploys | T03, T04, T26 | DB file persists on the volume across redeploys. | `db.test.js`, T04 checklist, T26 item 3 | Planned |
| DOC-3 | REQ 3.3 | Autosave about 1 s after typing stops; saved, unsaved or error label | T12, T15, T16 | Pause saves within about 1 s. Label matches real state. | `autosave.test.js`, `e2e/editor.spec.js`, `e2e/save-reliability.spec.js` | Implemented |
| DOC-4 | REQ 3.3 | List with name and last modified; open, rename, delete; "Untitled N" | T11, T13, T18 | Actions work. New names are unique "Untitled N". | `documents.test.js`, `documents-meta.test.js`, `e2e/doclist.spec.js` | Implemented |
| DOC-5 | REQ 3.3, D9 | Close asks keep or delete; delete is permanent | T19 | Keep stays in list. Delete removes it. Cancel keeps the tab. | `e2e/close.spec.js` | Implemented |
| DOC-6 | REQ 3.3 | Empty untitled tab closes without prompt | T19 | No dialog. No document remains. | `e2e/close.spec.js` | Implemented |
| DOC-7 | REQ 3.3 | Open tabs remembered per browser | T17 | Reload restores open tabs and the active tab. | `e2e/tabs.spec.js` | Implemented |
| DOC-8 | REQ 3.3 | 1 MB maximum with a clear error | T11, T12, T24 | Server returns 413 above 1,048,576 bytes. Client rejects the edit and shows the message. | `documents.test.js`, `documents-save.test.js`, `size-limit.test.js`, `e2e/size-limit.spec.js` | Implemented |

## 5. Multi-device conflict

| ID | Source | Summary | Tasks | Acceptance criteria | Validation | Status |
|----|--------|---------|-------|---------------------|------------|--------|
| CON-1 | REQ 3.4, D8 | Warn before overwriting a version changed elsewhere; three choices | T12, T16, T23 | Stale save gets 412. Dialog offers overwrite, load other, save as new. Each gives the stated server result. | `documents-save.test.js`, `e2e/conflict.spec.js` | Implemented |

## 6. Deployment and quality

| ID | Source | Summary | Tasks | Acceptance criteria | Validation | Status |
|----|--------|---------|-------|---------------------|------------|--------|
| DEP-1 | REQ 3.5 | Private Railway instance; password is the access control | T04, T07, T26 | Deployed URL shows only the login page without a session. | T04 checklist, T26 item 1 | Planned |
| DEP-2 | REQ 3.5 | Railway persistent volume | T03, T04 | Production refuses to start without a volume path. Volume mounted at `/data`. | `config.test.js`, T04 checklist | Planned |
| DEP-3 | REQ 3.5 | Desktop browsers | T10, T26 | Smoke specs pass in Chromium, Firefox and WebKit. Manual check in real browsers. | Playwright `@smoke` projects, T26 item 7 | Implemented |
| DEP-4 | REQ 3.5 | Secure, HttpOnly cookies over HTTPS | T07, T26 | Production config sets `Secure`, `HttpOnly`, `SameSite=Lax` and HSTS. | `headers.test.js`, T26 item 2 | Implemented |
| DEP-5 | REQ 3.5 | README notes removing the reset variable | T26 | README has the note and the side effect on sessions. | README review in T26 | Planned |
| NFR-1 | REQ 3.5 | 1 MB documents stay responsive | T15, T24, T25 | Open under 2 s, 200 typed characters under 3 s, Ctrl+End under 0.5 s. | `e2e/perf.spec.js`, manual scroll check | Planned |

## 7. Edge cases

| ID | Source | Summary | Tasks | Acceptance criteria | Validation | Status |
|----|--------|---------|-------|---------------------|------------|--------|
| EDGE-1 | REQ 4 | Document deleted on another device | T12, T16, T23 | Save gets 404. Dialog offers save as new and discard. | `documents-save.test.js`, `e2e/conflict.spec.js` | Implemented |
| EDGE-2 | REQ 4 | Save failure | T16 | Error label, text kept, retries, unload warning. | `autosave.test.js`, `e2e/save-reliability.spec.js` | Implemented |
| EDGE-3 | REQ 4 | Content over 1 MB | T12, T24 | Rejected with a clear error. Existing content unchanged. | `documents-save.test.js`, `e2e/size-limit.spec.js` | Implemented |
| EDGE-4 | REQ 4 | Session expires while editing | T16 | Re-login dialog. Unsaved text kept and saved after login. | `e2e/save-reliability.spec.js` | Implemented |
| EDGE-5 | REQ 4 | Wrong password | T07, T08, T10 | Generic error. Rate limit after repeated failures. | `auth.test.js`, `rate-limit.test.js`, `e2e/login.spec.js` | Implemented |
| EDGE-6 | REQ 4 | Password change | T09 | Needs current password. Other sessions signed out. | `password-route.test.js` | Implemented |
| EDGE-7 | REQ 4 | Reset variable left set | T06, T26 | Every start resets and logs a warning. README explains it. | `bootstrap.test.js`, README review | Planned |
| EDGE-8 | REQ 4 | No variable and no stored password | T06 | Refuse to start with a clear log message. | `bootstrap.test.js` | Implemented |
| EDGE-9 | REQ 4 | Unknown file extension | T20 | Plain text. | `languages.test.js` | Implemented |

## 8. Plan interpretations

These items are not new product scope. They make an existing requirement precise or close a gap found in review (`PLAN_REVIEW.md`). Each one traces to a parent requirement.

| ID | Parent | Interpretation | Tasks | Validation | Status |
|----|--------|----------------|-------|------------|--------|
| INT-1 | DOC-8 | 1 MB = 1,048,576 bytes of UTF-8 | T11, T12, T24 | Boundary tests at 1,048,576 and 1,048,577 bytes | Implemented |
| INT-2 | ACC-6 | Session lifetime is fixed at 30 days from sign-in, not sliding | T07 | `auth.test.js` clock tests | Implemented |
| INT-3 | ACC-2 | Public: login page and its assets, `/healthz`, `POST /api/login` | T07 | `gate.test.js` sweep | Implemented |
| INT-4 | CON-1 | `version` counts content changes only; rename and language do not conflict | T12, T13 | `documents-meta.test.js` | Implemented |
| INT-5 | DOC-1 | Clean open tabs refresh on focus and activation | T17 | Two-context test in `e2e/tabs.spec.js` | Implemented |
| INT-6 | DOC-2, DEP-2 | Production refuses to start without a volume path | T03 | `config.test.js` | Implemented |
| INT-7 | CON-1 | "Save mine as new" names the copy "<name> (conflict copy)" | T23 | `e2e/conflict.spec.js` | Implemented |
| INT-8 | EDT-5 | Literal search is case-insensitive with no toggle | T21 | `e2e/find-replace.spec.js` | Implemented |
| INT-9 | ACC-4 | New passwords need 12 to 256 characters; a shorter seed only logs a warning | T05, T06, T09 | `password.test.js`, `bootstrap.test.js` | Implemented |
| INT-10 | DOC-5 | Keep flushes the save first; a failed save keeps the tab open | T19 | `e2e/close.spec.js` with a failed PUT | Implemented |
| INT-11 | EDT-8 | Manifest, icons and service worker script are public routes | T27 | `gate.test.js` | Implemented |

## 9. Non-goal guards

Tests that prove excluded features stay out.

| ID | Source | Guard | Tasks | Validation | Status |
|----|--------|-------|-------|------------|--------|
| NG-1 | REQ 8 | No multi-cursor | T15 | `e2e/editor.spec.js` cursor count | Implemented |
| NG-2 | REQ 8 | No regex, whole-word or cross-document search | T21 | `e2e/find-replace.spec.js` | Implemented |
| NG-3 | REQ 8 | No multi-user or sign-up routes | T07 | `gate.test.js` route sweep | Implemented |
| NG-4 | REQ 8 | No live sync (no WebSocket or polling while idle) | T17 | Code review: refresh runs only on focus and activation | Implemented |
| NG-5 | REQ 8 | No hidden-URL or IP-based protection | T07 | `gate.test.js` (all protection is the session) | Implemented |
| NG-6 | REQ 8 | No offline use: any service worker is network-only and caches nothing | T27 | Code review of `sw.js`, `e2e/install.spec.js` checks Cache Storage is empty | Implemented |
