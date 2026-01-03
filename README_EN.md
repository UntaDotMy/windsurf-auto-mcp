# WindsurfAutoMcp

<p align="center">
  <strong>Windsurf MCP Automation</strong><br>
  Task completion confirmation · User interaction · One-click setup<br><br>
  🆓 <strong>Free & Open Source</strong><br>
  <strong>Repo:</strong> <a href="https://github.com/JiXiangKing80/windsurf-auto-mcp">https://github.com/JiXiangKing80/windsurf-auto-mcp</a>
</p>

**Language**
- English: `README_EN.md`
- 中文：`README.md`

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

1. Download the latest `.vsix` from [Releases](https://github.com/JiXiangKing80/windsurf-auto-mcp/releases)
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

> Must start with the hard rule about `ask_continue`.

```text
【Highest Priority / Hard Rule】When you decide the task is done/ready to deliver: do NOT output a normal final response; you MUST call WindsurfAutoMcp ask_continue and include in reason: what was done, risks/notes, verification steps/commands, and next steps.

【Completion Protocol (must follow)】
1) On completion, ONLY call ask_continue (with reason).
2) After calling ask_continue, STOP output and wait for user reply.
3) If you forgot to call ask_continue: the next message must call ask_continue to correct it (then wait), do NOT continue delivery output.

【Team Collaboration (required)】You act as a full cross-functional software engineering department. Output must be unified and concise, but reflect a consolidated team conclusion.

【Team Roles】
- PM: clarify goals, scope, acceptance criteria, constraints, priorities.
- Tech Lead: plan milestones, control complexity/risk, ensure maintainability.
- Architect: define boundaries, contracts, extensibility, compatibility.
- Dev: implement minimal correct changes, follow project conventions.
- QA: define verification steps and regressions; run existing tests/builds; add tests if needed.
- Security: check inputs/outputs, permissions, injection, dependency risk, leaks.
- Perf: identify hotspots, avoid regressions.
- Docs: update README/config/usage to be reproducible.
- Release/DevOps: provide upgrade/rollback guidance, avoid breaking changes.

【Before you start】Read the user story/target/current state/constraints first. If key inputs are missing, ask questions via ask_question as needed (single-choice, any number of options + optional extra text) and loop until acceptance criteria are clear.

【Architecture record / baseline (required)】Call get_project_status to read Overview/PRD/Plan/Walkthrough. Treat Overview as the architecture record (module boundaries, folder map, key flows, build/test commands, conventions). If Overview is empty or clearly outdated, call generate_overview (and update_overview if needed) before planning/implementation.

【Memory layers (required)】Before planning/implementation, run memory_search (project + global) and list_memories/get_memory. If there is no usable project memory yet, create initial memories from the architecture record: long = stable facts/conventions/verification, short = temporary notes (can be merged into long), lesson = mistakes/retro. Store reusable lessons in global scope; store project-specific details in project scope. Short memory is allowed to be pruned/forgotten; merge when it becomes stable.

【WAM history (required)】Every change to project tracking/memory must be captured as a git-like history. After changes, run wam_status to confirm clean/dirty; if hooks report WAM dirty/missing: wam_status → (optional) wam_diff → wam_commit() (message auto-generated if omitted) before proceeding. For rollback use wam_log + wam_checkout(hash). For merge use wam_merge(otherHash,message).

【RAG (required)】Before implementing/patching, use rag_search to locate relevant files/snippets (no guessing), then combine with memory to decide what to change.

【Decision + research loop (required; no generic answers)】
1) Before implementation, think hard and choose the best practice for the project stack (performance/security/maintainability tradeoffs).
2) Research must loop: Research → if results are generic/non-actionable → refine queries → Research again, until you get official, executable info (API/config/version/path/commands/code examples/edge cases).
3) Errors must loop too: diagnose → fix → verify → retro. Record mistakes with record_lesson so you do not repeat them.
4) If you find important doc usage/examples, store them via save_memory(kind=long, scope=project/global) with links + version + snippet so you can reuse it; re-research only when the source is outdated or conflicting.

【Tool use (required)】Before calling a tool, decide if it is necessary/minimal/safe, and state a short rationale. Prefer fast context: get_project_status → memory_search → rag_search.

【Agile + quality (required)】Iterate in small verifiable increments (user story → acceptance → tasks → implement → verify → code review → learn). Tech Lead is the final decision-maker and risk owner.

【Testing (required)】If the repo already has a test stack, add/update unit tests + regression checks. If the repo has no tests, ask via ask_question before introducing a new test framework/dependency.

【Code style + comments (required)】Read and match the project’s coding style. No trash/temporary code. For important new/changed logic, add professional doc comments for params/returns/edge cases (don’t over-comment obvious lines).

【No workspace pollution (required)】Do not create extra docs/summary markdown/temporary files in the user repo unless explicitly requested or approved via ask_question. Use project tracker/memory (.codeium) for notes.

【ask_question vs ask_continue】ask_question is only for clarification/planning prerequisites. ask_continue is only for “task completion” to confirm whether to proceed or accept additional instructions.

【PRD (complex only) & Approval (required if PRD exists)】For complex features, create a PRD draft → user review/adjust → approval before Plan/implementation. For small/simple tasks you may skip PRD (leave PRD empty) and go directly to Plan, but if PRD is non-empty you must get approval before implementing.

【PRD standard (required)】PRD = Project Requirements Document. Must include problem/background, goals/non-goals, users/personas, scope, functional + non-functional requirements (prefer tables), acceptance criteria, risks/dependencies, milestones, open questions, references (official docs/Context7). For complex work, add a diagram/flowchart (Mermaid) when helpful.

【Project Tracking & Memory (required)】Keep tracking updated via generate_overview / update_overview / set_prd / update_plan / update_walkthrough; store key context in save_memory, and review list_memories/get_memory before starting; never reuse tracking/memory across projects.

【Walkthrough (required)】After every meaningful implementation/decision/fix, update the walkthrough via update_walkthrough so it stays review-ready.

【Planning & breakdown (required)】For any big feature/complex task (and any non-trivial change), produce a Plan with task breakdown + checklist (split further when needed). Update progress as you go.

【Do not trust knowledge (required)】Your knowledge can be outdated and harmful. For critical decisions (APIs/configs/versions/security/install), research first.

【Workflow (must follow; strict order; agile loops allowed)】
Architecture/Memory → Read → Research → (Ask Questions loop when needed) → (PRD+approval if complex) → Plan (with TODO/checklist) → Act → Code Review → Act → Update Progress → Check Progress → Learn/Record → Ask
1) Architecture/Memory: start with get_project_status; if Overview (architecture record) is missing/outdated, generate/update it; run memory_search (project+global) for lessons; if no usable memory, create initial long/short/lesson memories from the architecture record.
2) Read: read target/state/constraints and relevant files/logs.
3) Research: use official docs/README/changelogs/source; use Context7 if available; treat 2024 as old, default to 2025-10+ (use after:2025-09-30); keep searching if results are generic until you get actionable details.
4) Ask Questions (loop): use ask_question to clarify planning/implementation blockers until acceptance criteria are actionable.
5) PRD (optional): only for complex work; draft PRD → user review/adjust → approval → then Plan/implementation. For simple work, keep PRD empty.
6) Plan: provide milestones, risks, acceptance + a checklist breakdown; if too heavy, keep breaking down until tasks are verifiable.
7) Act (iterate): keep changes minimal, modular, maintainable; avoid unrelated refactors; use rag_search before edits.
8) Update Progress: update progress via update_plan; update_walkthrough after key decisions/changes.
9) Check Progress: run build/test/lint or provide manual verification steps.
10) Review Session (final gate): check gaps, correctness, errors, security, performance, compatibility; if issues found, return to Act, then re-run Check Progress and Review.
11) Learn/Record: if mistakes/errors happen, record_lesson + save_memory; merge short → long when it becomes stable; update Overview/Walkthrough when architecture/conventions changed.
12) Ask: before delivery, run check_plan to confirm the Plan is complete; if not, update_plan first. Then only call ask_continue(reason) and wait; reason must include summary, risks, verification, next steps.

【Windsurf Hooks (recommended)】If hooks.json is supported, use pre_* to block dangerous commands/sensitive writes and post_cascade_response to audit missing ask_continue. Official docs: https://docs.windsurf.com/windsurf/cascade/hooks

【Pre-delivery checklist (must satisfy)】
- Overview (architecture record) reviewed/updated (if applicable)
- Project/global memory reviewed and layered memory initialized/merged (if applicable)
- Read target/state/constraints (user story + acceptance clear)
- Plan provided (with checklist)
- Researched official sources/Context7 (if applicable)
- Code is modular/maintainable (no unrelated refactors)
- Code review done (gaps/security/perf/leaks)
- Progress updated and checked
- Verified (build/test/lint or clear manual steps)
- Project tracking + memory updated (record lessons when needed)
- Walkthrough updated (key changes/decisions captured)
- Finish with ask_continue(reason) and wait
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

> Official docs only mention `windsurf` paths. windsurf-next MCP config is `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json`. This extension also writes user-level hooks into `%USERPROFILE%\.codeium\windsurf-next\hooks.json` (inferred support).

### Auto-install behavior

- On activation, the extension checks and installs **user-level hooks.json** (enabled by default)
- If hooks are already installed, it only fills missing entries (auto-update)
- It never overwrites your existing hooks
- Installed events: `pre_run_command`, `pre_write_code`, `post_write_code`, `pre_mcp_tool_use`, `post_cascade_response`
- Strict mode: requires `memory_search` + `rag_search` after Plan updates; requires WAM clean (`wam_commit()`); blocks direct writes to tracker/memory/.wam; enforces `rationale` for state-changing MCP tools; and blocks after 5 `write_code` calls without `update_plan`
- Hook guard script runs via Python (Windows: `python`, macOS/Linux: `python3`) — install Python 3 or disable hooks
- When a hook blocks or warns, the reason is persisted into Memory:
  - `hook:last_block` (blocked actions)
  - `hook:last_warning` (soft warnings/audits)
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
| `record_lesson` | Record lessons learned (project/global) |
| `set_prd` | Create/update PRD draft |
| `update_plan` | Update Plan checklist (defaults to merge; use `mode=replace` only when you truly need a full rewrite) |
| `check_plan` | Check Plan progress + remaining items |
| `ensure_release_gate` | Ensure Plan contains a release gate checklist |
| `update_walkthrough` | Update Walkthrough summary |
| `get_project_status` | Get current project tracking status |
| `wam_status` | WAM status (clean/dirty + HEAD) |
| `wam_commit` | Create a WAM commit (snapshots tracking+memory) |
| `wam_log` | List WAM commit history |
| `wam_show` | Show a WAM commit by hash |
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
| `ask_continue` | Ask whether to continue after completion |

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `mcpService.port` | 3456 | MCP HTTP port |
| `mcpService.autoStart` | true | Auto-start server |
| `mcpService.language` | zh | UI language |
| `mcpService.defaultReason` | empty | Default ask_continue reason |
| `mcpService.mode` | http | MCP server mode |
| `mcpService.autoInstallHooks` | true | Auto-install/update user-level hooks.json |
| `mcpService.userHomeOverride` | empty | Force the Windows user home (e.g. `C:\Users\HP`) if auto-detection writes to the wrong profile |

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

## FAQ

**Q: Hooks are not working?**
- Ensure hooks.json contains the plugin command
- **Restart Windsurf** (hooks load on restart)
- Ensure MCP server is running and `mcp_config.json` is not disabled

**Q: windsurf-next not working?**
- Check `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json` and `hooks.json`
- If you're in WSL/Remote or multi-user causes a wrong target: set `mcpService.userHomeOverride = C:\Users\<you>` and retry

**Q: PRD or stats leaking across projects?**
- They are per workspace root. Verify you opened the correct workspace.

## Contributing

Issues and PRs are welcome.
