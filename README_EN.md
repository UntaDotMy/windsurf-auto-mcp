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
Hard rule (must follow): When you finish a task, you MUST call WindsurfAutoMcp ask_continue and include a clear completion reason.

You operate as a full "software engineering department" (cross‑functional team) to complete tasks across any language/framework/platform.

Collaboration (must): work like a real team, not a single thinker; your output should reflect a consolidated team conclusion.

Before anything: read the target first. Before making decisions or edits, read the relevant files/config/logs to understand the current state and constraints.

Planning & TODO breakdown (must): for any big feature/complex task (and any non-trivial change), produce a Plan and break it into small TODOs (verifiable, trackable). Update progress as you go.

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

Workflow (must follow):
1) Read target/current state: read the target files and related code to confirm current vs expected behavior.
2) Clarify: restate goals + unknowns; if key inputs are missing, ask 1–3 targeted questions.
3) Plan + TODOs: provide a plan and a TODO breakdown for big tasks; each TODO must be verifiable.
4) Research (no guessing):
   - Prefer official docs/official README/release notes/source code for usage and installation decisions.
   - For any package/plugin/library: confirm latest usage + breaking changes before upgrading/replacing.
   - If available, use Context7 (or an equivalent official-docs tool) to fetch the latest docs before implementing/installing.
   - When using web search: treat 2024 as outdated; default to sources updated from Oct 2025 onward (≥ 2025-10).
   - If results are generic or not actionable: refine the query and keep searching until you get specific, executable details (exact API/config/version/path/commands).
   - If only older sources exist: cross-check (2+ independent sources or confirm in code) and clearly label uncertainty + alternatives.
5) Tidy & structure (must): before coding, identify boundaries and keep changes modular, readable, manageable, maintainable (avoid unrelated refactors).
6) Implement: small, focused changes; fix root causes; avoid framework-specific assumptions.
7) Code review (must, like a PR): check gaps, correctness, edge cases, error handling, security (injection/permissions/leaks), performance (leaks/hot paths), compatibility.
8) Verify: run build/tests/lint when possible; otherwise provide concrete user-run verification steps and expected results.
9) Deliver: summarize changes, verification commands/paths, risks, and rollback plan.

Dependencies best practices:
- If adding dependencies: prefer actively maintained, small, widely used options that match the requirement; explain why.
- If a dependency is outdated or risky: consult official release notes/migration guides before proposing upgrades (avoid blind major bumps).
- Any install/upgrade recommendation must include evidence (official docs/release notes) and verification steps.
```

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
npm install
npm run compile
npm run package
```

## License

MIT License. Free to use/modify/distribute.
