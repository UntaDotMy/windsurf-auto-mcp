# WindsurfAutoMcp

<p align="center">
  <img src="https://img.shields.io/badge/Windsurf-MCP%20自动化-blue?style=for-the-badge" alt="Windsurf MCP 自动化">
  <img src="https://img.shields.io/badge/License-MIT-green?style=for-the-badge" alt="MIT License">
</p>

<p align="center">
  <strong>Windsurf IDE 代理工作流强制执行</strong><br>
  任务完成确认 · 先思考工作流 · 记忆与 RAG · 类 Git 版本控制 (WAM)<br><br>
  🆓 <strong>完全免费 · 开源项目</strong>
</p>

<p align="center">
  <a href="https://github.com/JiXiangKing80/windsurf-auto-mcp">🏠 原始仓库</a> ·
  <a href="https://github.com/UntaDotMy/windsurf-auto-mcp">🔀 Fork</a> ·
  <a href="#安装">📦 安装</a> ·
  <a href="#mcp-工具列表">🛠️ 工具</a> ·
  <a href="#windsurf-hooks">🛡️ Hooks</a>
</p>

**语言:** 中文 | [English](README.md)

<p align="center">
  <a href="#概览">概览</a> •
  <a href="#功能特性">功能特性</a> •
  <a href="#安装">安装</a> •
  <a href="#快速开始">快速开始</a> •
  <a href="#推荐全局规则--提示语">规则</a> •
  <a href="#项目跟踪overview--prd--plan--wam--walkthrough">项目跟踪</a> •
  <a href="#windsurf-hooks">Hooks</a> •
  <a href="#mcp-工具列表">工具列表</a> •
  <a href="#常见问题">FAQ</a>
</p>

---

## 概览

WindsurfAutoMcp 通过 MCP 协议标准化交互：AI 完成任务后必须 `ask_continue`，避免空转消耗；同时提供 PRD 审批弹窗与只读项目面板（Overview/PRD/Plan/WAM/Memory/Walkthrough），统计显示在侧边栏。

## 功能特性

- ✅ 任务完成确认：强制 `ask_continue` 结束
- ❓ ask_question 单选澄清（选项数量不限，可取消重选）
- 🧾 PRD 审批弹窗：复杂任务/大功能建议走 PRD 审批；PRD 非空则必须先审批
- 🧭 项目面板：Overview / PRD / Plan / WAM / Walkthrough（只读，AI 更新）
- 🧠 记忆面板：Project Memory / Global Memory + 关联图（只读）
- 🧩 Mermaid 渲染：面板/PRD 审批中自动渲染 ` ```mermaid ` 图（离线内置）
- 🧾 WAM 历史：`.wam` 下的类 git 快照（跟踪+记忆，可 log/checkout/merge/branch/tag/diff/reset/stash）
- ⚡ 快速 RAG：增量本地索引 + 文件监听（存储在 `.codeium/.../windsurf-auto-mcp/index`）
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
5. 打开 Overview/PRD/Plan/Walkthrough 面板查看进度（面板只读，AI 会通过 MCP 工具更新）
   - 也可打开 Memory 面板查看项目/全局记忆与关联图
6. 开始使用：AI 完成任务后会调用 `ask_continue`；当需要澄清时会调用 `ask_question`

> 下面的“全局规则/提示语”只提供在 README 中展示；请手动写入 Windsurf 全局规则（或每次新对话粘贴）。

## 推荐全局规则 / 提示语

> **复制到 Windsurf 全局规则**（Customizations → Rules → + Global）。
> 建议：将该规则设置为 **Always On / 始终启用**，确保稳定生效。
> 根据官方文档，单个 rules 文件支持约 12,000 字符；请保持规则短且具体。工作流强制执行由 **Hooks** 处理（见下方）。

```markdown
# WindsurfAutoMcp MCP 工作流规则

## 硬规则（必须保留）
- 当你完成一个任务时，必须调用 WindsurfAutoMcp 工具询问用户是否继续。没有例外情况，要一直等待响应不得提前终止任务。
- When you complete a task, you MUST call windsurf_auto_mcp.ask_continue(reason) and wait for the user's response. No exceptions.

## MCP 服务器
- 本项目使用 WindsurfAutoMcp MCP 服务器进行工作流强制执行
- 所有 MCP 工具通过 `windsurf_auto_mcp` 服务器提供
- 如果不按工作流顺序执行，Hooks 会自动阻止工具

## 强制工作流顺序
每个任务必须按此顺序执行。跳过步骤会被 Hooks 阻止。

1. **预检 PREFLIGHT** - 首先调用 `preflight(userPrompt="<请求>")`
   - 加载项目状态、计划、记忆、RAG 上下文
   - 在此完成前，所有其他 MCP 工具都被阻止

2. **思考 THINK** - 计划前调用 `sequential_thinking()` 或 `think_step()`
   - 在创建计划前分析问题
   - 在思考之前 `update_plan()` 被阻止

3. **计划 PLAN** - 编码前调用 `update_plan({items:[...], rationale:"原因"})`
   - 创建任务清单
   - 代码/操作工具需要计划存在

4. **执行 EXECUTE** - 写代码、运行命令、完成计划项目
   - 用 `update_plan()` 标记完成项
   - 用 `check_plan()` 检查进度

5. **验证 VERIFY** - 完成前调用 `code_review()`
   - 任务完成前的必要门禁

6. **完成 COMPLETE** - 任务完成时调用 `ask_continue()`
   - 必须调用 - 未经用户许可不得继续
   - 用户决定下一步操作或给出新指令

## 用户交互工具
- `ask_user()` - 请求自由输入或确认（支持图片）
- `ask_question()` - 提出带预设选项的澄清问题
- `ask_continue()` - 任务完成时必须调用 - 询问用户下一步

## 被阻止时
- 调用 `check_hook_status()` 查看阻止原因
- 按工作流顺序执行：预检 → 思考 → 计划 → 执行 → 验证 → 完成
- 不要在修复顺序之前重试

## MCP 工具参考
| 工具 | 何时使用 |
|------|----------|
| `preflight()` | 第一步 - 在其他工具之前 |
| `sequential_thinking()` | 第二步 - 计划之前 |
| `think_step()` | sequential_thinking 的替代 |
| `update_plan()` | 第三步 - 编码之前 |
| `memory_search()` | 搜索记忆（预检后） |
| `rag_search()` | 搜索代码库（预检后） |
| `code_review()` | 完成前 |
| `ask_continue()` | 最后 - 任务完成时 |
| `check_hook_status()` | 被阻止时 - 查看原因 |
```

## 项目跟踪（Overview / PRD / Plan / WAM / Walkthrough）

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
  - 文件：`overview.md` / `prd.md` / `plan.md` / `walkthrough.md` / `memory.md`（含 `.metadata.json` / `.resolved` / `.resolved.N` 版本快照）
  - `overview.md` 用于“项目概览/架构/上下文”；`plan.md` 仅包含 Plan + Checklist
- WAM（历史快照）存储：
  - 项目级（每个 projectId 一份）：
    - Windows: `%USERPROFILE%\.codeium\windsurf\windsurf-auto-mcp\.wam\<projectId>\`
    - Windows (windsurf-next): `%USERPROFILE%\.codeium\windsurf-next\windsurf-auto-mcp\.wam\<projectId>\`
  - 全局（用于全局记忆）：`%USERPROFILE%\.codeium\windsurf-auto-mcp\.wam\global\`
- RAG 索引（本地缓存；按 projectId）：
  - Windows: `%USERPROFILE%\.codeium\windsurf\windsurf-auto-mcp\index\<projectId>\rag-index.json`
  - Windows (windsurf-next): `%USERPROFILE%\.codeium\windsurf-next\windsurf-auto-mcp\index\<projectId>\rag-index.json`
- `projectId` 会在 `get_project_status` 返回的 JSON 中提供
- 面板为只读，由 AI 通过 MCP 工具更新（Overview/PRD/Plan/WAM/Walkthrough）
- 统计显示在侧边栏（全局调用 + 项目统计）
- PRD 适用于复杂任务/大功能；PRD 非空则会触发审批弹窗，未审批不得实现
- 统计为 **单项目** 级别：Overview/PRD/Plan/Walkthrough 更新计数
- Hooks（强制）在 `pre_write_code` / `pre_run_command` / `pre_mcp_tool_use` 校验：Overview 必须存在 + 项目记忆已初始化 +（PRD 非空需审批）+ Plan 必须存在 + 必须先 `memory_search` + `rag_search`（Plan 更新后需重跑）+ WAM 必须 clean（否则阻止并要求 `wam_commit()`）；并禁止直接写入 tracker/memory/.wam。

### 清理/重置

侧边栏 **Maintenance/清理数据** 提供：
- 清空 Overview/PRD/Plan/Walkthrough（会删除对应 brain 产出文件）
- 重置项目数据（会清空并重置项目统计）

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
- 安装的事件：`pre_user_prompt`、`pre_run_command`、`post_run_command`、`pre_write_code`、`post_write_code`、`pre_mcp_tool_use`、`post_mcp_tool_use`、`post_cascade_response`
- 严格模式：必须有 Plan Checklist（items），且 Plan 必须包含“验证/测试/构建/lint”“依赖/安全扫描（npm audit + OSV/Dependabot）”与“代码审查”门禁（推荐先 `ensure_release_gate` 自动补齐）；Plan 更新后必须 `memory_search` + `rag_search`；WAM 必须 clean（`wam_commit()`）；禁止直接写 tracker/memory/.wam；对会修改状态的 MCP 工具强制要求 `rationale`；且连续 3 次 `write_code` 未 `update_plan` 会被阻止
- 每次新用户输入后（`pre_user_prompt`）：在 `write_code` / `run_command` 前必须先 `preflight(userPrompt=...)`（推荐；一次完成预检），或手动完成：`get_project_status` + `check_plan` + `memory_search` + `rag_search` + `wam_status`
- Hooks 护栏脚本使用 Python 执行（Windows：`python`；macOS/Linux：`python3`）— 请确保已安装 Python 3 或关闭 hooks
- 当 hooks 阻止/警告时，原因会写入 Memory（便于回看与复盘）：
  - `hook:last_block`（阻止原因）
  - `hook:last_warning`（软警告/审计）
  - `hook:last_error`（命令/MCP 工具错误摘要）
- 同时会写入滚动审计日志（脱敏）：`audit.jsonl`（可在侧边栏打开 **Audit** 面板查看）
- 当遇到“命令失败 / MCP 工具报错 / 关键门禁阻止”时，hooks 会自动 `record_lesson(scope=both)` 记录到 **项目 + 全局** 记忆（用于避免重复犯错）
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
| `generate_overview` | 从工作区自动生成 Overview（项目概览/架构/上下文） |
| `update_overview` | 设置/更新 Overview（Markdown） |
| `set_prd` | 创建/更新 PRD 草案 |
| `update_plan` | 更新 Plan Checklist（默认合并；不允许 `mode=replace`） |
| `plan_change_request` | 计划变更请求（强制用户选择：合并 / 替换 / 取消） |
| `rag_search` | RAG 搜索工作区上下文（返回相关片段） |
| `memory_search` | 搜索项目/全局记忆 |
| `memory_hygiene` | 记忆整理：short→long 提升/近重复去重/经验自动链接（可选应用） |
| `record_lesson` | 记录错误经验（项目/全局） |
| `check_plan` | 检查 Plan 进度与未完成项 |
| `ensure_release_gate` | 确保 Plan 包含发布门禁清单 |
| `update_walkthrough` | 更新 Walkthrough 总结 |
| `get_project_status` | 获取当前项目跟踪状态 |
| `preflight` | 运行必需预检（状态/计划/记忆/RAG/WAM）并输出结构化结果 |
| `wam_status` | 查看 WAM 状态（clean/dirty + HEAD） |
| `wam_commit` | 创建 WAM 提交（快照：跟踪+记忆） |
| `wam_log` | 查看 WAM 提交历史 |
| `wam_show` | 查看指定 hash 的 WAM 提交 |
| `wam_verify` | 校验 WAM 完整性（hash 链 + 快照 digest + 可选签名） |
| `wam_checkout` | 从指定 WAM 提交恢复（回滚） |
| `wam_merge` | 合并另一提交到当前状态（三方合并 + 冲突记录） |
| `wam_branch` | 分支（refs/heads）：list/create/delete |
| `wam_tag` | 标签（refs/tags）：list/create/delete |
| `wam_diff` | 对比快照（tracker+memory），默认 HEAD ↔ WORKING |
| `wam_reset` | hard 重置当前分支/HEAD 并恢复快照 |
| `wam_stash` | 暂存/应用工作状态（push/list/apply/pop/drop） |
| `save_memory` | 保存项目记忆 |
|| `get_memory` | 读取项目记忆 |
|| `list_memories` | 列出项目记忆键 |
|| `resolve_library_docs` | 将库名解析为文档ID（先查缓存，再查已知源） |
|| `get_library_docs` | 获取库文档（全局缓存7天） |
|| `sequential_thinking` | 复杂问题结构化思考（阶段: 定义→研究→分析→综合→结论） |
|| `think_step` | 快速记录单个思考步骤（比 sequential_thinking 轻量） |
|| `get_thinking_history` | 获取/清除当前思考会话历史 |
|| `index_codebase` | 深度代码库索引（入口点、约定、技术栈） |
|| `sync_overview` | 概览过时或缺失时重新生成 |
|| `workflow_status` | 获取当前工作流状态和先思考指导 |
|| `check_hook_status` | **操作被阻止时调用** - 显示钩子阻止/警告原因（存储在 Memory 中）|
|| `verify_action` | 验证操作结果并记录到 walkthrough |
|| `code_review` | 记录代码审查结果 |
|| `ask_continue` | 任务完成后询问是否继续 |

## 配置项

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `mcpService.port` | 3456 | MCP HTTP 端口 |
| `mcpService.autoStart` | true | 启动时自动启动服务器 |
|| `mcpService.language` | en | 界面语言 (en/zh) |
| `mcpService.defaultReason` | 空 | ask_continue 默认原因 |
| `mcpService.mode` | http | MCP 服务器模式 |
| `mcpService.autoInstallHooks` | true | 自动安装/更新用户级 hooks.json |
| `mcpService.userHomeOverride` | 空 | 强制指定 Windows 用户目录（例如 `C:\Users\HP`），用于修复写入到错误用户目录的问题 |
| `mcpService.wamSigning` | false | 启用 WAM 提交签名（HMAC-SHA256，用于增强历史可信度） |

## 构建 VSIX（开发者）

```bash
npm ci
npm run compile
npm run package
```

## GitHub Actions 构建（推荐）

- 推送到 `feature` 分支会自动构建 VSIX 并上传为 artifact（见 `.github/workflows/build-vsix.yml`）
- 适合在不本地打包的情况下先验证安装效果
- 下载方式：GitHub → Actions → 选择对应的 workflow run → Artifacts → 下载 `windsurf-auto-mcp-vsix` → 解压得到 `.vsix` → 安装并重启 Windsurf

## 安全/依赖扫描（CI）

- `.github/workflows/security.yml` 会运行：
  - `npm audit --audit-level=high`
  - OSV Scanner（递归扫描仓库依赖/锁文件）
- `dependabot.yml` 会定期检查 npm/GitHub Actions 依赖更新并创建 PR（建议开启）

## 常见问题

**Q: Hooks 没生效？**
- 确认 `hooks.json` 已写入并包含本插件命令
- **重启 Windsurf**（hooks 需要重启加载）
- 确认 MCP 服务已启动且 `mcp_config.json` 未禁用

**Q: windsurf-next 不生效？**
- 检查 `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json` 与 `hooks.json`
- 如果你是 WSL/Remote 环境或多用户目录导致写入错位：设置 `mcpService.userHomeOverride = C:\Users\<你>` 后重试

**Q: 写入 mcp_config.json 失败/提示 JSON 无效？**
- 新版本会自动备份并重写无效的 `mcp_config.json`（同目录会生成 `mcp_config.json.invalid.<timestamp>.bak`）
- 建议检查备份文件内容，确认是否需要手动合并其它 MCP 配置

**Q: 统计或 PRD 混用？**
- 不会混用，按项目根目录区分；请确认当前打开的工作区

## 贡献

欢迎提交 Issue / PR。

## 致谢

- **原作者:** [JiXiangKing80](https://github.com/JiXiangKing80/windsurf-auto-mcp)
- **Fork 与改进:** [UntaDotMy](https://github.com/UntaDotMy/windsurf-auto-mcp)
- **许可证:** MIT
