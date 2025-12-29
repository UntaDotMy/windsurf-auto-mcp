/**
 * WindsurfAutoMcp 扩展主入口
 * Windsurf MCP 自动化工具 - 任务完成确认、用户交互、一键配置
 */

import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

type UiLanguage = 'zh' | 'en';
type ChoiceQuestion = {
    id?: string;
    prompt?: string;
    options: string[];
};
type TrackerItemStatus = 'todo' | 'doing' | 'done';
type TrackerItem = {
    id: string;
    text: string;
    status: TrackerItemStatus;
    updatedAt: string;
};
type ProjectTrackerStats = {
    prdUpdates: number;
    prdApprovals: number;
    planUpdates: number;
    todoUpdates: number;
    checklistUpdates: number;
    updatedAt?: string;
};
type ProjectTracker = {
    rootPath: string;
    name: string;
    prd: {
        content: string;
        status: 'draft' | 'approved';
        approvedBy?: string;
        approvedAt?: string;
        updatedAt?: string;
    };
    plan: { items: TrackerItem[] };
    todos: { items: TrackerItem[] };
    checklist: { items: TrackerItem[] };
    stats: ProjectTrackerStats;
    updatedAt: string;
};
type TrackerData = {
    schemaVersion: 1;
    activeProject?: string;
    projects: Record<string, ProjectTracker>;
};

const I18N: Record<UiLanguage, Record<string, string>> = {
    zh: {
        // Extension host
        'ext.activating': 'WindsurfAutoMcp 扩展正在激活...',
        'ext.activated': 'WindsurfAutoMcp 扩展激活完成',
        'ext.deactivated': 'WindsurfAutoMcp 扩展已停用',
        'ext.serverAlreadyRunning': '服务器已在运行',
        'ext.serverStarted': 'MCP服务器已启动，端口: {port}',
        'ext.portInUseTry': '端口被占用，尝试端口: {port}',
        'ext.serverStopped': 'MCP服务器已停止',
        'ext.portUpdatedRestart': '端口已更新为 {port}，重启服务器后生效',
        'ext.settingsSaved': '设置已保存',
        'ext.noPendingRequests': '当前没有待处理的对话请求。AI 需要先调用 ask_continue 工具。',
        'ext.noPendingRequestsShort': '当前没有待处理的对话请求',
        'ext.defaultsRestored': '已恢复默认设置',
        'ext.configuredWindsurf': 'WindsurfAutoMcp 已配置到 Windsurf/Windsurf-next (端口: {port})',
        'ext.statsTitle': 'WindsurfAutoMcp 统计:\n',
        'ext.statsLineTotal': '总调用: {total}\n',
        'ext.statsLineAskUser': 'ask_user: {askUser}\n',
        'ext.statsLineAskContinue': 'ask_continue: {askContinue}\n',
        'ext.statsLineNotify': 'notify: {notify}\n',
        'ext.statsLineUploads': '图片上传: {uploads}\n',
        'ext.statsLineUptime': '运行时间: {uptime} 分钟',
        'ext.workspaceRequired': '请先打开一个工作区',
        'ext.statusTooltipRunning': 'WindsurfAutoMcp 运行中 - 端口 {port}\n调用次数: {calls}',
        'ext.statusTooltipStopped': 'WindsurfAutoMcp 已停止',
        'ext.statusTextStopped': '$(server) MCP: 停止',
        'ext.invalidConfigJson': '配置文件 JSON 无效: {path}。请修复 JSON（或删除文件以重新生成）后重试。原始错误: {error}',
        'ext.hooksInstalled': 'Hooks 已安装/更新（Windsurf / windsurf-next）',
        'ext.hooksAlreadyInstalled': 'Hooks 已是最新，无需更新',
        'ext.hooksInstallFailed': '安装 Hooks 失败',
        'ext.hooksUninstalled': 'Hooks 已卸载（已从 hooks.json 移除并删除脚本）',
        'ext.hooksUninstallFailed': '卸载 Hooks 失败',
        'ext.invalidHooksJson': 'hooks.json JSON 无效: {path}。请修复 JSON 后重试。原始错误: {error}',
        'ext.choiceRequired': '请先选择一个选项',

        // Tool responses
        'tool.confirmYes': '是',
        'tool.confirmNo': '否',
        'tool.userChoice': '用户选择: {choice}',
        'tool.userChoices': '用户选择:',
        'tool.userConfirmed': '用户已确认',
        'tool.userCanceled': '用户取消了操作',
        'tool.userInput': '用户输入: {text}',
        'tool.userUploadedImages': '[用户上传了图片 x{count}]',
        'tool.userEmpty': '用户提交了空内容',
        'tool.userContinue': '用户选择继续。',
        'tool.newInstruction': '\n新指令: {instruction}',
        'tool.userEnd': '用户选择结束对话。',

        // Webview (shared)
        'ui.lang.zh': '中文',
        'ui.lang.en': 'EN',
        'ui.lang.toggleToZh': '切换到中文',
        'ui.lang.toggleToEn': 'Switch to English',

        // Sidebar
        'sidebar.openSourceTitle': '开源与免费',
        'sidebar.openSourceDesc': '本插件完全免费。开源地址：',
        'sidebar.openGithub': '打开 GitHub',
        'sidebar.copyLink': '复制链接',
        'sidebar.serverTitle': '服务器',
        'sidebar.running': '运行中',
        'sidebar.stopped': '已停止',
        'sidebar.port': '端口',
        'sidebar.start': '启动',
        'sidebar.stop': '停止',
        'sidebar.restart': '重启',
        'sidebar.chatTitle': '对话',
        'sidebar.openDialog': '打开对话窗口',
        'sidebar.shortcut': '快捷键:',
        'sidebar.promptTitle': '提示语',
        'sidebar.promptText': '硬规则：完成任务时必须调用 ask_continue。',
        'sidebar.promptCopyText': [
            '【最高优先级 / 硬规则】当你判断“任务已完成/准备交付”时：不要直接输出最终答复；必须调用 WindsurfAutoMcp 的 ask_continue，并在 reason 中写清：完成内容、风险/注意点、验证步骤/命令、下一步。',
            '',
            '【完成协议（必须遵守）】',
            '1) 完成时只允许：调用 ask_continue（携带 reason）。',
            '2) 调用 ask_continue 后必须停止输出并等待用户回复。',
            '3) 如果你忘记调用 ask_continue：下一条消息必须先调用 ask_continue 纠正（再等待），不要继续输出交付内容。',
            '',
            '【团队协作（必须做到）】你现在扮演一个“完整的软件工程部门”（跨职能团队）协作完成任务，适用于任何语言/框架/平台；对外输出要简洁一致，但要体现“协同结论”。',
            '',
            '【开始前必须做】先读“目标/现状/约束”。在做任何修改前，必须先阅读目标文件/相关代码/配置/日志；缺关键输入先用 ask_question 提问（单选 A/B/C，可附补充信息）。',
            '',
            '【PRD 与审批（必须）】先输出 PRD 草案 → 用户确认/补充 → 审批通过后才能输出 Plan；未审批不得开始实现（写代码/运行命令/调用外部工具）。',
            '',
            '【计划与拆解（必须做到）】对任何“大功能/复杂任务”（以及任何非小改动），必须先输出 Plan，并拆成 TODO 小任务（每项可验证、可跟踪、可并行）。每完成一项就更新进度并同步项目跟踪。',
            '',
            '【不信任知识（必须做到）】不要依赖记忆/常识拍脑袋：你的知识可能过时且有害。遇到关键决策（API/配置/版本/安全/安装）必须先研究，再行动。',
            '',
            '【团队角色（内部协作）】',
            '- 需求负责人（PM）：澄清目标、范围、验收标准、约束与优先级。',
            '- 技术负责人（Tech Lead）：制定方案与里程碑，控制复杂度与风险，保证可维护性。',
            '- 架构/平台（Architect）：界定模块边界、接口契约、扩展性与兼容性。',
            '- 开发工程师（Dev）：实现最小正确改动，遵循项目规范，避免不必要的重构。',
            '- 测试/质量（QA）：设计验证步骤与回归点，优先运行已有测试/构建，必要时补充测试。',
            '- 安全（Security）：检查输入/输出边界、权限、注入、依赖风险、敏感信息泄露。',
            '- 性能（Perf）：识别热点与不必要开销，避免引入明显性能退化。',
            '- 文档（Docs）：更新 README/配置/使用说明，确保用户能按步骤复现。',
            '- 发布/运维（Release/DevOps）：给出升级/回滚说明，避免破坏性变更。',
            '',
	            '【统一工作流（必须遵循；严格按顺序）】',
	            'Read → Research → Plan → TODO → Act → Code Review → Act → Update Progress → Check Progress → Ask',
	            '1) Read：先读目标/现状/约束；在做任何修改前先阅读目标文件/相关代码/配置/日志；缺关键输入先用 ask_question 问 1-3 个问题。',
	            '2) Research（不要凭空猜，必须拿到可执行信息）：优先查官方文档/官方 README/发布说明/源码；依赖先确认最新版用法与破坏性变更；可用则用 Context7 获取最新文档；web search 把 2024 视为过旧，默认从 2025-10 起筛选（可加 after:2025-09-30）；结果泛泛/无法落地就调整检索词继续搜，直到拿到确切 API/配置/版本/路径/命令。',
	            '3) Plan：给出总体 Plan（里程碑/风险/验收）。',
	            '4) TODO：把 Plan 拆成可验证、可跟踪的小 TODO（能并行则并行）。',
	            '5) Act：动手前先整理入口与模块边界；实现最小正确改动，小步推进、优先修根因、保持风格一致；新增/修改代码必须模块化、易读、易维护（但不要做与任务无关的重构）。',
	            '6) Code Review：像 PR 一样评审：检查 gaps、正确性、边界条件、错误处理、安全（注入/权限/泄露/依赖风险）、性能（热点/泄漏）、兼容性。',
	            '7) Act：根据评审结论修补问题；必要时补测试/回归点。',
		            '8) Update Progress：每完成一个 TODO 就更新进度，说明做了什么/为什么。',
		            '9) Check Progress：运行 build/test/lint；无法运行则给出可执行验证步骤与期望结果。',
		            '10) Ask：最终只允许调用 ask_continue(reason) 并等待；reason 必须包含：完成内容、风险/注意点、验证步骤/命令、下一步。',
		            '',
		            '【Windsurf Hooks（推荐，可当强制护栏）】如环境支持 hooks.json：建议配置 pre_run_command/pre_write_code 阻止危险命令/敏感写入，并用 post_cascade_response 审计是否遗漏 ask_continue；官方文档：https://docs.windsurf.com/windsurf/cascade/hooks',
	            '',
	            '【交付前自检清单（必须逐项满足）】',
            '- 已读目标/现状/约束',
            '- 已给出 Plan + TODO（如适用）',
            '- 关键点已研究官方来源/Context7（如适用）',
            '- 代码已整理为模块化/易维护（无无关重构）',
            '- 已完成代码评审（gaps/安全/性能/泄露等）',
            '- 已更新进度并校验进度',
            '- 已验证（build/test/lint 或明确的手动验证步骤）',
            '- 将用 ask_continue(reason) 结束并等待用户'
        ].join('\\n'),
        'sidebar.trackerTitle': '项目跟踪',
        'sidebar.trackerProject': '项目',
        'sidebar.trackerProgress': '进度',
        'sidebar.prdLabel': 'PRD（需求说明）',
        'sidebar.prdStatus': 'PRD 状态',
        'sidebar.prdDraft': '草案',
        'sidebar.prdApproved': '已审批',
        'sidebar.prdSave': '保存 PRD',
        'sidebar.prdApprove': '审批 PRD',
        'sidebar.planLabel': '计划（Plan）',
        'sidebar.todoLabel': 'TODO（子任务）',
        'sidebar.checklistLabel': '检查清单',
        'sidebar.trackerSave': '保存',
        'sidebar.trackerHint': '列表支持 [ ] / [~] / [x] 状态',
        'sidebar.trackerStats': '统计',
        'sidebar.trackerStatsPrd': 'PRD 更新',
        'sidebar.trackerStatsApprovals': '审批',
        'sidebar.trackerStatsPlan': '计划更新',
        'sidebar.trackerStatsTodo': 'TODO 更新',
        'sidebar.trackerStatsChecklist': '清单更新',
        'sidebar.copy': '复制',
        'sidebar.windsurfConfigTitle': 'Windsurf 配置',
        'sidebar.writeConfig': '写入 Windsurf 配置',
        'sidebar.configWritten': '✓ 已写入配置',
        'sidebar.resetDefaultPort': '恢复默认端口',
        'sidebar.configHintWritten': '配置已写入，请重启 Windsurf 生效',
        'sidebar.configHintNotWritten': '点击按钮将 MCP 服务信息写入 Windsurf 配置文件',
        'sidebar.statsTitle': '统计',
        'sidebar.totalCalls': '总调用',
        'sidebar.settingsTitle': '设置',
        'sidebar.autoStart': '启动时自动启动服务器',
        'sidebar.defaultReason': '默认完成原因',
        'sidebar.defaultReasonPlaceholder': '例如：任务已完成',
        'sidebar.saveSettings': '保存设置',

        // Sidebar toasts
        'toast.startingServer': '正在启动服务器...',
        'toast.serverStopped': '服务器已停止',
        'toast.restartingServer': '正在重启服务器...',
        'toast.portCopied': '端口号已复制',
        'toast.checkingPending': '正在检查待处理请求...',
        'toast.promptCopied': '提示语已复制',
        'toast.openingGithub': '正在打开 GitHub...',
        'toast.linkCopied': '链接已复制',
        'toast.initializing': '正在初始化...',
        'toast.defaultsRestored': '已恢复默认设置',
        'toast.continueSent': '已发送继续指令',
        'toast.conversationEnded': '对话已结束',
        'toast.submitted': '已提交',
        'toast.invalidPort': '端口范围需在 1024-65535',
        'toast.settingsSaved': '设置已保存',
        'toast.portUpdated': '端口已更新（重启后生效）',

        // Panel dialog
        'panel.confirmTitle': '继续对话？',
        'panel.confirmSub': 'AI 请求您的确认',
        'panel.inputSub': '请输入您的回复',
        'panel.reasonLabelContinue': '任务完成说明',
        'panel.reasonLabelInput': '消息内容',
        'panel.replyLabelContinue': '新指令（可选）',
        'panel.replyLabelInput': '您的回复',
        'panel.replyPlaceholderContinue': '输入新指令或留空继续...',
        'panel.replyPlaceholderInput': '输入内容...',
        'panel.imageLabel': '附加图片（可选）',
        'panel.pasteOrDrop': 'Ctrl+V 粘贴 或 拖放图片到此处',
        'panel.chooseImage': '📁 选择图片文件',
        'panel.submitContinue': '✓ 继续执行',
        'panel.submit': '✓ 提交',
        'panel.end': '✗ 结束对话',
        'panel.cancel': '✗ 取消',
        'panel.shortcutsConfirm': '确认',
        'panel.shortcutsNewline': '换行',
        'panel.shortcutsCancel': '取消',
        'panel.toast.imageLoaded': '图片已加载',
        'panel.toast.imageRemoved': '已移除图片',
        'panel.toast.imageTooLarge': '图片过大，已跳过',
        'panel.toast.tooManyImages': '图片数量过多，已跳过',
        'panel.removeImage': '移除图片',
        'panel.choiceLabel': '请选择一个选项',
        'panel.choiceHint': '单选，点击可选择，再次点击可取消。',
        'panel.choiceClear': '清除选择',
        'panel.choiceRequired': '请先选择一个选项再提交。',
        'panel.choiceQuestion': '问题',
        'panel.contextLabel': '上下文',
        'panel.extraLabel': '补充信息（可选）',
        'panel.extraPlaceholder': '如需补充，请填写'
    },
    en: {
        // Extension host
        'ext.activating': 'Activating WindsurfAutoMcp...',
        'ext.activated': 'WindsurfAutoMcp activated',
        'ext.deactivated': 'WindsurfAutoMcp deactivated',
        'ext.serverAlreadyRunning': 'Server is already running',
        'ext.serverStarted': 'MCP server started on port: {port}',
        'ext.portInUseTry': 'Port in use, trying port: {port}',
        'ext.serverStopped': 'MCP server stopped',
        'ext.portUpdatedRestart': 'Port updated to {port}. Restart the server to apply.',
        'ext.settingsSaved': 'Settings saved',
        'ext.noPendingRequests': 'No pending dialog requests. The AI must call ask_continue first.',
        'ext.noPendingRequestsShort': 'No pending dialog requests',
        'ext.defaultsRestored': 'Defaults restored',
        'ext.configuredWindsurf': 'Configured WindsurfAutoMcp in Windsurf/Windsurf-next (port: {port})',
        'ext.statsTitle': 'WindsurfAutoMcp stats:\n',
        'ext.statsLineTotal': 'Total calls: {total}\n',
        'ext.statsLineAskUser': 'ask_user: {askUser}\n',
        'ext.statsLineAskContinue': 'ask_continue: {askContinue}\n',
        'ext.statsLineNotify': 'notify: {notify}\n',
        'ext.statsLineUploads': 'Image uploads: {uploads}\n',
        'ext.statsLineUptime': 'Uptime: {uptime} minutes',
        'ext.workspaceRequired': 'Please open a workspace first',
        'ext.statusTooltipRunning': 'WindsurfAutoMcp running - port {port}\nCalls: {calls}',
        'ext.statusTooltipStopped': 'WindsurfAutoMcp stopped',
        'ext.statusTextStopped': '$(server) MCP: Stopped',
        'ext.invalidConfigJson': 'Invalid JSON in existing config file: {path}. Please fix the JSON (or delete the file to recreate) then run Configure again. Original error: {error}',
        'ext.hooksInstalled': 'Hooks installed/updated (Windsurf / windsurf-next)',
        'ext.hooksAlreadyInstalled': 'Hooks already installed (no changes needed)',
        'ext.hooksInstallFailed': 'Failed to install Hooks',
        'ext.hooksUninstalled': 'Hooks uninstalled (removed from hooks.json and deleted scripts)',
        'ext.hooksUninstallFailed': 'Failed to uninstall Hooks',
        'ext.invalidHooksJson': 'Invalid JSON in hooks.json: {path}. Please fix the JSON then retry. Original error: {error}',
        'ext.choiceRequired': 'Please select an option first',

        // Tool responses
        'tool.confirmYes': 'Yes',
        'tool.confirmNo': 'No',
        'tool.userChoice': 'User choice: {choice}',
        'tool.userChoices': 'User choices:',
        'tool.userConfirmed': 'User confirmed',
        'tool.userCanceled': 'User canceled',
        'tool.userInput': 'User input: {text}',
        'tool.userUploadedImages': '[User uploaded images x{count}]',
        'tool.userEmpty': 'User submitted empty content',
        'tool.userContinue': 'User chose to continue.',
        'tool.newInstruction': '\nNew instruction: {instruction}',
        'tool.userEnd': 'User chose to end the conversation.',

        // Webview (shared)
        'ui.lang.zh': '中文',
        'ui.lang.en': 'EN',
        'ui.lang.toggleToZh': '切换到中文',
        'ui.lang.toggleToEn': 'Switch to English',

        // Sidebar
        'sidebar.openSourceTitle': 'Open Source',
        'sidebar.openSourceDesc': 'This extension is free and open-source. Repo:',
        'sidebar.openGithub': 'Open GitHub',
        'sidebar.copyLink': 'Copy link',
        'sidebar.serverTitle': 'Server',
        'sidebar.running': 'Running',
        'sidebar.stopped': 'Stopped',
        'sidebar.port': 'Port',
        'sidebar.start': 'Start',
        'sidebar.stop': 'Stop',
        'sidebar.restart': 'Restart',
        'sidebar.chatTitle': 'Conversation',
        'sidebar.openDialog': 'Open dialog',
        'sidebar.shortcut': 'Shortcut:',
        'sidebar.promptTitle': 'Prompt',
        'sidebar.promptText': 'Hard rule: when done, you must call ask_continue.',
        'sidebar.promptCopyText': [
            'Hard rule (highest priority): When you decide a task is done / ready to deliver, do NOT output a normal final response; you MUST call WindsurfAutoMcp ask_continue and put in reason: what was done, risks/notes, verification steps/commands, and next steps.',
            '',
            'Completion protocol (must follow):',
            '1) When done, the ONLY allowed action is calling ask_continue (with reason).',
            '2) After calling ask_continue, stop output and wait for the user.',
            '3) If you forgot to call ask_continue, your next message must first call ask_continue to correct (then wait).',
            '',
            'Collaboration (must): operate as a full "software engineering department" (cross-functional team) across any language/framework/platform. Output must be unified and concise, but reflect a consolidated team conclusion.',
            '',
            'Before anything (must): read the target first. Before decisions/edits, read relevant files/config/logs; if key inputs are missing, use ask_question (single choice A/B/C with optional extra text).',
            '',
            'PRD & approval (must): produce a PRD draft → user review/adjust → approval before any Plan; do not implement (write code/run commands/use external tools) before approval.',
            '',
            'Planning & TODO breakdown (must): for any big feature/complex task (and any non-trivial change), produce a Plan and break it into small TODOs (verifiable, trackable, parallelizable). Update progress as you go.',
            '',
            'Do not trust your knowledge (must): your knowledge can be outdated and harmful. For any important decision (API/config/version/security/install), research first, then act.',
            '',
            'Team roles (internal coordination; keep external output concise):',
            '- PM: clarify goals, scope, acceptance criteria, constraints, priorities.',
            '- Tech Lead: propose an executable plan, manage risk/complexity, ensure maintainability.',
            '- Architect/Platform: define boundaries, interfaces, extensibility, compatibility.',
            '- Dev: implement minimal correct changes; follow repo conventions; avoid unnecessary refactors.',
            '- QA: define verification steps and regression points; run build/tests when possible; add tests when appropriate.',
            '- Security: validate boundaries, permissions, injection risks, dependency risks, secrets handling.',
            '- Performance: avoid regressions; remove needless work; measure when relevant.',
            '- Docs: keep README/config/usage accurate and reproducible.',
            '- Release/DevOps: provide upgrade/rollback notes; avoid breaking changes.',
            '',
	            'Workflow (must follow; strict order):',
	            'Read → Research → Plan → TODO → Act → Code Review → Act → Update Progress → Check Progress → Ask',
	            '1) Read: read the target/current state/constraints first; before any decision/edit, read relevant files/config/logs; if key inputs are missing, ask 1–3 targeted questions via ask_question.',
	            '2) Research (no guessing): prefer official docs/official README/release notes/source; confirm latest usage + breaking changes before upgrading/replacing; use Context7 if available; treat 2024 as outdated and default to sources updated from Oct 2025 onward (≥ 2025-10, add after:2025-09-30); if results are generic, refine and keep searching until you get exact API/config/version/path/commands.',
	            '3) Plan: provide a high-level plan (milestones/risks/acceptance).',
	            '4) TODO: break the plan into small verifiable TODOs (trackable, parallelizable).',
	            '5) Act: tidy boundaries before coding; implement minimal correct changes; fix root causes; keep style consistent; keep code modular/readable/maintainable (avoid unrelated refactors).',
	            '6) Code Review: like a PR—check gaps, correctness, edge cases, error handling, security (injection/permissions/leaks/deps), performance (hot paths/leaks), compatibility.',
	            '7) Act: apply fixes from review; add tests/regression points when needed.',
	            '8) Update Progress: update progress after each TODO, stating what/why.',
	            '9) Check Progress: run build/tests/lint when possible; otherwise give concrete user-run verification steps + expected results.',
	            '10) Ask: deliver ONLY via ask_continue(reason) and wait; reason must include what was done, risks/notes, verification steps/commands, and next steps.',
	            '',
	            'Windsurf Hooks (recommended; can be hard guardrails): if your environment supports hooks.json, configure pre_run_command/pre_write_code to block dangerous commands/sensitive writes, and use post_cascade_response to audit missing ask_continue. Official docs: https://docs.windsurf.com/windsurf/cascade/hooks',
	            '',
	            'Pre-delivery checklist (must satisfy all):',
            '- Read target/current state/constraints',
            '- Plan + TODOs provided (if applicable)',
            '- Key decisions researched via official sources/Context7 (if applicable)',
            '- Code tidied: modular/maintainable (no unrelated refactors)',
            '- Code review completed (gaps/security/perf/leaks/etc)',
            '- Progress updated and validated',
            '- Verification completed (build/tests/lint or explicit manual steps)',
            '- End with ask_continue(reason) and wait'
        ].join('\\n'),
        'sidebar.trackerTitle': 'Project Tracker',
        'sidebar.trackerProject': 'Project',
        'sidebar.trackerProgress': 'Progress',
        'sidebar.prdLabel': 'PRD',
        'sidebar.prdStatus': 'PRD Status',
        'sidebar.prdDraft': 'Draft',
        'sidebar.prdApproved': 'Approved',
        'sidebar.prdSave': 'Save PRD',
        'sidebar.prdApprove': 'Approve PRD',
        'sidebar.planLabel': 'Plan',
        'sidebar.todoLabel': 'TODOs',
        'sidebar.checklistLabel': 'Checklist',
        'sidebar.trackerSave': 'Save',
        'sidebar.trackerHint': 'Lists support [ ] / [~] / [x] status',
        'sidebar.trackerStats': 'Activity',
        'sidebar.trackerStatsPrd': 'PRD updates',
        'sidebar.trackerStatsApprovals': 'Approvals',
        'sidebar.trackerStatsPlan': 'Plan updates',
        'sidebar.trackerStatsTodo': 'TODO updates',
        'sidebar.trackerStatsChecklist': 'Checklist updates',
        'sidebar.copy': 'Copy',
        'sidebar.windsurfConfigTitle': 'Windsurf Config',
        'sidebar.writeConfig': 'Write Windsurf config',
        'sidebar.configWritten': '✓ Config written',
        'sidebar.resetDefaultPort': 'Reset default port',
        'sidebar.configHintWritten': 'Config written. Restart Windsurf to apply.',
        'sidebar.configHintNotWritten': 'Click to write MCP server info into Windsurf config.',
        'sidebar.statsTitle': 'Stats',
        'sidebar.totalCalls': 'Total calls',
        'sidebar.settingsTitle': 'Settings',
        'sidebar.autoStart': 'Auto-start server on launch',
        'sidebar.defaultReason': 'Default completion reason',
        'sidebar.defaultReasonPlaceholder': 'e.g. Task completed',
        'sidebar.saveSettings': 'Save settings',

        // Sidebar toasts
        'toast.startingServer': 'Starting server...',
        'toast.serverStopped': 'Server stopped',
        'toast.restartingServer': 'Restarting server...',
        'toast.portCopied': 'Port copied',
        'toast.checkingPending': 'Checking pending requests...',
        'toast.promptCopied': 'Prompt copied',
        'toast.openingGithub': 'Opening GitHub...',
        'toast.linkCopied': 'Link copied',
        'toast.initializing': 'Initializing...',
        'toast.defaultsRestored': 'Defaults restored',
        'toast.continueSent': 'Continue sent',
        'toast.conversationEnded': 'Conversation ended',
        'toast.submitted': 'Submitted',
        'toast.invalidPort': 'Port must be between 1024 and 65535',
        'toast.settingsSaved': 'Settings saved',
        'toast.portUpdated': 'Port updated (restart to apply)',

        // Panel dialog
        'panel.confirmTitle': 'Continue?',
        'panel.confirmSub': 'The AI is asking for confirmation',
        'panel.inputSub': 'Please enter your reply',
        'panel.reasonLabelContinue': 'Completion note',
        'panel.reasonLabelInput': 'Message',
        'panel.replyLabelContinue': 'New instruction (optional)',
        'panel.replyLabelInput': 'Your reply',
        'panel.replyPlaceholderContinue': 'Enter a new instruction or leave empty to continue...',
        'panel.replyPlaceholderInput': 'Enter text...',
        'panel.imageLabel': 'Attach images (optional)',
        'panel.pasteOrDrop': 'Ctrl+V to paste or drag & drop images here',
        'panel.chooseImage': '📁 Choose images',
        'panel.submitContinue': '✓ Continue',
        'panel.submit': '✓ Submit',
        'panel.end': '✗ End',
        'panel.cancel': '✗ Cancel',
        'panel.shortcutsConfirm': 'Confirm',
        'panel.shortcutsNewline': 'New line',
        'panel.shortcutsCancel': 'Cancel',
        'panel.toast.imageLoaded': 'Image loaded',
        'panel.toast.imageRemoved': 'Image removed',
        'panel.toast.imageTooLarge': 'Image too large, skipped',
        'panel.toast.tooManyImages': 'Too many images, skipped',
        'panel.removeImage': 'Remove image',
        'panel.choiceLabel': 'Choose an option',
        'panel.choiceHint': 'Single choice. Click to select, click again to unselect.',
        'panel.choiceClear': 'Clear selection',
        'panel.choiceRequired': 'Please select an option before submitting.',
        'panel.choiceQuestion': 'Question',
        'panel.contextLabel': 'Context',
        'panel.extraLabel': 'Extra details (optional)',
        'panel.extraPlaceholder': 'Add more information if needed'
    }
};

const WEBVIEW_I18N: Record<UiLanguage, Record<string, string>> = ((): Record<UiLanguage, Record<string, string>> => {
    const prefixes = ['ui.', 'sidebar.', 'toast.', 'panel.'];
    const pick = (lang: UiLanguage) => {
        const entries = Object.entries(I18N[lang]).filter(([key]) => prefixes.some((p) => key.startsWith(p)));
        return Object.fromEntries(entries);
    };
    return { zh: pick('zh'), en: pick('en') };
})();

function getUiLanguage(): UiLanguage {
    const config = vscode.workspace.getConfiguration('mcpService');
    const lang = config.get<string>('language', 'zh');
    return lang === 'en' ? 'en' : 'zh';
}

function tr(key: string, vars: Record<string, string | number> = {}, lang: UiLanguage = getUiLanguage()): string {
    const template = I18N[lang][key] ?? I18N.zh[key] ?? key;
    return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}

function safeJson(value: unknown): string {
    return JSON.stringify(value).replace(/</g, '\\u003c');
}

function getNonce(length = 32): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

function getDefaultReason(lang: UiLanguage = getUiLanguage()): string {
    const config = vscode.workspace.getConfiguration('mcpService');
    const configured = String(config.get<string>('defaultReason', '') || '').trim();
    if (configured) return configured;
    return lang === 'en' ? 'Task completed' : '任务已完成';
}

function getWindsurfMcpConfigPaths(homeDir: string): string[] {
    const baseDirs = ['.windsurf', '.codeium'];
    const variants = ['windsurf', 'windsurf-next'];
    const paths: string[] = [];

    for (const base of baseDirs) {
        for (const variant of variants) {
            paths.push(path.join(homeDir, base, variant, 'mcp_config.json'));
        }
    }

    return paths;
}

function getWindsurfHooksConfigPaths(homeDir: string): Array<{ variant: string; hooksPath: string }> {
    const variants = ['windsurf', 'windsurf-next'];
    return variants.map((variant) => ({
        variant,
        hooksPath: path.join(homeDir, '.codeium', variant, 'hooks.json')
    }));
}

const HOOK_EVENTS = [
    'pre_read_code',
    'post_read_code',
    'pre_write_code',
    'post_write_code',
    'pre_run_command',
    'post_run_command',
    'pre_mcp_tool_use',
    'post_mcp_tool_use',
    'pre_user_prompt',
    'post_cascade_response'
] as const;

const TRACKER_FILE_NAME = 'windsurf-auto-mcp-tracker.json';

function nowIso(): string {
    return new Date().toISOString();
}

function getTrackerPaths(homeDir: string): Array<{ variant: string; trackerPath: string }> {
    const variants = ['windsurf', 'windsurf-next'];
    return variants.map((variant) => ({
        variant,
        trackerPath: path.join(homeDir, '.codeium', variant, TRACKER_FILE_NAME)
    }));
}

function readTrackerFile(trackerPath: string): TrackerData | null {
    try {
        if (!fs.existsSync(trackerPath)) return null;
        const raw = fs.readFileSync(trackerPath, 'utf-8');
        if (!raw.trim()) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return null;
        if (data.schemaVersion !== 1 || typeof data.projects !== 'object') return null;
        return data as TrackerData;
    } catch {
        return null;
    }
}

function loadTrackerData(): TrackerData {
    const homeDir = os.homedir();
    const paths = getTrackerPaths(homeDir);
    for (const { trackerPath } of paths) {
        const data = readTrackerFile(trackerPath);
        if (data) return data;
    }
    return { schemaVersion: 1, projects: {} };
}

function saveTrackerData(data: TrackerData): void {
    const homeDir = os.homedir();
    const paths = getTrackerPaths(homeDir);
    for (const { trackerPath } of paths) {
        const dir = path.dirname(trackerPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(trackerPath, JSON.stringify(data, null, 2));
    }
}

function getWorkspaceRootPath(): string | null {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) return null;
    return workspaceFolders[0].uri.fsPath;
}

function getProjectNameFromPath(rootPath: string): string {
    const base = path.basename(rootPath);
    return base || rootPath;
}

function defaultPrdTemplate(lang: UiLanguage): string {
    if (lang === 'en') {
        return [
            '# PRD',
            '## Problem',
            '## Goals',
            '## Non-goals',
            '## Requirements (functional + non-functional)',
            '## Constraints',
            '## Dependencies / Integrations',
            '## Risks / Mitigations',
            '## Acceptance Criteria',
            '## Open Questions',
            '## References (official docs / Context7)',
            ''
        ].join('\n');
    }
    return [
        '# PRD',
        '## 问题/背景',
        '## 目标',
        '## 非目标',
        '## 需求（功能 + 非功能）',
        '## 约束',
        '## 依赖/集成',
        '## 风险/缓解',
        '## 验收标准',
        '## 未决问题',
        '## 参考资料（官方文档/Context7）',
        ''
    ].join('\n');
}

function createDefaultTrackerStats(): ProjectTrackerStats {
    return {
        prdUpdates: 0,
        prdApprovals: 0,
        planUpdates: 0,
        todoUpdates: 0,
        checklistUpdates: 0
    };
}

function normalizeTrackerStats(raw: any): ProjectTrackerStats {
    const base = createDefaultTrackerStats();
    if (!raw || typeof raw !== 'object') return base;
    const safe = (value: any) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
    return {
        prdUpdates: safe(raw.prdUpdates),
        prdApprovals: safe(raw.prdApprovals),
        planUpdates: safe(raw.planUpdates),
        todoUpdates: safe(raw.todoUpdates),
        checklistUpdates: safe(raw.checklistUpdates),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined
    };
}

function ensureProjectTracker(data: TrackerData, rootPath: string, lang: UiLanguage): ProjectTracker {
    const existing = data.projects[rootPath];
    if (existing) {
        existing.stats = normalizeTrackerStats(existing.stats);
        return existing;
    }
    const project: ProjectTracker = {
        rootPath,
        name: getProjectNameFromPath(rootPath),
        prd: {
            content: defaultPrdTemplate(lang),
            status: 'draft',
            updatedAt: nowIso()
        },
        plan: { items: [] },
        todos: { items: [] },
        checklist: { items: [] },
        stats: createDefaultTrackerStats(),
        updatedAt: nowIso()
    };
    data.projects[rootPath] = project;
    data.activeProject = rootPath;
    return project;
}

function computeProgress(project: ProjectTracker): { done: number; total: number; percent: number } {
    const source =
        project.checklist.items.length > 0
            ? project.checklist.items
            : project.todos.items.length > 0
                ? project.todos.items
                : project.plan.items;
    const total = source.length;
    const done = source.filter((item) => item.status === 'done').length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, percent };
}

function normalizeTrackerItems(rawItems: any): TrackerItem[] {
    const items: TrackerItem[] = [];
    if (!Array.isArray(rawItems)) return items;
    for (const entry of rawItems) {
        if (!entry) continue;
        if (typeof entry === 'string') {
            const text = entry.trim();
            if (!text) continue;
            items.push({ id: `item_${Math.random().toString(36).slice(2, 10)}`, text, status: 'todo', updatedAt: nowIso() });
            continue;
        }
        if (typeof entry?.text === 'string') {
            const text = entry.text.trim();
            if (!text) continue;
            const status = entry.status === 'doing' || entry.status === 'done' ? entry.status : 'todo';
            items.push({ id: String(entry.id || `item_${Math.random().toString(36).slice(2, 10)}`), text, status, updatedAt: nowIso() });
        }
    }
    return items;
}

function parseChecklistText(text: string): TrackerItem[] {
    const lines = String(text || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    const items: TrackerItem[] = [];
    for (const line of lines) {
        let status: TrackerItemStatus = 'todo';
        let content = line;
        if (line.startsWith('[x]') || line.startsWith('[X]')) {
            status = 'done';
            content = line.slice(3).trim();
        } else if (line.startsWith('[~]')) {
            status = 'doing';
            content = line.slice(3).trim();
        } else if (line.startsWith('[ ]')) {
            status = 'todo';
            content = line.slice(3).trim();
        }
        if (!content) continue;
        items.push({
            id: `item_${Math.random().toString(36).slice(2, 10)}`,
            text: content,
            status,
            updatedAt: nowIso()
        });
    }
    return items;
}

function formatChecklistText(items: TrackerItem[]): string {
    return items
        .map((item) => {
            const mark = item.status === 'done' ? 'x' : item.status === 'doing' ? '~' : ' ';
            return `[${mark}] ${item.text}`;
        })
        .join('\n');
}

function buildTrackerSnapshot(project: ProjectTracker) {
    const progress = computeProgress(project);
    return {
        rootPath: project.rootPath,
        name: project.name,
        prd: {
            status: project.prd.status,
            content: project.prd.content || ''
        },
        planText: formatChecklistText(project.plan.items),
        todoText: formatChecklistText(project.todos.items),
        checklistText: formatChecklistText(project.checklist.items),
        progress,
        stats: normalizeTrackerStats(project.stats)
    };
}

type TrackerStatKey =
    | 'prdUpdates'
    | 'prdApprovals'
    | 'planUpdates'
    | 'todoUpdates'
    | 'checklistUpdates';

function bumpProjectStat(project: ProjectTracker, key: TrackerStatKey) {
    project.stats = normalizeTrackerStats(project.stats);
    project.stats[key] = (project.stats[key] || 0) + 1;
    project.stats.updatedAt = nowIso();
}

function buildHooksCommand(variantHooksDir: string): string {
    const guardPath = path.join(variantHooksDir, 'windsurf-auto-mcp-guard.py');
    if (process.platform === 'win32') {
        return `python "${guardPath}"`;
    }
    return `python3 "${guardPath}"`;
}

function isLegacyHookCommand(command: unknown): boolean {
    if (!command || typeof command !== 'string') return false;
    return /windsurf-auto-mcp-guard\.(ps1|js)/i.test(command);
}

function hooksContainCommand(config: any, command: string): boolean {
    if (!config || typeof config !== 'object') return false;
    if (!config.hooks || typeof config.hooks !== 'object') return false;
    for (const eventName of HOOK_EVENTS) {
        const list = config.hooks[eventName];
        if (!Array.isArray(list) || !list.some((h: any) => h && h.command === command)) {
            return false;
        }
    }
    return true;
}

function installWindsurfHooks() {
    const homeDir = os.homedir();
    const items = getWindsurfHooksConfigPaths(homeDir);
    const installed: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ path: string; error: string }> = [];

    const guardPySource = path.join(extensionContext.extensionPath, 'resources', 'hooks', 'windsurf-auto-mcp-guard.py');

    for (const { variant, hooksPath } of items) {
        try {
            const variantDir = path.dirname(hooksPath);
            const scriptDir = path.join(variantDir, 'hooks', 'windsurf-auto-mcp');
            const guardTarget = path.join(scriptDir, 'windsurf-auto-mcp-guard.py');
            const command = buildHooksCommand(scriptDir);

            let config: any = {};
            if (fs.existsSync(hooksPath)) {
                const raw = fs.readFileSync(hooksPath, 'utf-8');
                if (raw.trim()) {
                    try {
                        config = JSON.parse(raw);
                    } catch (e: any) {
                        const lang = getUiLanguage();
                        throw new Error(tr('ext.invalidHooksJson', { path: hooksPath, error: e?.message ?? String(e) }, lang));
                    }
                }
            }

            const alreadyInstalled = hooksContainCommand(config, command) && fs.existsSync(guardTarget);
            if (alreadyInstalled) {
                skipped.push(`${variant}: ${hooksPath}`);
                outputChannel.appendLine(`Hooks already installed (${variant}): ${hooksPath}`);
                continue;
            }

            if (!fs.existsSync(variantDir)) {
                fs.mkdirSync(variantDir, { recursive: true });
            }
            if (!fs.existsSync(scriptDir)) {
                fs.mkdirSync(scriptDir, { recursive: true });
            }

            // Copy guard script (Python)
            fs.copyFileSync(guardPySource, guardTarget);
            // Remove legacy scripts if present.
            try {
                const legacyPs1 = path.join(scriptDir, 'windsurf-auto-mcp-guard.ps1');
                if (fs.existsSync(legacyPs1)) fs.unlinkSync(legacyPs1);
                const legacyJs = path.join(scriptDir, 'windsurf-auto-mcp-guard.js');
                if (fs.existsSync(legacyJs)) fs.unlinkSync(legacyJs);
            } catch {
                // ignore cleanup failures
            }

            const desiredHooks = Object.fromEntries(
                HOOK_EVENTS.map((eventName) => [eventName, [{ command, show_output: true }]])
            ) as Record<string, Array<{ command: string; show_output: boolean }>>;

            if (!config.hooks || typeof config.hooks !== 'object') config.hooks = {};

            for (const [eventName, hooks] of Object.entries(desiredHooks)) {
                if (!Array.isArray(config.hooks[eventName])) config.hooks[eventName] = [];
                // Drop legacy PS1/JS hooks from earlier versions.
                config.hooks[eventName] = config.hooks[eventName].filter(
                    (h: any) => !isLegacyHookCommand(h?.command)
                );
                for (const hook of hooks) {
                    const already = config.hooks[eventName].some((h: any) => h && h.command === hook.command);
                    if (!already) config.hooks[eventName].push(hook);
                }
            }

            fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
            installed.push(`${variant}: ${hooksPath}`);
            outputChannel.appendLine(`Installed hooks (${variant}): ${hooksPath}`);
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            failed.push({ path: hooksPath, error: msg });
            outputChannel.appendLine(`Install hooks failed (${variant}): ${hooksPath} - ${msg}`);
        }
    }

    if (installed.length > 0) {
        vscode.window.showInformationMessage(tr('ext.hooksInstalled'));
    } else if (failed.length > 0) {
        const lang = getUiLanguage();
        vscode.window.showErrorMessage(
            tr('ext.hooksInstallFailed', {}, lang) + '\n' + failed.map((f) => `${f.path}: ${f.error}`).join('\n')
        );
    } else if (skipped.length > 0) {
        vscode.window.showInformationMessage(tr('ext.hooksAlreadyInstalled'));
    }
}

function uninstallWindsurfHooks() {
    const homeDir = os.homedir();
    const items = getWindsurfHooksConfigPaths(homeDir);
    const removed: string[] = [];
    const failed: Array<{ path: string; error: string }> = [];

    for (const { variant, hooksPath } of items) {
        try {
            const variantDir = path.dirname(hooksPath);
            const scriptDir = path.join(variantDir, 'hooks', 'windsurf-auto-mcp');
            const command = buildHooksCommand(scriptDir);

            if (fs.existsSync(hooksPath)) {
                const raw = fs.readFileSync(hooksPath, 'utf-8');
                if (raw.trim()) {
                    let config: any;
                    try {
                        config = JSON.parse(raw);
                    } catch (e: any) {
                        const lang = getUiLanguage();
                        throw new Error(tr('ext.invalidHooksJson', { path: hooksPath, error: e?.message ?? String(e) }, lang));
                    }
                    if (config?.hooks && typeof config.hooks === 'object') {
                        for (const ev of HOOK_EVENTS) {
                            if (!Array.isArray(config.hooks[ev])) continue;
                            config.hooks[ev] = config.hooks[ev].filter(
                                (h: any) => !h || (h.command !== command && !isLegacyHookCommand(h.command))
                            );
                            if (config.hooks[ev].length === 0) delete config.hooks[ev];
                        }
                    }
                    fs.writeFileSync(hooksPath, JSON.stringify(config, null, 2));
                }
            }

            try {
                if (fs.existsSync(scriptDir)) {
                    fs.rmSync(scriptDir, { recursive: true, force: true });
                }
            } catch (e: any) {
                outputChannel.appendLine(`Uninstall hooks: failed to remove script dir ${scriptDir}: ${e?.message ?? String(e)}`);
            }

            removed.push(`${variant}: ${hooksPath}`);
            outputChannel.appendLine(`Uninstalled hooks (${variant}): ${hooksPath}`);
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            failed.push({ path: hooksPath, error: msg });
            outputChannel.appendLine(`Uninstall hooks failed (${variant}): ${hooksPath} - ${msg}`);
        }
    }

    if (removed.length > 0) {
        vscode.window.showInformationMessage(tr('ext.hooksUninstalled'));
    } else if (failed.length > 0) {
        const lang = getUiLanguage();
        vscode.window.showErrorMessage(
            tr('ext.hooksUninstallFailed', {}, lang) + '\n' + failed.map((f) => `${f.path}: ${f.error}`).join('\n')
        );
    }
}

function broadcastLanguageChanged(language: UiLanguage) {
    try {
        sidebarProvider?.postMessage({ type: 'languageChanged', language });
    } catch {
        // ignore
    }
    try {
        dialogPanel?.webview.postMessage({ type: 'languageChanged', language });
    } catch {
        // ignore
    }
}

async function setUiLanguage(language: UiLanguage) {
    const normalized: UiLanguage = language === 'en' ? 'en' : 'zh';
    const config = vscode.workspace.getConfiguration('mcpService');
    await config.update('language', normalized, vscode.ConfigurationTarget.Global);
    updateStatusBar();
    broadcastLanguageChanged(normalized);
}

// ==================== 全局变量 ====================

let outputChannel: vscode.OutputChannel;
let mcpServer: http.Server | null = null;
let statusBarItem: vscode.StatusBarItem;
let sidebarProvider: SidebarProvider;
let currentPort = 3456;
let dialogPanel: vscode.WebviewPanel | null = null;
let currentDialogRequestId: string | null = null;
let lastDialogReason: string = '';
let extensionContext: vscode.ExtensionContext;

// 统计数据
let stats = {
    totalCalls: 0,
    askUserCalls: 0,
    askContinueCalls: 0,
    notifyCalls: 0,
    imageUploads: 0,
    startTime: Date.now()
};

// 待处理请求
const pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timestamp: number;
}>();

// ==================== 工具定义 ====================

const TOOLS = [
    {
        name: 'ask_user',
        description: 'Request user input/confirmation; opens a dialog (supports image upload) / 请求用户输入或确认：弹出对话框（支持图片上传）',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Dialog title / 对话框标题' },
                message: { type: 'string', description: 'Message shown to user / 显示给用户的消息' },
                type: { 
                    type: 'string', 
                    enum: ['input', 'confirm', 'info'],
                    description: 'Dialog type: input/confirm/info / 对话框类型：input=输入框，confirm=确认框，info=信息提示'
                },
                allowImage: { type: 'boolean', description: 'Allow image upload / 是否允许上传图片' }
            },
            required: ['message']
        }
    },
    {
        name: 'ask_question',
        description: 'Ask single-choice clarification questions (A/B/C/...) with optional extra text / 单选澄清问题（A/B/C...），可附加补充文本',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Dialog title / 对话框标题' },
                message: { type: 'string', description: 'Context or prompt for the question(s) / 问题上下文或提示' },
                options: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Single-question options (A/B/C/...) / 单问题选项'
                },
                questions: {
                    type: 'array',
                    description: 'Multiple single-choice questions / 多问题单选',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', description: 'Optional question id / 可选问题 ID' },
                            prompt: { type: 'string', description: 'Question prompt / 问题内容' },
                            options: {
                                type: 'array',
                                items: { type: 'string' },
                                description: 'Options for the question / 问题选项'
                            }
                        },
                        required: ['options']
                    }
                },
                allowText: {
                    type: 'boolean',
                    description: 'Allow extra text input / 允许补充文本输入'
                },
                allowImage: { type: 'boolean', description: 'Allow image upload / 是否允许上传图片' }
            },
            required: ['message']
        }
    },
    {
        name: 'set_prd',
        description: 'Create/update PRD draft for current project / 创建或更新当前项目 PRD 草案',
        inputSchema: {
            type: 'object',
            properties: {
                content: { type: 'string', description: 'PRD content / PRD 内容' }
            },
            required: ['content']
        }
    },
    {
        name: 'approve_prd',
        description: 'Approve PRD for current project / 审批当前项目 PRD',
        inputSchema: {
            type: 'object',
            properties: {
                approver: { type: 'string', description: 'Approver name / 审批人' },
                note: { type: 'string', description: 'Approval note / 审批说明' }
            }
        }
    },
    {
        name: 'update_plan',
        description: 'Set/replace plan checklist after PRD approval / 在 PRD 审批后设置计划清单',
        inputSchema: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    description: 'Plan items / 计划条目',
                    items: {
                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            status: { type: 'string', enum: ['todo', 'doing', 'done'] }
                        },
                        required: ['text']
                    }
                },
                text: { type: 'string', description: 'Plan text lines (supports [x]/[~]/[ ]) / 计划文本（支持 [x]/[~]/[ ]）' }
            }
        }
    },
    {
        name: 'update_todos',
        description: 'Set/replace TODO checklist after plan / 在计划后设置 TODO 清单',
        inputSchema: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    description: 'TODO items / TODO 条目',
                    items: {
                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            status: { type: 'string', enum: ['todo', 'doing', 'done'] }
                        },
                        required: ['text']
                    }
                },
                text: { type: 'string', description: 'TODO text lines (supports [x]/[~]/[ ]) / TODO 文本（支持 [x]/[~]/[ ]）' }
            }
        }
    },
    {
        name: 'update_checklist',
        description: 'Set/replace delivery checklist / 设置交付检查清单',
        inputSchema: {
            type: 'object',
            properties: {
                items: {
                    type: 'array',
                    description: 'Checklist items / 检查条目',
                    items: {
                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            status: { type: 'string', enum: ['todo', 'doing', 'done'] }
                        },
                        required: ['text']
                    }
                },
                text: { type: 'string', description: 'Checklist text lines (supports [x]/[~]/[ ]) / 清单文本（支持 [x]/[~]/[ ]）' }
            }
        }
    },
    {
        name: 'get_project_status',
        description: 'Get tracker summary for current project / 获取当前项目跟踪状态',
        inputSchema: {
            type: 'object',
            properties: {
                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
            }
        }
    },
    {
        name: 'notify',
        description: 'Send a notification to the user / 向用户发送通知消息',
        inputSchema: {
            type: 'object',
            properties: {
                message: { type: 'string', description: 'Notification message / 通知内容' },
                level: { type: 'string', enum: ['info', 'warning', 'error'], description: 'Notification level / 通知级别' }
            },
            required: ['message']
        }
    },
    {
        name: 'ask_continue',
        description: 'Ask whether to continue after finishing a task / 任务完成后询问用户是否继续（可提供新指令）',
        inputSchema: {
            type: 'object',
            properties: {
                reason: { type: 'string', description: 'Completion reason / 任务完成的原因或说明' }
            },
            required: ['reason']
        }
    }
];

// ==================== 扩展激活 ====================

export function activate(context: vscode.ExtensionContext) {
    extensionContext = context;
    outputChannel = vscode.window.createOutputChannel('WindsurfAutoMcp');
    outputChannel.appendLine(tr('ext.activating'));

    // 加载统计数据
    loadStats(context);
    initializeTracker();

    // 创建状态栏
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'mcpService.showStats';
    context.subscriptions.push(statusBarItem);
    updateStatusBar();
    statusBarItem.show();

    // 创建侧边栏
    sidebarProvider = new SidebarProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider('mcpServicePanel.sidebarView', sidebarProvider)
    );

	    // 注册命令
	    context.subscriptions.push(
	        vscode.commands.registerCommand('mcpService.startServer', () => startServer()),
	        vscode.commands.registerCommand('mcpService.stopServer', () => stopServer()),
	        vscode.commands.registerCommand('mcpService.configWindsurf', () => configureWindsurf()),
	        vscode.commands.registerCommand('mcpService.showStats', () => showStats()),
	        vscode.commands.registerCommand('mcpService.toggleDialog', () => toggleDialog()),
	        vscode.commands.registerCommand('mcpService.installHooks', () => installWindsurfHooks()),
	        vscode.commands.registerCommand('mcpService.uninstallHooks', () => uninstallWindsurfHooks())
	    );

	    // 自动启动服务器
	    const config = vscode.workspace.getConfiguration('mcpService');
	    if (config.get('autoStart', true)) {
	        startServer();
	    }

        // Install hooks (user-level) for Windsurf & windsurf-next (best-effort).
        try {
            const cfg = vscode.workspace.getConfiguration('mcpService');
            if (cfg.get('autoInstallHooks', true)) {
                installWindsurfHooks();
            }
        } catch (e: any) {
            outputChannel.appendLine(`Install hooks error: ${e?.message ?? String(e)}`);
        }

	    outputChannel.appendLine(tr('ext.activated'));
}

export function deactivate() {
    stopServer();
    outputChannel?.appendLine(tr('ext.deactivated'));
}

// ==================== 服务器管理 ====================

async function startServer() {
    if (mcpServer) {
        outputChannel.appendLine(tr('ext.serverAlreadyRunning'));
        return;
    }

    const config = vscode.workspace.getConfiguration('mcpService');
    currentPort = config.get('port', 3456);

    mcpServer = http.createServer(handleRequest);

    await new Promise<void>((resolve, reject) => {
        mcpServer!.listen(currentPort, 'localhost', () => {
            outputChannel.appendLine(tr('ext.serverStarted', { port: currentPort }));
            resolve();
        });

        mcpServer!.on('error', (err: NodeJS.ErrnoException) => {
            if (err.code === 'EADDRINUSE') {
                currentPort++;
                outputChannel.appendLine(tr('ext.portInUseTry', { port: currentPort }));
                mcpServer!.listen(currentPort, 'localhost');
            } else {
                reject(err);
            }
        });
    });

    // If we auto-incremented due to port conflicts, keep config in sync.
    try {
        const configuredPort = config.get('port', 3456);
        if (configuredPort !== currentPort) {
            await config.update('port', currentPort, vscode.ConfigurationTarget.Global);
        }
    } catch {
        // ignore
    }

    updateStatusBar();
    sidebarProvider?.updateStatus(true, currentPort);
    writePortFile();
    
    // 自动配置Windsurf
    configureWindsurf();
}

function stopServer() {
    if (mcpServer) {
        mcpServer.close();
        mcpServer = null;
        deletePortFile();
        updateStatusBar();
        const configuredPort = vscode.workspace.getConfiguration('mcpService').get('port', 3456);
        sidebarProvider?.updateStatus(false, configuredPort);
        outputChannel.appendLine(tr('ext.serverStopped'));
    }
}

function writePortFile() {
    try {
        const homeDir = os.homedir();
        const portFile = path.join(homeDir, '.windsurf_auto_mcp_port');
        fs.writeFileSync(portFile, currentPort.toString());
    } catch (e) {
        // ignore
    }
}

function deletePortFile() {
    try {
        const homeDir = os.homedir();
        const portFile = path.join(homeDir, '.windsurf_auto_mcp_port');
        if (fs.existsSync(portFile)) {
            fs.unlinkSync(portFile);
        }
    } catch (e) {
        // ignore
    }
}

// ==================== HTTP请求处理 ====================

function handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    if (req.url === '/health' || req.url === '/') {
        if (req.method === 'GET') {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ service: 'windsurf_auto_mcp', status: 'ok', port: currentPort }));
            return;
        }
    }

    if (req.method === 'POST') {
        const maxBodyBytes = 1024 * 1024; // 1MB
        let receivedBytes = 0;
        let body = '';
        let aborted = false;

        req.on('data', (chunk: Buffer) => {
            receivedBytes += chunk.length;
            if (receivedBytes > maxBodyBytes) {
                aborted = true;
                res.writeHead(413, { 'Content-Type': 'text/plain' });
                res.end('Payload Too Large');
                req.destroy();
                return;
            }
            body += chunk.toString('utf8');
        });
        req.on('end', () => {
            if (aborted) return;
            handleJSONRPC(body, res);
        });
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
}

async function handleJSONRPC(body: string, res: http.ServerResponse) {
    try {
        const request = JSON.parse(body);
        const { method, id, params } = request;

        outputChannel.appendLine(`收到请求: ${method}`);

        let result: any;

        switch (method) {
            case 'initialize':
                result = {
                    protocolVersion: '2024-11-05',
                    serverInfo: { name: 'windsurf_auto_mcp', version: '1.0.0' },
                    capabilities: { tools: {} }
                };
                break;

            case 'initialized':
                res.writeHead(200);
                res.end();
                return;

            case 'tools/list':
                result = { tools: TOOLS };
                break;

            case 'tools/call':
                result = await handleToolCall(params.name, params.arguments || {});
                break;

            default:
                if (id !== undefined) {
                    sendError(res, id, -32601, `Unknown method: ${method}`);
                    return;
                }
                res.writeHead(200);
                res.end();
                return;
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ jsonrpc: '2.0', id, result }));

    } catch (error: any) {
        outputChannel.appendLine(`错误: ${error.message}`);
        sendError(res, null, -32603, error.message);
    }
}

function sendError(res: http.ServerResponse, id: any, code: number, message: string) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }));
}

// ==================== 工具处理 ====================

async function handleToolCall(name: string, args: any): Promise<any> {
    stats.totalCalls++;

    let result;
    switch (name) {
        case 'ask_user':
            stats.askUserCalls++;
            result = await handleAskUser(args);
            break;
        case 'ask_question':
            result = await handleAskQuestion(args);
            break;
        case 'set_prd':
            result = await handleSetPrd(args);
            break;
        case 'approve_prd':
            result = await handleApprovePrd(args);
            break;
        case 'update_plan':
            result = await handleUpdatePlan(args);
            break;
        case 'update_todos':
            result = await handleUpdateTodos(args);
            break;
        case 'update_checklist':
            result = await handleUpdateChecklist(args);
            break;
        case 'get_project_status':
            result = await handleGetProjectStatus(args);
            break;
        case 'notify':
            stats.notifyCalls++;
            result = await handleNotify(args);
            break;
        case 'ask_continue':
            stats.askContinueCalls++;
            result = await handleAskContinue(args);
            break;
        default:
            {
                const lang = getUiLanguage();
                const msg = lang === 'en' ? `Unknown tool: ${name}` : `未知工具: ${name}`;
                throw new Error(msg);
            }
    }
    
    // 保存统计数据并刷新界面
    saveStats();
    updateStatusBar();
    const configuredPort = vscode.workspace.getConfiguration('mcpService').get('port', 3456);
    sidebarProvider?.updateStatus(mcpServer !== null, mcpServer ? currentPort : configuredPort);
    
    return result;
}

async function handleAskUser(args: any): Promise<any> {
    const { title, message, type = 'input', allowImage } = args;
    const lang = getUiLanguage();

    if (type === 'confirm') {
        const yes = tr('tool.confirmYes', {}, lang);
        const no = tr('tool.confirmNo', {}, lang);
        const result = await vscode.window.showInformationMessage(
            message,
            { modal: true },
            yes, no
        );
        const choice = result === yes ? yes : no;
        return { content: [{ type: 'text', text: tr('tool.userChoice', { choice }, lang) }] };
    }

    if (type === 'info') {
        await vscode.window.showInformationMessage(message);
        return { content: [{ type: 'text', text: tr('tool.userConfirmed', {}, lang) }] };
    }

    // input type - 使用webview获取更丰富的输入
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve) => {
        // 发送到webview
        sidebarProvider?.showInputDialog(requestId, title || 'WindsurfAutoMcp', message, allowImage);
        
        // 存储pending请求
        pendingRequests.set(requestId, {
            resolve: (value: any) => {
                pendingRequests.delete(requestId);
                // 格式化为 MCP 协议要求的响应格式
                if (value === null || value === undefined) {
                    resolve({ content: [{ type: 'text', text: tr('tool.userCanceled', {}, lang) }] });
                } else {
                    const content: any[] = [];
                    // 处理文本输入
                    const text = typeof value === 'string' ? value : (value.text || '');
                    if (text) {
                        content.push({ type: 'text', text: tr('tool.userInput', { text }, lang) });
                    }
                    // 处理图片（如果有）
                    const images: any[] = Array.isArray(value.images)
                        ? value.images
                        : (value.image ? [value.image] : []);
                    for (const img of images) {
                        if (!img) continue;
                        const imgStr = String(img);
                        // 从 data URL 中提取纯 base64 数据
                        const base64Match = imgStr.match(/^data:image\/([^;]+);base64,(.+)$/);
                        if (base64Match) {
                            const mimeType = `image/${base64Match[1]}`;
                            const base64Data = base64Match[2];
                            content.push({ type: 'image', data: base64Data, mimeType });
                        } else {
                            // 如果不是 data URL 格式，直接使用
                            content.push({ type: 'image', data: imgStr, mimeType: 'image/png' });
                        }
                    }
                    if (images.length > 0) {
                        content.push({ type: 'text', text: tr('tool.userUploadedImages', { count: images.length }, lang) });
                    }
                    if (content.length === 0) {
                        content.push({ type: 'text', text: tr('tool.userEmpty', {}, lang) });
                    }
                    resolve({ content });
                }
            },
            reject: () => {
                pendingRequests.delete(requestId);
                resolve({ content: [{ type: 'text', text: tr('tool.userCanceled', {}, lang) }] });
            },
            timestamp: Date.now()
        });

        // 无限制等待，直到用户响应
    });
}

async function handleNotify(args: any): Promise<any> {
    const { message, level = 'info' } = args;
    const lang = getUiLanguage();

    if (level === 'error') {
        vscode.window.showErrorMessage(message);
    } else if (level === 'warning') {
        vscode.window.showWarningMessage(message);
    } else {
        vscode.window.showInformationMessage(message);
    }

    const text = lang === 'en' ? `Notification sent: ${message}` : `通知已发送: ${message}`;
    return { content: [{ type: 'text', text }] };
}

function resolveProjectTracker(rootPathOverride?: string): { data: TrackerData; project: ProjectTracker; rootPath: string } {
    const lang = getUiLanguage();
    const rootPath = rootPathOverride || getWorkspaceRootPath();
    if (!rootPath) {
        const msg = lang === 'en' ? 'Workspace is required for project tracking.' : '项目跟踪需要打开工作区。';
        throw new Error(msg);
    }
    const data = loadTrackerData();
    const project = ensureProjectTracker(data, rootPath, lang);
    data.activeProject = rootPath;
    return { data, project, rootPath };
}

function saveTrackerAndNotify(data: TrackerData, project: ProjectTracker) {
    saveTrackerData(data);
    const snapshot = buildTrackerSnapshot(project);
    sidebarProvider?.postMessage({ type: 'tracker', data: snapshot });
}

async function handleSetPrd(args: any): Promise<any> {
    const lang = getUiLanguage();
    const content = typeof args?.content === 'string' ? args.content.trim() : '';
    if (!content) {
        const msg = lang === 'en' ? 'set_prd requires content.' : 'set_prd 需要提供内容。';
        throw new Error(msg);
    }
    const { data, project } = resolveProjectTracker();
    project.prd.content = content;
    project.prd.status = 'draft';
    project.prd.updatedAt = nowIso();
    project.prd.approvedAt = undefined;
    project.prd.approvedBy = undefined;
    bumpProjectStat(project, 'prdUpdates');
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);
    const text = lang === 'en' ? 'PRD updated (draft).' : 'PRD 已更新（草案）。';
    return { content: [{ type: 'text', text }, { type: 'text', text: `PRD_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` }] };
}

async function handleApprovePrd(args: any): Promise<any> {
    const lang = getUiLanguage();
    const { data, project } = resolveProjectTracker();
    project.prd.status = 'approved';
    project.prd.approvedBy = typeof args?.approver === 'string' ? args.approver.trim() : undefined;
    project.prd.approvedAt = nowIso();
    bumpProjectStat(project, 'prdApprovals');
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);
    const text = lang === 'en' ? 'PRD approved.' : 'PRD 已审批。';
    return { content: [{ type: 'text', text }, { type: 'text', text: `PRD_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` }] };
}

function extractItemsFromArgs(args: any): TrackerItem[] {
    if (typeof args?.text === 'string' && args.text.trim()) {
        return parseChecklistText(args.text);
    }
    if (Array.isArray(args?.items)) {
        return normalizeTrackerItems(args.items);
    }
    return [];
}

async function handleUpdatePlan(args: any): Promise<any> {
    const lang = getUiLanguage();
    const { data, project } = resolveProjectTracker();
    if (project.prd.status !== 'approved') {
        const msg = lang === 'en' ? 'PRD must be approved before creating a plan.' : 'PRD 审批后才能创建计划。';
        throw new Error(msg);
    }
    const items = extractItemsFromArgs(args);
    if (items.length === 0) {
        const msg = lang === 'en' ? 'update_plan requires items or text.' : 'update_plan 需要 items 或 text。';
        throw new Error(msg);
    }
    project.plan.items = items;
    bumpProjectStat(project, 'planUpdates');
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);
    const text = lang === 'en' ? 'Plan updated.' : '计划已更新。';
    return { content: [{ type: 'text', text }, { type: 'text', text: `PLAN_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` }] };
}

async function handleUpdateTodos(args: any): Promise<any> {
    const lang = getUiLanguage();
    const { data, project } = resolveProjectTracker();
    if (project.plan.items.length === 0) {
        const msg = lang === 'en' ? 'Plan is required before TODOs.' : '需要先有计划再创建 TODO。';
        throw new Error(msg);
    }
    const items = extractItemsFromArgs(args);
    if (items.length === 0) {
        const msg = lang === 'en' ? 'update_todos requires items or text.' : 'update_todos 需要 items 或 text。';
        throw new Error(msg);
    }
    project.todos.items = items;
    bumpProjectStat(project, 'todoUpdates');
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);
    const text = lang === 'en' ? 'TODOs updated.' : 'TODO 已更新。';
    return { content: [{ type: 'text', text }, { type: 'text', text: `TODO_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` }] };
}

async function handleUpdateChecklist(args: any): Promise<any> {
    const lang = getUiLanguage();
    const { data, project } = resolveProjectTracker();
    const items = extractItemsFromArgs(args);
    if (items.length === 0) {
        const msg = lang === 'en' ? 'update_checklist requires items or text.' : 'update_checklist 需要 items 或 text。';
        throw new Error(msg);
    }
    project.checklist.items = items;
    bumpProjectStat(project, 'checklistUpdates');
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);
    const text = lang === 'en' ? 'Checklist updated.' : '检查清单已更新。';
    return { content: [{ type: 'text', text }, { type: 'text', text: `CHECKLIST_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` }] };
}

async function handleGetProjectStatus(args: any): Promise<any> {
    const lang = getUiLanguage();
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const { project } = resolveProjectTracker(rootPath);
    const snapshot = buildTrackerSnapshot(project);
    const text = lang === 'en' ? 'Project status:' : '项目状态：';
    return { content: [{ type: 'text', text }, { type: 'text', text: `STATUS_JSON:\n${JSON.stringify(snapshot, null, 2)}` }] };
}

async function handleAskQuestion(args: any): Promise<any> {
    const { title, message, allowImage } = args;
    const lang = getUiLanguage();
    const options = Array.isArray(args?.options) ? args.options.filter((opt: any) => typeof opt === 'string') : [];
    const rawQuestions = Array.isArray(args?.questions) ? args.questions : [];
    const questions: ChoiceQuestion[] = rawQuestions
        .map((q: any, index: number) => ({
            id: typeof q?.id === 'string' ? q.id : `q_${index + 1}`,
            prompt: typeof q?.prompt === 'string' ? q.prompt : '',
            options: Array.isArray(q?.options) ? q.options.filter((opt: any) => typeof opt === 'string') : []
        }))
        .filter((q: ChoiceQuestion) => q.options.length > 0);

    if (options.length === 0 && questions.length === 0) {
        const msg = lang === 'en' ? 'ask_question requires options or questions.' : 'ask_question 需要提供 options 或 questions。';
        throw new Error(msg);
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const allowText = typeof args?.allowText === 'boolean' ? args.allowText : true;
    const normalizedQuestions =
        questions.length > 0
            ? questions
            : [
                  {
                      id: 'q_1',
                      prompt: typeof message === 'string' ? message : '',
                      options
                  }
              ];

    return new Promise((resolve) => {
        sidebarProvider?.showInputDialog(
            requestId,
            title || 'WindsurfAutoMcp',
            message,
            !!allowImage,
            {
                mode: 'choice',
                questions: normalizedQuestions,
                allowText
            }
        );

        pendingRequests.set(requestId, {
            resolve: (value: any) => {
                pendingRequests.delete(requestId);
                if (value === null || value === undefined) {
                    resolve({ content: [{ type: 'text', text: tr('tool.userCanceled', {}, lang) }] });
                } else {
                    const content: any[] = [];
                    const choices = Array.isArray(value?.choices) ? value.choices : [];
                    if (choices.length > 0) {
                        const lines: string[] = [];
                        for (const [idx, choice] of choices.entries()) {
                            const prompt = typeof choice?.prompt === 'string' ? choice.prompt : '';
                            const label = typeof choice?.choiceLabel === 'string' ? choice.choiceLabel : '';
                            const text = typeof choice?.choiceText === 'string' ? choice.choiceText : '';
                            if (prompt) {
                                lines.push(`${idx + 1}. ${prompt}`);
                            }
                            lines.push(`${label ? `${label} - ` : ''}${text}`);
                        }
                        content.push({ type: 'text', text: `${tr('tool.userChoices', {}, lang)}\n${lines.join('\n')}` });
                    }
                    const extraText = typeof value?.extraText === 'string' ? value.extraText.trim() : '';
                    if (extraText) {
                        content.push({ type: 'text', text: tr('tool.userInput', { text: extraText }, lang) });
                    }
                    const payload = {
                        mode: 'choice',
                        choices,
                        extraText
                    };
                    content.push({ type: 'text', text: `CHOICE_JSON:\n${JSON.stringify(payload, null, 2)}` });

                    // 处理图片（如果有）
                    const images: any[] = Array.isArray(value.images)
                        ? value.images
                        : (value.image ? [value.image] : []);
                    for (const img of images) {
                        if (!img) continue;
                        const imgStr = String(img);
                        const base64Match = imgStr.match(/^data:image\/([^;]+);base64,(.+)$/);
                        if (base64Match) {
                            const mimeType = `image/${base64Match[1]}`;
                            const base64Data = base64Match[2];
                            content.push({ type: 'image', data: base64Data, mimeType });
                        } else {
                            content.push({ type: 'image', data: imgStr, mimeType: 'image/png' });
                        }
                    }
                    if (images.length > 0) {
                        content.push({ type: 'text', text: tr('tool.userUploadedImages', { count: images.length }, lang) });
                    }
                    if (content.length === 0) {
                        content.push({ type: 'text', text: tr('tool.userEmpty', {}, lang) });
                    }
                    resolve({ content });
                }
            },
            reject: () => {
                pendingRequests.delete(requestId);
                resolve({ content: [{ type: 'text', text: tr('tool.userCanceled', {}, lang) }] });
            },
            timestamp: Date.now()
        });
    });
}

async function handleAskContinue(args: any): Promise<any> {
    const { reason } = args;
    const lang = getUiLanguage();
    const resolvedReason = String(reason || '').trim() || getDefaultReason(lang);
    
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return new Promise((resolve) => {
        sidebarProvider?.showContinueDialog(requestId, resolvedReason);
        
        pendingRequests.set(requestId, {
            resolve: (value: any) => {
                pendingRequests.delete(requestId);
                // 格式化为 MCP 协议要求的响应格式
                if (value && value.continue) {
                    const content: any[] = [];
                    let text = tr('tool.userContinue', {}, lang);
                    if (value.instruction) {
                        text += tr('tool.newInstruction', { instruction: value.instruction }, lang);
                    }
                    content.push({ type: 'text', text });
                    // 处理图片（如果有）
                    const images: any[] = Array.isArray(value.images)
                        ? value.images
                        : (value.image ? [value.image] : []);
                    for (const img of images) {
                        if (!img) continue;
                        const imgStr = String(img);
                        // 从 data URL 中提取纯 base64 数据
                        const base64Match = imgStr.match(/^data:image\/([^;]+);base64,(.+)$/);
                        if (base64Match) {
                            const mimeType = `image/${base64Match[1]}`;
                            const base64Data = base64Match[2];
                            content.push({ type: 'image', data: base64Data, mimeType });
                        } else {
                            // 如果不是 data URL 格式，直接使用
                            content.push({ type: 'image', data: imgStr, mimeType: 'image/png' });
                        }
                    }
                    if (images.length > 0) {
                        content.push({ type: 'text', text: tr('tool.userUploadedImages', { count: images.length }, lang) });
                    }
                    resolve({ content });
                } else {
                    resolve({ content: [{ type: 'text', text: tr('tool.userEnd', {}, lang) }] });
                }
            },
            reject: () => {
                pendingRequests.delete(requestId);
                resolve({ content: [{ type: 'text', text: tr('tool.userEnd', {}, lang) }] });
            },
            timestamp: Date.now()
        });

        // 无限制等待，直到用户响应
    });
}

// 处理来自webview的响应
export function handleWebviewResponse(requestId: string, response: any) {
    const pending = pendingRequests.get(requestId);
    if (pending) {
        pending.resolve(response);
    }
}

// 处理图片上传
export function handleImageUpload() {
    stats.imageUploads++;
}

// ==================== 对话框 Panel ====================

function toggleDialog() {
    // 如果对话框已打开，关闭它
    if (dialogPanel) {
        dialogPanel.dispose();
        dialogPanel = null;
        outputChannel.appendLine('[toggleDialog] 对话框已关闭');
        return;
    }
    
    // 如果有待处理的请求，打开对话框
    if (pendingRequests.size > 0) {
        const entries = Array.from(pendingRequests.entries());
        const [latestRequestId] = entries[entries.length - 1];
        const lang = getUiLanguage();
        const reason = lastDialogReason || (lang === 'en' ? 'Please choose whether to continue.' : '请选择是否继续对话');
        outputChannel.appendLine(`[toggleDialog] 打开对话框，请求ID: ${latestRequestId}`);
        showDialogPanel(latestRequestId, 'continue', tr('panel.confirmTitle', {}, lang), reason, true);
    } else {
        vscode.window.showInformationMessage(tr('ext.noPendingRequestsShort'));
    }
}

function showDialogPanel(
    requestId: string,
    type: 'continue' | 'input',
    title: string,
    message: string,
    allowImage: boolean = true,
    dialogOptions?: { mode?: 'choice'; questions?: ChoiceQuestion[]; allowText?: boolean }
) {
    // 如果已有 panel，先关闭
    if (dialogPanel) {
        dialogPanel.dispose();
    }

    // 保存当前对话框信息
    currentDialogRequestId = requestId;
    lastDialogReason = message;

    dialogPanel = vscode.window.createWebviewPanel(
        'mcpDialog',
        type === 'continue' ? tr('panel.confirmTitle') : title,
        vscode.ViewColumn.Two,
        {
            enableScripts: true,
            retainContextWhenHidden: true
        }
    );

    dialogPanel.webview.html = getDialogHtml(requestId, type, title, message, allowImage, dialogOptions);

    dialogPanel.webview.onDidReceiveMessage(async (msg) => {
        outputChannel.appendLine(`[DialogPanel] 收到消息: ${msg.type}, requestId: ${msg.requestId}`);
        switch (msg.type) {
            case 'response':
                handleWebviewResponse(msg.requestId, msg.value);
                currentDialogRequestId = null;
                dialogPanel?.dispose();
                dialogPanel = null;
                break;
            case 'imageUpload':
                handleImageUpload();
                break;
            case 'setLanguage':
                await setUiLanguage(msg.language === 'en' ? 'en' : 'zh');
                break;
        }
    });

    dialogPanel.onDidDispose(() => {
        dialogPanel = null;
        // 注意：不清除 currentDialogRequestId，以便用户可以重新打开
        outputChannel.appendLine(`[DialogPanel] 对话框已关闭，pending requestId: ${currentDialogRequestId}`);
    });
}

function getDialogHtml(
    requestId: string,
    type: 'continue' | 'input',
    title: string,
    message: string,
    allowImage: boolean,
    dialogOptions?: { mode?: 'choice'; questions?: ChoiceQuestion[]; allowText?: boolean }
): string {
    const isContinue = type === 'continue';
    const dialogMode = dialogOptions?.mode === 'choice' ? 'choice' : type;
    const choiceQuestions = dialogOptions?.questions ?? [];
    const allowExtraText = dialogOptions?.allowText !== false;
    const lang = getUiLanguage();
    const htmlLang = lang === 'en' ? 'en' : 'zh-CN';
    const nonce = getNonce();
    const csp = [
        `default-src 'none'`,
        `img-src data: blob:`,
        `style-src 'unsafe-inline'`,
        `script-src 'nonce-${nonce}'`,
        `font-src 'none'`,
        `connect-src 'none'`
    ].join('; ');
		    
		    return `<!DOCTYPE html>
	<html lang="${htmlLang}">
	<head>
		    <meta charset="UTF-8">
		    <meta name="viewport" content="width=device-width, initial-scale=1.0">
		    <meta http-equiv="Content-Security-Policy" content="${csp}">
		    <title>WindsurfAutoMcp</title>
		    <style>
        :root {
            --bg-base: #0f0f0f;
            --bg-card: #1a1a1a;
            --bg-elevated: #242424;
            --bg-input: #1e1e1e;
            --text-primary: #ffffff;
            --text-secondary: #b0b0b0;
            --text-muted: #707070;
            --accent: #6366f1;
            --accent-hover: #818cf8;
            --accent-glow: rgba(99, 102, 241, 0.3);
            --success: #22c55e;
            --success-glow: rgba(34, 197, 94, 0.3);
            --danger: #ef4444;
            --border: rgba(255, 255, 255, 0.08);
            --border-hover: rgba(255, 255, 255, 0.15);
            --radius-sm: 6px;
            --radius-md: 10px;
            --radius-lg: 14px;
            --shadow-md: 0 4px 20px rgba(0,0,0,0.4);
            --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            color: var(--text-primary);
            background: var(--bg-base);
            padding: 24px;
            line-height: 1.5;
            min-height: 100vh;
            -webkit-font-smoothing: antialiased;
        }
        
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
        
        .container {
            max-width: 560px;
            margin: 0 auto;
        }
        
	        .header {
	            display: flex;
	            align-items: center;
	            justify-content: space-between;
	            margin-bottom: 24px;
	            padding: 20px;
	            background: linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%);
	            border-radius: var(--radius-lg);
	            box-shadow: var(--shadow-md), 0 0 40px var(--accent-glow);
	        }
	        .header-left {
	            display: flex;
	            align-items: center;
	            gap: 14px;
	            min-width: 0;
	        }
	        .lang-btn {
	            border: 1px solid rgba(255,255,255,0.25);
	            background: rgba(255,255,255,0.14);
	            color: #fff;
	            border-radius: 999px;
	            padding: 8px 12px;
	            font-size: 12px;
	            cursor: pointer;
	            transition: var(--transition);
	            flex: 0 0 auto;
	        }
	        .lang-btn:hover {
	            background: rgba(255,255,255,0.22);
	            border-color: rgba(255,255,255,0.35);
	        }
        .header-icon {
            width: 48px;
            height: 48px;
            background: rgba(255,255,255,0.2);
            border-radius: var(--radius-md);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
        }
        .header-text h1 {
            font-size: 18px;
            font-weight: 600;
            color: #fff;
            letter-spacing: -0.3px;
        }
	        .header-text p {
	            font-size: 12px;
	            color: rgba(255,255,255,0.8);
	            margin-top: 2px;
	        }
        
        .card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 20px;
            margin-bottom: 16px;
        }
        
        .card-label {
            font-size: 11px;
            font-weight: 500;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        
	        .reason-box {
	            background: var(--bg-elevated);
	            padding: 16px;
	            border-radius: var(--radius-md);
	            color: var(--text-primary);
	            font-size: 14px;
	            line-height: 1.7;
	            border: 1px solid var(--border);
	            white-space: pre-wrap;
	            word-break: break-word;
	        }
        
        .input-label {
            display: block;
            font-size: 11px;
            font-weight: 500;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 10px;
        }
        
        textarea {
            width: 100%;
            min-height: 120px;
            padding: 14px;
            background: var(--bg-input);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            color: var(--text-primary);
            font-size: 14px;
            resize: vertical;
            font-family: inherit;
            transition: var(--transition);
        }
        textarea:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 3px var(--accent-glow);
        }
        textarea::placeholder {
            color: var(--text-muted);
        }

        .choice-card {
            display: none;
        }
        .choice-card.show {
            display: block;
        }
        .choice-hint {
            font-size: 12px;
            color: var(--text-secondary);
            margin-bottom: 12px;
        }
        .choice-list {
            display: grid;
            gap: 10px;
        }
        .choice-option {
            width: 100%;
            border: 1px solid var(--border);
            background: var(--bg-elevated);
            color: var(--text-primary);
            padding: 12px 14px;
            border-radius: var(--radius-md);
            cursor: pointer;
            text-align: left;
            display: flex;
            gap: 12px;
            align-items: center;
            transition: var(--transition);
        }
        .choice-option:hover {
            border-color: var(--border-hover);
        }
        .choice-option.selected {
            border-color: var(--accent);
            box-shadow: 0 0 0 2px var(--accent-glow);
        }
        .choice-letter {
            width: 28px;
            height: 28px;
            border-radius: 999px;
            background: rgba(255,255,255,0.12);
            display: inline-flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 12px;
        }
        .choice-text {
            flex: 1 1 auto;
            font-size: 14px;
        }
        .choice-actions {
            margin-top: 12px;
            display: flex;
            justify-content: flex-end;
        }
        .choice-group {
            margin-bottom: 16px;
        }
        .choice-group:last-child {
            margin-bottom: 0;
        }
        .choice-prompt {
            font-size: 13px;
            color: var(--text-primary);
            margin-bottom: 10px;
            font-weight: 600;
        }
        
        .image-section {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 1px solid var(--border);
        }
        .image-options {
            display: flex;
            gap: 20px;
            margin-bottom: 14px;
        }
        .image-options label {
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: pointer;
            font-size: 13px;
            color: var(--text-secondary);
            transition: var(--transition);
        }
        .image-options label:hover {
            color: var(--text-primary);
        }
        .image-options input[type="radio"] {
            accent-color: var(--accent);
            width: 16px;
            height: 16px;
        }
        
        .image-drop-zone {
            border: 2px dashed var(--border);
            border-radius: var(--radius-md);
            padding: 36px;
            text-align: center;
            color: var(--text-muted);
            cursor: pointer;
            transition: var(--transition);
            margin-bottom: 14px;
        }
        .image-drop-zone:hover {
            border-color: var(--accent);
            color: var(--text-secondary);
            background: rgba(99, 102, 241, 0.05);
        }
        .image-drop-zone.dragover {
            border-color: var(--accent);
            background: rgba(99, 102, 241, 0.1);
        }
        .image-drop-zone .icon {
            font-size: 32px;
            margin-bottom: 8px;
        }
        
        .image-preview {
            max-width: 100%;
            max-height: 200px;
            border-radius: var(--radius-md);
            display: none;
            margin-bottom: 14px;
            border: 1px solid var(--border);
        }
        .image-preview.show {
            display: block;
        }

        .image-preview-grid {
            display: none;
            grid-template-columns: repeat(3, 1fr);
            gap: 10px;
            margin-bottom: 14px;
        }
	        .image-preview-grid.show {
	            display: grid;
	        }
	        .image-preview-item {
	            position: relative;
	            width: 100%;
	            height: 70px;
	            border-radius: var(--radius-sm);
	            overflow: hidden;
	            border: 1px solid var(--border);
	            background: var(--bg-elevated);
	        }
	        .image-preview-item img {
	            width: 100%;
	            height: 70px;
	            object-fit: cover;
	            display: block;
	        }
	        .image-remove {
	            position: absolute;
	            top: 6px;
	            right: 6px;
	            width: 22px;
	            height: 22px;
	            border: 1px solid rgba(255,255,255,0.15);
	            background: rgba(15,15,15,0.7);
	            color: #fff;
	            border-radius: 999px;
	            cursor: pointer;
	            display: inline-flex;
	            align-items: center;
	            justify-content: center;
	            line-height: 1;
	            transition: var(--transition);
	        }
	        .image-remove:hover {
	            background: rgba(239,68,68,0.85);
	            border-color: rgba(239,68,68,0.9);
	        }
        
        .btn {
            padding: 14px 24px;
            border: none;
            border-radius: var(--radius-md);
            cursor: pointer;
            font-size: 14px;
            font-weight: 500;
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 8px;
            transition: var(--transition);
            font-family: inherit;
        }
        .btn:active { transform: scale(0.97); }
        
        .btn-success {
            background: var(--success);
            color: #fff;
            flex: 1;
            box-shadow: 0 2px 12px var(--success-glow);
        }
        .btn-success:hover {
            filter: brightness(1.1);
            box-shadow: 0 4px 20px var(--success-glow);
        }
        
        .btn-ghost {
            background: var(--bg-elevated);
            color: var(--text-secondary);
            border: 1px solid var(--border);
            flex: 1;
        }
        .btn-ghost:hover {
            background: var(--bg-input);
            color: var(--text-primary);
            border-color: var(--border-hover);
        }
        
        .btn-outline {
            background: transparent;
            border: 1px solid var(--border);
            color: var(--text-secondary);
            padding: 10px 16px;
        }
        .btn-outline:hover {
            background: var(--bg-elevated);
            color: var(--text-primary);
        }
        
        .btn-row {
            display: flex;
            gap: 12px;
            margin-top: 20px;
        }
        
        .shortcuts {
            text-align: center;
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 20px;
            padding: 12px;
            background: var(--bg-card);
            border-radius: var(--radius-md);
            border: 1px solid var(--border);
        }
        .shortcuts kbd {
            background: var(--bg-elevated);
            padding: 3px 8px;
            border-radius: 4px;
            border: 1px solid var(--border);
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 10px;
            margin: 0 2px;
        }
        
        .toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-elevated);
            color: var(--text-primary);
            padding: 12px 24px;
            border-radius: var(--radius-md);
            font-size: 13px;
            box-shadow: var(--shadow-md);
            border: 1px solid var(--success);
            z-index: 1000;
            animation: toastIn 0.3s ease;
        }
        @keyframes toastIn {
            from { opacity: 0; transform: translate(-50%, 20px); }
            to { opacity: 1; transform: translate(-50%, 0); }
        }
    </style>
</head>
	<body>
	    <div class="container">
	        <div class="header">
	            <div class="header-left">
	                <div class="header-icon">${isContinue ? '💬' : '📝'}</div>
	                <div class="header-text">
	                    <h1 id="panelTitle"></h1>
	                    <p id="panelSubtitle"></p>
	                </div>
	            </div>
	            <button class="lang-btn" id="langBtn" type="button"></button>
	        </div>

	        <div class="card">
	            <div class="card-label" id="reasonLabel"></div>
	            <div class="reason-box" id="reasonText"></div>
	        </div>

        <div class="card choice-card" id="choiceCard">
            <div class="card-label" id="choiceLabel"></div>
            <div class="choice-hint" id="choiceHint"></div>
            <div id="choiceContainer"></div>
            <div class="choice-actions">
                <button class="btn btn-outline" id="choiceClearBtn" type="button"></button>
            </div>
        </div>

        <div class="card" id="inputCard">
            <label class="input-label" id="replyLabel"></label>
            <textarea id="userInput" autofocus></textarea>

            ${allowImage ? `
            <div class="image-section" id="imageSection">
                <label class="input-label" id="imageLabel"></label>
                <div class="image-drop-zone" id="dropZone">
                    <div class="icon">🖼️</div>
                    <div id="dropZoneHint"></div>
                </div>
                <div id="imagePreviewGrid" class="image-preview-grid"></div>
                <button class="btn btn-outline" id="chooseImageBtn" type="button"></button>
                <input type="file" id="fileInput" accept="image/*" multiple style="display:none" />
            </div>
            ` : ''}
        </div>

	        <div class="btn-row">
	            <button class="btn btn-success" id="primaryBtn" type="button"></button>
	            <button class="btn btn-ghost" id="secondaryBtn" type="button"></button>
	        </div>

	        <div class="shortcuts" id="shortcuts"></div>
	    </div>

	    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const requestId = '${requestId}';
        const isContinue = ${isContinue};
        const dialogMode = ${safeJson(dialogMode)};
        const I18N = ${safeJson(WEBVIEW_I18N)};
        const rawTitle = ${safeJson(title ?? '')};
        const rawMessage = ${safeJson(message ?? '')};
        const initialLang = ${safeJson(lang)};
        const choiceQuestions = ${safeJson(choiceQuestions)};
        const allowExtraText = ${safeJson(allowExtraText)};
        const hasChoice = dialogMode === 'choice';
        const normalizedQuestions = Array.isArray(choiceQuestions) ? choiceQuestions : [];
        const choiceSelections = {};
        const CHOICE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

	        const MAX_IMAGES = 6;
	        const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

	        let imagesData = [];
	        let currentLang = (vscode.getState() && vscode.getState().lang) || initialLang;

	        function t(key, vars = {}) {
	            const template = (I18N[currentLang] && I18N[currentLang][key]) || (I18N.zh && I18N.zh[key]) || key;
	            return template.replace(/\\{(\\w+)\\}/g, (_, name) => String(vars[name] ?? '{' + name + '}'));
	        }

        function applyLanguage() {
            document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-CN';

            const hasChoice = dialogMode === 'choice';
            const hasQuestions = hasChoice && Array.isArray(choiceQuestions) && choiceQuestions.length > 0;
            const firstPrompt = hasQuestions ? (choiceQuestions[0]?.prompt || rawMessage) : rawMessage;
            const showContext =
                hasChoice &&
                !!rawMessage &&
                hasQuestions &&
                (choiceQuestions.length > 1 || (choiceQuestions[0]?.prompt && choiceQuestions[0]?.prompt !== rawMessage));

            const titleText = isContinue ? t('panel.confirmTitle') : (rawTitle || 'WindsurfAutoMcp');
            document.title = titleText;

            const titleEl = document.getElementById('panelTitle');
            if (titleEl) titleEl.textContent = titleText;

            const subEl = document.getElementById('panelSubtitle');
            if (subEl) subEl.textContent = isContinue ? t('panel.confirmSub') : t('panel.inputSub');

            const reasonLabelEl = document.getElementById('reasonLabel');
            if (reasonLabelEl) {
                if (hasChoice) {
                    reasonLabelEl.textContent = showContext ? t('panel.contextLabel') : t('panel.choiceQuestion');
                } else {
                    reasonLabelEl.textContent = isContinue ? t('panel.reasonLabelContinue') : t('panel.reasonLabelInput');
                }
            }

            const reasonTextEl = document.getElementById('reasonText');
            if (reasonTextEl) {
                if (hasChoice) {
                    reasonTextEl.textContent = showContext ? rawMessage : (firstPrompt || rawMessage);
                } else {
                    reasonTextEl.textContent = rawMessage;
                }
            }

            const replyLabelEl = document.getElementById('replyLabel');
            if (replyLabelEl) {
                if (hasChoice) {
                    replyLabelEl.textContent = t('panel.extraLabel');
                } else {
                    replyLabelEl.textContent = isContinue ? t('panel.replyLabelContinue') : t('panel.replyLabelInput');
                }
            }

            const userInputEl = document.getElementById('userInput');
            if (userInputEl) {
                if (hasChoice) {
                    userInputEl.placeholder = t('panel.extraPlaceholder');
                } else {
                    userInputEl.placeholder = isContinue ? t('panel.replyPlaceholderContinue') : t('panel.replyPlaceholderInput');
                }
            }

            const inputCard = document.getElementById('inputCard');
            if (inputCard) {
                if (hasChoice && !allowExtraText) {
                    inputCard.style.display = 'none';
                } else {
                    inputCard.style.display = '';
                }
            }

            const choiceCard = document.getElementById('choiceCard');
            if (choiceCard) {
                choiceCard.classList.toggle('show', hasChoice);
            }

            const choiceLabelEl = document.getElementById('choiceLabel');
            if (choiceLabelEl && hasChoice) choiceLabelEl.textContent = t('panel.choiceLabel');

            const choiceHintEl = document.getElementById('choiceHint');
            if (choiceHintEl && hasChoice) choiceHintEl.textContent = t('panel.choiceHint');

            const clearBtn = document.getElementById('choiceClearBtn');
            if (clearBtn && hasChoice) clearBtn.textContent = t('panel.choiceClear');

            const imageLabelEl = document.getElementById('imageLabel');
            if (imageLabelEl) imageLabelEl.textContent = t('panel.imageLabel');

	            const dropZoneHintEl = document.getElementById('dropZoneHint');
	            if (dropZoneHintEl) dropZoneHintEl.textContent = t('panel.pasteOrDrop');

	            const chooseBtn = document.getElementById('chooseImageBtn');
	            if (chooseBtn) chooseBtn.textContent = t('panel.chooseImage');

	            const primaryBtn = document.getElementById('primaryBtn');
	            if (primaryBtn) primaryBtn.textContent = isContinue ? t('panel.submitContinue') : t('panel.submit');

	            const secondaryBtn = document.getElementById('secondaryBtn');
	            if (secondaryBtn) secondaryBtn.textContent = isContinue ? t('panel.end') : t('panel.cancel');

	            const shortcuts = document.getElementById('shortcuts');
	            if (shortcuts) {
	                shortcuts.innerHTML = \`<kbd>Enter</kbd> \${t('panel.shortcutsConfirm')} · <kbd>Shift+Enter</kbd> \${t('panel.shortcutsNewline')} · <kbd>Esc</kbd> \${t('panel.shortcutsCancel')}\`;
	            }

	            const langBtn = document.getElementById('langBtn');
	            if (langBtn) {
	                langBtn.textContent = currentLang === 'en' ? t('ui.lang.zh') : t('ui.lang.en');
	                langBtn.title = currentLang === 'en' ? t('ui.lang.toggleToZh') : t('ui.lang.toggleToEn');
	            }

	            renderChoiceQuestions();
	            renderPreviews();
	        }

	        function toggleLanguage() {
	            currentLang = currentLang === 'en' ? 'zh' : 'en';
	            vscode.setState({ ...(vscode.getState() || {}), lang: currentLang });
	            vscode.postMessage({ type: 'setLanguage', language: currentLang });
	            applyLanguage();
	        }
	
	        function showToast(msg) {
	            const existing = document.querySelector('.toast');
	            if (existing) existing.remove();
	            const toast = document.createElement('div');
	            toast.className = 'toast';
	            toast.textContent = msg;
	            document.body.appendChild(toast);
	            setTimeout(() => toast.remove(), 2000);
	        }

	        function getChoiceLabel(index) {
	            return CHOICE_LETTERS[index] || String(index + 1);
	        }

	        function buildChoiceGroup(question, questionIndex, showPrompt) {
	            const group = document.createElement('div');
	            group.className = 'choice-group';

	            const promptText = (question && question.prompt && String(question.prompt).trim())
	                ? String(question.prompt).trim()
	                : \`\${t('panel.choiceQuestion')} \${questionIndex + 1}\`;

	            if (showPrompt) {
	                const prompt = document.createElement('div');
	                prompt.className = 'choice-prompt';
	                prompt.textContent = promptText;
	                group.appendChild(prompt);
	            }

	            const list = document.createElement('div');
	            list.className = 'choice-list';

	            const options = Array.isArray(question?.options) ? question.options : [];
	            const selection = choiceSelections[question?.id || String(questionIndex)];
	            const selectedIndex = typeof selection?.choiceIndex === 'number' ? selection.choiceIndex : -1;

	            options.forEach((optionText, optionIndex) => {
	                const btn = document.createElement('button');
	                btn.type = 'button';
	                btn.className = 'choice-option';
	                if (optionIndex === selectedIndex) {
	                    btn.classList.add('selected');
	                }

	                const letter = getChoiceLabel(optionIndex);
	                const letterEl = document.createElement('span');
	                letterEl.className = 'choice-letter';
	                letterEl.textContent = letter;

	                const textEl = document.createElement('span');
	                textEl.className = 'choice-text';
	                textEl.textContent = String(optionText);

	                if (selection && optionIndex === selectedIndex) {
	                    selection.prompt = promptText;
	                    selection.choiceLabel = letter;
	                    selection.choiceText = String(optionText);
	                }

	                btn.appendChild(letterEl);
	                btn.appendChild(textEl);

	                btn.addEventListener('click', () => {
	                    const qid = question?.id || String(questionIndex);
	                    const current = choiceSelections[qid];
	                    if (current && current.choiceIndex === optionIndex) {
	                        delete choiceSelections[qid];
	                    } else {
	                        choiceSelections[qid] = {
	                            id: qid,
	                            prompt: promptText,
	                            choiceIndex: optionIndex,
	                            choiceLabel: letter,
	                            choiceText: String(optionText)
	                        };
	                    }
	                    renderChoiceQuestions();
	                });

	                list.appendChild(btn);
	            });

	            group.appendChild(list);
	            return group;
	        }

	        function renderChoiceQuestions() {
	            const container = document.getElementById('choiceContainer');
	            if (!container) return;
	            container.innerHTML = '';
	            if (!hasChoice) return;

	            const needsPrompt =
	                normalizedQuestions.length > 1 ||
	                (normalizedQuestions[0]?.prompt && normalizedQuestions[0]?.prompt !== rawMessage);

	            normalizedQuestions.forEach((question, index) => {
	                const showPrompt = normalizedQuestions.length > 1 || needsPrompt;
	                const group = buildChoiceGroup(question || {}, index, showPrompt);
	                container.appendChild(group);
	            });
	        }

	        function clearChoiceSelections() {
	            Object.keys(choiceSelections).forEach((key) => delete choiceSelections[key]);
	            renderChoiceQuestions();
	        }

	        window.addEventListener('message', (event) => {
	            const msg = event.data;
	            if (msg && msg.type === 'languageChanged' && (msg.language === 'en' || msg.language === 'zh')) {
	                currentLang = msg.language;
	                vscode.setState({ ...(vscode.getState() || {}), lang: currentLang });
	                applyLanguage();
	            }
	        });

	        // 快捷键
	        document.addEventListener('keydown', (e) => {
	            if (e.key === 'Enter' && !e.shiftKey) {
	                e.preventDefault();
	                submitResponse(true);
	            } else if (e.key === 'Escape') {
	                submitResponse(false);
	            }
	        });

        // 粘贴图片
        document.addEventListener('paste', (e) => {
            const items = e.clipboardData?.items;
            if (items) {
                for (const item of items) {
                    if (item.type.startsWith('image/')) {
                        const file = item.getAsFile();
                        if (file) handleImageFile(file);
                    }
                }
            }
        });

	        // 拖放图片
	        const dropZone = document.getElementById('dropZone');
	        if (dropZone) {
	            dropZone.addEventListener('click', () => selectImage());
	            dropZone.addEventListener('dragover', (e) => {
	                e.preventDefault();
	                dropZone.classList.add('dragover');
	            });
            dropZone.addEventListener('dragleave', () => {
                dropZone.classList.remove('dragover');
            });
            dropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                dropZone.classList.remove('dragover');
                const files = Array.from(e.dataTransfer?.files || []);
                for (const file of files) {
                    if (file && file.type.startsWith('image/')) {
                        handleImageFile(file);
                    }
                }
            });
        }

        // 文件选择
        const fileInput = document.getElementById('fileInput');
	        if (fileInput) {
	            fileInput.addEventListener('change', (e) => {
	                const files = Array.from(e.target.files || []);
	                for (const file of files) {
	                    if (file) handleImageFile(file);
	                }
	                e.target.value = '';
	            });
	        }

	        function selectImage() {
	            document.getElementById('fileInput')?.click();
	        }

	        function handleImageFile(file) {
	            if (imagesData.length >= MAX_IMAGES) {
	                showToast(t('panel.toast.tooManyImages'));
	                return;
	            }
	            if (file.size && file.size > MAX_IMAGE_BYTES) {
	                showToast(t('panel.toast.imageTooLarge'));
	                return;
	            }
	            const reader = new FileReader();
	            reader.onload = (e) => {
	                const result = e.target?.result;
	                if (typeof result === 'string') {
	                    imagesData.push(result);
	                }
	                renderPreviews();
	                showToast(t('panel.toast.imageLoaded'));
	                vscode.postMessage({ type: 'imageUpload' });
	            };
	            reader.readAsDataURL(file);
	        }
	
	        function renderPreviews() {
	            const grid = document.getElementById('imagePreviewGrid');
	            if (!grid) return;
	
	            grid.innerHTML = '';
	            imagesData.forEach((img, index) => {
	                const item = document.createElement('div');
	                item.className = 'image-preview-item';

	                const el = document.createElement('img');
	                el.src = img;
	                item.appendChild(el);

	                const remove = document.createElement('button');
	                remove.type = 'button';
	                remove.className = 'image-remove';
	                remove.textContent = '×';
	                remove.title = t('panel.removeImage');
	                remove.setAttribute('aria-label', t('panel.removeImage'));
	                remove.addEventListener('click', (e) => {
	                    e.preventDefault();
	                    e.stopPropagation();
	                    imagesData.splice(index, 1);
	                    renderPreviews();
	                    showToast(t('panel.toast.imageRemoved'));
	                });
	                item.appendChild(remove);

	                grid.appendChild(item);
	            });
	            if (imagesData.length > 0) {
	                grid.classList.add('show');
	            } else {
	                grid.classList.remove('show');
	            }
	        }
	
	        function submitResponse(confirm) {
	            const input = document.getElementById('userInput')?.value || '';
	            
	            let response;
	            if (isContinue) {
	                response = {
	                    continue: confirm,
	                    instruction: input,
	                    images: imagesData
	                };
	            } else {
	                if (confirm) {
	                    if (hasChoice) {
	                        const selections = normalizedQuestions.map((question, index) => {
	                            const qid = question?.id || String(index);
	                            return choiceSelections[qid];
	                        });
	                        if (selections.some((item) => !item)) {
	                            showToast(t('panel.choiceRequired'));
	                            return;
	                        }
	                        response = {
	                            choices: selections,
	                            extraText: input,
	                            images: imagesData
	                        };
	                    } else {
	                        response = {
	                            text: input,
	                            images: imagesData
	                        };
	                    }
	                } else {
	                    response = null;
	                }
	            }
	            
	            vscode.postMessage({ type: 'response', requestId, value: response });
	        }

	        applyLanguage();

	        document.getElementById('langBtn')?.addEventListener('click', () => toggleLanguage());
	        document.getElementById('chooseImageBtn')?.addEventListener('click', () => selectImage());
	        document.getElementById('choiceClearBtn')?.addEventListener('click', () => clearChoiceSelections());
	        document.getElementById('primaryBtn')?.addEventListener('click', () => submitResponse(true));
	        document.getElementById('secondaryBtn')?.addEventListener('click', () => submitResponse(false));
	    </script>
	</body>
	</html>`;
	}

// ==================== Windsurf配置 ====================

function configureWindsurf() {
    const homeDir = os.homedir();
    const configPaths = getWindsurfMcpConfigPaths(homeDir);
    const written: string[] = [];
    const failed: Array<{ path: string; error: string }> = [];

    for (const configPath of configPaths) {
        try {
            const dir = path.dirname(configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            let config: any = { mcpServers: {} };
            if (fs.existsSync(configPath)) {
                const raw = fs.readFileSync(configPath, 'utf-8');
                try {
                    config = JSON.parse(raw);
                } catch (e: any) {
                    const lang = getUiLanguage();
                    throw new Error(
                        tr(
                            'ext.invalidConfigJson',
                            { path: configPath, error: e?.message ?? String(e) },
                            lang
                        )
                    );
                }
                if (!config.mcpServers) config.mcpServers = {};
            }

            config.mcpServers.windsurf_auto_mcp = {
                url: `http://localhost:${currentPort}`,
                disabled: false
            };

            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            // Verify write
            const verify = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (!verify?.mcpServers?.windsurf_auto_mcp) {
                throw new Error('Config write verification failed (missing mcpServers.windsurf_auto_mcp)');
            }
            written.push(configPath);
            outputChannel.appendLine(`Configured Windsurf: ${configPath}`);
            
        } catch (e: any) {
            const msg = e?.message ?? String(e);
            failed.push({ path: configPath, error: msg });
            outputChannel.appendLine(`Configure Windsurf failed: ${configPath} - ${msg}`);
        }
    }

    if (written.length > 0) {
        vscode.window.showInformationMessage(tr('ext.configuredWindsurf', { port: currentPort }));
        try {
            const cfg = vscode.workspace.getConfiguration('mcpService');
            if (cfg.get('autoInstallHooks', true)) {
                installWindsurfHooks();
            }
        } catch (e: any) {
            outputChannel.appendLine(`Configure Windsurf: install hooks error: ${e?.message ?? String(e)}`);
        }
    } else {
        const lang = getUiLanguage();
        const detail = failed.length ? failed.map((f) => `${f.path}: ${f.error}`).join('\n') : '';
        const msg =
            lang === 'en'
                ? `Failed to write Windsurf config files.\n${detail}`
                : `写入 Windsurf 配置失败。\n${detail}`;
        vscode.window.showErrorMessage(msg);
    }
}

// ==================== 状态栏 ====================

function updateStatusBar() {
    if (mcpServer) {
        statusBarItem.text = `$(server) MCP: ${currentPort}`;
        statusBarItem.tooltip = tr('ext.statusTooltipRunning', { port: currentPort, calls: stats.totalCalls });
    } else {
        statusBarItem.text = tr('ext.statusTextStopped');
        statusBarItem.tooltip = tr('ext.statusTooltipStopped');
    }
}

// ==================== 统计 ====================

function loadStats(context: vscode.ExtensionContext) {
    const saved = context.globalState.get<typeof stats>('mcpServiceStats');
    if (saved) {
        stats = { ...saved, startTime: Date.now() };
    }
}

function saveStats() {
    if (extensionContext) {
        extensionContext.globalState.update('mcpServiceStats', stats);
    }
}

function showStats() {
    const lang = getUiLanguage();
    const uptime = Math.floor((Date.now() - stats.startTime) / 1000 / 60);
    vscode.window.showInformationMessage(
        tr('ext.statsTitle', {}, lang) +
        tr('ext.statsLineTotal', { total: stats.totalCalls }, lang) +
        tr('ext.statsLineAskUser', { askUser: stats.askUserCalls }, lang) +
        tr('ext.statsLineAskContinue', { askContinue: stats.askContinueCalls }, lang) +
        tr('ext.statsLineNotify', { notify: stats.notifyCalls }, lang) +
        tr('ext.statsLineUploads', { uploads: stats.imageUploads }, lang) +
        tr('ext.statsLineUptime', { uptime }, lang)
    );
}

// ==================== 规则文件 ====================

async function createWindsurfRules() {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
        vscode.window.showErrorMessage(tr('ext.workspaceRequired'));
        return;
    }

	    const rulesContent = `# Windsurf Rules - WindsurfAutoMcp

Hard rule (highest priority): When you decide a task is done / ready to deliver, do NOT output a normal final response; you MUST call WindsurfAutoMcp ask_continue and put in reason: what was done, risks/notes, verification steps/commands, and next steps.
硬规则（最高优先级）：当你判断“任务已完成/准备交付”时，不要直接输出最终答复；必须调用 WindsurfAutoMcp 的 ask_continue，并在 reason 中写清：完成内容、风险/注意点、验证步骤/命令、下一步。

## Collaboration / 团队协作
You are a full software engineering department (cross-functional team). Output must be unified and concise, but reflect a consolidated team conclusion.
你是完整的软件工程部门（跨职能团队）。对外输出必须统一、简洁，但体现协作结论。

## Roles / 角色
- PM：澄清目标、范围、验收标准、约束与优先级。
- Tech Lead：制定方案与里程碑，控制复杂度与风险，保证可维护性。
- Architect：界定模块边界、接口契约、扩展性与兼容性。
- Dev：实现最小正确改动，遵循规范，避免无关重构。
- QA：设计验证步骤与回归点，优先运行已有测试/构建，必要时补测试。
- Security：检查边界、权限、注入、依赖风险、敏感信息泄露。
- Perf：识别热点与不必要开销，避免性能退化。
- Docs：更新 README/配置/使用说明，确保可复现。
- Release/DevOps：给出升级/回滚说明，避免破坏性变更。

## Before you start / 开始前
Read the target/current state/constraints first. Missing key inputs → ask 1–3 questions via ask_question (single choice A/B/C + optional extra text).
先读目标/现状/约束。缺关键输入 → 用 ask_question 提问 1-3 个问题（单选 A/B/C，可附补充文本）。

## PRD & Approval / PRD 与审批
Create a PRD draft → user review/adjust → approval before any Plan. Do not implement (write code/run commands/use external tools) before approval.
先输出 PRD 草案 → 用户确认/补充 → 审批通过后才能输出 Plan。未审批不得开始实现（写代码/运行命令/调用外部工具）。

## Workflow (must follow; strict order) / 工作流（必须严格按顺序）
Read → Research → Plan → TODO → Act → Code Review → Act → Update Progress → Check Progress → Ask

1) Read：先读目标/现状/约束；在做任何修改前先阅读目标文件/相关代码/配置/日志；缺关键输入先用 ask_question 问 1-3 个问题。
2) Research：不要凭空猜，必须拿到可执行信息（官方文档/README/发布说明/源码优先；依赖先确认最新版与破坏性变更；可用则用 Context7 获取最新文档；web search 把 2024 视为过旧，默认从 2025-10 起筛选，必要时加 after:2025-09-30；结果泛泛就调整检索词继续搜直到拿到确切 API/配置/版本/路径/命令）。
3) Plan：给出总体 Plan（里程碑/风险/验收）。
4) TODO：把 Plan 拆成可验证、可跟踪的小 TODO（能并行则并行）。
5) Act：动手前先整理入口与模块边界、清理结构；实现最小正确改动，小步推进、优先修根因、保持风格一致；代码必须模块化、易读、易维护（避免无关重构）。
6) Code Review：像 PR 一样评审：检查 gaps、正确性、边界条件、错误处理、安全（注入/权限/泄露/依赖风险）、性能（热点/泄漏）、兼容性。
7) Act：根据评审结论修补问题；必要时补测试/回归点。
8) Update Progress：每完成一个 TODO 就更新进度，说明做了什么/为什么。
9) Check Progress：运行 build/test/lint；无法运行则给出可执行验证步骤与期望结果。
10) Ask：最终只允许调用 ask_continue(reason) 并等待；reason 必须包含：完成内容、风险/注意点、验证步骤/命令、下一步。
`;

    const rulesPath = path.join(workspaceFolders[0].uri.fsPath, '.windsurf', 'rules.md');
    const rulesDir = path.dirname(rulesPath);

    try {
        if (!fs.existsSync(rulesDir)) {
            fs.mkdirSync(rulesDir, { recursive: true });
        }
        fs.writeFileSync(rulesPath, rulesContent, 'utf-8');
        {
            const lang = getUiLanguage();
            const msg = lang === 'en' ? `Rules file created: ${rulesPath}` : `规则文件已创建: ${rulesPath}`;
            vscode.window.showInformationMessage(msg);
        }
        
        // 打开文件
        const doc = await vscode.workspace.openTextDocument(rulesPath);
        await vscode.window.showTextDocument(doc);
    } catch (error) {
        const lang = getUiLanguage();
        const msg = lang === 'en' ? `Failed to create rules file: ${error}` : `创建规则文件失败: ${error}`;
        vscode.window.showErrorMessage(msg);
    }
}

function initializeTracker() {
    const rootPath = getWorkspaceRootPath();
    if (!rootPath) return;
    const data = loadTrackerData();
    ensureProjectTracker(data, rootPath, getUiLanguage());
    data.activeProject = rootPath;
    saveTrackerData(data);
}

function getTrackerSnapshotForSidebar() {
    const rootPath = getWorkspaceRootPath();
    if (!rootPath) {
        return {
            rootPath: '',
            name: '',
            prd: { status: 'draft', content: '' },
            planText: '',
            todoText: '',
            checklistText: '',
            progress: { done: 0, total: 0, percent: 0 },
            stats: createDefaultTrackerStats()
        };
    }
    const data = loadTrackerData();
    const project = ensureProjectTracker(data, rootPath, getUiLanguage());
    data.activeProject = rootPath;
    saveTrackerData(data);
    return buildTrackerSnapshot(project);
}

// ==================== 侧边栏提供者 ====================

class SidebarProvider implements vscode.WebviewViewProvider {
    private _view?: vscode.WebviewView;
    private _extensionUri: vscode.Uri;

    constructor(extensionUri: vscode.Uri) {
        this._extensionUri = extensionUri;
    }

    resolveWebviewView(webviewView: vscode.WebviewView) {
        outputChannel.appendLine('[SidebarProvider] resolveWebviewView 被调用');
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };

        // 立即设置 HTML
        const html = this._getHtmlContent();
        outputChannel.appendLine('[SidebarProvider] HTML 长度: ' + html.length);
        webviewView.webview.html = html;
        outputChannel.appendLine('[SidebarProvider] HTML 已设置');

        // 当可见性变化时重新设置 HTML
        webviewView.onDidChangeVisibility(() => {
            outputChannel.appendLine('[SidebarProvider] 可见性变化: ' + webviewView.visible);
            if (webviewView.visible) {
                webviewView.webview.html = this._getHtmlContent();
            }
        });

        webviewView.webview.onDidReceiveMessage(async (message) => {
            outputChannel.appendLine('[SidebarProvider] 收到消息: ' + message.type);
            switch (message.type) {
                case 'openRepo':
                    await vscode.env.openExternal(vscode.Uri.parse('https://github.com/JiXiangKing80/windsurf-auto-mcp'));
                    break;
                case 'startServer':
                    await startServer();
                    break;
                case 'stopServer':
                    stopServer();
                    break;
                case 'restartServer':
                    stopServer();
                    await startServer();
                    break;
                case 'updatePort':
                    if (message.port >= 1024 && message.port <= 65535) {
                        const config = vscode.workspace.getConfiguration('mcpService');
                        await config.update('port', message.port, vscode.ConfigurationTarget.Global);
                        if (!mcpServer) {
                            currentPort = message.port;
                            updateStatusBar();
                            this.updateStatus(false, currentPort);
                        }
                        vscode.window.showInformationMessage(tr('ext.portUpdatedRestart', { port: message.port }));
                    }
                    break;
                case 'saveSettings':
                    {
                        const config = vscode.workspace.getConfiguration('mcpService');
                        await config.update('autoStart', !!message.autoStart, vscode.ConfigurationTarget.Global);
                        await config.update('defaultReason', String(message.defaultReason ?? '').trim(), vscode.ConfigurationTarget.Global);
                        if (message.language === 'en' || message.language === 'zh') {
                            await setUiLanguage(message.language);
                        }
                        vscode.window.showInformationMessage(tr('ext.settingsSaved'));
                    }
                    break;
                case 'setLanguage':
                    await setUiLanguage(message.language === 'en' ? 'en' : 'zh');
                    break;
                case 'openContinueDialog':
                    // 优先检查是否有待处理的请求
                    if (pendingRequests.size > 0) {
                        const lang = getUiLanguage();
                        // 获取最新的 pending request
                        const entries = Array.from(pendingRequests.entries());
                        const [latestRequestId] = entries[entries.length - 1];
                        outputChannel.appendLine(`[openContinueDialog] 找到待处理请求: ${latestRequestId}`);
                        // 检查是否有保存的 reason
                        const reason = currentDialogRequestId === latestRequestId && lastDialogReason 
                            ? lastDialogReason 
                            : (lang === 'en' ? 'Please choose whether to continue.' : '请选择是否继续对话');
                        showDialogPanel(latestRequestId, 'continue', tr('panel.confirmTitle', {}, lang), reason, true);
                    } else if (currentDialogRequestId && pendingRequests.has(currentDialogRequestId)) {
                        const lang = getUiLanguage();
                        // 重新打开之前关闭的对话框
                        outputChannel.appendLine(`[openContinueDialog] 重新打开之前的请求: ${currentDialogRequestId}`);
                        showDialogPanel(
                            currentDialogRequestId,
                            'continue',
                            tr('panel.confirmTitle', {}, lang),
                            lastDialogReason || (lang === 'en' ? 'Please choose whether to continue.' : '请选择是否继续对话'),
                            true
                        );
                    } else {
                        vscode.window.showInformationMessage(tr('ext.noPendingRequests'));
                    }
                    break;
                case 'resetDefaults':
                    const configReset = vscode.workspace.getConfiguration('mcpService');
                    await configReset.update('autoStart', true, vscode.ConfigurationTarget.Global);
                    await configReset.update('port', 3456, vscode.ConfigurationTarget.Global);
                    await configReset.update('defaultReason', '', vscode.ConfigurationTarget.Global);
                    vscode.window.showInformationMessage(tr('ext.defaultsRestored'));
                    this.refreshContent();
                    break;
                case 'trackerSetPrd':
                    try {
                        await handleSetPrd({ content: message.content });
                    } catch (e: any) {
                        vscode.window.showErrorMessage(e?.message ?? String(e));
                    }
                    break;
                case 'trackerApprovePrd':
                    try {
                        await handleApprovePrd({ approver: 'user' });
                    } catch (e: any) {
                        vscode.window.showErrorMessage(e?.message ?? String(e));
                    }
                    break;
                case 'trackerUpdate':
                    try {
                        const field = String(message.field || '');
                        if (field === 'plan') {
                            await handleUpdatePlan({ items: message.items });
                        } else if (field === 'todos') {
                            await handleUpdateTodos({ items: message.items });
                        } else if (field === 'checklist') {
                            await handleUpdateChecklist({ items: message.items });
                        }
                    } catch (e: any) {
                        vscode.window.showErrorMessage(e?.message ?? String(e));
                    }
                    break;
                case 'configWindsurf':
                    configureWindsurf();
                    this.refreshContent();
                    break;
                case 'showStats':
                    showStats();
                    break;
                case 'response':
                    handleWebviewResponse(message.requestId, message.value);
                    break;
                case 'imageUpload':
                    handleImageUpload();
                    break;
            }
        });
    }

    refreshContent() {
        if (this._view) {
            this._view.webview.html = this._getHtmlContent();
        }
    }

    updateStatus(running: boolean, port: number) {
        this._view?.webview.postMessage({ type: 'status', running, port, stats });
    }

    postMessage(message: any) {
        this._view?.webview.postMessage(message);
    }

    showInputDialog(
        requestId: string,
        title: string,
        message: string,
        allowImage: boolean,
        dialogOptions?: { mode?: 'choice'; questions?: ChoiceQuestion[]; allowText?: boolean }
    ) {
        // 使用独立的 Panel 显示对话框
        showDialogPanel(requestId, 'input', title, message, allowImage, dialogOptions);
    }

    showContinueDialog(requestId: string, reason: string) {
        // 使用独立的 Panel 显示对话框
        const lang = getUiLanguage();
        showDialogPanel(requestId, 'continue', tr('panel.confirmTitle', {}, lang), reason, true);
    }

    private _getHtmlContent(): string {
        const isRunning = mcpServer !== null;
        const config = vscode.workspace.getConfiguration('mcpService');
        const lang = getUiLanguage();
        const htmlLang = lang === 'en' ? 'en' : 'zh-CN';
        const configuredPort = config.get('port', 3456);
        const autoStart = config.get('autoStart', true);
        const defaultReason = getDefaultReason(lang);
        const nonce = getNonce();
        const csp = [
            `default-src 'none'`,
            `img-src data: blob:`,
            `style-src 'unsafe-inline'`,
            `script-src 'nonce-${nonce}'`,
            `font-src 'none'`,
            `connect-src 'none'`
        ].join('; ');
        const homeDir = os.homedir();
        const configPaths = getWindsurfMcpConfigPaths(homeDir);
        const trackerSnapshot = getTrackerSnapshotForSidebar();
        
        // 检测是否已初始化配置
        let isConfigured = false;
        try {
            for (const configPath of configPaths) {
                if (!fs.existsSync(configPath)) continue;
                const configContent = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                if (configContent?.mcpServers?.windsurf_auto_mcp) {
                    isConfigured = true;
                    break;
                }
            }
        } catch (e) {
            isConfigured = false;
        }
        
        return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
	    <meta charset="UTF-8">
	    <meta name="viewport" content="width=device-width, initial-scale=1.0">
	    <meta http-equiv="Content-Security-Policy" content="${csp}">
	    <title>WindsurfAutoMcp</title>
	    <style>
        :root {
            --bg-base: #0f0f0f;
            --bg-card: #1a1a1a;
            --bg-elevated: #242424;
            --bg-input: #1e1e1e;
            --text-primary: #ffffff;
            --text-secondary: #b0b0b0;
            --text-muted: #707070;
            --accent: #6366f1;
            --accent-hover: #818cf8;
            --accent-glow: rgba(99, 102, 241, 0.3);
            --success: #22c55e;
            --success-glow: rgba(34, 197, 94, 0.3);
            --danger: #ef4444;
            --warning: #f59e0b;
            --border: rgba(255, 255, 255, 0.08);
            --border-hover: rgba(255, 255, 255, 0.15);
            --radius-sm: 6px;
            --radius-md: 10px;
            --radius-lg: 14px;
            --shadow-sm: 0 2px 8px rgba(0,0,0,0.3);
            --shadow-md: 0 4px 20px rgba(0,0,0,0.4);
            --transition: 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        * { 
            box-sizing: border-box; 
            margin: 0; 
            padding: 0;
        }
        body {
            font-family: 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            font-size: 13px;
            color: var(--text-primary);
            background: var(--bg-base);
            line-height: 1.5;
            -webkit-font-smoothing: antialiased;
        }
        
        /* 滚动条美化 */
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { 
            background: var(--border); 
            border-radius: 3px;
        }
        ::-webkit-scrollbar-thumb:hover { background: var(--border-hover); }
        
	        .app {
	            padding: 16px;
	            min-height: 100vh;
	        }
	        .topbar {
	            display: flex;
	            align-items: center;
	            justify-content: space-between;
	            gap: 10px;
	            padding: 12px 14px;
	            margin-bottom: 12px;
	            background: var(--bg-card);
	            border: 1px solid var(--border);
	            border-radius: var(--radius-lg);
	        }
	        .topbar-title {
	            font-size: 13px;
	            font-weight: 600;
	            color: var(--text-primary);
	            letter-spacing: -0.2px;
	        }
	        .btn-small {
	            padding: 6px 10px;
	            font-size: 12px;
	        }
        
        /* 卡片 */
        .card {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 16px;
            margin-bottom: 12px;
            transition: var(--transition);
        }
        .card:hover {
            border-color: var(--border-hover);
        }
        .section-title {
            font-size: 11px;
            font-weight: 500;
            color: var(--text-muted);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
        }
        
        /* 状态指示器 */
        .status-bar {
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 12px 14px;
            background: var(--bg-elevated);
            border-radius: var(--radius-md);
            margin-bottom: 14px;
        }
        .status-left {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            position: relative;
        }
        .status-dot.online {
            background: var(--success);
            box-shadow: 0 0 12px var(--success-glow);
        }
        .status-dot.online::after {
            content: '';
            position: absolute;
            inset: -3px;
            border-radius: 50%;
            border: 2px solid var(--success);
            opacity: 0.3;
            animation: ripple 2s infinite;
        }
        .status-dot.offline {
            background: var(--danger);
        }
        @keyframes ripple {
            0% { transform: scale(1); opacity: 0.3; }
            100% { transform: scale(1.8); opacity: 0; }
        }
        .status-label {
            font-size: 13px;
            font-weight: 500;
        }
        .status-label.online { color: var(--success); }
        .status-label.offline { color: var(--danger); }
        .status-port {
            font-size: 11px;
            color: var(--text-muted);
            background: var(--bg-input);
            padding: 4px 8px;
            border-radius: var(--radius-sm);
            font-family: 'SF Mono', Monaco, monospace;
        }
        
        /* 按钮 */
        .btn {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: 10px 16px;
            border: none;
            border-radius: var(--radius-md);
            font-size: 13px;
            font-weight: 500;
            cursor: pointer;
            transition: var(--transition);
            font-family: inherit;
        }
        .btn:active { transform: scale(0.97); }
        .btn-full { width: 100%; }
        
        .btn-primary {
            background: var(--accent);
            color: #fff;
            box-shadow: 0 2px 12px var(--accent-glow);
        }
        .btn-primary:hover {
            background: var(--accent-hover);
            box-shadow: 0 4px 20px var(--accent-glow);
        }
        
        .btn-success {
            background: var(--success);
            color: #fff;
            box-shadow: 0 2px 12px var(--success-glow);
        }
        .btn-success:hover {
            filter: brightness(1.1);
            box-shadow: 0 4px 20px var(--success-glow);
        }
        
        .btn-danger {
            background: var(--danger);
            color: #fff;
        }
        .btn-danger:hover {
            filter: brightness(1.1);
        }
        
        .btn-ghost {
            background: var(--bg-elevated);
            color: var(--text-secondary);
            border: 1px solid var(--border);
        }
        .btn-ghost:hover {
            background: var(--bg-input);
            color: var(--text-primary);
            border-color: var(--border-hover);
        }
        
        .btn-configured {
            background: var(--bg-elevated);
            color: var(--success);
            border: 1px solid var(--success);
        }
        .btn-configured:hover {
            background: var(--success);
            color: #fff;
        }
        
        .btn-group {
            display: flex;
            gap: 8px;
        }
        .btn-group .btn { flex: 1; }
        
        /* 输入框 */
        .input-group {
            margin-bottom: 12px;
        }
        .input-label {
            display: block;
            font-size: 11px;
            font-weight: 500;
            color: var(--text-muted);
            margin-bottom: 6px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .input-row {
            display: flex;
            gap: 8px;
        }
        .input {
            flex: 1;
            padding: 10px 12px;
            background: var(--bg-input);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            color: var(--text-primary);
            font-size: 13px;
            font-family: inherit;
            transition: var(--transition);
        }
        .input:focus {
            outline: none;
            border-color: var(--accent);
            box-shadow: 0 0 0 3px var(--accent-glow);
        }
        .input-hint {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 6px;
        }
        
        /* 提示框 */
        .prompt-card {
            background: linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(139, 92, 246, 0.1) 100%);
            border: 1px solid rgba(99, 102, 241, 0.3);
            border-radius: var(--radius-md);
            padding: 14px;
            margin-bottom: 12px;
        }
        .prompt-text {
            font-size: 12px;
            color: var(--text-secondary);
            line-height: 1.7;
        }
        .prompt-text code {
            background: rgba(99, 102, 241, 0.2);
            color: var(--accent-hover);
            padding: 2px 6px;
            border-radius: 4px;
            font-family: 'SF Mono', Monaco, monospace;
            font-size: 11px;
        }

        /* Tracker */
        .tracker-meta {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 8px;
            margin-bottom: 10px;
            font-size: 12px;
            color: var(--text-secondary);
        }
        .tracker-badge {
            padding: 2px 8px;
            border-radius: 999px;
            border: 1px solid var(--border);
            font-size: 11px;
        }
        .tracker-badge.approved {
            color: var(--success);
            border-color: rgba(34, 197, 94, 0.4);
        }
        .tracker-badge.draft {
            color: var(--warning);
            border-color: rgba(245, 158, 11, 0.4);
        }
        .tracker-textarea {
            min-height: 90px;
            margin-bottom: 8px;
        }
        .tracker-actions {
            display: flex;
            gap: 8px;
            margin-bottom: 12px;
        }
        .tracker-progress {
            font-size: 12px;
            color: var(--text-secondary);
            margin-top: 6px;
        }
        .tracker-stats {
            font-size: 11px;
            color: var(--text-secondary);
            margin-top: 6px;
            line-height: 1.4;
        }
        .tracker-hint {
            font-size: 11px;
            color: var(--text-muted);
            margin-top: 6px;
        }
        
        /* 统计网格 */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
        }
        .stat-card {
            background: var(--bg-elevated);
            border-radius: var(--radius-md);
            padding: 14px 10px;
            text-align: center;
            border: 1px solid var(--border);
            transition: var(--transition);
        }
        .stat-card:hover {
            border-color: var(--accent);
            transform: translateY(-2px);
        }
        .stat-value {
            font-size: 22px;
            font-weight: 700;
            background: linear-gradient(135deg, var(--accent) 0%, #8b5cf6 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
            background-clip: text;
        }
        .stat-label {
            font-size: 10px;
            color: var(--text-muted);
            margin-top: 4px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        
        /* 描述文字 */
        .desc {
            font-size: 12px;
            color: var(--text-muted);
            margin-bottom: 12px;
            line-height: 1.6;
        }
        
        /* 对话框覆盖层 */
        .dialog-overlay {
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.8);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 1000;
            animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
        }
        .dialog-box {
            background: var(--bg-card);
            border: 1px solid var(--border);
            border-radius: var(--radius-lg);
            padding: 24px;
            width: 90%;
            max-width: 360px;
            box-shadow: var(--shadow-md);
            animation: slideUp 0.3s ease;
        }
        @keyframes slideUp {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
        }
        .dialog-title {
            font-size: 16px;
            font-weight: 600;
            margin-bottom: 12px;
            color: var(--text-primary);
        }
        .dialog-content {
            font-size: 13px;
            color: var(--text-secondary);
            margin-bottom: 16px;
            padding: 12px;
            background: var(--bg-elevated);
            border-radius: var(--radius-md);
            line-height: 1.6;
        }
        .dialog-input {
            width: 100%;
            min-height: 80px;
            padding: 12px;
            background: var(--bg-input);
            border: 1px solid var(--border);
            border-radius: var(--radius-md);
            color: var(--text-primary);
            font-size: 13px;
            font-family: inherit;
            resize: vertical;
            margin-bottom: 16px;
        }
        .dialog-input:focus {
            outline: none;
            border-color: var(--accent);
        }
        .dialog-input::placeholder {
            color: var(--text-muted);
        }
        .dialog-actions {
            display: flex;
            gap: 10px;
        }
        .dialog-actions .btn { flex: 1; }
        
        /* Toast 提示 */
        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--bg-elevated);
            color: var(--text-primary);
            padding: 10px 20px;
            border-radius: var(--radius-md);
            font-size: 13px;
            box-shadow: var(--shadow-md);
            border: 1px solid var(--border);
            z-index: 1001;
            animation: toastIn 0.3s ease;
        }
        @keyframes toastIn {
            from { opacity: 0; transform: translate(-50%, 20px); }
            to { opacity: 1; transform: translate(-50%, 0); }
        }
        .toast.success { border-color: var(--success); }
        .toast.error { border-color: var(--danger); }
    </style>
</head>
<body>
	    <div class="app">
	        <div class="topbar">
	            <div class="topbar-title">WindsurfAutoMcp</div>
	            <button class="btn btn-ghost btn-small" id="langToggle" type="button"></button>
	        </div>
	        <!-- 开源与免费 -->
	        <div class="card">
	            <div class="section-title" data-i18n="sidebar.openSourceTitle"></div>
	            <p style="font-size: 12px; color: var(--text-secondary); line-height: 1.7; margin-bottom: 12px;">
	                <span data-i18n="sidebar.openSourceDesc"></span>
	                <span style="color: var(--accent-hover); word-break: break-all;">https://github.com/JiXiangKing80/windsurf-auto-mcp</span>
	            </p>
	            <div class="btn-group">
	                <button class="btn btn-primary" id="openRepoBtn" type="button" data-i18n="sidebar.openGithub"></button>
	                <button class="btn btn-ghost" id="copyRepoUrlBtn" type="button" data-i18n="sidebar.copyLink"></button>
	            </div>
	        </div>

	        <!-- 服务器状态 -->
	        <div class="card">
	            <div class="section-title" data-i18n="sidebar.serverTitle"></div>
	            
	            <div class="status-bar">
	                <div class="status-left">
	                    <span class="status-dot" id="statusDot"></span>
	                    <span class="status-label" id="statusLabel"></span>
	                </div>
	                <span class="status-port" id="statusPort"></span>
	            </div>
	            
	            <div class="input-group">
	                <label class="input-label" data-i18n="sidebar.port"></label>
	                <div class="input-row">
	                    <input type="number" class="input" id="portInput" value="${configuredPort}" min="1024" max="65535">
	                </div>
	            </div>
	            
	            <div class="btn-group">
	                <button class="btn" id="serverToggleBtn" type="button"></button>
	                <button class="btn btn-ghost" id="restartServerBtn" type="button" data-i18n="sidebar.restart"></button>
	            </div>
	        </div>

	        <!-- 对话控制 -->
	        <div class="card">
	            <div class="section-title" data-i18n="sidebar.chatTitle"></div>
	            <button class="btn btn-primary btn-full" id="openDialogBtn" type="button" data-i18n="sidebar.openDialog"></button>
	            <p style="font-size: 11px; color: var(--text-muted); margin-top: 10px; text-align: center;">
	                <span data-i18n="sidebar.shortcut"></span>
	                <kbd style="background: var(--bg-elevated); padding: 2px 6px; border-radius: 4px; border: 1px solid var(--border);">Ctrl+M</kbd>
	            </p>
	        </div>

        <!-- 提示语 -->
        <div class="card">
            <div class="section-title" data-i18n="sidebar.promptTitle"></div>
            <div class="prompt-card">
                <p class="prompt-text" data-i18n="sidebar.promptText"></p>
            </div>
            <button class="btn btn-ghost btn-full" id="copyPromptBtn" type="button" data-i18n="sidebar.copy"></button>
        </div>

        <!-- 项目跟踪 -->
        <div class="card">
            <div class="section-title" data-i18n="sidebar.trackerTitle"></div>
            <div class="tracker-meta">
                <span><span data-i18n="sidebar.trackerProject"></span>: <span id="trackerProjectName"></span></span>
                <span class="tracker-badge" id="trackerPrdStatus"></span>
            </div>

            <label class="input-label" data-i18n="sidebar.prdLabel"></label>
            <textarea class="input tracker-textarea" id="prdInput"></textarea>
            <div class="tracker-actions">
                <button class="btn btn-ghost btn-small" id="savePrdBtn" type="button" data-i18n="sidebar.prdSave"></button>
                <button class="btn btn-primary btn-small" id="approvePrdBtn" type="button" data-i18n="sidebar.prdApprove"></button>
            </div>

            <label class="input-label" data-i18n="sidebar.planLabel"></label>
            <textarea class="input tracker-textarea" id="planInput"></textarea>
            <button class="btn btn-ghost btn-full" id="savePlanBtn" type="button" data-i18n="sidebar.trackerSave"></button>

            <label class="input-label" data-i18n="sidebar.todoLabel"></label>
            <textarea class="input tracker-textarea" id="todoInput"></textarea>
            <button class="btn btn-ghost btn-full" id="saveTodoBtn" type="button" data-i18n="sidebar.trackerSave"></button>

            <label class="input-label" data-i18n="sidebar.checklistLabel"></label>
            <textarea class="input tracker-textarea" id="checklistInput"></textarea>
            <button class="btn btn-ghost btn-full" id="saveChecklistBtn" type="button" data-i18n="sidebar.trackerSave"></button>

            <div class="tracker-progress" id="trackerProgress"></div>
            <div class="tracker-stats" id="trackerStats"></div>
            <div class="tracker-hint" data-i18n="sidebar.trackerHint"></div>
        </div>

	        <!-- 快捷操作 -->
	        <div class="card">
	            <div class="section-title" data-i18n="sidebar.windsurfConfigTitle"></div>
	            <div class="btn-group">
	                <button class="btn" id="initBtn" type="button"></button>
	                <button class="btn btn-ghost" id="resetDefaultsBtn" type="button" data-i18n="sidebar.resetDefaultPort"></button>
	            </div>
	            <p style="font-size: 11px; color: var(--text-muted); margin-top: 10px;" id="configHint"></p>
	        </div>

		        <div class="card">
		            <div class="section-title" data-i18n="sidebar.settingsTitle"></div>
		            <div class="input-group">
		                <label style="display:flex; align-items:center; gap:10px; color: var(--text-secondary); font-size: 12px;">
		                    <input type="checkbox" id="autoStartToggle" ${autoStart ? 'checked' : ''} />
		                    <span data-i18n="sidebar.autoStart"></span>
		                </label>
		            </div>
	            <div class="input-group">
	                <label class="input-label" data-i18n="sidebar.defaultReason"></label>
	                <div class="input-row">
	                    <input type="text" class="input" id="defaultReasonInput" />
	                </div>
	            </div>
		            <button class="btn btn-primary btn-full" id="saveSettingsBtn" type="button" data-i18n="sidebar.saveSettings"></button>
		        </div>

	        <!-- 统计 -->
	        <div class="card">
	            <div class="section-title" data-i18n="sidebar.statsTitle"></div>
	            <div class="stats-grid">
	                <div class="stat-card">
	                    <div class="stat-value" id="statTotal">${stats.totalCalls}</div>
	                    <div class="stat-label" data-i18n="sidebar.totalCalls"></div>
	                </div>
	                <div class="stat-card">
	                    <div class="stat-value" id="statAskContinue">${stats.askContinueCalls}</div>
	                    <div class="stat-label">ask_continue</div>
	                </div>
	            </div>
	        </div>
	    </div>

	    <script nonce="${nonce}">
	        const vscode = acquireVsCodeApi();
	        const I18N = ${safeJson(WEBVIEW_I18N)};
	        const initialLang = ${safeJson(lang)};
	        const initialDefaultReason = ${safeJson(defaultReason)};
	        const initialTracker = ${safeJson(trackerSnapshot)};
	        let currentLang = (vscode.getState() && vscode.getState().lang) || initialLang;

	        let runtime = {
	            running: ${isRunning},
	            port: ${isRunning ? currentPort : configuredPort},
	            stats: ${safeJson(stats)}
	        };

	        let isConfigured = ${isConfigured ? 'true' : 'false'};
	        let trackerData = initialTracker;

	        function t(key, vars = {}) {
	            const template = (I18N[currentLang] && I18N[currentLang][key]) || (I18N.zh && I18N.zh[key]) || key;
	            return template.replace(/\\{(\\w+)\\}/g, (_, name) => String(vars[name] ?? '{' + name + '}'));
	        }

	        function showToast(message, type = 'info') {
	            const existing = document.querySelector('.toast');
	            if (existing) existing.remove();

	            const toast = document.createElement('div');
	            toast.className = 'toast ' + type;
	            toast.textContent = message;
	            document.body.appendChild(toast);

	            setTimeout(() => toast.remove(), 2000);
	        }

	        function applyI18n() {
	            document.documentElement.lang = currentLang === 'en' ? 'en' : 'zh-CN';

	            document.querySelectorAll('[data-i18n]').forEach((el) => {
	                const key = el.getAttribute('data-i18n');
	                if (key) el.textContent = t(key);
	            });

	            const defaultReasonInput = document.getElementById('defaultReasonInput');
	            if (defaultReasonInput) {
	                defaultReasonInput.placeholder = t('sidebar.defaultReasonPlaceholder');
	                if (!defaultReasonInput.value) defaultReasonInput.value = initialDefaultReason;
	            }

	            const langToggle = document.getElementById('langToggle');
            if (langToggle) {
                langToggle.textContent = currentLang === 'en' ? t('ui.lang.zh') : t('ui.lang.en');
                langToggle.title = currentLang === 'en' ? t('ui.lang.toggleToZh') : t('ui.lang.toggleToEn');
            }

            renderStatus();
            renderConfig();
            renderTracker();
        }

	        function renderStatus() {
	            const dot = document.getElementById('statusDot');
	            const label = document.getElementById('statusLabel');
	            const port = document.getElementById('statusPort');
	            const toggleBtn = document.getElementById('serverToggleBtn');

	            if (dot) {
	                dot.classList.toggle('online', !!runtime.running);
	                dot.classList.toggle('offline', !runtime.running);
	            }
	            if (label) {
	                label.classList.toggle('online', !!runtime.running);
	                label.classList.toggle('offline', !runtime.running);
	                label.textContent = runtime.running ? t('sidebar.running') : t('sidebar.stopped');
	            }
	            if (port) {
	                const fallbackPort = Number(document.getElementById('portInput')?.value) || runtime.port;
	                port.textContent = ':' + String(runtime.running ? runtime.port : fallbackPort);
	            }

	            if (toggleBtn) {
	                toggleBtn.className = 'btn ' + (runtime.running ? 'btn-danger' : 'btn-success');
	                toggleBtn.textContent = runtime.running ? t('sidebar.stop') : t('sidebar.start');
	            }
	        }

	        function renderConfig() {
	            const initBtn = document.getElementById('initBtn');
	            const hint = document.getElementById('configHint');

	            if (initBtn) {
	                initBtn.className = 'btn ' + (isConfigured ? 'btn-configured' : 'btn-primary');
	                initBtn.textContent = isConfigured ? t('sidebar.configWritten') : t('sidebar.writeConfig');
	            }
	            if (hint) {
	                hint.textContent = isConfigured ? t('sidebar.configHintWritten') : t('sidebar.configHintNotWritten');
	            }
	        }

	        function renderStats() {
	            const total = document.getElementById('statTotal');
	            const askContinue = document.getElementById('statAskContinue');
	            if (total) total.textContent = String(runtime.stats?.totalCalls ?? 0);
	            if (askContinue) askContinue.textContent = String(runtime.stats?.askContinueCalls ?? 0);
	        }

	        function formatTrackerList(items) {
	            if (!Array.isArray(items)) return '';
	            return items.map((item) => {
	                const status = item?.status === 'done' ? 'x' : item?.status === 'doing' ? '~' : ' ';
	                const text = String(item?.text || '').trim();
	                if (!text) return '';
                return '[' + status + '] ' + text;
	            }).filter(Boolean).join('\\n');
	        }

	        function parseTrackerList(text) {
	            const lines = String(text || '').split('\\n').map((line) => line.trim()).filter(Boolean);
	            const items = [];
	            lines.forEach((line) => {
	                let status = 'todo';
	                let content = line;
	                if (line.startsWith('[x]') || line.startsWith('[X]')) {
	                    status = 'done';
	                    content = line.slice(3).trim();
	                } else if (line.startsWith('[~]')) {
	                    status = 'doing';
	                    content = line.slice(3).trim();
	                } else if (line.startsWith('[ ]')) {
	                    status = 'todo';
	                    content = line.slice(3).trim();
	                }
	                if (!content) return;
	                items.push({ text: content, status });
	            });
	            return items;
	        }

	        function renderTracker() {
	            const nameEl = document.getElementById('trackerProjectName');
	            const statusEl = document.getElementById('trackerPrdStatus');
	            const prdInput = document.getElementById('prdInput');
	            const planInput = document.getElementById('planInput');
	            const todoInput = document.getElementById('todoInput');
	            const checklistInput = document.getElementById('checklistInput');
            const progressEl = document.getElementById('trackerProgress');
            const statsEl = document.getElementById('trackerStats');

	            if (nameEl) nameEl.textContent = trackerData?.name || '-';
	            if (statusEl) {
	                const approved = trackerData?.prd?.status === 'approved';
	                statusEl.textContent = approved ? t('sidebar.prdApproved') : t('sidebar.prdDraft');
	                statusEl.classList.toggle('approved', approved);
	                statusEl.classList.toggle('draft', !approved);
	            }
	            if (prdInput && typeof trackerData?.prd?.content === 'string') prdInput.value = trackerData.prd.content;
	            if (planInput) planInput.value = trackerData?.planText || '';
	            if (todoInput) todoInput.value = trackerData?.todoText || '';
	            if (checklistInput) checklistInput.value = trackerData?.checklistText || '';
            if (progressEl) {
                const progress = trackerData?.progress || { done: 0, total: 0, percent: 0 };
                progressEl.textContent =
                    t('sidebar.trackerProgress') +
                    ': ' +
                    progress.done +
                    '/' +
                    progress.total +
                    ' (' +
                    progress.percent +
                    '%)';
            }
            if (statsEl) {
                const stats = trackerData?.stats || {};
                const prdUpdates = Number.isFinite(stats.prdUpdates) ? stats.prdUpdates : 0;
                const prdApprovals = Number.isFinite(stats.prdApprovals) ? stats.prdApprovals : 0;
                const planUpdates = Number.isFinite(stats.planUpdates) ? stats.planUpdates : 0;
                const todoUpdates = Number.isFinite(stats.todoUpdates) ? stats.todoUpdates : 0;
                const checklistUpdates = Number.isFinite(stats.checklistUpdates) ? stats.checklistUpdates : 0;
                statsEl.textContent =
                    t('sidebar.trackerStats') +
                    ': ' +
                    t('sidebar.trackerStatsPrd') +
                    ' ' +
                    prdUpdates +
                    ' | ' +
                    t('sidebar.trackerStatsApprovals') +
                    ' ' +
                    prdApprovals +
                    ' | ' +
                    t('sidebar.trackerStatsPlan') +
                    ' ' +
                    planUpdates +
                    ' | ' +
                    t('sidebar.trackerStatsTodo') +
                    ' ' +
                    todoUpdates +
                    ' | ' +
                    t('sidebar.trackerStatsChecklist') +
                    ' ' +
                    checklistUpdates;
            }
        }

	        function toggleLanguage() {
	            currentLang = currentLang === 'en' ? 'zh' : 'en';
	            vscode.setState({ ...(vscode.getState() || {}), lang: currentLang });
	            vscode.postMessage({ type: 'setLanguage', language: currentLang });
	            applyI18n();
	        }

	        function toggleServer() {
	            if (runtime.running) {
	                stopServer();
	            } else {
	                startServer();
	            }
	        }

	        function startServer() {
	            vscode.postMessage({ type: 'startServer' });
	            showToast(t('toast.startingServer'), 'success');
	        }

	        function stopServer() {
	            vscode.postMessage({ type: 'stopServer' });
	            showToast(t('toast.serverStopped'), 'info');
	        }

	        function restartServer() {
	            vscode.postMessage({ type: 'restartServer' });
	            showToast(t('toast.restartingServer'), 'success');
	        }

	        function openContinueDialog() {
	            vscode.postMessage({ type: 'openContinueDialog' });
	            showToast(t('toast.checkingPending'), 'info');
	        }

	        function copyPrompt() {
	            navigator.clipboard.writeText(t('sidebar.promptCopyText')).then(() => {
	                showToast(t('toast.promptCopied'), 'success');
	            });
	        }

	        function openRepo() {
	            vscode.postMessage({ type: 'openRepo' });
	            showToast(t('toast.openingGithub'), 'info');
	        }

	        function copyRepoUrl() {
	            const text = 'https://github.com/JiXiangKing80/windsurf-auto-mcp';
	            navigator.clipboard.writeText(text).then(() => {
	                showToast(t('toast.linkCopied'), 'success');
	            });
	        }

	        function configWindsurf() {
	            vscode.postMessage({ type: 'configWindsurf' });
	            showToast(t('toast.initializing'), 'success');
	        }

	        function resetDefaults() {
	            vscode.postMessage({ type: 'resetDefaults' });
	            showToast(t('toast.defaultsRestored'), 'success');
	        }

	        function saveSettings() {
	            const autoStartToggle = document.getElementById('autoStartToggle');
	            const defaultReasonInput = document.getElementById('defaultReasonInput');
	            vscode.postMessage({
	                type: 'saveSettings',
	                autoStart: !!autoStartToggle?.checked,
	                defaultReason: defaultReasonInput?.value || ''
	            });
	            showToast(t('toast.settingsSaved'), 'success');
	        }

	        function savePrd() {
	            const prdInput = document.getElementById('prdInput');
	            const content = prdInput?.value || '';
	            vscode.postMessage({ type: 'trackerSetPrd', content });
	            showToast(t('toast.submitted'), 'success');
	        }

	        function approvePrd() {
	            vscode.postMessage({ type: 'trackerApprovePrd' });
	            showToast(t('toast.submitted'), 'success');
	        }

	        function saveTrackerList(field, textareaId) {
	            const textarea = document.getElementById(textareaId);
	            const items = parseTrackerList(textarea?.value || '');
	            vscode.postMessage({ type: 'trackerUpdate', field, items });
	            showToast(t('toast.submitted'), 'success');
	        }

	        const portInput = document.getElementById('portInput');
	        if (portInput) {
	            portInput.addEventListener('change', () => {
	                const nextPort = Number(portInput.value);
	                if (!Number.isFinite(nextPort) || nextPort < 1024 || nextPort > 65535) {
	                    showToast(t('toast.invalidPort'), 'error');
	                    return;
	                }
	                vscode.postMessage({ type: 'updatePort', port: nextPort });
	                showToast(t('toast.portUpdated'), 'success');
	                renderStatus();
	            });
	        }

	        window.addEventListener('message', (event) => {
	            const message = event.data;
	            if (!message || !message.type) return;

	            switch (message.type) {
	                case 'status':
	                    runtime.running = !!message.running;
	                    runtime.port = Number(message.port) || runtime.port;
	                    runtime.stats = message.stats || runtime.stats;
	                    renderStatus();
	                    renderStats();
	                    break;
	                case 'tracker':
	                    trackerData = message.data || trackerData;
	                    renderTracker();
	                    break;
	                case 'languageChanged':
	                    if (message.language === 'en' || message.language === 'zh') {
	                        currentLang = message.language;
	                        vscode.setState({ ...(vscode.getState() || {}), lang: currentLang });
	                        applyI18n();
	                    }
	                    break;
	            }
	        });

	        applyI18n();
	        renderStats();

	        document.getElementById('langToggle')?.addEventListener('click', () => toggleLanguage());
	        document.getElementById('openRepoBtn')?.addEventListener('click', () => openRepo());
	        document.getElementById('copyRepoUrlBtn')?.addEventListener('click', () => copyRepoUrl());
	        document.getElementById('serverToggleBtn')?.addEventListener('click', () => toggleServer());
	        document.getElementById('restartServerBtn')?.addEventListener('click', () => restartServer());
	        document.getElementById('openDialogBtn')?.addEventListener('click', () => openContinueDialog());
	        document.getElementById('copyPromptBtn')?.addEventListener('click', () => copyPrompt());
	        document.getElementById('savePrdBtn')?.addEventListener('click', () => savePrd());
	        document.getElementById('approvePrdBtn')?.addEventListener('click', () => approvePrd());
	        document.getElementById('savePlanBtn')?.addEventListener('click', () => saveTrackerList('plan', 'planInput'));
	        document.getElementById('saveTodoBtn')?.addEventListener('click', () => saveTrackerList('todos', 'todoInput'));
	        document.getElementById('saveChecklistBtn')?.addEventListener('click', () => saveTrackerList('checklist', 'checklistInput'));
	        document.getElementById('initBtn')?.addEventListener('click', () => configWindsurf());
	        document.getElementById('resetDefaultsBtn')?.addEventListener('click', () => resetDefaults());
	        document.getElementById('saveSettingsBtn')?.addEventListener('click', () => saveSettings());
	    </script>
</body>
</html>`;
    }
}
