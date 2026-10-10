# Build Plan V3: Workspaces, Status Bar and New-Document Defaults

**Status:** M17 (T28, T29) is Done in PR #6. M18 to M21 (T30 to T39) are Planned. T40 (Notion workspace rules) is Blocked with M15 (C17). No open plan decisions.
**Date:** 2026-10-10
**Inputs:** `REQUIREMENTS_V3.md`, `REQUIREMENTS_V2.md`, `REQUIREMENTS.md`, `BUILD_PLAN.md` (v1 plan, TD-1 to TD-19), `PLAN_REVIEW.md`
**Codebase:** v1 and v2 are built (`BUILD_PLAN.md` section 9, `REQUIREMENTS_V2.md` section 9). Line references in this file are for the head of PR #6.

---

## 0. Execution rules for coding agents

1. Read `AGENTS.md` before any work. Precedence: `REQUIREMENTS_V3.md` > `REQUIREMENTS_V2.md` > `REQUIREMENTS.md` (section 10 of each newer file lists what it changes) > `AGENTS.md` > this plan.
2. Do one task at a time in dependency order (section 3). One task = one commit or one PR.
3. Do not start a task until all its dependencies show **Done** in section 7.
4. Each task ends with `npm test` and `npm run test:e2e` green.
5. Write the failing test first. Prove the failure on an assertion, not on a missing import (`AGENTS.md` Testing rule 1).
6. Each milestone ends with the two-pass review (`PLAN_REVIEW.md` section 1). Log it in `PLAN_REVIEW.md` section 14. Log deviations in `PLAN_REVIEW.md` section 9.
7. Update section 7 when a task is done.
8. Do not build anything in `REQUIREMENTS_V3.md` sections 7 and 8.
9. If a task needs a product decision that this plan does not give, stop and ask the owner.

---

## 1. Summary

| Milestone | Tasks | Covers | Status |
|-----------|-------|--------|--------|
| M17 Status bar and new-document defaults | T28, T29 | STB-1 to STB-3, NEW-1, NEW-2 | Done (PR #6) |
| M18 Workspace data and API | T30, T31 | WS-1, WS-5, WS-6 (server), MIG-1, MIG-3 | Planned |
| M19 Switch and per-workspace tabs | T32, T33, T34 | WS-2 to WS-4, WS-6 (client), WS-7 to WS-9, MIG-2, EDGE-28 to EDGE-30, EDGE-34 | Planned |
| M20 Move between workspaces | T35, T36 | MOV-1 to MOV-3, EDGE-31, EDGE-32 | Planned |
| M21 Workspace colors | T37, T38, T39 | CLR-1 to CLR-6, README | Planned |
| M15 resumed | T40 | NOT-14 to NOT-16, EDGE-33 | Blocked (C17) |

**Critical path:** T30 > T31 > T33 > T34 > T36 > T39.

---

## 2. Technical decisions

Numbering continues from v1 (TD-1 to TD-19). Each "Left to the builder" item of `REQUIREMENTS_V3.md` section 11 has a decision here (section 2.9).

### 2.1 Workspace identity and naming

| ID | Decision | Reason |
|----|----------|--------|
| TD-20 | Workspace ids are `personal` and `work`. Display names are "Personal" and "Work". The server list lives in `server/src/workspaces.js`. The client list lives in `web/src/workspace.js`. | Two fixed values (WS-1, D40). Lowercase ids are safe in URLs, SQL and storage keys. |
| TD-21 | The layout class `.workspace` (`web/index.html:38`, `web/styles.css:176`) becomes `.main-area`. Done first in T32. | C14: one meaning per word. |

### 2.2 Data model (migration 2)

| ID | Decision | Reason |
|----|----------|--------|
| TD-22 | Append migration 2 to `server/src/migrations.js`: `ALTER TABLE documents ADD COLUMN workspace TEXT NOT NULL DEFAULT 'personal' CHECK (workspace IN ('personal', 'work'));` and `CREATE INDEX documents_workspace_updated ON documents(workspace, updated_at);`. `PRAGMA user_version` goes from 1 to 2. | The default puts every existing row in Personal (MIG-1). The CHECK blocks a third workspace (WS-1). Verified on 2026-10-10 with `node:sqlite` (SQLite 3.50.4): the ALTER keeps old rows as `personal` and the CHECK rejects `other`. |

### 2.3 HTTP API

| ID | Decision | Reason |
|----|----------|--------|
| TD-23 | Every `/api/documents` route takes an optional query parameter `workspace`. A missing value means `personal`. An unknown value returns 400 `invalid_workspace`. | One route set. A request in the old form (no parameter) acts on Personal, which holds every document from before the upgrade (MIG-3). A path prefix would need a second, legacy route set. |
| TD-24 | Every repo query that reads or writes a document adds `workspace = ?`. A document of the other workspace gives the same result as a missing one: 404 `not_found` (WS-5). | One rule for list, get, save, rename, language, move and delete. `saveContent` returns `currentVersion: null` for it, which maps to 404, not 412. |
| TD-25 | "Untitled N" counts only names in the target workspace. | WS-6: "Untitled 1" can exist in both workspaces. |
| TD-26 | Move: `PATCH /api/documents/:id?workspace=<from>` with JSON `{ "workspace": "<to>" }`. It keeps name, content, version and `updated_at`. A move to the same workspace returns 200 and changes nothing. An unknown target returns 400 `invalid_workspace`. | MOV-2. Keeping `updated_at` keeps the sort position, as a language change does (section 2.9). |
| TD-27 | `GET /api/settings` returns `{ autosaveSeconds, workspaceColors: { personal, work } }`. Each color is a stored hex string or `null` (default). `PUT /api/settings` takes an optional `workspaceColors` object with both keys. Each value is `null` or matches `^#([0-9a-fA-F]{3}\|[0-9a-fA-F]{6})$`. Else 400 `invalid_color` with `workspace`. A body without `workspaceColors` keeps the stored colors. | CLR-2 to CLR-4. Settings keys `color_personal` and `color_work`. `null` deletes the row. A stored value that breaks the rule reads as `null` (CLR-3), like `autosave_seconds` (`server/src/settings/routes.js:15-17`). |

API changes in `BUILD_PLAN.md` section 2.7 terms:

| Method and path | Change |
|-----------------|--------|
| `GET /api/documents` | `?workspace=` filters the list. |
| `POST /api/documents?name=&language=` | `?workspace=` sets the new document's workspace and its "Untitled N" sequence. `language` is done in PR #6. |
| `GET`, `PUT .../content`, `DELETE /api/documents/:id` | `?workspace=` must match the document, else 404. |
| `PATCH /api/documents/:id` | `?workspace=` must match. The body can also hold `workspace` (move). |
| `GET`, `PUT /api/settings` | Adds `workspaceColors`. |

### 2.4 Client state

| ID | Decision | Reason |
|----|----------|--------|
| TD-28 | The active workspace is a `createStoredChoice` (`web/src/stored-choice.js`) with key `pn.workspace` and values `['personal', 'work']`. | The first value is the default for a first visit, blocked storage and unknown values (WS-4). Same module as the theme. |
| TD-29 | `theme-init.js` sets `data-workspace` on `<html>` and `document.title` ("Personal - Notepad" or "Work - Notepad") before first paint. | WS-3. No flash of the wrong title or tab strip color. |
| TD-30 | `api.js` holds the active workspace (`api.setWorkspace(id)`) and adds `workspace=<id>` to every `/api/documents` path. `listDocuments(workspace?)` takes an override for the switch prefetch. | Callers (`tabs.js`, `doclist.js`, `drop.js`, `conflict.js`) stay unchanged. New, drop and recovery copies go to the active workspace (WS-6). |
| TD-31 | Personal tabs keep the key `pn.openTabs.v1` (`web/src/tabs.js:9`). Work tabs use `pn.openTabs.work.v1`. `readOpenTabs` and `writeOpenTabs` take the key. | MIG-2 needs no data migration: the old key already holds the Personal tabs. |

### 2.5 Switch

| ID | Decision | Reason |
|----|----------|--------|
| TD-32 | One `<button id="workspace-switch">` in the top bar, after the spacer and before the theme button. Its text is the active name. Its `aria-label` is "Workspace: Personal. Switch to Work" (or the reverse). It shows only the active workspace, so the "other color" part of CLR-1 does not apply. | WS-2. A native button works from the keyboard. Its place keeps New as the first Tab stop, which `e2e/layout.spec.js` checks. |
| TD-33 | The switch runs these steps. During the switch the button is disabled. (1) Read the target list with `listDocuments(target)`. Not 200: stay and show "Could not open the Work documents. Try again." (EDGE-30). (2) Flush every tracked document. Repeat while `autosave.hasUnsaved()` and the last round saved, at most 3 rounds. A failed flush: stay. If the cause is a conflict or a delete, the CON-1 or EDGE-1 dialog explains it (EDGE-29). Else show "Unsaved changes could not be saved: <cause>. The workspace did not change." (EDGE-28). (3) In one synchronous step: untrack and drop all tabs without the close prompt, set the workspace (stored choice, `api.setWorkspace`, `data-workspace`, title), then run `tabs.boot({ list })` with the list from step 1. | WS-7, WS-8. Step 3 has no `await`, so no keystroke can land between the last save and the tab close. Modal dialogs block the button, so a switch cannot start while a CON-1 dialog is open. |

### 2.6 Move UI

| ID | Decision | Reason |
|----|----------|--------|
| TD-34 | Each Documents row gets a third action, "Move to Work" or "Move to Personal" (`data-action="move"`, `aria-label` "Move <name> to Work"). Flow: if the document is open, `autosave.flush(id)`. False: show "Not moved: unsaved changes could not be saved." and stop (EDGE-32). Then send the move. Not 200: show "Not moved. Try again." and keep the tab (EDGE-32). 200: close the tab if it is clean, refresh the list and show "Moved <name> to Work.". | MOV-1, MOV-3. A tab that got new text during the request stays open. Its next save gets 404, and the EDGE-1 dialog offers "Save mine as a new document" in the active workspace. No text is lost. |
| TD-35 | A document moved on another device needs no new code. Its id returns 404 in this workspace, so the EDGE-1 paths run: a clean tab closes at the next refresh (`planRefresh`) and a dirty tab gets the deleted dialog at its next save. | EDGE-31. |

### 2.7 Colors

| ID | Decision | Reason |
|----|----------|--------|
| TD-36 | CSS variables on `<html>`: `--ws-strip` and `--ws-strip-fg`. Default: `var(--surface)` and `var(--muted)`, which is today's look (CLR-6). `[data-workspace="work"]` sets the Work preset `#0f766e` with `#ffffff` text. On each switch and each settings read or save, `main.js` sets both variables inline on `<html>` when the active workspace has a stored color (text color from TD-37), and removes them when it has none. | The preset lives only in CSS. Contrast of `#0f766e` (WCAG formula, computed 2026-10-10): white text 5.47:1. Against the default strip: 2.70:1 in dark (`#26282c`) and 5.47:1 in light (`#ffffff`), so the two differ visibly in both themes. |
| TD-37 | `web/src/workspace-color.js` exports `textColorOn(hex)`. It returns `#000000` or `#ffffff`, whichever has the higher contrast ratio with the WCAG 2.x relative luminance formula. | CLR-5, C15. Computed: `#777777` black 4.69:1, `#ffff00` black 19.56:1, `#000080` white 16.01:1. |
| TD-38 | The tab strip background, the inactive tab text, the dirty marker and the close button of inactive tabs use `--ws-strip` and `--ws-strip-fg`. The active tab keeps `var(--bg)` and `var(--fg)`. The switch button uses the active workspace color. | CLR-1. The active tab is not on the workspace color, so it keeps today's contrast. |
| TD-39 | Settings dialog: two text fields after the autosave field, "Personal color (hex, empty for default)" and "Work color (hex, empty for default)". An empty field sends `null`. The server error `invalid_color` shows "Use #RGB or #RRGGBB for the <name> color." | CLR-2, CLR-3, `formDialog` already takes more fields. A color picker is allowed, not required (section 6 of `REQUIREMENTS_V3.md`). It is not built. |

### 2.8 Notion (with M15)

| ID | Decision | Reason |
|----|----------|--------|
| TD-40 | Parent page variables: `NOTION_PARENT_PAGE_PERSONAL` and `NOTION_PARENT_PAGE_WORK`. One token variable for both. Final names are set when M15 starts, because v2 has not named its variables yet. | NOT-14, NOT-15, D51. |

### 2.9 "Left to the builder" decisions

| `REQUIREMENTS_V3.md` section 11 item | Decision |
|--------------------------------------|----------|
| Form and placement of the switch | TD-32 |
| Work preset hex | `#0f766e` (TD-36) |
| How a request names the workspace | Query parameter `workspace`, default `personal` (TD-23) |
| `localStorage` key names | `pn.workspace`, `pn.openTabs.v1` (Personal), `pn.openTabs.work.v1` (Work) (TD-28, TD-31) |
| Whether a move changes the last-modified date | No (TD-26) |
| Notion variable names and Settings API shape | TD-40 and TD-27 |

---

## 3. Order and parallel work

| Layer | Tasks | Notes |
|-------|-------|-------|
| L0 | T28, T29 | Done in PR #6 |
| L1 | T30, T32, T37 | No dependencies on each other |
| L2 | T31 | Needs T30 |
| L3 | T33, T35 | T33 needs T31 and T32. T35 needs T31. |
| L4 | T34 | Needs T33 |
| L5 | T36, T38 | T36 needs T34 and T35. T38 needs T34 and T37. |
| L6 | T39 | Needs T36 and T38 |
| Blocked | T40 | Needs M15 and T35 |

---

## 4. Task definitions

### Phase M17: Status bar and new-document defaults (Done)

#### T28 Status bar layout (S, Done)
- **Requirements:** STB-1 to STB-3, D53, D55.
- **Implementation:** `web/index.html` status bar order: save status, selection counts, counts, Count syntax, language list, spacer, status message. `web/styles.css`: `--outline-width` on `.app`, used by `.outline-panel` and by the save status `min-width` while the outline is open. `.statusbar` wraps (`flex-wrap: wrap`).
- **Acceptance criteria:** The STB rows of `REQUIREMENTS_V3.md` section 3.6.
- **Validation:** `e2e/layout.spec.js` (pane edge, outline closed, 480 px window). `e2e/export-drop.spec.js` (message after the language list). Each check failed on the old code.

#### T29 New-document defaults and recovery copies (S, Done)
- **Requirements:** NEW-1, NEW-2, D54, D56.
- **Implementation:** `POST /api/documents` takes an optional `language` (400 `invalid_language`). `tabs.newDocument` sends `markdown`. `conflict.js`: the conflict copy sends `tabs.languageOf(id)`, the deleted-elsewhere copy sends `tab.language`. README and `BUILD_PLAN.md` sections 2.6 and 2.7 updated.
- **Acceptance criteria:** The NEW rows of `REQUIREMENTS_V3.md` section 3.6.
- **Validation:** `server/test/documents.test.js` (language stored, unknown and repeated values rejected). `e2e/language.spec.js`, `e2e/conflict.spec.js`.

### Phase M18: Workspace data and API

#### T30 Migration 2: workspace column (S)
- **Objective:** Every document has a workspace. Old documents are in Personal.
- **Requirements:** MIG-1, WS-1 (database part).
- **Implementation:** Append migration 2 (TD-22). Do not edit migration 1 (C9).
- **Dependencies:** None.
- **Acceptance criteria:** A database at `user_version` 1 with documents upgrades to 2. Every old row reads `personal`. An `UPDATE` to another value fails on the CHECK. A fresh database reaches 2.
- **Validation:** `server/test/db.test.js`: build a version 1 database with `migrate(db, migrations.slice(0, 1))`, add rows, run all migrations, assert the rows and the CHECK.

#### T31 Workspace-scoped document API (M)
- **Objective:** The server keeps the two workspaces apart.
- **Requirements:** WS-1, WS-5, WS-6 (server), MIG-3.
- **Implementation:**
  - `server/src/workspaces.js`: `WORKSPACES`, `parseWorkspace(query)` (missing gives `personal`, unknown gives null).
  - `server/src/documents/routes.js`: parse `workspace` first on each route. Null: 400 `invalid_workspace`.
  - `server/src/documents/repo.js`: every function takes `workspace` (TD-24). `nextUntitledName` filters by workspace (TD-25). `toMeta` does not return `workspace`.
- **Dependencies:** T30.
- **Acceptance criteria:** A Work document id in a Personal request returns 404 for GET, PUT content, PATCH and DELETE. The Personal list holds no Work document. "Untitled 1" exists in both workspaces. A PUT without `workspace` saves a Personal document. `?workspace=team` returns 400. No route creates, renames or deletes a workspace.
- **Validation:** `server/test/documents-workspace.test.js` for each criterion. The existing document tests pass unchanged (they send no `workspace`, so they test MIG-3 too).

### Phase M19: Switch and per-workspace tabs

#### T32 Workspace state, title and class rename (S)
- **Objective:** The page knows its workspace before first paint.
- **Requirements:** WS-3, WS-4, C14.
- **Implementation:** Rename `.workspace` to `.main-area` (TD-21). `web/src/workspace.js`: the stored choice (TD-28), `WORKSPACE_NAMES`, `titleFor(id)`. `theme-init.js` sets `data-workspace` and the title (TD-29).
- **Dependencies:** None.
- **Acceptance criteria:** A first visit and an unknown stored value give Personal and "Personal - Notepad". A stored `work` gives "Work - Notepad" at first paint. No `.workspace` class is left.
- **Validation:** `web/test/workspace.test.js` (stored value, blocked storage, title). Extend `web/test/build-web.test.js` for the `theme-init.js` bundle. Grep for `.workspace` in `web/`.

#### T33 Workspace-scoped client calls and per-workspace tabs (M)
- **Objective:** All client calls and stored tabs follow the active workspace.
- **Requirements:** WS-6 (client), WS-7 (storage), MIG-2.
- **Implementation:** `api.js` per TD-30. `tabs.js` per TD-31: the storage key comes from the active workspace. `main.js` calls `api.setWorkspace` at start, before `tabs.boot`.
- **Dependencies:** T31, T32.
- **Acceptance criteria:** With `pn.workspace = work`, New, a drop and both recovery copies create Work documents. The drop name clash check uses the Work list. Tabs stored under `pn.openTabs.v1` before the upgrade restore as the Personal tabs.
- **Validation:** `web/test/tabs.test.js` (key per workspace). `e2e/workspaces.spec.js`: drop `notes.md` in Work while Personal has `notes.md` gives `notes.md`. MIG-2 test: write `pn.openTabs.v1` with no `pn.workspace`, reload, same tabs and active tab.

#### T34 Switch control and switch safety (M)
- **Objective:** The owner switches workspaces without losing text.
- **Requirements:** WS-2, WS-7, WS-8, WS-9, EDGE-28 to EDGE-30, EDGE-34.
- **Implementation:** The button (TD-32) and the switch steps (TD-33) in `web/src/workspace-switch.js`, with `api`, `autosave`, `tabs` and the stored choice as injected dependencies. `tabs.js` gets `closeAllSaved()` and `boot({ list })`.
- **Dependencies:** T33.
- **Acceptance criteria:** Switching away and back restores the same tabs and active tab. Text typed 1 second before a switch is on the server after it. A failed save keeps the workspace and shows the message. A failed list read keeps the workspace. A keyboard-only run switches the workspace. A theme change in Work shows in Personal. Two browser contexts in different workspaces work independently.
- **Validation:** `web/test/workspace-switch.test.js` with fakes: each EDGE path, the 3-round limit, no await in step 3 (a fake flush that marks a document dirty again causes another round). `e2e/workspaces.spec.js`: round trip, save before switch, offline save (route abort), keyboard run, shared theme, two contexts. Extend the NFR-5 keyboard test in `e2e/layout.spec.js` with the switch.

### Phase M20: Move between workspaces

#### T35 Move route (S)
- **Objective:** The server moves a document to the other workspace.
- **Requirements:** MOV-2, WS-5 for moves.
- **Implementation:** `PATCH` body field `workspace` (TD-26). Validate with `parseWorkspace`. `repo.updateMeta` sets it in the same transaction as a rename or language change.
- **Dependencies:** T31.
- **Acceptance criteria:** A moved document has identical bytes, the same version and the same `updated_at`. It leaves the source list and shows in the target list. A name used in the target stays unchanged. A move sent with the wrong source workspace returns 404.
- **Validation:** `server/test/documents-workspace.test.js`.

#### T36 Move action in the Documents dropdown (M)
- **Objective:** The owner moves a document from the list.
- **Requirements:** MOV-1, MOV-3, EDGE-31, EDGE-32.
- **Implementation:** TD-34 in `web/src/doclist.js`. Arrow-key order includes the new button (LAY-4).
- **Dependencies:** T34, T35.
- **Acceptance criteria:** The moved document leaves this list and shows in the other one. An edit typed 1 second before the move is in the moved document. A failed save or a failed move keeps the tab and moves nothing. A clean tab of a document moved on another device closes at the next refresh. A dirty one gets the EDGE-1 dialog.
- **Validation:** `e2e/workspaces.spec.js` (move, move with unsaved text, failed move by route abort, moved on a second context). Extend the LAY-4 arrow-key test in `e2e/layout.spec.js` so it reaches the Move button.

### Phase M21: Workspace colors

#### T37 Color settings API (S)
- **Objective:** The server stores one color per workspace.
- **Requirements:** CLR-2 (server), CLR-3, CLR-4.
- **Implementation:** TD-27 in `server/src/settings/routes.js`.
- **Dependencies:** None.
- **Acceptance criteria:** `#AbC` and `#0f766e` are accepted. `#12`, `red`, `#GGGGGG` and `123456` return 400 `invalid_color`. `null` returns the default. A corrupt stored value reads as `null`. A PUT without `workspaceColors` keeps the colors.
- **Validation:** `server/test/settings.test.js`.

#### T38 Colors in the UI (M)
- **Objective:** Each workspace shows its color.
- **Requirements:** CLR-1, CLR-2 (dialog), CLR-5, CLR-6.
- **Implementation:** TD-36 to TD-39. `main.js` applies the colors after each settings read and save.
- **Dependencies:** T34, T37.
- **Acceptance criteria:** Each switch changes the tab strip color. A fresh install shows two different strip colors in each theme. Personal with no color looks as today. `#777777`, `#ffff00` and `#000080` each give text at 4.5:1 or more. Clearing a field restores the default. A color set in context A shows in context B after a reload.
- **Validation:** `web/test/workspace-color.test.js` (the three CLR-5 colors, `#RGB` input). `e2e/workspaces.spec.js` (computed `background-color` of `#tabstrip` per workspace and theme, Settings round trip, second context). Screenshots of both workspaces in both themes for the owner.

#### T39 README and docs (S)
- **Objective:** The owner can read how workspaces work.
- **Requirements:** `REQUIREMENTS_V3.md` section 10, README row.
- **Implementation:** README: workspaces, the switch, Move, colors and the Notion variables (marked "with Notion sync"). Set `REQUIREMENTS_V3.md` section 9 statuses.
- **Dependencies:** T36, T38.
- **Acceptance criteria:** README describes each owner-visible change. No doc names `.workspace` as a layout class.
- **Validation:** Read-through. Grep.

### Phase M15 resumed: Notion with workspace rules (Blocked)

#### T40 Notion workspace rules (S after M15)
- **Objective:** Notion sync follows the workspace of each document.
- **Requirements:** NOT-14 to NOT-16, EDGE-33.
- **Implementation:** Built inside M15. The parent page comes from the document's workspace (TD-40). A workspace without its variable disables the sync control and names the variable. A move queues the archive job and, if the target has a parent page, a create job, else sync off.
- **Dependencies:** M15 (C10 test call, C17), T35.
- **Acceptance criteria:** The NOT-14 to NOT-16 and EDGE-33 rows.
- **Validation:** Server tests with a fake Notion client. One owner check against real Notion.

---

## 5. Testing approach

- **Unit (`node:test`):** pure modules (`workspaces.js`, `workspace.js`, `workspace-color.js`, `workspace-switch.js` with fakes) and server routes through `app.inject`.
- **E2E (Playwright, Chromium):** new `e2e/workspaces.spec.js` for the M19 to M21 flows. The fixtures stay unchanged: their API calls send no `workspace`, so they keep using Personal (MIG-3).
- **Firefox and WebKit:** mark the switch round trip `@smoke`. The owner runs it where those browsers are installed.
- **Upgrade check:** before M18 ships, copy a production-like database (`user_version` 1), start the new build on it and compare the Personal list with the old list (MIG-1).

---

## 6. Risks and assumptions

Numbering continues from v1 (R1 to R8).

| ID | Risk or assumption | Mitigation |
|----|--------------------|------------|
| R9 | A custom Work color loads after first paint, so the CSS preset shows for a moment. | Accept. If the owner reports it, cache the colors per browser. Not built now (fewest parts). |
| R10 | A switch waits for every save. On a slow network it can take seconds. | The button is disabled during the switch. The save status shows "Saving...". |
| R11 | Text typed during a move request reaches a 404 and opens the EDGE-1 dialog. | Accepted: no text is lost (TD-34). The e2e test covers it. |
| R12 | The migration runs at app start on Railway (v1 TD-17). A failure stops the start. | It runs in one transaction (`migrate` in `server/src/db.js`). Upgrade check in section 5. |
| R13 | This container runs Node 22. Production runs Node 24. | Run the suites on Node 24 before release, as in v2 (`PLAN_REVIEW.md` section 13). PR #6 ran on Node 22: `npm test` 355 pass, Chromium e2e 137 pass. |

---

## 7. Progress tracker

| ID | Title | Milestone | Size | Depends on | Status | PR or commit | Notes |
|----|-------|-----------|------|------------|--------|--------------|-------|
| T28 | Status bar layout | M17 | S | none | Done | PR #6 (aa926e0, 10eac16) | Narrow-window wrap from the Codex review. |
| T29 | New-document defaults and recovery copies | M17 | S | none | Done | PR #6 (aa926e0, 70239d0, 10eac16) | Recovery copy fixes from the Codex review. |
| T30 | Migration 2: workspace column | M18 | S | none | Planned | | |
| T31 | Workspace-scoped document API | M18 | M | T30 | Planned | | |
| T32 | Workspace state, title and class rename | M19 | S | none | Planned | | |
| T33 | Workspace-scoped client calls and tabs | M19 | M | T31, T32 | Planned | | |
| T34 | Switch control and switch safety | M19 | M | T33 | Planned | | |
| T35 | Move route | M20 | S | T31 | Planned | | |
| T36 | Move action in the Documents dropdown | M20 | M | T34, T35 | Planned | | |
| T37 | Color settings API | M21 | S | none | Planned | | |
| T38 | Colors in the UI | M21 | M | T34, T37 | Planned | | |
| T39 | README and docs | M21 | S | T36, T38 | Planned | | |
| T40 | Notion workspace rules | M15 | S | M15, T35 | Blocked | | C17 |

---

## 8. Requirements traceability

| Requirement | Tasks | Validation |
|-------------|-------|------------|
| STB-1 to STB-3 | T28 | `e2e/layout.spec.js`, `e2e/export-drop.spec.js` |
| NEW-1, NEW-2 | T29 | `server/test/documents.test.js`, `e2e/language.spec.js`, `e2e/conflict.spec.js` |
| WS-1 | T30, T31 | `db.test.js`, `documents-workspace.test.js` |
| WS-2 | T34 | `e2e/workspaces.spec.js`, `e2e/layout.spec.js` (keyboard run) |
| WS-3, WS-4 | T32 | `web/test/workspace.test.js`, `build-web.test.js` |
| WS-5 | T31 | `documents-workspace.test.js` |
| WS-6 | T31, T33 | `documents-workspace.test.js`, `e2e/workspaces.spec.js` |
| WS-7 | T33, T34 | `tabs.test.js`, `e2e/workspaces.spec.js` |
| WS-8, WS-9 | T34 | `workspace-switch.test.js`, `e2e/workspaces.spec.js` |
| MOV-1 to MOV-3 | T35, T36 | `documents-workspace.test.js`, `e2e/workspaces.spec.js` |
| CLR-1, CLR-5, CLR-6 | T38 | `workspace-color.test.js`, `e2e/workspaces.spec.js` |
| CLR-2 to CLR-4 | T37, T38 | `settings.test.js`, `e2e/workspaces.spec.js` |
| MIG-1 | T30 | `db.test.js`, upgrade check (section 5) |
| MIG-2 | T33 | `e2e/workspaces.spec.js` |
| MIG-3 | T31 | `documents-workspace.test.js`, existing document tests |
| NOT-14 to NOT-16 | T40 | Blocked |
| EDGE-28 to EDGE-30, EDGE-34 | T34 | `workspace-switch.test.js`, `e2e/workspaces.spec.js` |
| EDGE-31, EDGE-32 | T36 | `e2e/workspaces.spec.js` |
| EDGE-33 | T40 | Blocked |

Every requirement and edge case in `REQUIREMENTS_V3.md` sections 3 and 4 has a task.

---

## 9. Definition of done

- Every row in section 8, except T40 while M15 is blocked, meets its "Done when" check in `REQUIREMENTS_V3.md`.
- Nothing in `REQUIREMENTS_V3.md` sections 7 and 8 is built.
- The v1 and v2 tests still pass, with changes only where `REQUIREMENTS_V3.md` section 10 names them.
- Each milestone review is logged in `PLAN_REVIEW.md` section 14.
