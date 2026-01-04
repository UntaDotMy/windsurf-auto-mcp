# WindsurfAutoMcp

<p align="center">
  <img src="https://img.shields.io/badge/Windsurf-MCP%20Automation-blue?style=for-the-badge" alt="Windsurf MCP Automation">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License">
  <img src="https://img.shields.io/badge/Language-TypeScript-blue?style=for-the-badge" alt="TypeScript">
</p>

<p align="center">
  <strong>Agentic Workflow Enforcement for Windsurf IDE</strong><br>
  Task completion confirmation · Think-first workflow · Memory & RAG · Git-like version control (WAM)<br><br>
  🆓 <strong>Free & Open Source</strong>
</p>

<p align="center">
  <a href="https://github.com/JiXiangKing80/windsurf-auto-mcp">🏠 Original Repository</a> ·
  <a href="https://github.com/UntaDotMy/windsurf-auto-mcp">🔀 Fork</a> ·
  <a href="#installation">📦 Installation</a> ·
  <a href="#mcp-tools">🛠️ Tools</a> ·
  <a href="#windsurf-hooks">🛡️ Hooks</a>
</p>

**Language:** English (default) | [中文](README_ZH.md)

<p align="center">
  <a href="#overview">Overview</a> •
  <a href="#features">Features</a> •
  <a href="#installation">Installation</a> •
  <a href="#quick-start">Quick Start</a> •
  <a href="#recommended-global-rules--prompt">Rules</a> •
  <a href="#project-tracker-overview--prd--plan--wam--walkthrough">Project Tracker</a> •
  <a href="#windsurf-hooks">Hooks</a> •
  <a href="#mcp-tools">Tools</a> •
  <a href="#faq">FAQ</a>
</p>

---

## Overview

WindsurfAutoMcp standardizes task completion with MCP: when the AI finishes a task, it must call `ask_continue` instead of continuing to spend credits. It also provides a PRD approval dialog and read-only project panels (Overview/PRD/Plan/Memory/Walkthrough); stats stay in the sidebar.

## Features

- ✅ Task completion confirmation via `ask_continue`
- ❓ ask_question single-choice clarification (any number of options, can deselect)
- 🧾 PRD approval dialog: PRD is for complex work; if PRD is non-empty, it must be approved before implementation
- 🧭 Project panels: Overview / PRD / Plan / WAM / Walkthrough (read-only, AI-updated)
- 🧠 Memory panel: Project Memory / Global Memory + relationship graph (read-only)
- 🧩 Mermaid rendering: panels/PRD review auto-render ` ```mermaid ` diagrams (offline-bundled)
- 🧾 WAM history: git-like snapshots under `.wam` (tracking+memory; log/checkout/merge/branch/tag/diff/reset/stash)
- ⚡ Fast RAG: incremental local index + file watcher (stored under `.codeium/.../windsurf-auto-mcp/index`)
- 📊 Stats in the sidebar
- 📊 Per-project stats + Memory storage
- ⚙️ One-click MCP config for Windsurf / windsurf-next
- 🛡️ Optional hooks guardrails (auto-update when missing)
- 🖼️ Image upload & delete before send
- 🌐 EN/中文 UI
- ⌨️ Shortcut: `Ctrl+M`

## Requirements

| Requirement | Details |
|------------|---------|
| Windsurf / VS Code | 1.80.0+ |
| Node.js | Not required (extension is bundled) |

## Installation

### Option A: Release (recommended)

1. Download the latest `.vsix` from [Releases](https://github.com/JiXiangKing80/windsurf-auto-mcp/releases) (original) or build from source
2. Open Windsurf/VS Code
3. `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
4. Select the `.vsix`
5. **Restart Windsurf/VS Code**

### Option B: Drag & Drop

1. Open Extensions (`Ctrl+Shift+X`)
2. Drag the `.vsix` into the Extensions view
3. **Restart Windsurf/VS Code**

## Quick Start

1. Open the **WindsurfAutoMcp** sidebar
2. Ensure the server is running (auto-start by default)
3. Click **Write Windsurf Config** (writes to `%USERPROFILE%\.codeium\windsurf\mcp_config.json` and `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json`)
4. **Restart Windsurf** to load MCP config + hooks
5. Open Overview/PRD/Plan/Walkthrough panels (read-only; AI updates via MCP tools)
   - You can also open the Memory panel to view project/global memory + the relationship graph
6. Use the assistant; it will call `ask_continue` on completion and `ask_question` when clarification is needed

> The global prompt below is **documented only**. Please copy it into your Windsurf global rules (or paste per session).

## Recommended Global Rules / Prompt

> **Copy this into Windsurf global rules** (Customizations → Rules → + Global).
> Per [official docs](https://docs.windsurf.com/windsurf/cascade/memories), rules should be concise (<6000 chars per file). Workflow enforcement is handled by **hooks** (see below).

```text
# WindsurfAutoMcp Workflow Rules

## ⚠️ CRITICAL: STOP → THINK → READ → RESEARCH → PLAN → CODE

**NEVER trust your knowledge. ALWAYS research first. Treat 2024 info as outdated.**

## Phase 0: STOP & UNDERSTAND
Before ANY action:
1. `preflight()` - MANDATORY first call every session
2. `check_hook_status()` - If ANY action fails/blocked, call this IMMEDIATELY
3. Read the error/block message. Understand WHY.

## Phase 1: THINK DEEPLY
1. `index_codebase({depth:"deep"})` - Understand project tech stack, structure, patterns
2. `sequential_thinking()` - Break down complex problems into stages
3. Read target files BEFORE editing - understand context
4. Identify: What exists? What patterns? What conventions?

## Phase 2: RESEARCH (MANDATORY)
**NEVER skip research. NEVER assume. ALWAYS verify.**
1. `memory_search({query, scope:"both"})` - Check lessons, cached research
2. `rag_search({query})` - Find existing code patterns in THIS project
3. `resolve_library_docs()` → `get_library_docs()` - Get CURRENT docs (not from memory)
4. Web search for best practices - treat knowledge from 2024 as potentially outdated
5. Save findings: `save_memory({key:"research:topic", scope:"global", kind:"long"})`

## Phase 3: PLAN (NO CODE WITHOUT PLAN)
1. `update_plan({items:[...]})` - Create detailed checklist
2. Include: verification steps, tests, code_review
3. Get user approval for significant changes
4. Plan must reference research findings

## Phase 4: EXECUTE (ONE STEP AT A TIME)
1. Complete ONE plan item
2. `check_plan()` - Mark done, get next
3. `verify_action()` - Confirm success
4. Repeat until complete

## Phase 5: VERIFY & LEARN
1. `code_review()` - Required before completion
2. `record_lesson()` - On errors/learnings
3. `ask_continue()` - Only after code_review passes

## 🛑 ABSOLUTE BLOCKS
- ❌ NO code without approved plan
- ❌ NO plan without research (memory + rag + docs)
- ❌ NO implementation without reading existing code first
- ❌ NO ask_continue without code_review
- ❌ NO assumptions - verify everything with existing code

## 🚨 WHEN BLOCKED
If hooks block your action (exit code 2):
1. STOP retrying the same action
2. Call `check_hook_status()` immediately
3. Read the block reason in the response
4. Fix the issue (e.g., create plan first, run preflight)
5. Then retry

## KEY TOOLS
- `preflight()` - Session start (MANDATORY)
- `check_hook_status()` - When blocked/failed
- `index_codebase({depth:"deep"})` - Understand project
- `sequential_thinking()` - Think through complex problems
- `memory_search({scope:"both"})` - Check memory
- `rag_search()` - Find code patterns
- `resolve_library_docs()` / `get_library_docs()` - Get docs
- `update_plan()` / `check_plan()` - Plan management
- `code_review()` - Before completion
- `ask_continue()` - Request next task
```

## Project Tracker (Overview / PRD / Plan / WAM / Walkthrough)

- Tracking is **per workspace root**; data never bleeds across projects
- Tracker files (user-level):
  - Windows: `%USERPROFILE%\.codeium\windsurf\windsurf-auto-mcp-tracker.json`
  - Windows (windsurf-next): `%USERPROFILE%\.codeium\windsurf-next\windsurf-auto-mcp-tracker.json`
- Memory files (user-level):
  - Windows: `%USERPROFILE%\.codeium\windsurf\windsurf-auto-mcp-memories.json`
  - Windows (windsurf-next): `%USERPROFILE%\.codeium\windsurf-next\windsurf-auto-mcp-memories.json`
- Project artifacts (brain):
  - Windows: `%USERPROFILE%\.codeium\windsurf\windsurf-auto-mcp\brain\<projectId>\`
  - Windows (windsurf-next): `%USERPROFILE%\.codeium\windsurf-next\windsurf-auto-mcp\brain\<projectId>\`
  - Files: `overview.md` / `prd.md` / `plan.md` / `walkthrough.md` / `memory.md` (plus `.metadata.json` / `.resolved` / `.resolved.N` snapshots)
  - `overview.md` is “project overview/architecture/context”; `plan.md` contains only the Plan + checklist
- WAM (history snapshots):
  - Project-level (per projectId):
    - Windows: `%USERPROFILE%\.codeium\windsurf\windsurf-auto-mcp\.wam\<projectId>\`
    - Windows (windsurf-next): `%USERPROFILE%\.codeium\windsurf-next\windsurf-auto-mcp\.wam\<projectId>\`
  - Global (for global memories): `%USERPROFILE%\.codeium\windsurf-auto-mcp\.wam\global\`
- RAG index (local cache; per projectId):
  - Windows: `%USERPROFILE%\.codeium\windsurf\windsurf-auto-mcp\index\<projectId>\rag-index.json`
  - Windows (windsurf-next): `%USERPROFILE%\.codeium\windsurf-next\windsurf-auto-mcp\index\<projectId>\rag-index.json`
- `projectId` is included in `get_project_status` JSON output
- Panels are read-only and updated by the AI via MCP tools (Overview/PRD/Plan/WAM/Walkthrough)
- Stats are shown in the sidebar (global calls + per-project)
- PRD is for complex work; if PRD is non-empty it triggers the approval dialog and must be approved before implementation
- Per-project stats: Overview/PRD/Plan/Walkthrough update counters
- Hooks (strict) enforce on `pre_write_code` / `pre_run_command` / `pre_mcp_tool_use`: Overview exists + project memory initialized + (if PRD is non-empty it must be approved) + Plan exists + must run `memory_search` + `rag_search` (rerun after Plan updates) + WAM clean (else blocked until `wam_commit()`); also blocks direct writes to tracker/memory/.wam.

### Maintenance / Reset

The sidebar **Maintenance** card lets you:
- Clear Overview/PRD/Plan/Walkthrough (also removes their brain artifacts)
- Reset project data (also resets per-project stats)

## Windsurf Hooks

### Paths (official docs)

- System-level:
  - Windows: `C:\ProgramData\Windsurf\hooks.json`
  - macOS: `/Library/Application Support/Windsurf/hooks.json`
  - Linux/WSL: `/etc/windsurf/hooks.json`
- User-level:
  - Windows: `%USERPROFILE%\.codeium\windsurf\hooks.json`
  - macOS/Linux: `~/.codeium/windsurf/hooks.json`
- Workspace-level: `.windsurf/hooks.json`

> Official docs only mention `windsurf` paths. This extension supports **both** `windsurf` and `windsurf-next` user-level configs:
> - MCP config: `%USERPROFILE%\.codeium\windsurf\mcp_config.json` and `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json`
> - Hooks: `%USERPROFILE%\.codeium\windsurf\hooks.json` and `%USERPROFILE%\.codeium\windsurf-next\hooks.json`

### Auto-install behavior

- On activation, the extension checks and installs **user-level hooks.json** (enabled by default)
- If hooks are already installed, it only fills missing entries (auto-update)
- It never overwrites your existing hooks
- Installed events: `pre_user_prompt`, `pre_run_command`, `post_run_command`, `pre_write_code`, `post_write_code`, `pre_mcp_tool_use`, `post_mcp_tool_use`, `post_cascade_response`
- Strict mode: requires a real Plan checklist (items) and the Plan must include verification (tests/build/lint) + dependency/security scan (npm audit + OSV/Dependabot) + a code review gate (recommended: run `ensure_release_gate` to auto-add); requires `memory_search` + `rag_search` after Plan updates; requires WAM clean (`wam_commit()`); blocks direct writes to tracker/memory/.wam; enforces `rationale` for state-changing MCP tools; and blocks after 3 `write_code` calls without `update_plan`
- After every new user prompt (`pre_user_prompt`): before any `write_code` / `run_command`, you must run `preflight(userPrompt=...)` (recommended) OR complete: `get_project_status` + `check_plan` + `memory_search` + `rag_search` + `wam_status`
- Hook guard script runs via Python (Windows: `python`, macOS/Linux: `python3`) — install Python 3 or disable hooks
- When a hook blocks or warns, the reason is persisted into Memory:
  - `hook:last_block` (blocked actions)
  - `hook:last_warning` (soft warnings/audits)
  - `hook:last_error` (run_command/MCP tool error summary)
- A rolling redacted audit log is also written: `audit.jsonl` (open the **Audit** panel from the sidebar)
- On “command failure / MCP tool error / critical gate block”, hooks automatically call `record_lesson(scope=both)` to store learnings in **project + global** memory (to avoid repeating mistakes)
- **Restart Windsurf after hooks.json updates** to apply hooks

### Uninstall

- Run `WindsurfAutoMcp: Uninstall Hooks / 卸载 Hooks`
- Or remove the matching `command` entries from hooks.json

### Disable/uninstall behavior

- The hook script reads `mcp_config.json` and probes `http://localhost:<port>/health`
- If `windsurf_auto_mcp` is missing/disabled/unreachable, it exits 0 (no blocking/audit)

## MCP Tools

| Tool | Description |
|------|-------------|
| `ask_user` | Request user input/confirmation (supports image) |
| `ask_question` | Single-choice clarification (any number of options, optional text/image) |
| `generate_overview` | Auto-generate Overview from the workspace |
| `update_overview` | Set/update Overview (Markdown) |
| `rag_search` | RAG search workspace context (returns relevant snippets) |
| `memory_search` | Search project/global memory |
| `memory_hygiene` | Memory hygiene: promote short→long / dedupe near-duplicates / auto-link lessons (optional apply) |
| `record_lesson` | Record lessons learned (project/global) |
| `set_prd` | Create/update PRD draft |
| `update_plan` | Update Plan checklist (merge by default; `mode=replace` is blocked) |
| `plan_change_request` | Plan change request (forces user choice: merge / replace / cancel) |
| `check_plan` | Check Plan progress + remaining items |
| `ensure_release_gate` | Ensure Plan contains a release gate checklist |
| `update_walkthrough` | Update Walkthrough summary |
| `get_project_status` | Get current project tracking status |
| `preflight` | Run required preflight checks (status/plan/memory/rag/wam) with structured output |
| `wam_status` | WAM status (clean/dirty + HEAD) |
| `wam_commit` | Create a WAM commit (snapshots tracking+memory) |
| `wam_log` | List WAM commit history |
| `wam_show` | Show a WAM commit by hash |
| `wam_verify` | Verify WAM integrity (hash chain + snapshot digests + optional signatures) |
| `wam_checkout` | Restore from a WAM commit (rollback) |
| `wam_merge` | Merge another commit into current state (3-way merge + conflicts) |
| `wam_branch` | Branches (refs/heads): list/create/delete |
| `wam_tag` | Tags (refs/tags): list/create/delete |
| `wam_diff` | Diff snapshots (tracker+memory), default HEAD ↔ WORKING |
| `wam_reset` | hard reset current branch/HEAD and restore snapshots |
| `wam_stash` | Stash/apply working state (push/list/apply/pop/drop) |
| `save_memory` | Save project memory |
| `get_memory` | Fetch project memory |
| `list_memories` | List project memory keys |
| `resolve_library_docs` | Resolve library name to doc ID (check cache, then known sources) |
| `get_library_docs` | Fetch library documentation (cached globally for 7 days) |
| `sequential_thinking` | Structured thinking for complex problems (stages: define→research→analyze→synthesize→conclude) |
| `think_step` | Quick single thinking step (lighter than sequential_thinking) |
| `get_thinking_history` | Get/clear current thinking session history |
| `index_codebase` | Deep codebase indexing (entry points, conventions, stack) |
| `sync_overview` | Regenerate overview if stale or missing |
| `workflow_status` | Get current workflow status with think-first guidance |
| `check_hook_status` | **Call when action blocked** - shows hook block/warning reasons stored in memory |
| `verify_action` | Verify action results and log to walkthrough |
| `code_review` | Record code review results |
| `ask_continue` | Ask whether to continue after completion |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `mcpService.port` | 3456 | MCP HTTP port |
| `mcpService.autoStart` | true | Auto-start server |
| `mcpService.language` | en | UI language (en/zh) |
| `mcpService.defaultReason` | empty | Default ask_continue reason |
| `mcpService.mode` | http | MCP server mode |
| `mcpService.autoInstallHooks` | true | Auto-install/update user-level hooks.json |
| `mcpService.userHomeOverride` | empty | Force the Windows user home (e.g. `C:\Users\HP`) if auto-detection writes to the wrong profile |
| `mcpService.wamSigning` | false | Enable WAM commit signing (HMAC-SHA256) to make history harder to forge |

## Build VSIX (for dev)

```bash
npm ci
npm run compile
npm run package
```

## GitHub Actions build (recommended)

- Pushing to the `feature` branch triggers an automated VSIX build and uploads it as an artifact (see `.github/workflows/build-vsix.yml`)
- Useful to validate install behavior without packaging locally
- Download: GitHub → Actions → open the workflow run → Artifacts → download `windsurf-auto-mcp-vsix` → unzip to get the `.vsix` → install and restart Windsurf

## Security / dependency scanning (CI)

- `.github/workflows/security.yml` runs:
  - `npm audit --audit-level=high`
  - OSV Scanner (recursive scan)
- `dependabot.yml` checks npm + GitHub Actions updates weekly (recommended)

## FAQ

**Q: Hooks are not working?**
- Ensure hooks.json contains the plugin command
- **Restart Windsurf** (hooks load on restart)
- Ensure MCP server is running and `mcp_config.json` is not disabled

**Q: windsurf-next not working?**
- Check `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json` and `hooks.json`
- If you're in WSL/Remote or multi-user causes a wrong target: set `mcpService.userHomeOverride = C:\Users\<you>` and retry

**Q: Configure Windsurf fails / invalid JSON in mcp_config.json?**
- Newer versions back up and rewrite invalid `mcp_config.json` automatically (creates `mcp_config.json.invalid.<timestamp>.bak`)
- Review the backup and merge any other MCP server entries if needed

**Q: PRD or stats leaking across projects?**
- They are per workspace root. Verify you opened the correct workspace.

## Contributing

Issues and PRs are welcome.

## Credits

- **Original Author:** [JiXiangKing80](https://github.com/JiXiangKing80/windsurf-auto-mcp)
- **Forked & Improved by:** [UntaDotMy](https://github.com/UntaDotMy/windsurf-auto-mcp)
- **License:** MIT
