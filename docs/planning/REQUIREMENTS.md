# Margin: Requirements and Build Plan Input

**Status:** Decision-complete. Open questions: none.
**Date:** 2026-10-09
**Purpose:** Single source of truth for a coding agent to turn into a build plan. This file does not include an implementation.

---

## 1. Summary

- **Problem:** The owner wants a minimal, private, Notepad++-style text editor in the browser. Documents must be the same on every device.
- **Outcome:** One web app on Railway. One owner signs in with a password. Documents live on the server. The editor opens in dark mode.
- **v1 scope:** Tabs, autosave, plain text editing, line numbers, syntax highlighting, find and replace on the current tab.

---

## 2. Decision log

| # | Topic | Decision | Notes |
|---|-------|----------|-------|
| D1 | Storage | Server-side. Same documents on every device. | Rejected: browser-only storage, local disk files. |
| D2 | Access | Single password login. | Replaces the earlier answer "no app login (hidden URL or Railway limits)". See constraint C2. |
| D3 | Scope | Core tier: tabs, autosave, plain text, syntax highlighting, line numbers, find and replace. | Rejected: Extended tier (multi-cursor, diff, text transforms). |
| D4 | Password source | Railway variable seeds the first password. In-app change screen. In-app password wins afterward. Railway reset variable for recovery. | Rejected: first-visit setup screen, variable-only. |
| D5 | Highlight languages | Plain text, Markdown, JSON, HTML, CSS, JS, TS, Python, SQL, YAML and shell. | Rejected: broad set (Java, C, C++, C#, PHP, Ruby, Go, Rust). |
| D6 | Find and replace | Current tab only. Literal text. | Rejected: regex, whole-word, search across documents. |
| D7 | Language selection | Auto from document name extension. Manual override. | Rejected: manual-only, content detection. |
| D8 | Multi-device conflict | Warn before saving over a changed version. | Rejected: last save wins, live sync. |
| D9 | Closing a tab | Ask each time: keep or delete. | Implies a document list. |
| D10 | Theme | Dark by default. | Light toggle included (see D11). |
| D11 | Proposed defaults | Accepted in full. | Listed as DOC, EDT, ACC and DEP requirements below. |
| D12 | Shortcuts for new and close | Installable as a desktop app so Ctrl+N and Ctrl+W work in its own window. | Browsers keep Ctrl+N and Ctrl+W in normal tabs. Rejected: Alt-only fallback, toolbar buttons only. |
| D13 | Fallback shortcuts | Alt+N new and Alt+W close work everywhere, including normal tabs and Firefox. | Rejected: toolbar buttons only outside the installed app. |

---

## 3. Requirements

### 3.1 Access and security

| ID | Requirement | Done when |
|----|-------------|-----------|
| ACC-1 | One owner and one password. No other accounts. | Login accepts the one password. No sign-up route exists. |
| ACC-2 | Every page and data route needs a signed-in session. | A request without a session gets an auth error and no data. |
| ACC-3 | The first password comes from a Railway variable. | A fresh deploy with the variable set accepts that password. |
| ACC-4 | A change-password screen exists. It needs the current password. After a change, the in-app password wins. The Railway variable only seeds the first password. | After a change, the old password fails and the new one works. This still holds after a restart. |
| ACC-5 | A Railway reset variable handles recovery. While it is set, each start discards the in-app password and uses the Railway variable password. | With the reset variable set, a restart makes the Railway password work and the in-app password fail. |
| ACC-6 | Sessions last 30 days per device. A logout button exists. | Logout ends the session. A session stays valid until the 30-day limit. |
| ACC-7 | Failed logins are rate limited. | Repeated wrong passwords get blocked for a period. |
| ACC-8 | The app refuses to start when there is no password variable and no stored password. | Startup fails with a clear log message. The app never starts open. |

### 3.2 Editor

| ID | Requirement | Done when |
|----|-------------|-----------|
| EDT-1 | Tabs show the open documents. | A user can open, switch and close tabs. |
| EDT-2 | Plain text editing. Line numbers are always on. | Line numbers show for every document. |
| EDT-3 | Syntax highlighting for plain text, Markdown, JSON, HTML, CSS, JS, TS, Python, SQL, YAML and shell. | Each listed language highlights correctly. |
| EDT-4 | The language comes from the document name extension. An unknown extension means plain text. The user can override the language per tab. | Renaming `a.py` to `a.sql` changes the highlighting. The override works on any tab. |
| EDT-5 | Find and replace works on the current tab only. It matches literal text. It offers replace and replace all. | Find, replace and replace all work. No regex, whole-word or cross-document option exists. |
| EDT-6 | Dark theme by default. A light toggle exists. The choice is remembered per browser. | A first visit shows dark. The toggle choice survives a reload. |
| EDT-7 | Shortcuts: Ctrl+N new, Ctrl+W close, Ctrl+S force save, Ctrl+F find and Ctrl+H replace. | All five work in the installed app window in Chrome and Edge. Ctrl+S, Ctrl+F and Ctrl+H also work in a normal tab. |
| EDT-9 | Alt+N new and Alt+W close work everywhere. | Both work in a normal tab, in Firefox and in the installed app. |
| EDT-8 | The app can be installed as a desktop app in Chrome and Edge and opens in its own window. | The browser offers install. The installed app opens in its own window. |

### 3.3 Documents and storage

| ID | Requirement | Done when |
|----|-------------|-----------|
| DOC-1 | Documents are stored on the server and are the same on every device. | A document saved on device A shows on device B. |
| DOC-2 | Documents survive restarts and redeploys. | Documents are still present after a redeploy. |
| DOC-3 | Autosave runs about 1 second after typing stops. A status label shows saved, unsaved or error. | Typing then pausing saves the document. The label matches the real state. |
| DOC-4 | A document list shows name and last modified date. It supports open, rename and delete. New documents are named "Untitled N". | All three actions work. New documents get a unique "Untitled N" name. |
| DOC-5 | Closing a tab asks whether to keep or delete the document. Keep leaves it in the list. Delete is permanent. | Both answers behave as stated. The prompt says delete is permanent. |
| DOC-6 | An empty untitled tab closes without the prompt. | Closing an empty "Untitled N" tab shows no prompt and leaves no document. |
| DOC-7 | Open tabs are remembered per browser. | A reload restores the open tabs and the active tab. |
| DOC-8 | Maximum size is 1 MB per document. | A larger save or paste shows a clear error. |

### 3.4 Multi-device conflict

| ID | Requirement | Done when |
|----|-------------|-----------|
| CON-1 | The editor warns before saving over a version changed on another device. The choices are: overwrite with mine, load the other version, or save mine as a new document. | Editing one document on two devices triggers the warning on the second save. Each choice works. |

### 3.5 Deployment and quality

| ID | Requirement | Done when |
|----|-------------|-----------|
| DEP-1 | Deploy on Railway as a private instance. The app password is the access control. | The deployed URL asks for the password. |
| DEP-2 | Use a Railway persistent volume for documents. | See DOC-2. |
| DEP-3 | Target desktop browsers. | The app works in current desktop browsers. |
| DEP-4 | Use secure, HttpOnly session cookies over Railway HTTPS. | Cookies carry both flags in production. |
| DEP-5 | The README states that the reset variable must be removed after recovery. | The README has this note. |
| NFR-1 | Documents up to 1 MB stay responsive. | Typing and scrolling stay smooth in a 1 MB document. |

---

## 4. Edge cases and failure behavior

| ID | Situation | Behavior |
|----|-----------|----------|
| EDGE-1 | Another device deleted the open document. | Warn. Offer "save mine as a new document". |
| EDGE-2 | Save fails (offline or server error). | The status label shows an error. Unsaved text stays in the tab. The app retries. The browser warns before the page closes with unsaved changes. |
| EDGE-3 | Content exceeds 1 MB. | Reject the save or paste with a clear error. Existing content stays unchanged. |
| EDGE-4 | The session expires while editing. | Show the sign-in screen. Keep unsaved text. |
| EDGE-5 | Wrong password. | Show a generic error. Rate limit after repeated failures. |
| EDGE-6 | Password change. | Require the current password. Sign out other sessions. |
| EDGE-7 | Reset variable left set. | Every start resets the password again. The README states this. |
| EDGE-8 | No password variable and no stored password. | Refuse to start. Log a clear message. |
| EDGE-9 | Unknown file extension. | Treat as plain text. |

---

## 5. Constraints

- **C1:** Deploy on Railway.
- **C2:** Railway cannot restrict a public domain to chosen IPs with a user-controlled firewall. Private networking links only services in the same project and environment, so a browser cannot use it. Access control therefore lives in the app. Verified 2026-10-09 against Railway docs and help threads:
  - https://docs.railway.com/guides/lock-down-production-project
  - https://station.railway.com/questions/disable-public-networking-and-white-list-156d6b62
- **C3:** Documents need a persistent volume.
- **C4:** Desktop browsers are the target.

---

## 6. Left to the builder

- Language and framework
- Storage engine
- Editor library (CodeMirror 6 is one possible option, not required)
- Environment variable names
- Rate limit values
- Search case sensitivity
- Document list sort order
- Delete confirmation in the document list
- Whether the manual language override is stored with the document

---

## 7. Not requirements

- The source links below are examples only:
  - https://notepad-plus-plus.org/
  - https://github.com/badlogic/jot
  - https://jasperbernaers.com/notepad/
- From Jot, not adopted: Markdown focus, comment threads, real-time collaboration, API keys.
- From the Jasper Bernaers notepad, not adopted: browser-local storage, diff, regex, text transforms, local AI.
- "Notepad++" is inspiration only. Feature or UI parity is not required.

---

## 8. Non-goals

- Multiple users, roles or sharing links
- Live sync or real-time collaboration
- Regex, whole-word search or search across documents
- Diff, multi-cursor, text transforms, macros or plugins
- Markdown preview or comments
- Phone or tablet layout
- Browser-local-only storage or local disk file access
- AI features
- Offline use
- Hidden-URL or IP-based protection

---

## 9. Deferred ideas

- Export, download and backups
- Trash or undo for deleted documents
- Regex and whole-word search
- Search across documents
- Markdown preview
- Diff, multi-cursor and text transforms
- Mobile layout
- Live sync
- Folders or tags
- App name and branding

---

## 10. Proposed build sequence

**This section is a proposal for the planning step. It adds no product decisions.**

| Milestone | Work | Covers | Exit check |
|-----------|------|--------|------------|
| M0 | Repo, app skeleton, Railway service, persistent volume, variable loading, startup refusal without a password | ACC-8, DEP-1, DEP-2, EDGE-8 | The deployed URL responds. The app refuses to start without a password. |
| M1 | Login, session, logout, rate limit, change password, reset variable | ACC-1 to ACC-7, DEP-4, EDGE-4 to EDGE-7 | Auth tests pass. Recovery works on Railway. |
| M2 | Document storage and API with size limit and version tracking for conflicts | DOC-1, DOC-2, DOC-8, EDGE-3 | A document saved, redeployed and reloaded stays intact. |
| M3 | Editor shell: tabs, line numbers, theme, autosave and status label | EDT-1, EDT-2, EDT-6, DOC-3, EDGE-2 | A user can type, pause and see the saved status. |
| M4 | Document list, rename, delete, close prompt, empty-tab rule, tab restore | DOC-4 to DOC-7 | All close paths behave as stated. |
| M5 | Highlighting and language selection | EDT-3, EDT-4, EDGE-9 | All 11 languages highlight. The override works. |
| M6 | Find and replace, shortcuts | EDT-5, EDT-7 | Find, replace and replace all work on the current tab. |
| M7 | Conflict warning and deleted-elsewhere handling | CON-1, EDGE-1 | Two-device test passes for all three choices. |
| M8 | Hardening, README, end-to-end check on Railway | DEP-3, DEP-5, NFR-1 | The definition of done below is met. |

### Definition of done

- Every requirement in section 3 meets its "Done when" check.
- Every edge case in section 4 behaves as stated.
- Nothing in section 8 is built.
- The app runs on Railway behind the password with documents on a persistent volume.

---

## 11. Open questions

None.
