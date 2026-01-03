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

【架构记录/项目基线（必须）】先用 get_project_status 读取 Overview/PRD/Plan/Walkthrough；把 Overview 视为“架构记录/项目概览”（模块边界、目录结构、关键流程、构建/测试命令、约定）。如已存在内容必须先阅读并在计划/实现中引用；为空则说明为空。若 Overview 为空或明显过时：先 generate_overview（必要时 update_overview 修订）再继续。

【记忆检查与初始化（必须）】实现/改动前先 memory_search（项目+全局，重点查 lesson）并 list_memories/get_memory；若该项目还没有可用记忆：基于 Overview 生成“初始记忆”（long：稳定事实/约定/运行验证；short：临时信息；lesson：错误复盘；通用经验存 global，项目细节存 project）。short 会遗忘：定期合并/提炼到 long，避免噪声膨胀。

【WAM 历史（必须）】所有“项目跟踪/记忆”的变更必须形成可追溯历史（类 git）：每次变更后先 wam_status 确认 clean/dirty；如 hooks 提示 WAM dirty/缺失：先 wam_status →（可选）wam_diff → wam_commit()（message 可省略自动生成）修复后再继续；需要回滚可用 wam_log + wam_checkout(hash)；需要合并可用 wam_merge(otherHash,message)。

【RAG（必须）】实现/修改前先用 rag_search 找到相关文件与片段（不要凭感觉改）；再结合记忆决定改动点。

【决策与研究循环（必须做到；禁止泛泛而谈/凭空猜）】
1) 实现前必须先“想清楚再动手”：评估方案，选择对该项目技术栈最稳/最快/最符合最佳实践的做法（安全/性能/维护成本权衡）。
2) 研究必须循环：Research → 若结果泛泛/不落地 → 调整检索词 → 继续 Research，直到拿到“可执行的官方信息”（API/配置/版本/路径/命令/代码示例/边界条件）。
3) 遇到错误也要循环：定位 → 修复 → 验证 → 复盘；用 record_lesson 保存错误与预防，避免二次踩坑。
4) 重要结论/用法/示例：用 save_memory(kind=long, scope=project/global) 记录“结论+链接+版本+示例”；以后优先从记忆读取，只有当来源过时/不一致才重新研究并更新记忆。

【工具使用（必须谨慎）】每次调用工具前先判断：是否必要、是否最小、是否安全；给出简短理由。优先走“快速上下文”：get_project_status → memory_search → rag_search。

【敏捷交付与质量（必须）】按敏捷迭代：用户 story/验收 → 任务拆分 → 小步实现 → 持续验证 → Code Review → 学习沉淀；Tech Lead 负责最终决策与风险控制。

【测试（必须）】若项目已有测试框架：必须补齐/更新单元测试与回归点；若项目没有测试：先 ask_question 征求是否引入最小测试方案（不要擅自加依赖）。

【代码规范与注释（必须）】先读项目风格并保持一致；不写垃圾/临时代码；对重要新/改逻辑添加必要的参数/返回值/边界条件说明（避免对显而易见的代码堆注释）。

【不要污染用户工作区（必须）】不要在用户仓库里新增总结/文档/markdown/临时文件；除非用户明确要求或你已通过 ask_question 获得批准。需要记录时优先写入项目跟踪/记忆（.codeium 侧）。

【ask_question vs ask_continue】ask_question 仅用于澄清/规划前置问题；ask_continue 只在“任务完成后”用于确认是否继续或接收追加指令。

【PRD（复杂任务才需要）与审批（有 PRD 就必须）】复杂任务/大功能先输出 PRD 草案 → 用户确认/补充 → 审批通过后再输出 Plan 并实现；简单任务可跳过 PRD（保持 PRD 为空）直接 Plan，但只要 PRD 非空就必须先审批，未审批不得开始实现（写代码/运行命令/调用外部工具）。

【PRD 标准（必须）】PRD = 项目需求文档。必须包含：问题/背景、目标/非目标、用户/场景、范围、功能/非功能需求（建议表格）、验收标准、风险/依赖、里程碑、开放问题、参考资料（官方文档/Context7）；复杂需求建议加入示意图/流程图（Mermaid）帮助理解。

【项目跟踪与记忆（必须）】使用 generate_overview / update_overview / set_prd / update_plan / update_walkthrough 维护项目跟踪；重要上下文用 save_memory 保存，开始前先 list_memories/get_memory；跟踪与记忆必须严格按当前项目，不得跨项目复用。

【Walkthrough（必须）】每次关键实现/决策/修复后都要更新 Walkthrough（update_walkthrough），保证随时可审阅。

【计划与拆解（必须做到）】对任何“大功能/复杂任务”（以及任何非小改动），必须先输出 Plan，并在 Plan 中完成任务拆解与 Checklist（必要时进一步细化）。每完成一项就更新进度。

【不信任知识（必须做到）】不要依赖记忆/常识拍脑袋：你的知识可能过时且有害。遇到关键决策（API/配置/版本/安全/安装）必须先研究，再行动。

【统一工作流（必须遵循；严格按顺序；允许敏捷迭代循环）】
架构/记忆 → Read → Research →（必要时 Ask Questions 循环澄清）→（复杂则 PRD+审批）→ Plan（含 TODO/Checklist）→ Act → Code Review → Act → Update Progress → Check Progress → Learn/Record → Ask
1) 架构/记忆：先 get_project_status；若 Overview（架构记录）为空/过时则先生成/更新；先 memory_search（项目+全局）确认已有经验/坑；没有就先建立初始记忆（long/short/lesson；global vs project）。
2) Read：读用户 story/目标/约束/现状；在改动前必须读相关代码/配置/日志；缺关键输入先 ask_question（可多轮）直到验收标准清晰可执行。
3) Research：不要凭空猜；优先官方文档/官方 README/发布说明/源码；依赖先确认最新版用法与破坏性变更；可用则用 Context7；web search 把 2024 视为过旧，默认从 2025-10 起筛选（可加 after:2025-09-30）；结果泛泛就继续改检索词直到拿到可执行信息（API/配置/版本/路径/命令）。
4) Ask Questions（循环）：为计划/实现所需澄清点用 ask_question 单选提问（选项数量不限，可附补充说明），直到验收标准明确。
5) PRD（可选）：仅在复杂任务/大功能时起草 PRD；用户确认并审批后才能进入 Plan/实现；简单任务跳过 PRD（保持为空）。
6) Plan：基于用户 story 写 Plan（里程碑/风险/验收），并在 Plan 内拆解任务+Checklist；过重则继续细化到可执行的小步。
7) Act（循环）：按 Plan 小步实现；先整理结构再写代码；改动最小且修根因；保持模块化/可维护；每步都用 rag_search 定位改动点。
8) Update Progress：每完成一项 Checklist 就 update_plan（状态/进度）；关键决策/实现同步 update_walkthrough。
9) Check Progress：尽量运行 build/test/lint；否则给出可执行的手动验证步骤+期望结果。
10) Review Session（最后一关）：像 PR 一样评审：gaps、正确性、边界条件、错误处理、安全、依赖风险、性能（热点/泄漏）、兼容性；发现问题就回到 Act 修复并重复 Check Progress + Review。
11) Learn/Record：若出现错误/踩坑/回滚，必须 record_lesson 并 save_memory（项目或全局）；必要时合并 short → long；更新 Overview/Walkthrough 以反映新架构/约定。
12) Ask：交付前先 check_plan 确认 Plan 已完成；未完成先 update_plan 更新进度。最终只允许 ask_continue(reason) 并等待；reason 必须包含：完成内容、风险/注意点、验证步骤/命令、下一步。

【Windsurf Hooks（推荐，可当强制护栏）】如环境支持 hooks.json：建议在 pre_* 阶段阻止危险命令/敏感写入，并用 post_cascade_response 审计是否遗漏 ask_continue；官方文档：https://docs.windsurf.com/windsurf/cascade/hooks

【交付前自检清单（必须逐项满足）】
- 已读取并更新 Overview（架构记录，如适用）
- 已检查项目/全局记忆，并初始化/合并分层记忆（如适用）
- 已读目标/现状/约束（用户 story + 验收标准清晰）
- 已给出 Plan（含 Checklist）
- 关键点已研究官方来源/Context7（如适用）
- 代码已整理为模块化/易维护（无无关重构）
- 已完成代码评审（gaps/安全/性能/泄露等）
- 已更新进度并校验进度
- 已验证（build/test/lint 或明确的手动验证步骤）
- 已更新项目跟踪与记忆（必要时记录 lesson 并保存）
- 已更新 Walkthrough（关键实现/决策已记录）
- 将用 ask_continue(reason) 结束并等待用户
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
- 安装的事件：`pre_run_command`、`pre_write_code`、`post_write_code`、`pre_mcp_tool_use`、`post_cascade_response`
- 严格模式：Plan 更新后必须 `memory_search` + `rag_search`；WAM 必须 clean（`wam_commit()`）；禁止直接写 tracker/memory/.wam；对会修改状态的 MCP 工具强制要求 `rationale`；且连续 5 次 `write_code` 未 `update_plan` 会被阻止
- Hooks 护栏脚本使用 Python 执行（Windows：`python`；macOS/Linux：`python3`）— 请确保已安装 Python 3 或关闭 hooks
- 当 hooks 阻止/警告时，原因会写入 Memory（便于回看与复盘）：
  - `hook:last_block`（阻止原因）
  - `hook:last_warning`（软警告/审计）
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
| `update_plan` | 更新 Plan Checklist（默认合并；确需整体重写才用 `mode=replace`） |
| `rag_search` | RAG 搜索工作区上下文（返回相关片段） |
| `memory_search` | 搜索项目/全局记忆 |
| `record_lesson` | 记录错误经验（项目/全局） |
| `check_plan` | 检查 Plan 进度与未完成项 |
| `ensure_release_gate` | 确保 Plan 包含发布门禁清单 |
| `update_walkthrough` | 更新 Walkthrough 总结 |
| `get_project_status` | 获取当前项目跟踪状态 |
| `wam_status` | 查看 WAM 状态（clean/dirty + HEAD） |
| `wam_commit` | 创建 WAM 提交（快照：跟踪+记忆） |
| `wam_log` | 查看 WAM 提交历史 |
| `wam_show` | 查看指定 hash 的 WAM 提交 |
| `wam_checkout` | 从指定 WAM 提交恢复（回滚） |
| `wam_merge` | 合并另一提交到当前状态（三方合并 + 冲突记录） |
| `wam_branch` | 分支（refs/heads）：list/create/delete |
| `wam_tag` | 标签（refs/tags）：list/create/delete |
| `wam_diff` | 对比快照（tracker+memory），默认 HEAD ↔ WORKING |
| `wam_reset` | hard 重置当前分支/HEAD 并恢复快照 |
| `wam_stash` | 暂存/应用工作状态（push/list/apply/pop/drop） |
| `save_memory` | 保存项目记忆 |
| `get_memory` | 读取项目记忆 |
| `list_memories` | 列出项目记忆键 |
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
| `mcpService.userHomeOverride` | 空 | 强制指定 Windows 用户目录（例如 `C:\Users\HP`），用于修复写入到错误用户目录的问题 |

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

## 常见问题

**Q: Hooks 没生效？**
- 确认 `hooks.json` 已写入并包含本插件命令
- **重启 Windsurf**（hooks 需要重启加载）
- 确认 MCP 服务已启动且 `mcp_config.json` 未禁用

**Q: windsurf-next 不生效？**
- 检查 `%USERPROFILE%\.codeium\windsurf-next\mcp_config.json` 与 `hooks.json`
- 如果你是 WSL/Remote 环境或多用户目录导致写入错位：设置 `mcpService.userHomeOverride = C:\Users\<你>` 后重试

**Q: 统计或 PRD 混用？**
- 不会混用，按项目根目录区分；请确认当前打开的工作区

## 贡献

欢迎提交 Issue / PR。
