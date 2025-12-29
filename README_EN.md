# WindsurfAutoMcp

<p align="center">
  <strong>Windsurf MCP Automation</strong><br>
  Task completion confirmation · User interaction · One‑click setup<br><br>
  🆓 <strong>Free & open source</strong><br>
  <strong>Repo:</strong> <a href="https://github.com/JiXiangKing80/windsurf-auto-mcp">https://github.com/JiXiangKing80/windsurf-auto-mcp</a><br>
  💎 <strong>Use MCP to improve interaction and reduce wasted Windsurf credits</strong>
</p>

**Language / 语言**
- English: `README_EN.md`
- 中文：`README.md`

---

## Why WindsurfAutoMcp?

In the default workflow, after the AI finishes a task it may “idle” while waiting for your next message — and **Windsurf credits can keep being consumed**.

WindsurfAutoMcp uses MCP to:
- ✅ **Pause after completion**: the AI asks whether to continue instead of idling
- ✅ **Batch work**: chain multiple tasks with fewer back‑and‑forth messages
- ✅ **Stay in control**: you can intervene, adjust direction, or end at any time

## Features

- 💎 **Save credits** by avoiding idle completion loops
- 🔌 **HTTP MCP server** (stable connection)
- ✅ **Task completion confirmation** via `ask_continue`
- 🖼️ **Multi‑image upload** in dialogs (paste/drag/drop/file picker)
- 🗑️ **Remove wrong images** before sending (click **×** on the preview)
- ⚙️ **One‑click Windsurf config** (writes MCP config automatically)
- ⚙️ **Windsurf-next supported** (writes MCP config for both Windsurf and Windsurf-next)
- 🎨 **Sidebar control panel**
- 🌐 **Bilingual UI** (EN/中文 toggle in sidebar + dialogs)
- ⌨️ **Hotkey**: `Ctrl+M` toggles the dialog
- 📊 **Usage stats**
- 🧩 **Auto‑install global rules** to avoid pasting prompts every chat

## Requirements

| Item | Notes |
|------|------|
| Windsurf / VS Code | 1.80.0+ |
| Node.js | Not required (extension is packaged) |

## Install

### Option A: Install from Release (recommended)

1. Download the latest `.vsix` from [Releases](https://github.com/JiXiangKing80/windsurf-auto-mcp/releases)
2. Open Windsurf / VS Code
3. `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
4. Select the `.vsix`
5. **Restart Windsurf / VS Code**

### Option B: Drag & drop

1. Open Extensions panel (`Ctrl+Shift+X`)
2. Drag the `.vsix` into the panel
3. **Restart Windsurf / VS Code**

## Usage

### Quick start

1. After installation, open the **WindsurfAutoMcp** sidebar
2. Click **Write Windsurf config** (or start server and it will auto‑write)
3. **Restart Windsurf**
4. Start working: when the AI finishes, it calls `ask_continue` and the confirmation dialog appears

> Recommended: add the “Global rules / prompt” below to Windsurf’s global rules so you don’t need to paste it every new chat. If you can’t, paste it once at the start of each new chat.

### Recommended global rules / prompt (paste into Windsurf global rules)

> It must start with the required “call ask_continue when finished” rule (the first line is the hard rule).

```text
Hard rule (highest priority): When you decide a task is done / ready to deliver, do NOT output a normal final response; you MUST call WindsurfAutoMcp ask_continue and put in reason: what was done, risks/notes, verification steps/commands, and next steps.

Completion protocol (must follow):
1) When done, the ONLY allowed action is calling ask_continue (with reason).
2) After calling ask_continue, stop output and wait for the user.
3) If you forgot to call ask_continue, your next message must first call ask_continue to correct (then wait).

Collaboration (must): operate as a full "software engineering department" (cross-functional team) across any language/framework/platform. Output should be concise but reflect a consolidated team conclusion.

Before anything (must): read the target first. Before decisions/edits, read relevant files/config/logs to understand the current state and constraints.

Planning & TODO breakdown (must): for any big feature/complex task (and any non-trivial change), produce a Plan and break it into small TODOs (verifiable, trackable, parallelizable). Update progress as you go.

Do not trust your knowledge (must): your knowledge can be outdated and harmful. For any important decision (API/config/version/security/install), research first, then act.

Team roles (coordinate internally; keep external output concise):
- PM: clarify goals, scope, acceptance criteria, constraints, priorities.
- Tech Lead: propose an executable plan, manage risk/complexity, ensure maintainability.
- Dev: implement minimal correct changes; follow repo conventions; avoid unnecessary refactors.
- QA: define verification steps and regression points; run build/tests when possible; add tests when appropriate.
- Security: validate boundaries, permissions, injection risks, dependency risks, secrets handling.
- Performance: avoid regressions; remove needless work; measure when relevant.
- Docs: keep README/config/usage accurate and reproducible.
- Release: provide upgrade/rollback notes; avoid breaking changes.

Workflow (must follow; strict order):
Read → Research → Plan → TODO → Act → Code Review → Act → Update Progress → Check Progress → Ask
1) Read: read the target/current state/constraints first; before any decision/edit, read relevant files/config/logs; list unknowns and ask 1–3 targeted questions if key inputs are missing.
2) Research (no guessing): prefer official docs/official README/release notes/source; confirm latest usage + breaking changes before upgrading/replacing; use Context7 if available; treat 2024 as outdated and default to sources updated from Oct 2025 onward (≥ 2025-10, add after:2025-09-30); if results are generic, refine and keep searching until you get exact API/config/version/path/commands.
3) Plan: provide a high-level plan (milestones/risks/acceptance).
4) TODO: break the plan into small verifiable TODOs (trackable, parallelizable).
5) Act: tidy boundaries before coding; implement minimal correct changes; fix root causes; keep style consistent; keep code modular/readable/maintainable (avoid unrelated refactors).
6) Code Review: like a PR—check gaps, correctness, edge cases, error handling, security (injection/permissions/leaks/deps), performance (hot paths/leaks), compatibility.
7) Act: apply fixes from review; add tests/regression points when needed.
8) Update Progress: update progress after each TODO, stating what/why.
9) Check Progress: run build/tests/lint when possible; otherwise give concrete user-run verification steps + expected results.
10) Ask: deliver ONLY via ask_continue(reason) and wait; reason must include what was done, risks/notes, verification steps/commands, and next steps.

Windsurf Hooks (recommended; can be hard guardrails): if your environment supports hooks.json, configure pre_run_command/pre_write_code to block dangerous commands/sensitive writes, and use post_cascade_response to audit missing ask_continue. Official docs: https://docs.windsurf.com/windsurf/cascade/hooks

Pre-delivery checklist (must satisfy all):
- Read target/current state/constraints
- Plan + TODOs provided (if applicable)
- Key decisions researched via official sources/Context7 (if applicable)
- Code tidied: modular/maintainable (no unrelated refactors)
- Code review completed (gaps/security/perf/leaks/etc)
- Progress updated and validated
- Verification completed (build/tests/lint or explicit manual steps)
- End with ask_continue(reason) and wait

Dependencies best practices:
- If adding dependencies: prefer actively maintained, small, widely used options that match the requirement; explain why.
- If a dependency is outdated or risky: consult official release notes/migration guides before proposing upgrades (avoid blind major bumps).
- Any install/upgrade recommendation must include evidence (official docs/release notes) and verification steps.
```

### Windsurf Hooks (optional but strongly recommended)

Windsurf officially supports **Cascade Hooks**: run your own shell commands automatically before/after key Cascade actions (read/write code, run commands, MCP tool use, responses). This is useful for safety guardrails, compliance/auditing, enforcing workflow, and blocking dangerous commands.

Official docs: `https://docs.windsurf.com/windsurf/cascade/hooks`

Config file locations (official):
- System-level:
  - Windows: `C:\ProgramData\Windsurf\hooks.json`
  - macOS: `/Library/Application Support/Windsurf/hooks.json`
  - Linux/WSL: `/etc/windsurf/hooks.json`
- User-level: `~/.codeium/windsurf/hooks.json`
- Workspace-level: `.windsurf/hooks.json` in your workspace root

Key rules (official):
- All three levels are merged, in order: system → user → workspace
- Hooks receive JSON via stdin (includes `agent_action_name`, `trajectory_id`, `execution_id`, `timestamp`, `tool_info`)
- Exit codes: `0`=success; `2`=blocking (only for `pre_*`, stderr is shown to Cascade); any other non-zero does not block but reports an error (depending on `show_output`)

Minimal example (official format):
```json
{
  "hooks": {
    "pre_run_command": [
      { "command": "python3 /abs/path/hook.py", "show_output": true }
    ]
  }
}
```

Events (official):
- `pre_read_code` / `post_read_code`
- `pre_write_code` / `post_write_code`
- `pre_run_command` / `post_run_command`
- `pre_mcp_tool_use` / `post_mcp_tool_use`
- `pre_user_prompt`
- `post_cascade_response`

Repo examples (not installed automatically):
- `examples/windsurf-hooks/hooks.json`
- `examples/windsurf-hooks/scripts/guard.js`

Notes:
- Usage: copy `examples/windsurf-hooks/hooks.json` to one of the hooks.json locations above, then replace `/ABSOLUTE/PATH/...` in `command` with your local absolute path.
- The example blocks typical dangerous ops via `pre_run_command`/`pre_write_code`, and warns when `ask_continue` is missing via `post_cascade_response` (warning only; does not block).
- Hooks run with your user’s full permissions: use absolute paths, validate input JSON, and don’t log secrets.
- windsurf-next: official docs currently only mention `windsurf` paths; if you use windsurf-next and user-level hooks don’t apply, you can also try `~/.codeium/windsurf-next/hooks.json` (matches the `mcp_config.json` path pattern; not officially documented).

### Hotkey

| Hotkey | Action |
|--------|--------|
| `Ctrl+M` | Toggle dialog |

### MCP tools

| Tool | Description |
|------|-------------|
| `ask_continue` | Ask whether to continue after completing a task |
| `ask_user` | Request user input (supports image upload) |
| `notify` | Send a user notification |

### Settings

Search `mcpService` in settings:

| Setting | Default | Notes |
|--------|---------|------|
| `mcpService.port` | 3456 | MCP server port |
| `mcpService.autoStart` | true | Auto‑start server on launch |
| `mcpService.language` | zh | UI language (`zh`/`en`) |
| `mcpService.defaultReason` | empty | Default reason used when `ask_continue` has no `reason` |

## FAQ

**The sidebar icon is missing**
- Restart Windsurf/VS Code fully, and confirm the extension is enabled.

**The port is in use**
- The extension will try the next port, or change `mcpService.port`.

**The dialog doesn’t show**
- Press `Ctrl+M` to open it, and confirm the AI actually called `ask_continue`.

**Can I delete a wrong image before submitting?**
- Yes. Click **×** on the image preview in the dialog.

## Build from source

```bash
git clone https://github.com/JiXiangKing80/windsurf-auto-mcp.git
cd windsurf-auto-mcp
npm ci # Node.js 18+ recommended
npm run compile
npm run package
```

### Build VSIX on GitHub Actions (recommended)

This repo includes a workflow that builds a `.vsix` artifact on pushes to `feature` and on PRs targeting `main`.

## License

MIT License. Free to use/modify/distribute.
