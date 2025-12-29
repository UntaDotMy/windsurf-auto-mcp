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
  <a href="#project-tracker-prd--plan--todo--checklist">Project Tracker</a> •
  <a href="#windsurf-hooks">Hooks</a> •
  <a href="#mcp-tools">Tools</a> •
  <a href="#faq">FAQ</a>
</p>

---

## Overview

WindsurfAutoMcp standardizes task completion with MCP: when the AI finishes a task, it must call `ask_continue` instead of continuing to spend credits. It also provides a control panel and a project tracker (PRD/Plan/TODO/Checklist).

## Features

- ✅ Task completion confirmation via `ask_continue`
- 🔌 MCP HTTP server
- 🖼️ Image upload & delete before send
- ⚙️ One-click MCP config for Windsurf / windsurf-next
- 🧭 Project tracker: PRD/Plan/TODO/Checklist + progress + stats
- 🛡️ Optional hooks guardrails for commands/writes
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
3. Click **Write Windsurf Config** (writes both windsurf and windsurf-next)
4. **Restart Windsurf** to load MCP config + hooks
5. Use the assistant; it will call `ask_continue` on completion

> Add the prompt below to Windsurf global rules so you do not have to paste it each session.

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

【Before you start】Read target/current state/constraints first. If key inputs are missing, ask 1-3 questions via ask_question (single choice A/B/C + optional extra text).

【PRD & Approval (required)】Create a PRD draft → user review/adjust → approval before any Plan. Do not implement (write code/run commands/use external tools) before approval.

【Planning & TODO breakdown (required)】For any big feature/complex task (and any non-trivial change), produce a Plan and break it into TODOs. Update progress as you go.

【Do not trust knowledge (required)】Your knowledge can be outdated and harmful. For critical decisions (APIs/configs/versions/security/install), research first.

【Workflow (must follow; strict order)】
Read → Research → Plan → TODO → Act → Code Review → Act → Update Progress → Check Progress → Ask
1) Read: read target/state/constraints and relevant files/logs.
2) Research: use official docs/README/changelogs/source; use Context7 if available; treat 2024 as old, default to 2025-10+ (use after:2025-09-30); keep searching if results are generic until you get actionable details.
3) Plan: provide milestones, risks, acceptance.
4) TODO: break down into verifiable, trackable tasks.
5) Act: keep changes minimal, modular, maintainable; avoid unrelated refactors.
6) Code Review: check gaps, correctness, errors, security, performance, compatibility.
7) Act: fix review findings; add tests/regression if needed.
8) Update Progress: update progress after each TODO.
9) Check Progress: run build/test/lint or provide manual verification steps.
10) Ask: only call ask_continue(reason) and wait; reason must include summary, risks, verification, next steps.

【Windsurf Hooks (recommended)】If hooks.json is supported, use pre_* to block dangerous commands/sensitive writes and post_cascade_response to audit missing ask_continue. Official docs: https://docs.windsurf.com/windsurf/cascade/hooks

【Pre-delivery checklist (must satisfy)】
- Read target/state/constraints
- Plan + TODO (if applicable)
- Researched official sources/Context7 (if applicable)
- Code is modular/maintainable (no unrelated refactors)
- Code review done (gaps/security/perf/leaks)
- Progress updated and checked
- Verified (build/test/lint or clear manual steps)
- Finish with ask_continue(reason) and wait
```

## Project Tracker (PRD / Plan / TODO / Checklist)

- Tracking is **per workspace root**; PRD/Plan/TODO never bleed across projects
- Tracker files (user-level):
  - Windows: `%USERPROFILE%\.codeium\windsurf\windsurf-auto-mcp-tracker.json`
  - Windows (windsurf-next): `%USERPROFILE%\.codeium\windsurf-next\windsurf-auto-mcp-tracker.json`
- Sidebar provides editable PRD/Plan/TODO/Checklist with live progress
- Per-project stats: PRD updates, approvals, plan updates, TODO updates, checklist updates
- Hooks validate PRD approval + Plan/TODO before `pre_write_code`; missing gates block writes

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
- If hooks are already installed, it does nothing; it only fills missing entries
- It never overwrites your existing hooks
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
| `ask_question` | Single-choice clarification (A/B/C..., optional text/image) |
| `set_prd` | Create/update PRD draft |
| `approve_prd` | Approve PRD |
| `update_plan` | Set/update plan checklist |
| `update_todos` | Set/update TODO checklist |
| `update_checklist` | Set/update delivery checklist |
| `get_project_status` | Get current project tracking status |
| `notify` | Show notification |
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

## FAQ

**Q: Hooks are not working?**
- Ensure hooks.json contains the plugin command
- **Restart Windsurf** (hooks load on restart)
- Ensure MCP server is running and `mcp_config.json` is not disabled

**Q: windsurf-next not working?**
- Check `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json` and `hooks.json`

**Q: PRD or stats leaking across projects?**
- They are per workspace root. Verify you opened the correct workspace.

## Contributing

Issues and PRs are welcome.
