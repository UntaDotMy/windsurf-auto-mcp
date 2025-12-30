# WindsurfAutoMcp

<p align="center">
  <strong>Windsurf MCP 自动化工具</strong><br>
  任务完成确认 · 用户交互 · 一键配置<br><br>
  🆓 <strong>完全免费 · 开源项目</strong><br>
  <strong>开源地址：</strong> <a href="https://github.com/JiXiangKing80/windsurf-auto-mcp">https://github.com/JiXiangKing80/windsurf-auto-mcp</a>
</p>

**语言 / Language**
- 中文：`README.md`
- English: `README_EN.md`

<p align="center">
  <a href="#概览">概览</a> •
  <a href="#功能特性">功能特性</a> •
  <a href="#安装">安装</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#推荐全局规则--提示语">规则</a> •
  <a href="#项目跟踪prd--task--plan--todo--checklist--walkthrough">项目跟踪</a> •
  <a href="#windsurf-hooks">Hooks</a> •
  <a href="#mcp-工具列表">工具列表</a> •
  <a href="#常见问题">FAQ</a>
</p>

---

## 概览

WindsurfAutoMcp 通过 MCP 协议标准化交互：AI 完成任务后必须 `ask_continue`，避免空转消耗；同时提供 PRD 审批弹窗与只读项目面板（PRD/Plan/Walkthrough），其中 Plan 汇总 Task/TODO/Checklist，统计显示在侧边栏。

## 功能特性

- ✅ 任务完成确认：强制 `ask_continue` 结束
- ❓ ask_question 单选澄清（选项数量不限，可取消重选）
- 🧾 PRD 审批弹窗：未审批不可进入 Plan/实现
- 🧭 项目面板：PRD / Plan / Walkthrough（只读，AI 更新；Plan 汇总 Task/TODO/Checklist）
- 📊 统计显示在侧边栏
- 📊 项目级统计 + Memory 存储
- ⚙️ 一键配置 Windsurf / windsurf-next：写入 MCP 配置
- 🛡️ Hooks 护栏：阻止危险命令/敏感写入（缺失时自动更新）
- 🖼️ 图片上传与删除：发送前可移除
- 🌐 中英双语界面
- ⌨️ 快捷键：`Ctrl+M` 打开对话框

## 系统要求

| 要求 | 说明 |
|------|------|
| Windsurf / VS Code | 1.80.0 或更高版本 |
| Node.js | 不需要（扩展已打包） |

## 安装

### 方法一：从 Release 下载（推荐）

1. 从 [Releases](https://github.com/JiXiangKing80/windsurf-auto-mcp/releases) 下载最新 `.vsix`
2. 打开 Windsurf/VS Code
3. `Ctrl+Shift+P` → `Extensions: Install from VSIX...`
4. 选择 `.vsix`
5. **重启 Windsurf/VS Code**

### 方法二：拖拽安装

1. 打开扩展面板（`Ctrl+Shift+X`）
2. 将 `.vsix` 拖入扩展面板
3. **重启 Windsurf/VS Code**

## 快速开始

1. 安装扩展后，打开侧边栏 **WindsurfAutoMcp**
2. 确认服务器已启动（默认自动启动）
3. 点击 **写入 Windsurf 配置**（会同时写入 `%USERPROFILE%\.codeium\windsurf\mcp_config.json` 与 `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json`）
4. **重启 Windsurf** 使 MCP 配置与 Hooks 生效
5. 打开 PRD/Plan/Walkthrough 面板查看进度（面板只读，AI 会通过 MCP 工具更新；Plan 汇总 Task/TODO/Checklist）
6. 开始使用：AI 完成任务后会调用 `ask_continue`；当需要澄清时会调用 `ask_question`

> 下面的“全局规则/提示语”只提供在 README 中展示；请手动写入 Windsurf 全局规则（或每次新对话粘贴）。

## 推荐全局规则 / 提示语

> 必须以“任务完成后调用 ask_continue”开头（第一条为硬规则）。

```text
【最高优先级 / 硬规则】当你判断“任务已完成/准备交付”时：不要直接输出最终答复；必须调用 WindsurfAutoMcp 的 ask_continue，并在 reason 中写清：完成内容、风险/注意点、验证步骤/命令、下一步。

【完成协议（必须遵守）】
1) 完成时只允许：调用 ask_continue（携带 reason）。
2) 调用 ask_continue 后必须停止输出并等待用户回复。
3) 如果你忘记调用 ask_continue：下一条消息必须先调用 ask_continue 纠正（再等待），不要继续输出交付内容。

【团队协作（必须做到）】你现在扮演一个“完整的软件工程部门”（跨职能团队）协作完成任务，适用于任何语言/框架/平台；对外输出必须统一、简洁，但体现“跨角色协同结论”。

【团队角色（内部协作）】
- 需求负责人（PM）：澄清目标、范围、验收标准、约束与优先级。
- 技术负责人（Tech Lead）：制定方案与里程碑，控制复杂度与风险，保证可维护性。
- 架构/平台（Architect）：界定模块边界、接口契约、扩展性与兼容性。
- 开发工程师（Dev）：实现最小正确改动，遵循项目规范，避免不必要的重构。
- 测试/质量（QA）：设计验证步骤与回归点，优先运行已有测试/构建，必要时补测试。
- 安全（Security）：检查输入/输出边界、权限、注入、依赖风险、敏感信息泄露。
- 性能（Perf）：识别热点与不必要开销，避免引入明显性能退化。
- 文档（Docs）：更新 README/配置/使用说明，确保用户能按步骤复现。
- 发布/运维（Release/DevOps）：给出升级/回滚说明，避免破坏性变更。

【开始前必须做】先读“目标/现状/约束”。在做任何修改前，必须先阅读目标文件/相关代码/配置/日志；不确定点必须用 ask_question 按需提问（单选，选项数量不限，可附补充信息）。

【ask_question vs ask_continue】ask_question 仅用于澄清/规划前置问题；ask_continue 只在“任务完成后”用于确认是否继续或接收追加指令。

【PRD 与审批（必须）】先输出 PRD 草案 → 用户确认/补充 → 审批通过后才能输出 Plan；未审批不得开始实现（写代码/运行命令/调用外部工具）。

【计划与拆解（必须做到）】对任何“大功能/复杂任务”（以及任何非小改动），必须先输出 Plan，并在 Plan 中包含 Task/子任务/TODO/Checklist（必要时按任务拆分）。每完成一项就更新进度。

【不信任知识（必须做到）】不要依赖记忆/常识拍脑袋：你的知识可能过时且有害。遇到关键决策（API/配置/版本/安全/安装）必须先研究，再行动。

【统一工作流（必须遵循；严格按顺序）】
Read → Research → Plan → TODO → Act → Code Review → Act → Update Progress → Check Progress → Ask
1) Read：先读目标/现状/约束；在做任何修改前先阅读目标文件/相关代码/配置/日志；缺关键输入先用 ask_question 按需提问。
2) Research：不要凭空猜，必须拿到可执行信息（官方文档/README/发布说明/源码优先；依赖先确认最新版与破坏性变更；可用则用 Context7 获取最新文档；web search 把 2024 视为过旧，默认从 2025-10 起筛选，必要时加 after:2025-09-30；结果泛泛就调整检索词继续搜直到拿到确切 API/配置/版本/路径/命令）。
3) Plan：给出总体 Plan（里程碑/风险/验收）。
4) TODO：把 Plan 拆成可验证、可跟踪的小 TODO（能并行则并行）。
5) Act：动手前先整理入口与模块边界、清理结构；实现最小正确改动，小步推进、优先修根因、保持风格一致；代码必须模块化、易读、易维护（避免无关重构）。
6) Code Review：像 PR 一样评审：检查 gaps、正确性、边界条件、错误处理、安全（注入/权限/泄露/依赖风险）、性能（热点/泄漏）、兼容性。
7) Act：根据评审结论修补问题；必要时补测试/回归点。
8) Update Progress：每完成一个 TODO 就更新进度，说明做了什么/为什么。
9) Check Progress：运行 build/test/lint；无法运行则给出可执行验证步骤与期望结果。
10) Ask：最终只允许调用 ask_continue(reason) 并等待；reason 必须包含：完成内容、风险/注意点、验证步骤/命令、下一步。

【Windsurf Hooks（推荐，可当强制护栏）】如环境支持 hooks.json：建议在 pre_* 阶段阻止危险命令/敏感写入，并用 post_cascade_response 审计是否遗漏 ask_continue；官方文档：https://docs.windsurf.com/windsurf/cascade/hooks

【交付前自检清单（必须逐项满足）】
- 已读目标/现状/约束
- 已给出 Plan + TODO（如适用）
- 关键点已研究官方来源/Context7（如适用）
- 代码已整理为模块化/易维护（无无关重构）
- 已完成代码评审（gaps/安全/性能/泄露等）
- 已更新进度并校验进度
- 已验证（build/test/lint 或明确的手动验证步骤）
- 将用 ask_continue(reason) 结束并等待用户
```

## 项目跟踪（PRD / Plan / Walkthrough）

- 跟踪按 **项目根目录** 存储，不会混用其它项目数据
- 跟踪文件（用户级）：
  - Windows: `%USERPROFILE%\.codeium\windsurf\windsurf-auto-mcp-tracker.json`
  - Windows (windsurf-next): `%USERPROFILE%\.codeium\windsurf-next\windsurf-auto-mcp-tracker.json`
- Memory 文件（用户级）：
  - Windows: `%USERPROFILE%\.codeium\windsurf\windsurf-auto-mcp-memories.json`
  - Windows (windsurf-next): `%USERPROFILE%\.codeium\windsurf-next\windsurf-auto-mcp-memories.json`
- 项目产出（brain）存储：
  - Windows: `%USERPROFILE%\.codeium\windsurf\windsurf-auto-mcp\brain\<projectId>\`
  - Windows (windsurf-next): `%USERPROFILE%\.codeium\windsurf-next\windsurf-auto-mcp\brain\<projectId>\`
  - 文件：`prd.md` / `implementation_plan.md` / `task.md` / `walkthrough.md` / `memory.md`（含 `.metadata.json` / `.resolved` / `.resolved.N` 版本快照）
- `projectId` 会在 `get_project_status` 返回的 JSON 中提供
- 面板为只读，由 AI 通过 MCP 工具更新（PRD/Plan/Walkthrough）；Plan 汇总 Task/TODO/Checklist
- 统计显示在侧边栏（全局调用 + 项目统计）
- PRD 由 AI 生成并触发审批弹窗；未审批无法进入 Plan/实现
- 统计为 **单项目** 级别：PRD 更新/审批、Task/Plan/TODO/Checklist 更新
- Hooks 在 `pre_write_code` 会校验 PRD 审批 + Plan/TODO 是否已建立，否则阻止写入

## Windsurf Hooks

### 路径（官方文档）

- 系统级：
  - Windows：`C:\ProgramData\Windsurf\hooks.json`
  - macOS：`/Library/Application Support/Windsurf/hooks.json`
  - Linux/WSL：`/etc/windsurf/hooks.json`
- 用户级：
  - Windows：`%USERPROFILE%\.codeium\windsurf\hooks.json`
  - macOS/Linux：`~/.codeium/windsurf/hooks.json`
- 工作区级：`.windsurf/hooks.json`

> 官方文档目前只写 `windsurf` 路径；windsurf-next 的 MCP 配置实际使用 `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json`。本扩展会按相同规律写入 `%USERPROFILE%\.codeium\windsurf-next\hooks.json`（推断支持）。

### 自动安装规则

- 扩展激活时会检查并安装 **用户级 hooks.json**（默认开启）
- 已安装但缺失项会自动补齐（相当于更新到最新）
- 不覆盖你已有 hooks，仅追加缺失项
- **更新 hooks.json 后需重启 Windsurf 才会生效**

### 卸载

- 命令面板运行 `WindsurfAutoMcp: Uninstall Hooks / 卸载 Hooks`
- 或手动从 hooks.json 删除对应 `command`

### 失效联动

- hook 脚本会读取 `mcp_config.json` 并探测 `http://localhost:<port>/health`
- 如果 `windsurf_auto_mcp` 未配置/被禁用/服务不可达，脚本会直接退出 0（不阻止/审计）

## MCP 工具列表

| 工具 | 说明 |
|------|------|
| `ask_user` | 请求用户输入/确认（支持图片） |
| `ask_question` | 单选澄清问题（选项数量不限，可附补充文本/图片） |
| `set_prd` | 创建/更新 PRD 草案 |
| `approve_prd` | 审批 PRD |
| `update_task` | 设置/更新任务清单 |
| `update_plan` | 设置/更新计划清单 |
| `update_todos` | 设置/更新 TODO 清单 |
| `update_checklist` | 设置/更新交付检查清单 |
| `update_walkthrough` | 更新 Walkthrough 总结 |
| `get_project_status` | 获取当前项目跟踪状态 |
| `save_memory` | 保存项目记忆 |
| `get_memory` | 读取项目记忆 |
| `list_memories` | 列出项目记忆键 |
| `notify` | 通知消息 |
| `ask_continue` | 任务完成后询问是否继续 |

## 配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `mcpService.port` | 3456 | MCP HTTP 端口 |
| `mcpService.autoStart` | true | 启动时自动启动服务器 |
| `mcpService.language` | zh | 界面语言 |
| `mcpService.defaultReason` | 空 | ask_continue 默认原因 |
| `mcpService.mode` | http | MCP 服务器模式 |
| `mcpService.autoInstallHooks` | true | 自动安装/更新用户级 hooks.json |

## 常见问题

**Q: Hooks 没生效？**
- 确认 `hooks.json` 已写入并包含本插件命令
- **重启 Windsurf**（hooks 需要重启加载）
- 确认 MCP 服务已启动且 `mcp_config.json` 未禁用

**Q: windsurf-next 不生效？**
- 检查 `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json` 与 `hooks.json`

**Q: 统计或 PRD 混用？**
- 不会混用，按项目根目录区分；请确认当前打开的工作区

## 贡献

欢迎提交 Issue / PR。
