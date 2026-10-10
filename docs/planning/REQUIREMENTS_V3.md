# NPPweb v3 Workspaces: Requirements

**Status:** Decision-complete. Open questions: none. M17 (status bar and new-document defaults, section 3.6) is built in PR #6. The workspace milestones (M18 to M21) are not built.
**Date:** 2026-10-10
**Purpose:** Single source of truth for v3. The build plan is `docs/planning/BUILD_PLAN_V3.md`. This file does not include an implementation.
**Location:** `docs/planning/REQUIREMENTS_V3.md`
**Builds on:** `docs/planning/REQUIREMENTS.md` (v1) and `docs/planning/REQUIREMENTS_V2.md` (v2). Their requirements stay in force unless section 10 says otherwise.

---

## 1. Summary

- **Problem:** All notes share one Documents list, one tab set and one "Untitled N" sequence. Work notes and personal notes mix.
- **User:** The one owner of the private NPPweb instance (ACC-1).
- **Outcome:** Two fixed workspaces, Personal and Work. A top-bar switch toggles them. Each workspace shows only its own documents and tabs and has its own color. Personal keeps today's documents, tabs and look.
- **Also in this version (built first, PR #6):** The counts and the language list move to the left edge of the editor pane in the status bar. New documents start as Markdown. Section 3.6 has the requirements.
- **Out of this version:** The Claude integration from the original request. It is deferred in full (section 8).

### 1.1 Current behavior (verified)

- One owner, one password and one SQLite file `notepad.db` (`server/src/db.js:14`).
- The `documents` table has no grouping column (`server/src/migrations.js:17-25`).
- Open tabs, theme, Visual/Raw mode, outline panel and count mode are stored per browser in `localStorage` (`web/src/tabs.js:9`, `web/src/stored-choice.js:1-4`).
- The autosave delay is one server-wide setting (`server/src/settings/routes.js:1-4`).
- "Folders or tags" is a v1 deferred idea (`docs/planning/REQUIREMENTS.md:176`). "AI features" is a non-goal in v1 and v2 (`docs/planning/REQUIREMENTS.md:160`, `docs/planning/REQUIREMENTS_V2.md:269`).

---

## 2. Decision log

Numbering continues from v2 (D14 to D38). D39 to D52 are owner decisions for workspaces. D53 and D54 are owner decisions from PR #6. D55 and D56 are builder decisions from the PR #6 review. The owner can reverse D55 and D56.

| # | Topic | Decision | Rejected |
|---|-------|----------|----------|
| D39 | Separation | One database. Each document belongs to exactly one workspace. The app never mixes them. | Separate database files, separate app instances |
| D40 | Count | Exactly two workspaces with fixed names: Personal and Work. | Renamable, any number |
| D41 | Access | One password and one session open both workspaces. | Separate unlock for Work |
| D42 | Start workspace | Last used workspace, stored per browser. | Always Personal, stored on the server |
| D43 | Move | Yes, from the Documents dropdown. | No move |
| D44 | Migration | All existing documents go to Personal. | One-time sort screen |
| D45 | Cue | Name on the switch and in the window title, plus one color per workspace. | Name only |
| D46 | Color storage | On the server. Same colors on every device. | Per browser |
| D47 | Color and themes | One hex color per workspace for dark and light. Text switches to black or white automatically. | Separate dark and light colors |
| D48 | Default colors | Personal keeps today's look. Work starts with a preset color. | Both keep today's look |
| D49 | Color setting place | Account > Settings. | Menu on the switch |
| D50 | Proposed workspace defaults | Accepted in full. They are WS-6 to WS-9, MOV-2, MOV-3, CLR-3 and EDGE-31. | None |
| D51 | Notion | One token for both workspaces. One parent page per workspace. A move of a synced document archives its page and recreates it. | Personal only, one shared parent, token per workspace, block the move |
| D52 | Claude integration | Deferred in full. | None |
| D53 | Status bar layout | The counts, the Count syntax button and the language list start at the left edge of the editor pane, in the same status bar. | Keep them at the right end |
| D54 | New document type | New stores Markdown as the document's language. The language list shows "Markdown". A later rename keeps Markdown until the owner changes the list. | A name without an extension resolves to Markdown, with the list on "Auto (detected)" |
| D55 | Status messages | Short status messages move to the right end of the status bar. Next to the save status, a long message pushed the counts to the right for 5 seconds. | Keep them next to the save status |
| D56 | Recovery copies | "Save mine as a new document" keeps the language in use. The conflict copy stores the resolved language, because the " (conflict copy)" suffix hides the name extension. The deleted-elsewhere copy keeps the same name and the stored override. | Copy without a language (auto) |

---

## 3. Requirements

"Active workspace" means the workspace that the switch shows in this browser tab.

### 3.1 Workspaces

| ID | Requirement | Done when |
|----|-------------|-----------|
| WS-1 | There are exactly two workspaces: Personal and Work. No UI or API path creates, renames or deletes a workspace. | No route or control changes the set of workspaces. |
| WS-2 | One switch in the top bar toggles the active workspace. It shows the active workspace name. It has an accessible name and works from the keyboard. This extends NFR-5. | A keyboard-only run switches the workspace. |
| WS-3 | The window title starts with the active workspace name: "Personal - Notepad" or "Work - Notepad". Today the title is "Notepad" (`web/index.html:6`). | The title changes on each switch, also in the installed app window. |
| WS-4 | Each browser stores its active workspace, like the theme (EDT-6). A first visit opens Personal. Blocked storage or an unknown stored value also opens Personal. | After a reload, each device opens its own last workspace. |
| WS-5 | The server lists, reads, saves, renames and deletes only the documents of the requested workspace. A request for a document of the other workspace gets "not found". | An API test that sends a Work document ID in a Personal request gets 404. The Personal list holds no Work document. |
| WS-6 | The Documents list, "Untitled N" numbering and the drop name-clash check (DRP-2) are per workspace. New documents, dropped files and "Save mine as a new document" (CON-1, EDGE-1) go to the active workspace. | "Untitled 1" can exist in both workspaces. Dropping `notes.md` in Work while only Personal has `notes.md` gives `notes.md`, not `notes (2).md`. |
| WS-7 | Each workspace has its own open tabs and active tab, stored per browser. This extends DOC-7. A switch closes the current workspace's tabs and restores the other workspace's tabs. | Switching away and back restores the same tabs and the same active tab. |
| WS-8 | Before a switch, all unsaved tabs save. The switch completes only after every save succeeds and no conflict dialog is open. No text is lost. | Text typed 1 second before a switch is on the server after the switch. |
| WS-9 | Both workspaces share: the password, sessions, theme, Visual/Raw mode, outline panel state, count mode and autosave delay. | A theme change made in Work also shows in Personal. |

### 3.2 Move between workspaces

| ID | Requirement | Done when |
|----|-------------|-----------|
| MOV-1 | Each row of the Documents dropdown has "Move to Work" (in Personal) or "Move to Personal" (in Work). The action works from the keyboard (LAY-4). | The moved document leaves this list and shows in the other workspace's list. |
| MOV-2 | A move keeps the name, content and version. A name that is already used in the target workspace stays unchanged, because names are not unique today. | The moved document has identical bytes and the same version. |
| MOV-3 | If the document is open in a tab, its unsaved edits save first. Then its tab closes. | An edit typed 1 second before the move is in the moved document. |

### 3.3 Workspace colors

| ID | Requirement | Done when |
|----|-------------|-----------|
| CLR-1 | The active workspace color fills the background of the tab strip (`web/index.html:44`). The switch shows the active workspace in its color. If the switch also shows the other workspace, that part uses the other color. | Each switch changes the tab strip color. |
| CLR-2 | Account > Settings has one hex color field per workspace, next to the autosave delay. An empty field returns that workspace to its default color. | Clearing a field and saving restores the default. |
| CLR-3 | A field accepts `#RGB` or `#RRGGBB` in any letter case. Other input is rejected with a message, as in SAV-3. A stored value that breaks this rule reads as the default, as the autosave setting does (`server/src/settings/routes.js:15-17`). | `#12`, `red`, `#GGGGGG` and `123456` are rejected. `#AbC` is accepted. |
| CLR-4 | The server stores the colors. Other devices show a change after their next page load, as in SAV-2 and SAV-4. | A color set on device A shows on device B after a reload. |
| CLR-5 | One color applies in the dark theme and the light theme. Text on a workspace color is black or white, whichever gives the higher contrast. The contrast ratio is at least 4.5:1 for every color (C15). | `#777777`, `#ffff00` and `#000080` each show text at 4.5:1 or more. |
| CLR-6 | Personal with no color set keeps today's theme-based tab strip look. Work starts with a preset color that differs visibly from the Personal default in both themes. | A fresh install shows two different tab strip colors in each theme. |

### 3.4 Migration and compatibility

| ID | Requirement | Done when |
|----|-------------|-----------|
| MIG-1 | The upgrade puts every existing document in Personal. Work starts empty. The migration is a new appended migration (C9). | After the upgrade, the Personal list equals the list before the upgrade. |
| MIG-2 | Open tabs stored before the upgrade (key `pn.openTabs.v1`, `web/src/tabs.js:9`) restore as the Personal tabs. | The first load after the upgrade shows the same tabs and active tab. |
| MIG-3 | A page loaded before the upgrade keeps saving its open tabs after the upgrade. This is derived from the README promise: "Unsaved text stays in the browser and saves when the server is back." | A save request in the old form, without a workspace, saves the Personal document. |

### 3.5 Notion sync (M15, still blocked)

These rules change the v2 Notion requirements. They apply when M15 is built.

| ID | Requirement | Done when |
|----|-------------|-----------|
| NOT-14 | One Notion token serves both workspaces. Each workspace has its own parent page variable. In NOT-3, NOT-5 and NOT-11, "the parent page" means the parent page of the document's workspace. | Personal pages and Work pages are under different parent pages. |
| NOT-15 | A workspace without its parent page variable cannot sync. Its sync control is disabled and names the missing variable. This extends NOT-12. | With only the Personal variable set, a Work document shows the disabled control and the note. |
| NOT-16 | A move of a synced document sends its Notion page to Notion trash (the NOT-6 archive job). If the target workspace has a parent page, a new page is created under it with the current title and saved content. Else sync turns off for that document. | After a move, no page of that document stays under the old parent outside Notion trash. |

### 3.6 Status bar and new-document defaults (M17, built in PR #6)

These rules apply in both workspaces.

| ID | Requirement | Done when |
|----|-------------|-----------|
| STB-1 | The word and character counts (CNT-1, CNT-3), the Count syntax button (CNT-2) and the language list (EDT-4) sit in the status bar and start at the left edge of the editor pane. With the outline open, they start 8 px inside the pane. With the outline closed, they follow the save status. | `e2e/layout.spec.js`: the counts start within 16 px of the pane edge. With the outline closed, they follow the save status. |
| STB-2 | Short status messages (for example a rejected drop) show at the right end of the status bar (D55). | A drop message shows to the right of the language list. |
| STB-3 | In a narrow window the status bar wraps to a second row. No status-bar control leaves the window. | `e2e/layout.spec.js`: at 480 px with the outline open, Count syntax and the language list end at or before 480 px. |
| NEW-1 | New (top-bar button, empty-state button and shortcut) creates "Untitled N" with the stored language Markdown. The language list shows "Markdown". A dropped file keeps "Auto (detected)", so its extension decides (DRP-6). | `e2e/language.spec.js`: New opens a Markdown tab. A named `.txt` document stays Auto and plain. |
| NEW-2 | "Save mine as a new document" keeps the language in use (D56). The conflict copy stores the resolved language of its tab. The deleted-elsewhere copy keeps the stored override. | `e2e/conflict.spec.js`: both copies of an "Untitled N" document are Markdown. A conflict copy of `notes.py` is Python. |

---

## 4. Edge cases and failure behavior

Numbering continues from v2 (EDGE-10 to EDGE-27).

| ID | Situation | Behavior |
|----|-----------|----------|
| EDGE-28 | A save before a switch fails (offline, server error or expired session). | Stay in the current workspace. Show a message that names the cause: unsaved changes could not be saved. Retries continue as in EDGE-2. For an expired session, EDGE-4 applies. |
| EDGE-29 | A conflict dialog is open, or a conflict appears during the save before a switch. | Stay in the current workspace. The owner resolves the conflict (CON-1), then switches again. |
| EDGE-30 | The other workspace's documents cannot load during a switch. | Stay in the current workspace. Show a message. All text is already saved (WS-8). |
| EDGE-31 | Another device moved a document that is open here. | Same as EDGE-1. A clean tab closes at the next refresh. A dirty tab warns at its next save and offers "Save mine as a new document" in the active workspace. |
| EDGE-32 | A move fails: the save before it fails, or the server returns an error. | Nothing moves. The tab stays open. Show a message. |
| EDGE-33 | A synced document moves to a workspace without a Notion parent page. | The archive job still runs, retries and survives a restart (NOT-10, EDGE-21, EDGE-22). Sync is off for the document in the target workspace. |
| EDGE-34 | Device A is in Personal and device B is in Work at the same time. | They work independently. Shared settings follow SAV-4 and CLR-4. |

---

## 5. Constraints

- **C13:** One SQLite file holds all data (`server/src/db.js:14`). Migrations are append-only (C9, `server/src/migrations.js:2`).
- **C14:** The CSS class `.workspace` already names the main layout area (`web/index.html:38`, `web/styles.css:176`). New code must not mix the two meanings. The builder can rename the CSS class.
- **C15:** CLR-5 is always reachable. With the WCAG 2.x relative luminance formula, black or white text on any sRGB color reaches at least 4.58:1. Confidence: high (computed from the formula). Source: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
- **C16:** C5 from v2 still applies: vanilla JavaScript, CodeMirror 6, esbuild, Fastify 5, `node:sqlite` and Node.js 24.
- **C17:** M15 is still blocked. Network access to `api.notion.com` and a Notion token are missing (`docs/planning/REQUIREMENTS_V2.md:298`). NOT-14 to NOT-16 wait for M15.

---

## 6. Preferences, examples and readings (not requirements)

- **"Toggle":** one possible control. Any switch works (for example a segmented control or a single button) if WS-2 and CLR-1 hold.
- **"Hex code":** hex entry is required (CLR-2, CLR-3). A color picker next to the field is allowed, not required.
- **"Background of the tab bar where all docs are shown":** read as the strip of open document tabs (`#tabstrip`), not the Documents dropdown.
- **"Looks exactly the same as now":** read as the same documents, tabs and colors in Personal. The switch and the "Personal - " title prefix are additions the owner chose (D45).
- **Work preset color:** the builder picks the exact hex within CLR-6.

---

## 7. Non-goals

- **Workspace set:** a third workspace, renaming workspaces, a password per workspace and a database file per workspace.
- **Workspace as a unit:** export, backup or delete of a whole workspace.
- **Per-workspace settings:** theme, Visual/Raw mode, autosave delay and a keyboard shortcut for the switch.
- **Search:** search across documents or across workspaces in the app UI. Find stays on the current tab (EDT-5).
- **Carried over from v1 and v2:** multiple users, live sync, phone or tablet layout, offline use and AI features.

---

## 8. Deferred ideas

### 8.1 Claude integration (D52)

Discovery stopped before a decision. Use this section as the start point when the owner resumes it. Nothing in it is a requirement.

- **Picked so far:**
  - Direction: Claude reads the notes through a custom connector (remote MCP server). An in-app Claude panel and a "send to Claude" button were not picked.
  - Scope: a Claude access switch per workspace.
  - Rights: read and create. No edit, rename, move or delete.
  - Apps: claude.ai, Claude Desktop and Claude Code.
  - Finding notes: list plus text search, for Claude only.
- **Not decided:**
  - Sign-in method: an OAuth authorization server in NPPweb (the owner enters the password once and approves) or a static access token.
  - Eight proposed defaults: both switches start off. A workspace with access off is invisible to Claude. Four tools (list, search, read, create). Created notes follow the name rule, the 1 MB limit and DRP-2 suffixes. Settings lists connected Claude apps with a Revoke button. A password change revokes all Claude access. A move into a workspace with access off hides the note at once. The Notion rule became D51.
- **Facts verified on 2026-10-10:**
  - claude.ai and Claude Desktop custom connectors sign in by OAuth. Password or cookie login is not a supported type. Requirements include a 401 with `WWW-Authenticate: Bearer resource_metadata=...`, RFC 9728 metadata, PKCE with S256 and the redirect `https://claude.ai/api/mcp/auth_callback`. Source: https://claude.com/docs/connectors/building/authentication
  - A static key works in claude.ai only through a beta "Request headers" option for limited organizations. Availability for individual accounts is unverified. Source: https://claude.com/docs/connectors/custom/add-unlisted
  - The Free plan allows one custom connector. Source: https://support.claude.com/en/articles/11175166-about-custom-connectors-using-remote-mcp
  - Claude Code adds a remote server with `claude mcp add --transport http` and accepts a static `--header "Authorization: Bearer ..."` or OAuth. SSE is deprecated. Source: https://code.claude.com/docs/en/mcp
  - Anthropic's outbound traffic to connectors comes from `160.79.104.0/21`. Source: https://platform.claude.com/docs/en/api/ip-addresses
  - "No sign-in" gives every holder of the URL access to the notes. It is excluded.
- **Conflict to resolve on resume:** "AI features" is a non-goal in v1 and v2.

### 8.2 Other deferred ideas

- More workspaces or renamable workspaces
- A Notion token per workspace (for example an employer's Notion for Work)
- Export, backup or delete of a whole workspace
- A keyboard shortcut for the switch
- Folders or tags (v1 deferred idea, still deferred)

---

## 9. Build sequence and status

The task-level plan is `docs/planning/BUILD_PLAN_V3.md` (tasks T28 to T40). Each phase follows the two-pass review in `docs/planning/PLAN_REVIEW.md` section 1, as in v2. V3 reviews go to `PLAN_REVIEW.md` section 14. M17 was added for the PR #6 work, so the workspace milestones of the first draft (M17 to M20) are now M18 to M21.

| Milestone | Work | Covers | Status |
|-----------|------|--------|--------|
| M17 | Status bar layout and new-document defaults | STB-1 to STB-3, NEW-1, NEW-2 | Done in PR #6 |
| M18 | Schema migration, workspace-scoped API, old-request compatibility | WS-1, WS-5, WS-6 (server part), MIG-1, MIG-3 | Planned |
| M19 | Switch, per-workspace tabs, title, start workspace, switch safety | WS-2 to WS-4, WS-6 (client part), WS-7 to WS-9, MIG-2, EDGE-28 to EDGE-30, EDGE-34 | Planned |
| M20 | Move between workspaces | MOV-1 to MOV-3, EDGE-31, EDGE-32 | Planned |
| M21 | Workspace colors in Settings | CLR-1 to CLR-6 | Planned |
| M15 (resumed) | Notion with the workspace rules | NOT-14 to NOT-16, EDGE-33 | Blocked (C17) |

### Definition of done

- Every requirement in section 3, except section 3.5 while M15 is blocked, meets its "Done when" check.
- Every edge case in section 4, except EDGE-33 while M15 is blocked, behaves as stated.
- Nothing in section 7 or section 8 is built.
- The v1 and v2 tests still pass, with changes only where section 10 names them.

---

## 10. Changes to v1 and v2

| Item | Change |
|------|--------|
| v1 DOC-4, Documents list | The list shows the active workspace only (WS-6). It gains the Move action (MOV-1). |
| v1 DOC-7, open tabs per browser | Open tabs are per workspace and per browser (WS-7). |
| v1 EDGE-1, deleted elsewhere | Also covers a document moved elsewhere (EDGE-31). |
| v1 EDT-4, language from the name extension | New documents store Markdown as an override (NEW-1). Recovery copies keep the language in use (NEW-2). Dropped files and unknown extensions are unchanged (EDGE-9). |
| v1 `BUILD_PLAN.md` section 2.7, `POST /api/documents` | Takes an optional `language` (400 `invalid_language` for an unknown value). Done in PR #6. |
| v1 deferred idea "Folders or tags" | Still deferred. Two fixed workspaces are not folders or tags. |
| v2 SAV-3, Settings dialog | Also holds the two color fields (CLR-2). |
| v2 DRP-2, name clash on drop | The check runs within the active workspace (WS-6). |
| v2 CNT-1 to CNT-3, counts in the status bar | The counts, Count syntax and the language list start at the left edge of the editor pane (STB-1). Status messages move to the right end (STB-2). |
| v2 NOT-3, NOT-5, NOT-11, NOT-12 | Read per workspace (NOT-14, NOT-15). |
| v2 non-goal "AI features" | Unchanged. Claude integration is deferred (section 8.1). |
| README | New documents start as Markdown: updated in PR #6. Update at build time: workspaces, colors, Move and the Notion variables. |

---

## 11. Left to the builder

- The form and placement of the switch, within WS-2 and CLR-1
- The exact Work preset hex, within CLR-6
- How a request names the workspace (path, query or header), within WS-5 and MIG-3
- The `localStorage` key names for the active workspace and per-workspace tabs
- Whether a move changes the last-modified date, and so the sort position in the list
- The Notion parent page variable names and the Settings API shape

---

## 12. Sources

- Repo files cited inline (`server/src/db.js`, `server/src/migrations.js`, `server/src/settings/routes.js`, `web/index.html`, `web/src/tabs.js`, `web/src/stored-choice.js`, `web/styles.css`)
- WCAG 2.1 contrast ratio: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
- Claude connector authentication: https://claude.com/docs/connectors/building/authentication
- Claude custom connectors: https://claude.com/docs/connectors/custom/add-unlisted
- Claude custom connectors (support): https://support.claude.com/en/articles/11175166-about-custom-connectors-using-remote-mcp
- Claude Code MCP: https://code.claude.com/docs/en/mcp
- Anthropic IP addresses: https://platform.claude.com/docs/en/api/ip-addresses

---

## 13. Open questions

None.
