# WindsurfAutoMcp

<p align="center">
  <strong>Windsurf MCP 自动化工具</strong><br>
  任务完成确认 · 用户交互 · 一键配置<br><br>
  🆓 <strong>完全免费 · 开源项目</strong><br>
  <strong>开源地址：</strong> <a href="https://github.com/JiXiangKing80/windsurf-auto-mcp">https://github.com/JiXiangKing80/windsurf-auto-mcp</a><br>
  💎 <strong>通过 MCP 协议优化交互，让你的 Windsurf 积分发挥数倍价值</strong>
</p>

**语言 / Language**
- 中文：`README.md`
- English: `README_EN.md`

<p align="center">
  <a href="#功能特性">功能特性</a> •
  <a href="#安装方法">安装</a> •
  <a href="#使用方法">使用</a> •
  <a href="#常见问题">FAQ</a> •
  <a href="#贡献">贡献</a>
</p>

---

## 为什么使用 WindsurfAutoMcp？

传统方式下，AI 完成一个任务后会等待你的下一条指令，而你可能还在查看结果。这期间 **Windsurf 积分在持续消耗**。

WindsurfAutoMcp 通过 MCP 协议实现：
- ✅ **任务完成后自动暂停** - AI 主动询问是否继续，不再空转消耗积分
- ✅ **批量任务连续执行** - 一次指令完成多个任务，减少交互次数
- ✅ **精准控制工作流** - 随时可以介入、修改方向或结束任务

**让你的 Windsurf 积分发挥 2-5 倍价值！**

## 功能特性

- 💎 **节约积分** - 任务完成后自动暂停，避免空转消耗
- 🔌 **HTTP 模式 MCP 服务器** - 稳定可靠的连接方式
- ✅ **任务完成确认** - AI 完成任务后自动询问用户是否继续
- 🖼️ **图片上传支持** - 在对话中上传多张图片给 AI（粘贴/拖拽/文件选择）
- 🗑️ **可删除误选图片** - 发送前可从预览中移除图片（点击 ×）
- ⚙️ **一键配置 Windsurf** - 自动写入 MCP 配置文件
- ⚙️ **支持 Windsurf-next** - 同步写入 Windsurf / Windsurf-next 的 MCP 配置文件
- 🎨 **可视化控制面板** - 侧边栏管理界面
- 🌐 **中英双语** - 侧边栏与对话框支持 EN/中文切换
- ⌨️ **快捷键支持** - `Ctrl+M` 快速切换对话框
- 📊 **使用统计** - 记录调用次数

## 系统要求

| 要求 | 说明 |
|------|------|
| Windsurf / VS Code | 1.80.0 或更高版本 |
| Node.js | **不需要** - 扩展已打包，开箱即用 |

## 安装方法

### 方法一：从 Release 下载（推荐）

1. 从 [Releases](https://github.com/JiXiangKing80/windsurf-auto-mcp/releases) 下载最新的 `.vsix` 文件
2. 打开 Windsurf/VS Code
3. 按 `Ctrl+Shift+P` 打开命令面板
4. 输入 `Extensions: Install from VSIX...`
5. 选择下载的 `.vsix` 文件
6. **重启 Windsurf/VS Code**

### 方法二：拖拽安装

1. 打开 Windsurf/VS Code 的扩展面板（`Ctrl+Shift+X`）
2. 将 `.vsix` 文件直接拖入扩展面板
3. **重启 Windsurf/VS Code**

## 使用方法

### 快速开始

1. 安装扩展后，点击侧边栏的 **WindsurfAutoMcp** 图标
2. 点击 **写入 Windsurf 配置**（或启动服务器后自动写入）
3. **重启 Windsurf**
4. 开始使用：AI 在任务完成后会调用 `ask_continue`，并弹出确认对话框

> 建议将下方“全局规则/提示语”添加到 Windsurf 的全局规则中（这样每次新对话无需重复粘贴）；如果不方便，也可以每次新对话先发一次提示语给 AI。

### 推荐全局规则 / 提示语（复制到 Windsurf 全局规则）

> 必须以“任务完成后调用 ask_continue”开头（第一条为硬规则）。

```text
【最高优先级 / 硬规则】当你判断“任务已完成/准备交付”时：不要直接输出最终答复；必须调用 WindsurfAutoMcp 的 ask_continue，并在 reason 中写清：完成内容、风险/注意点、验证步骤/命令、下一步。

【完成协议（必须遵守）】
1) 完成时只允许：调用 ask_continue（携带 reason）。
2) 调用 ask_continue 后必须停止输出并等待用户回复。
3) 如果你忘记调用 ask_continue：下一条消息必须先调用 ask_continue 纠正（再等待），不要继续输出交付内容。

【团队协作（必须做到）】你现在扮演一个“完整的软件工程部门”（跨职能团队）协作完成任务，适用于任何语言/框架/平台；对外输出要简洁一致，但要体现“协同结论”。

【开始前必须做】先读“目标/现状/约束”。在做任何修改前，必须先阅读目标文件/相关代码/配置/日志，理解当前状态与约束，再做决策。

【计划与拆解（必须做到）】对任何“大功能/复杂任务”（以及任何非小改动），必须先输出 Plan，并拆成 TODO 小任务（每项可验证、可跟踪、可并行）。每完成一项就更新进度。

【不信任知识（必须做到）】不要依赖记忆/常识拍脑袋：你的知识可能过时且有害。遇到关键决策（API/配置/版本/安全/安装）必须先研究，再行动。

【团队角色（内部协作）】
- 需求负责人（PM）：澄清目标、范围、验收标准、约束与优先级。
- 技术负责人（Tech Lead）：制定方案与里程碑，控制复杂度与风险，保证可维护性。
- 开发工程师（Dev）：实现最小正确改动，遵循项目规范，避免不必要的重构。
- 测试/质量（QA）：设计验证步骤与回归点，优先运行已有测试/构建，必要时补充测试。
- 安全（Security）：检查输入/输出边界、权限、注入、依赖风险、敏感信息泄露。
- 性能（Perf）：识别热点与不必要开销，避免引入明显性能退化。
- 文档（Docs）：更新 README/配置/使用说明，确保用户能按步骤复现。
- 发布（Release）：给出升级/回滚说明，避免破坏性变更。

【统一工作流（必须遵循；严格按顺序）】
Read → Research → Plan → TODO → Act → Code Review → Act → Update Progress → Check Progress → Ask
1) Read：先读目标/现状/约束；在做任何修改前先阅读目标文件/相关代码/配置/日志；列出不确定点，缺关键输入就先问 1-3 个问题。
2) Research（不要凭空猜，必须拿到可执行信息）：优先查官方文档/官方 README/发布说明/源码；依赖先确认最新版用法与破坏性变更；可用则用 Context7 获取最新文档；web search 把 2024 视为过旧，默认从 2025-10 起筛选（可加 after:2025-09-30）；结果泛泛/无法落地就调整检索词继续搜，直到拿到确切 API/配置/版本/路径/命令。
3) Plan：给出总体 Plan（里程碑/风险/验收）。
4) TODO：把 Plan 拆成可验证、可跟踪的小 TODO（能并行则并行）。
5) Act：动手前先整理入口与模块边界；实现最小正确改动，小步推进、优先修根因、保持风格一致；新增/修改代码必须模块化、易读、易维护（但不要做与任务无关的重构）。
6) Code Review：像 PR 一样评审：检查 gaps、正确性、边界条件、错误处理、安全（注入/权限/泄露/依赖风险）、性能（热点/泄漏）、兼容性。
7) Act：根据评审结论修补问题；必要时补测试/回归点。
8) Update Progress：每完成一个 TODO 就更新进度，说明做了什么/为什么。
9) Check Progress：运行 build/test/lint；无法运行则给出可执行验证步骤与期望结果。
10) Ask：最终只允许调用 ask_continue(reason) 并等待；reason 必须包含：完成内容、风险/注意点、验证步骤/命令、下一步。

【Windsurf Hooks（推荐，可当强制护栏）】如环境支持 hooks.json：建议配置 pre_run_command/pre_write_code 阻止危险命令/敏感写入，并用 post_cascade_response 审计是否遗漏 ask_continue；官方文档：https://docs.windsurf.com/windsurf/cascade/hooks

【交付前自检清单（必须逐项满足）】
- 已读目标/现状/约束
- 已给出 Plan + TODO（如适用）
- 关键点已研究官方来源/Context7（如适用）
- 代码已整理为模块化/易维护（无无关重构）
- 已完成代码评审（gaps/安全/性能/泄露等）
- 已更新进度并校验进度
- 已验证（build/test/lint 或明确的手动验证步骤）
- 将用 ask_continue(reason) 结束并等待用户

依赖与生态最佳实践：
- 如果需要新增依赖：优先选择维护活跃、体积小、常用且与需求匹配的方案；并说明原因。
- 如果发现依赖过旧/有安全风险：先用官方发布说明/迁移指南确认升级路径，再提出升级方案（避免盲升大版本）。
- 任何安装/升级建议必须给出依据（官方文档/发布说明）与验证步骤。
```

### Windsurf Hooks（可选但强烈推荐）

Windsurf 官方支持 **Cascade Hooks**：在 Cascade 读/写代码、执行命令、调用 MCP 工具、生成回复等关键动作前后，自动运行你配置的 shell 命令。可用于：安全护栏、合规审计、强制流程、阻止危险命令等。

官方文档：`https://docs.windsurf.com/windsurf/cascade/hooks`

配置文件位置（官方）：
- 系统级（System-level）：
  - Windows：`C:\ProgramData\Windsurf\hooks.json`
  - macOS：`/Library/Application Support/Windsurf/hooks.json`
  - Linux/WSL：`/etc/windsurf/hooks.json`
- 用户级（User-level）：
  - Windsurf（官方）：
    - Windows：`%USERPROFILE%\.codeium\windsurf\hooks.json`
    - macOS/Linux：`~/.codeium/windsurf/hooks.json`
  - Windsurf-next（非官方，但与 `mcp_config.json` 路径规律一致）：
    - Windows：`%USERPROFILE%\.codeium\windsurf-next\hooks.json`
    - macOS/Linux：`~/.codeium/windsurf-next/hooks.json`
- 工作区级（Workspace-level）：工作区根目录的 `.windsurf/hooks.json`

关键规则（官方）：
- 三层配置会合并执行，顺序：system → user → workspace
- Hook 通过 stdin 接收 JSON（包含 `agent_action_name`、`trajectory_id`、`execution_id`、`timestamp`、`tool_info`）
- Exit code：`0`=正常；`2`=阻止（仅 `pre_*` 生效，Cascade 会显示 stderr）；其他非 0=不阻止但会报告错误（取决于 `show_output`）

最小配置示例（官方格式）：
```json
{
  "hooks": {
    "pre_run_command": [
      { "command": "python3 /abs/path/hook.py", "show_output": true }
    ]
  }
}
```

事件（官方）：
- `pre_read_code` / `post_read_code`
- `pre_write_code` / `post_write_code`
- `pre_run_command` / `post_run_command`
- `pre_mcp_tool_use` / `post_mcp_tool_use`
- `pre_user_prompt`
- `post_cascade_response`

本仓库提供了一个可直接参考的示例（不会自动安装）：
- `examples/windsurf-hooks/hooks.json`
- `examples/windsurf-hooks/scripts/guard.js`

说明：
- 用法：把 `examples/windsurf-hooks/hooks.json` 复制到上述任意一个 hooks.json 位置，并把 `command` 里的 `/ABSOLUTE/PATH/...` 改成你本机的绝对路径。
- 该示例用 `pre_run_command`/`pre_write_code` 阻止典型危险操作；用 `post_cascade_response` 在遗漏 `ask_continue` 时给出警告（不阻止）。
- Hooks 以当前用户权限执行，风险很高：请使用绝对路径、验证输入 JSON、避免把密钥写入日志。
- “禁用/卸载扩展”联动：示例脚本会读取 `mcp_config.json` 并探测 `http://localhost:<port>/health`；如果 `windsurf_auto_mcp` 未配置/被禁用/服务不可达（例如扩展已禁用或卸载），脚本会直接退出 0，不再阻止/审计任何动作。
- windsurf-next：官方文档目前只写了 `windsurf` 路径；如果你使用 windsurf-next 且 user-level hooks 不生效，可尝试把用户级路径改成 `~/.codeium/windsurf-next/hooks.json`（与 `mcp_config.json` 的路径规律一致，非官方保证）。

### 快捷键

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+M` | 切换对话框显示/隐藏 |

### MCP 工具

| 工具 | 说明 |
|------|------|
| `ask_continue` | 任务完成后询问用户是否继续 |
| `ask_user` | 请求用户输入，支持图片上传 |
| `notify` | 发送通知消息 |

### 配置选项

在设置中搜索 `mcpService`:

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `mcpService.port` | 3456 | MCP 服务器端口 |
| `mcpService.autoStart` | true | 启动时自动运行服务器 |
| `mcpService.language` | zh | 界面语言（`zh`/`en`） |
| `mcpService.defaultReason` | 空 | `ask_continue` 未提供 reason 时使用的默认原因 |

## 工作原理

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Windsurf AI   │ ──── │  WindsurfAutoMcp │ ──── │    用户界面     │
│  (Cascade)      │ MCP  │   (HTTP Server)  │      │  (对话框/面板)  │
└─────────────────┘      └──────────────────┘      └─────────────────┘
```

1. AI 完成任务后调用 `ask_continue` 工具
2. 扩展弹出对话框询问用户
3. 用户可以选择继续并提供新指令
4. 响应返回给 AI 继续工作

## 常见问题

<details>
<summary><strong>安装后没有看到 WindsurfAutoMcp 图标？</strong></summary>

1. 确保已完全重启 Windsurf/VS Code
2. 检查扩展是否已启用：`Ctrl+Shift+X` → 搜索 "WindsurfAutoMcp"
3. 尝试禁用后重新启用扩展
</details>

<details>
<summary><strong>提示"端口被占用"？</strong></summary>

1. 扩展会自动尝试下一个可用端口
2. 或在设置中修改 `mcpService.port` 为其他端口（如 3457）
</details>

<details>
<summary><strong>Windsurf 中 AI 无法调用 MCP 工具？</strong></summary>

1. 确保点击了 **写入 Windsurf 配置** 按钮
2. **必须重启 Windsurf** 才能生效
3. 检查状态栏是否显示 `MCP: 3456`（服务器运行中）
4. 查看输出面板确认无错误：`Ctrl+Shift+U` → 选择 "WindsurfAutoMcp"
</details>

<details>
<summary><strong>对话框不弹出？</strong></summary>

1. 按 `Ctrl+M` 手动打开对话框
2. 确保 AI 确实调用了 `ask_continue` 工具
</details>

<details>
<summary><strong>误选了图片，发送前能删除吗？</strong></summary>

可以。对话框里图片预览右上角有 **×** 按钮，点击即可移除该图片后再提交。
</details>

<details>
<summary><strong>为什么现在不需要每次新对话粘贴提示语？</strong></summary>

建议将提示语添加到 Windsurf 的全局规则中（这样每次新对话无需重复粘贴）。如果不方便，也可以每次新对话先发一次提示语给 AI。
</details>
<details>
<summary><strong>如何修改快捷键？</strong></summary>

默认快捷键是 `Ctrl+M`，如需修改：
1. 打开 VS Code 设置 → 键盘快捷方式
2. 搜索 `mcpService.toggleDialog`
3. 修改为您喜欢的快捷键
</details>

<details>
<summary><strong>如何查看服务器日志？</strong></summary>

1. 按 `Ctrl+Shift+U` 打开输出面板
2. 在下拉菜单中选择 **WindsurfAutoMcp**
</details>

<details>
<summary><strong>如何完全卸载？</strong></summary>

1. `Ctrl+Shift+X` → 搜索 "WindsurfAutoMcp" → 卸载
2. 删除配置文件（可选）：
   - Windows: `%USERPROFILE%\.codeium\windsurf\mcp_config.json` / `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json`
   - macOS/Linux: `~/.codeium/windsurf/mcp_config.json` / `~/.codeium/windsurf-next/mcp_config.json`
</details>

## 从源码构建

```bash
# 克隆仓库
git clone https://github.com/JiXiangKing80/windsurf-auto-mcp.git
cd windsurf-auto-mcp

# 安装依赖（需要 Node.js 16+）
# 安装依赖（推荐 Node.js 18+）
npm ci

# 编译
npm run compile

# 打包
npm run package
```

### 用 GitHub Actions 构建 VSIX（推荐）

本仓库包含一个构建工作流：push 到 `feature` 分支或对 `main` 提 PR 时，会自动产出 `.vsix` artifact，可直接下载测试。

## 贡献

欢迎提交 Issue 和 Pull Request！详见 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

本项目采用 [MIT License](LICENSE) 开源协议，**完全免费**，可自由使用、修改和分发。

## 版本历史

### v1.0.1
- ✨ 支持在继续对话/输入窗口上传多张图片

### v1.0.0
- 🎉 初始版本发布
- HTTP 模式 MCP 服务器
- 任务完成确认功能
- 图片上传支持
- 快捷键切换对话框（Ctrl+M）
- 一键配置 Windsurf
