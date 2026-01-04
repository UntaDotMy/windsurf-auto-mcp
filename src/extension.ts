/**
 * WindsurfAutoMcp 扩展主入口
 * Windsurf MCP 自动化工具 - 任务完成确认、用户交互、一键配置
 */

import * as vscode from 'vscode';
import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';

type UiLanguage = 'zh' | 'en';
type ChoiceQuestion = {
    id?: string;
    prompt?: string;
    options: string[];
};
type DialogMode = 'choice' | 'prd' | 'confirm';
type ConfirmDialogType = 'confirm' | 'info';
type TrackerItemStatus = 'todo' | 'doing' | 'done';
type TrackerItem = {
    id: string;
    text: string;
    status: TrackerItemStatus;
    updatedAt: string;
    sprint?: string;   // Sprint ID
    points?: number;   // Story points
    assignee?: string; // "ai" | "user" | string
};

type Sprint = {
    id: string;
    name: string;
    goal?: string;
    status: 'planning' | 'active' | 'completed';
    startDate?: string;
    endDate?: string;
    createdAt: string;
    completedAt?: string;
};

type ProjectTrackerStats = {
    prdUpdates: number;
    prdApprovals: number;
    overviewUpdates: number;
    planUpdates: number;
    walkthroughUpdates: number;
    updatedAt?: string;

    // Guard/preflight timestamps (do NOT affect WAM digest; see computeProjectWamDigest)
    lastPreflightAt?: string;
    lastProjectStatusAt?: string;
    lastCheckPlanAt?: string;
    lastMemorySearchAt?: string;
    lastRagSearchAt?: string;
    lastWamStatusAt?: string;

    // Artifact update timestamps
    lastPlanUpdateAt?: string;
    lastWalkthroughUpdateAt?: string;

    // Informational (not part of WAM digest)
    lastWamCommitAt?: string;
};
type ProjectTracker = {
    projectId: string;
    rootPath: string;
    name: string;
    overview: { content: string; updatedAt?: string; generatedBy?: 'auto' | 'ai' };
    prd: {
        content: string;
        status: 'draft' | 'approved';
        approvedBy?: string;
        approvedAt?: string;
        updatedAt?: string;
        generatedBy?: 'ai';
        reviewNote?: string;
        reviewedAt?: string;
    };
    plan: { summary: string; items: TrackerItem[] };
    sprints: Sprint[];
    activeSprintId?: string;
    walkthrough: { content: string; updatedAt?: string };
    stats: ProjectTrackerStats;
    updatedAt: string;
};
type TrackerData = {
    schemaVersion: 1;
    activeProject?: string;
    projects: Record<string, ProjectTracker>;
};
type MemoryEntry = {
    key: string;
    content: string;
    updatedAt: string;
    createdAt?: string;
    kind?: 'short' | 'long' | 'lesson';
    tags?: string[];
    links?: string[];
};
type ProjectMemoryStore = {
    memories: Record<string, MemoryEntry>;
    timeline?: Array<{
        at: string;
        kind: 'short' | 'long' | 'lesson';
        key: string;
        summary: string;
    }>;
};
type MemoryData = {
    schemaVersion: 1;
    projects: Record<string, ProjectMemoryStore>;
};

type GlobalMemoryData = {
    schemaVersion: 1;
    memories: Record<string, MemoryEntry>;
    timeline?: Array<{
        at: string;
        kind: 'short' | 'long' | 'lesson';
        key: string;
        summary: string;
    }>;
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
        'ext.statsLineAskQuestion': 'ask_question: {askQuestion}\n',
        'ext.statsLineAskContinue': 'ask_continue: {askContinue}\n',
        'ext.statsLineSetPrd': 'set_prd: {setPrd}\n',
        'ext.statsLineUpdatePlan': 'update_plan: {updatePlan}\n',
        'ext.statsLineUpdateWalkthrough': 'update_walkthrough: {updateWalkthrough}\n',
        'ext.statsLineGetProjectStatus': 'get_project_status: {getProjectStatus}\n',
        'ext.statsLineSaveMemory': 'save_memory: {saveMemory}\n',
        'ext.statsLineGetMemory': 'get_memory: {getMemory}\n',
        'ext.statsLineListMemory': 'list_memories: {listMemory}\n',
        'ext.statsLineUploads': '图片上传: {uploads}\n',
        'ext.statsLineUptime': '运行时间: {uptime} 分钟',
        'ext.statsInSidebar': '统计已显示在侧边栏。',
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
		            '=== WindsurfAutoMcp ACP 工作流 ===',
		            '',
		            '【硬规则 - 不可违背】',
		            'R1. 完成时必须: code_review() → ask_continue(reason)',
		            'R2. 新输入必须: preflight(userPrompt=...)',
		            'R3. 行动前必须: 有Plan含Checklist',
		            '',
		            '【ACP循环 - 严格按顺序】',
		            'STEP 1 - PREFLIGHT:',
		            '  → preflight(userPrompt="用户输入")',
		            '  → 读取: 项目状态/Plan/Memory/WAM',
		            '',
		            'STEP 2 - PLAN:',
		            '  → 复杂任务: set_prd → approve_prd',
		            '  → 所有任务: update_plan(mode=merge, items=[...])',
		            '  → 必须包含: Checklist项目',
		            '',
		            'STEP 3 - ACT [循环]:',
		            '  DO {',
		            '    → 小步实现一个任务',
		            '    → update_plan(标记done)',
		            '    → verify_action(检查结果)',
		            '  } WHILE (还有未完成项)',
		            '',
		            'STEP 4 - VERIFY:',
		            '  → 运行: 测试/构建/lint',
		            '  → 无法运行: 提供手动步骤',
		            '',
		            'STEP 5 - REVIEW [必须]:',
		            '  → code_review(summary="...", qualityChecks={...})',
		            '  → 如果有缺口: 返回STEP 3',
		            '',
		            'STEP 6 - FINISH:',
		            '  → check_plan() 确认100%',
		            '  → ask_continue(reason="完成内容+风险+验证步骤+下一步")',
		            '  → 等待用户决定',
		            '',
		            '【质量检查 - 交付前】',
		            '☐ Overview: 新项目需generate_overview',
		            '☐ Plan: 进度100%',
		            '☐ Walkthrough: 决策已记录',
		            '☐ WAM: wam_status clean',
		            '☐ 错误: record_lesson',
		            '',
		            '【自检 - 每步前】',
		            '? 信息最新吗?',
		            '? 代码正确吗?',
		            '? 安全吗?',
		            '? 用户想要什么?'
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
        'sidebar.trackerSave': '保存',
        'sidebar.trackerHint': '列表支持 [ ] / [~] / [x] 状态',
        'sidebar.trackerStats': '统计',
        'sidebar.trackerStatsPrd': 'PRD 更新',
        'sidebar.trackerStatsApprovals': '审批',
        'sidebar.trackerStatsOverview': '概览更新',
        'sidebar.trackerStatsPlan': '计划更新',
        'sidebar.trackerStatsWalkthrough': 'Walkthrough 更新',
        'sidebar.statAskContinue': 'ask_continue',
        'sidebar.statAskUser': 'ask_user',
        'sidebar.statAskQuestion': 'ask_question',
        'sidebar.statSetPrd': 'set_prd',
        'sidebar.statUpdateOverview': 'update_overview',
        'sidebar.statGenerateOverview': 'generate_overview',
        'sidebar.statUpdatePlan': 'update_plan',
        'sidebar.statPlanChangeRequest': 'plan_change_request',
        'sidebar.statUpdateWalkthrough': 'update_walkthrough',
        'sidebar.statRagSearch': 'rag_search',
        'sidebar.statMemorySearch': 'memory_search',
        'sidebar.statMemoryHygiene': 'memory_hygiene',
        'sidebar.statRecordLesson': 'record_lesson',
        'sidebar.statGetProjectStatus': 'get_project_status',
        'sidebar.statSaveMemory': 'save_memory',
        'sidebar.statGetMemory': 'get_memory',
        'sidebar.statListMemory': 'list_memories',
        'sidebar.statPreflight': 'preflight',
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
        'sidebar.panelsTitle': '项目面板',
        'sidebar.panelOverview': '项目概览',
        'sidebar.panelPrd': 'PRD',
        'sidebar.panelPlan': 'Plan（计划）',
        'sidebar.panelMemory': 'Memory（记忆）',
        'sidebar.panelWam': 'WAM（历史）',
        'sidebar.panelAudit': 'Audit（审计）',
        'sidebar.panelWalkthrough': 'Walkthrough',
        'sidebar.panelStats': '统计',
        'sidebar.systemTitle': '系统控制',
        'sidebar.openPanel': '打开',
        'sidebar.clearTitle': '清理数据',
        'sidebar.clearOverview': '清空项目概览',
        'sidebar.clearPrd': '清空 PRD',
        'sidebar.clearPlan': '清空 Plan',
        'sidebar.clearWalkthrough': '清空 Walkthrough',
        'sidebar.clearTracking': '重置项目数据',
        'sidebar.clearAudit': '清空 Audit',
        'sidebar.clearOverviewConfirm': '确定要清空当前项目的“项目概览”吗？',
        'sidebar.clearPrdConfirm': '确定要清空当前项目的 PRD 吗？',
        'sidebar.clearPlanConfirm': '确定要清空当前项目的 Plan 吗？',
        'sidebar.clearWalkthroughConfirm': '确定要清空当前项目的 Walkthrough 吗？',
        'sidebar.clearTrackingConfirm': '确定要重置当前项目的 PRD/Plan/Walkthrough/统计吗？',
        'sidebar.clearAuditConfirm': '确定要清空当前项目的 Audit 日志吗？',
        'sidebar.configureWindsurf': '写入 Windsurf 配置',
        'sidebar.installHooks': '安装/更新 Hooks',
        'sidebar.openDialogShort': '对话确认',
        'sidebar.languageTitle': '语言',
        'sidebar.configStatus': '配置状态',
        'sidebar.configStatusConfigured': '已配置',
        'sidebar.configStatusMissing': '未配置',

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
        'panel.extraPlaceholder': '如需补充，请填写',
        'panel.confirmYes': '确认',
        'panel.confirmNo': '取消',
        'panel.confirmOk': '知道了',
        'panel.prdTitle': 'PRD 审核',
        'panel.prdSubtitle': '请确认或要求修改',
        'panel.prdApprove': '批准 PRD',
        'panel.prdRequestChanges': '请求修改',
        'panel.prdNoteLabel': '修改意见',
        'panel.prdNotePlaceholder': '请描述你希望修改的内容',
        'panel.prdApproveHint': '审批后才能进入计划/实现阶段',
        'panel.readOnlyEmpty': '暂无内容',
        'panel.sectionSummary': '摘要',
        'panel.sectionItems': 'Checklist（清单）',
        'panel.sectionProgress': '进度',
        'panel.statsGlobal': '全局统计',
        'panel.statsProject': '项目统计',
        'panel.statsCalls': '工具调用',
        'panel.statsTracker': '项目跟踪',
        'panel.statsUptime': '运行时间',
        'panel.statsMinutes': '{minutes} 分钟',
        'panel.overviewTitle': '项目概览',
        'panel.prdPanelTitle': 'PRD',
        'panel.prdStatusDraft': '草案',
        'panel.prdStatusApproved': '已审批',
        'panel.reviewNoteLabel': '审核备注',
        'panel.planTitle': 'Plan（计划）',
        'panel.memoryTitle': 'Memory（记忆）',
        'panel.auditTitle': 'Audit（审计）',
        'panel.wamTitle': 'WAM（历史）',
        'panel.memoryProjectTitle': '项目记忆',
        'panel.memoryGlobalTitle': '全局记忆',
        'panel.memoryGraphTitle': '记忆关联图',
        'panel.memoryGraphHintTitle': '提示',
        'panel.memoryGraphHintBody': '点击右侧图中的节点查看详情（仅展示项目记忆）。',
        'panel.memoryGraphEmpty': '暂无项目记忆，图谱为空。',
        'panel.memoryGraphTooMany': '记忆过多，已跳过图谱渲染',
        'panel.walkthroughTitle': 'Walkthrough',
        'panel.walkthroughSubtitle': '实施记录',
        'artifact.memoryTitle': '项目记忆',
        'artifact.memoryUpdated': '更新时间',
        'artifact.tableStatus': '状态',
        'artifact.tableItem': '事项',
        'panel.itemTodo': '待办',
        'panel.itemDoing': '进行中',
        'panel.itemDone': '已完成'
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
        'ext.statsLineAskQuestion': 'ask_question: {askQuestion}\n',
        'ext.statsLineAskContinue': 'ask_continue: {askContinue}\n',
        'ext.statsLineSetPrd': 'set_prd: {setPrd}\n',
        'ext.statsLineUpdatePlan': 'update_plan: {updatePlan}\n',
        'ext.statsLineUpdateWalkthrough': 'update_walkthrough: {updateWalkthrough}\n',
        'ext.statsLineGetProjectStatus': 'get_project_status: {getProjectStatus}\n',
        'ext.statsLineSaveMemory': 'save_memory: {saveMemory}\n',
        'ext.statsLineGetMemory': 'get_memory: {getMemory}\n',
        'ext.statsLineListMemory': 'list_memories: {listMemory}\n',
        'ext.statsLineUploads': 'Image uploads: {uploads}\n',
        'ext.statsLineUptime': 'Uptime: {uptime} minutes',
        'ext.statsInSidebar': 'Stats are shown in the sidebar.',
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
            '=== WindsurfAutoMcp Agile Workflow ===',
            '',
            '[HARD RULES - Cannot Violate]',
            'R1. When DONE: code_review() → ask_continue(reason)',
            'R2. New input: preflight(userPrompt=...) FIRST',
            'R3. Before action: Must have Plan/Sprint with Checklist',
            '',
            '[AGILE LOOP - Follow in Order]',
            'STEP 1 - PREFLIGHT & SPRINT:',
            '  → preflight(userPrompt="user input")',
            '  → manage_sprint(action="start") if new sprint',
            '  → Reads: active sprint, plan status, memory',
            '',
            'STEP 2 - PLAN / BACKLOG:',
            '  → Complex tasks: set_prd → approve_prd',
            '  → Tasks: update_plan(items=[{text:"...", sprint:"id"}])',
            '  → Assign tasks to Active Sprint or Backlog',
            '',
            'STEP 3 - ACT [LOOP]:',
            '  DO {',
            '    → Implement one small task',
            '    → update_plan(mark done)',
            '    → verify_action(check result)',
            '  } WHILE (items remain)',
            '',
            'STEP 4 - VERIFY:',
            '  → Run: tests/build/lint',
            '  → If cannot run: provide manual steps',
            '',
            'STEP 5 - REVIEW [REQUIRED]:',
            '  → code_review(summary="...", qualityChecks={...})',
            '  → If gaps found: GO BACK to STEP 3',
            '',
            'STEP 6 - FINISH / COMMIT:',
            '  → check_plan() verify 100%',
            '  → generate_commit_message() → use suggestion',
            '  → ask_continue(reason="done+risks+verify+next")',
            '',
            '[QUALITY CHECKS - Before Delivery]',
            '☐ Sprint Goal met?',
            '☐ Plan: progress 100%',
            '☐ WAM: wam_status clean',
            '☐ Commit message generated',
            '',
            '[SELF-CHECK - Before Each Step]',
            '? Is this in the Sprint?',
            '? Code correct?',
            '? Safe?',
            '? User goal met?',
            ...(false ? [
            'Hard rule (highest priority): When you decide a task is done / ready to deliver, do NOT output a normal final response; you MUST call WindsurfAutoMcp ask_continue and put in reason: what was done, risks/notes, verification steps/commands, and next steps.',
            '',
            'Completion protocol (must follow):',
            '1) When done, the ONLY allowed action is calling ask_continue (with reason).',
            '2) After calling ask_continue, stop output and wait for the user.',
            '3) If you forgot to call ask_continue, your next message must first call ask_continue to correct (then wait).',
            '',
            'Collaboration (must): operate as a full "software engineering department" (cross-functional team) across any language/framework/platform. Output must be unified and concise, but reflect a consolidated team conclusion.',
            '',
            'Before anything (must): read the target/user story first. Before decisions/edits, read relevant files/config/logs; if key inputs are missing, use ask_question (single-choice, any number of options, ask as needed) and loop until acceptance criteria are clear.',
            '',
            'Architecture record / baseline (must): call get_project_status to read Overview/PRD/Plan/Walkthrough. Treat Overview as the architecture record (module boundaries, folder map, key flows, build/test commands, conventions). If Overview is empty or clearly outdated, call generate_overview (and update_overview if needed) before proceeding.',
            '',
            'Memory layers (must): before planning/implementation, run memory_search (project + global) and list_memories/get_memory. If there is no usable project memory yet, create initial memories from the architecture record: long = stable facts/conventions/verification, short = temporary notes (can be merged into long), lesson = mistakes/retro. Store reusable lessons in global scope; store project-specific details in project scope. Short memory is allowed to be pruned/forgotten; merge when it becomes stable.',
            '',
	            'WAM history (must): every change to project tracking/memory must be captured as a git-like history. After changes, run wam_status; if hooks report WAM dirty/missing, run wam_status → (optional) wam_diff → wam_commit() before proceeding. For rollback use wam_log + wam_checkout(hash). For merge use wam_merge(otherHash,message).',
            '',
            'RAG (must): before edits, use rag_search to locate the exact relevant files/snippets (no guessing), then combine with memory to decide what to change (prefer fast context: get_project_status → memory_search → rag_search).',
            '',
            'Decision + research loop (must; no generic answers):',
            '1) Before implementation, think hard and choose the best practice for the project stack (performance/security/maintainability tradeoffs).',
            '2) Research must loop: Research → if results are generic/non-actionable → refine queries → Research again, until you get official, executable info (API/config/version/path/commands/code examples/edge cases).',
            '3) Errors must loop too: diagnose → fix → verify → retro. Record mistakes with record_lesson so you do not repeat them.',
            '4) If you find important doc usage/examples, store them via save_memory(kind=long, scope=project/global) with links + version + snippet so you can reuse it; re-research only when the source is outdated or conflicting.',
            '',
            'Tool use (must be deliberate): before calling a tool, decide if it is necessary/minimal/safe, and state a short rationale. Do not blindly trust outputs.',
            '',
            'Agile delivery & quality (must): iterate in small verifiable increments (user story → acceptance → tasks → implement → verify → code review → learn). Tech Lead is the final decision-maker and risk owner.',
            'Testing (must): if the repo already has a test stack, add/update unit tests + regression checks. If the repo has no tests, ask via ask_question before introducing a new test framework/dependency.',
            'Code style & hygiene (must): read the project coding style first and match it. No trash/temporary code. Remove dead branches. Do not keep backward compatibility unless the user asks; ask if unsure.',
            'Comments/readability (must): for the code you write/change, add professional doc comments for important params/returns/edge cases; do not over-comment obvious lines.',
            'Do not pollute user workspace (must): do not create extra docs/summary markdown/temporary files in the user repo unless explicitly requested or approved via ask_question. Use project tracker/memory (.codeium) for notes instead.',
            '',
            'PRD (only for complex work) & approval (required if PRD exists): for complex features, produce a PRD draft → user review/adjust → approval before Plan/implementation; for small/simple tasks you may skip PRD (leave PRD empty) and go directly to Plan, but if PRD is non-empty you must get approval before implementing (writing code/running commands/using external tools).',
            '',
            'PRD standard (must): PRD = Project Requirements Document. Must include problem/background, goals/non-goals, users/personas, scope, functional + non-functional requirements (prefer tables), acceptance criteria, risks/dependencies, milestones, open questions, references (official docs/Context7). For complex work, add a diagram/flowchart (Mermaid) when helpful.',
            '',
            'Project tracking & memory (must): keep tracking updated via set_prd / update_plan / update_walkthrough (Plan includes task breakdown + checklist); store key context in save_memory, and review list_memories/get_memory before starting; never reuse tracking/memory across projects.',
            '',
            'Walkthrough (must): update walkthrough after every meaningful implementation/decision/fix (update_walkthrough), keep it review-ready.',
            '',
            'Planning & breakdown (must): for any big feature/complex task (and any non-trivial change), produce a Plan with task breakdown + checklist (split further when needed). Update progress as you go.',
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
            'Workflow (must follow; strict order; agile loops allowed):',
            'Architecture/Memory → Read → Research → (Ask Questions loop when needed) → (PRD+approval if complex) → Plan (with TODO/checklist) → Act → Code Review → Act → Update Progress → Check Progress → Learn/Record → Ask',
            '1) Architecture/Memory: start with get_project_status; if Overview (architecture record) is missing/outdated, generate/update it; run memory_search (project+global) for lessons; if no usable memory, create initial long/short/lesson memories from the architecture record.',
            '2) Read: read the user story/goal/constraints/current state; before any edit, read the relevant code/config/logs.',
            '3) Research (no guessing): prefer official docs/README/release notes/source; confirm latest usage + breaking changes before upgrading/replacing; use Context7 if available; treat 2024 as outdated and default to sources updated from Oct 2025 onward (≥ 2025-10, add after:2025-09-30); if results are generic, refine and keep searching until you get exact API/config/version/path/commands.',
            '4) Ask Questions (loop): use ask_question to clarify planning/implementation blockers (single-choice; any number of options; optional extra text) until acceptance criteria are actionable.',
            '5) PRD (optional): only for complex work; draft PRD → user review/adjust → approval → then Plan/implementation. For simple work, keep PRD empty.',
            '6) Plan: produce an executable plan with milestones/risks/acceptance + TODO/checklist breakdown; if too heavy, keep breaking down until tasks are verifiable.',
            '   Plan update rules (must): the Plan is the single source of truth. Default to incremental merge (update_plan(mode=merge))—do not overwrite and lose tasks. When requirements change, append/update items in the existing Plan and note impacts/acceptance. Only use mode=replace when explicitly requested, and ensure WAM has a rollback point first.',
            '7) Act (iterate): implement following the Plan; keep changes minimal and modular; use rag_search before edits; update dependencies only when it improves correctness/security/performance.',
            '8) Update Progress: keep progress current via update_plan (status/progress) and update_walkthrough (key decisions/changes).',
            '9) Check Progress: run build/tests/lint when possible; otherwise provide concrete user-run verification steps + expected results.',
            '10) Review Session (final gate): review like a PR—gaps, correctness, edge cases, error handling, security (injection/permissions/leaks/deps), performance (hot paths/leaks), compatibility; if issues found, go back to Act, then re-run Check Progress and Review.',
            '11) Learn/Record: when a mistake/error/rollback happens, record_lesson and save_memory (project/global); merge short → long when it becomes stable; update Overview/Walkthrough when architecture/conventions changed.',
            '12) Ask: before delivery, run check_plan to confirm the Plan is complete; if not, update_plan first. Then deliver ONLY via ask_continue(reason) and wait; reason must include what was done, risks/notes, verification steps/commands, and next steps.',
            '',
            'Windsurf Hooks (recommended; can be hard guardrails): if your environment supports hooks.json, configure pre_run_command/pre_write_code to block dangerous commands/sensitive writes, and use post_cascade_response to audit missing ask_continue. Official docs: https://docs.windsurf.com/windsurf/cascade/hooks',
            '',
            'Pre-delivery checklist (must satisfy all):',
            '- Overview (architecture record) reviewed/updated (if applicable)',
            '- Project/global memory reviewed and layered memory initialized/merged (if applicable)',
            '- Read target/current state/constraints (user story + acceptance clear)',
            '- Plan provided (with checklist)',
            '- Key decisions researched via official sources/Context7 (if applicable)',
            '- Code tidied: modular/maintainable (no unrelated refactors)',
            '- Code review completed (gaps/security/perf/leaks/etc)',
            '- Progress updated and validated',
            '- Verification completed (build/tests/lint or explicit manual steps)',
            '- Project tracking + memory updated (record lessons when needed)',
            '- Walkthrough updated (key changes/decisions captured)',
            '- End with ask_continue(reason) and wait',
            ] : [])
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
        'sidebar.trackerSave': 'Save',
        'sidebar.trackerHint': 'Lists support [ ] / [~] / [x] status',
        'sidebar.trackerStats': 'Activity',
        'sidebar.trackerStatsPrd': 'PRD updates',
        'sidebar.trackerStatsApprovals': 'Approvals',
        'sidebar.trackerStatsOverview': 'Overview updates',
        'sidebar.trackerStatsPlan': 'Plan updates',
        'sidebar.trackerStatsWalkthrough': 'Walkthrough updates',
        'sidebar.statAskContinue': 'ask_continue',
        'sidebar.statAskUser': 'ask_user',
        'sidebar.statAskQuestion': 'ask_question',
        'sidebar.statSetPrd': 'set_prd',
        'sidebar.statUpdateOverview': 'update_overview',
        'sidebar.statGenerateOverview': 'generate_overview',
        'sidebar.statUpdatePlan': 'update_plan',
        'sidebar.statPlanChangeRequest': 'plan_change_request',
        'sidebar.statUpdateWalkthrough': 'update_walkthrough',
        'sidebar.statRagSearch': 'rag_search',
        'sidebar.statMemorySearch': 'memory_search',
        'sidebar.statMemoryHygiene': 'memory_hygiene',
        'sidebar.statRecordLesson': 'record_lesson',
        'sidebar.statGetProjectStatus': 'get_project_status',
        'sidebar.statSaveMemory': 'save_memory',
        'sidebar.statGetMemory': 'get_memory',
        'sidebar.statListMemory': 'list_memories',
        'sidebar.statPreflight': 'preflight',
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
        'sidebar.panelsTitle': 'Project Panels',
        'sidebar.panelOverview': 'Overview',
        'sidebar.panelPrd': 'PRD',
        'sidebar.panelPlan': 'Plan',
        'sidebar.panelMemory': 'Memory',
        'sidebar.panelWam': 'WAM',
        'sidebar.panelAudit': 'Audit',
        'sidebar.panelWalkthrough': 'Walkthrough',
        'sidebar.panelStats': 'Stats',
        'sidebar.systemTitle': 'System',
        'sidebar.openPanel': 'Open',
        'sidebar.clearTitle': 'Maintenance',
        'sidebar.clearOverview': 'Clear Overview',
        'sidebar.clearPrd': 'Clear PRD',
        'sidebar.clearPlan': 'Clear Plan',
        'sidebar.clearWalkthrough': 'Clear Walkthrough',
        'sidebar.clearTracking': 'Reset Project',
        'sidebar.clearAudit': 'Clear Audit',
        'sidebar.clearOverviewConfirm': 'Clear project overview for the current project?',
        'sidebar.clearPrdConfirm': 'Clear PRD for the current project?',
        'sidebar.clearPlanConfirm': 'Clear Plan for the current project?',
        'sidebar.clearWalkthroughConfirm': 'Clear Walkthrough for the current project?',
        'sidebar.clearTrackingConfirm': 'Reset PRD/Plan/Walkthrough/stats for the current project?',
        'sidebar.clearAuditConfirm': 'Clear Audit log for the current project?',
        'sidebar.configureWindsurf': 'Write Windsurf Config',
        'sidebar.installHooks': 'Install/Update Hooks',
        'sidebar.openDialogShort': 'Confirm Dialog',
        'sidebar.languageTitle': 'Language',
        'sidebar.configStatus': 'Config Status',
        'sidebar.configStatusConfigured': 'Configured',
        'sidebar.configStatusMissing': 'Not configured',

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
        'panel.extraPlaceholder': 'Add more information if needed',
        'panel.confirmYes': 'Confirm',
        'panel.confirmNo': 'Cancel',
        'panel.confirmOk': 'OK',
        'panel.prdTitle': 'PRD Review',
        'panel.prdSubtitle': 'Approve or request changes',
        'panel.prdApprove': 'Approve PRD',
        'panel.prdRequestChanges': 'Request Changes',
        'panel.prdNoteLabel': 'Change request',
        'panel.prdNotePlaceholder': 'Describe the changes you want',
        'panel.prdApproveHint': 'Approval is required before planning/implementation',
        'panel.readOnlyEmpty': 'No content yet',
        'panel.sectionSummary': 'Summary',
        'panel.sectionItems': 'Checklist',
        'panel.sectionProgress': 'Progress',
        'panel.statsGlobal': 'Global Stats',
        'panel.statsProject': 'Project Stats',
        'panel.statsCalls': 'Tool Calls',
        'panel.statsTracker': 'Tracking',
        'panel.statsUptime': 'Uptime',
        'panel.statsMinutes': '{minutes} minutes',
        'panel.overviewTitle': 'Overview',
        'panel.prdPanelTitle': 'PRD',
        'panel.prdStatusDraft': 'Draft',
        'panel.prdStatusApproved': 'Approved',
        'panel.reviewNoteLabel': 'Review note',
        'panel.planTitle': 'Plan',
        'panel.memoryTitle': 'Memory',
        'panel.auditTitle': 'Audit',
        'panel.wamTitle': 'WAM',
        'panel.memoryProjectTitle': 'Project Memory',
        'panel.memoryGlobalTitle': 'Global Memory',
        'panel.memoryGraphTitle': 'Memory Graph',
        'panel.memoryGraphHintTitle': 'Hint',
        'panel.memoryGraphHintBody': 'Click a node to view details (project memory only).',
        'panel.memoryGraphEmpty': 'No project memories yet.',
        'panel.memoryGraphTooMany': 'Too many memories to render graph',
        'panel.walkthroughTitle': 'Walkthrough',
        'panel.walkthroughSubtitle': 'Delivery log',
        'artifact.memoryTitle': 'Project Memory',
        'artifact.memoryUpdated': 'Updated',
        'artifact.tableStatus': 'Status',
        'artifact.tableItem': 'Item',
        'panel.itemTodo': 'Todo',
        'panel.itemDoing': 'In progress',
        'panel.itemDone': 'Done'
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

function escapeHtml(value: string): string {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function sanitizeMarkdownHref(raw: string): string | null {
    const href = String(raw || '').trim();
    if (!href) return null;
    if (href.startsWith('#')) return href;
    if (/^https?:\/\//i.test(href)) return href;
    return null;
}

function renderInlineMarkdown(text: string): string {
    // Start by escaping HTML, then apply minimal markdown replacements for readability.
    let out = escapeHtml(String(text || ''));

    // Inline code: `code`
    out = out.replace(/`([^`]+)`/g, (_m, code) => `<code>${code}</code>`);

    // Bold: **text**
    out = out.replace(/\*\*([^*][\s\S]*?)\*\*/g, (_m, inner) => `<strong>${inner}</strong>`);

    // Links: [text](https://...)
    out = out.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, label, href) => {
        const safe = sanitizeMarkdownHref(href);
        if (!safe) return `${label} (${href})`;
        return `<a href="${escapeHtml(safe)}" target="_blank" rel="noreferrer noopener">${label}</a>`;
    });

    return out;
}

function stripJsonComments(raw: string): string {
    const input = String(raw || '');
    let out = '';
    let i = 0;
    let inString = false;
    let stringQuote = '"';
    let escape = false;

    while (i < input.length) {
        const ch = input[i];
        const next = i + 1 < input.length ? input[i + 1] : '';

        if (inString) {
            out += ch;
            if (escape) {
                escape = false;
            } else if (ch === '\\') {
                escape = true;
            } else if (ch === stringQuote) {
                inString = false;
            }
            i += 1;
            continue;
        }

        if (ch === '"' || ch === "'") {
            inString = true;
            stringQuote = ch;
            out += ch;
            i += 1;
            continue;
        }

        if (ch === '/' && next === '/') {
            // Line comment
            i += 2;
            while (i < input.length && input[i] !== '\n') i += 1;
            continue;
        }
        if (ch === '/' && next === '*') {
            // Block comment
            i += 2;
            while (i + 1 < input.length && !(input[i] === '*' && input[i + 1] === '/')) i += 1;
            i += 2;
            continue;
        }

        out += ch;
        i += 1;
    }
    return out;
}

function stripJsonTrailingCommas(raw: string): string {
    const input = String(raw || '');
    let out = '';
    let i = 0;
    let inString = false;
    let stringQuote = '"';
    let escape = false;

    while (i < input.length) {
        const ch = input[i];

        if (inString) {
            out += ch;
            if (escape) {
                escape = false;
            } else if (ch === '\\') {
                escape = true;
            } else if (ch === stringQuote) {
                inString = false;
            }
            i += 1;
            continue;
        }

        if (ch === '"' || ch === "'") {
            inString = true;
            stringQuote = ch;
            out += ch;
            i += 1;
            continue;
        }

        if (ch === ',') {
            // If the next non-whitespace character is ] or }, drop the comma.
            let j = i + 1;
            while (j < input.length && /\s/.test(input[j])) j += 1;
            const nextNonWs = j < input.length ? input[j] : '';
            if (nextNonWs === ']' || nextNonWs === '}') {
                i += 1;
                continue;
            }
        }

        out += ch;
        i += 1;
    }
    return out;
}

function parseJsonLenient(raw: string): any {
    let text = String(raw || '').replace(/^\uFEFF/, '');
    // Try strict first.
    try {
        if (!text.trim()) return null;
        return JSON.parse(text);
    } catch {
        // continue
    }
    // Try JSON-with-comments / trailing commas.
    text = stripJsonComments(text);
    text = stripJsonTrailingCommas(text);
    if (!text.trim()) return null;
    return JSON.parse(text);
}

function splitMarkdownTableRow(row: string): string[] {
    const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
    return trimmed.split('|').map((cell) => cell.trim());
}

function isMarkdownTableSeparator(line: string): boolean {
    const trimmed = line.trim();
    if (!trimmed.includes('|')) return false;
    const body = trimmed.replace(/^\|/, '').replace(/\|$/, '');
    return body.split('|').every((cell) => /^:?-{3,}:?$/.test(cell.trim()));
}

function renderMarkdownToHtml(content: string): string {
    const lines = String(content || '').split(/\r?\n/);
    const blocks: string[] = [];
    let i = 0;

    while (i < lines.length) {
        const line = lines[i];
        if (!line || line.trim() === '') {
            i += 1;
            continue;
        }

        if (line.trim().startsWith('```')) {
            const fence = line.trim().slice(3).trim().toLowerCase();
            const codeLines: string[] = [];
            i += 1;
            while (i < lines.length && !lines[i].trim().startsWith('```')) {
                codeLines.push(lines[i]);
                i += 1;
            }
            i += 1;
            if (fence === 'mermaid') {
                blocks.push(`<div class="mermaid">${escapeHtml(codeLines.join('\n'))}</div>`);
            } else {
                blocks.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
            }
            continue;
        }

        const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
        if (headingMatch) {
            const level = headingMatch[1].length;
            const text = renderInlineMarkdown(headingMatch[2].trim());
            blocks.push(`<h${level}>${text}</h${level}>`);
            i += 1;
            continue;
        }

        if (line.includes('|') && i + 1 < lines.length && isMarkdownTableSeparator(lines[i + 1])) {
            const headerCells = splitMarkdownTableRow(line).map((cell) => escapeHtml(cell));
            i += 2;
            const bodyRows: string[][] = [];
            while (i < lines.length && lines[i].includes('|') && lines[i].trim() !== '') {
                bodyRows.push(splitMarkdownTableRow(lines[i]).map((cell) => escapeHtml(cell)));
                i += 1;
            }
            const headerHtml = headerCells.map((cell) => `<th>${cell || '&nbsp;'}</th>`).join('');
            const bodyHtml = bodyRows
                .map((row) => `<tr>${row.map((cell) => `<td>${cell || '&nbsp;'}</td>`).join('')}</tr>`)
                .join('');
            blocks.push(`<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`);
            continue;
        }

        if (/^\s*[-*]\s+/.test(line)) {
            const items: string[] = [];
            while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
                items.push(renderInlineMarkdown(lines[i].replace(/^\s*[-*]\s+/, '').trim()));
                i += 1;
            }
            blocks.push(`<ul>${items.map((item) => `<li>${item}</li>`).join('')}</ul>`);
            continue;
        }

        const paragraphLines: string[] = [];
        while (i < lines.length && lines[i].trim() !== '') {
            paragraphLines.push(lines[i]);
            i += 1;
        }
        const paragraphText = renderInlineMarkdown(paragraphLines.join(' '));
        blocks.push(`<p>${paragraphText}</p>`);
    }

    return blocks.join('\n');
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

function normalizePathForCompare(value: string): string {
    return String(value || '').replace(/\\/g, '/').toLowerCase();
}

function isWslEnvironment(): boolean {
    if (process.platform === 'win32') return false;
    const release = os.release().toLowerCase();
    return release.includes('microsoft') || !!process.env.WSL_DISTRO_NAME || !!process.env.WSL_INTEROP;
}

function toWslPath(winPath: string): string {
    const trimmed = String(winPath || '').trim();
    if (!trimmed) return '';
    if (trimmed.startsWith('/mnt/')) return trimmed;
    const match = trimmed.match(/^([a-zA-Z]):[\\/](.*)$/);
    if (!match) return trimmed;
    const drive = match[1].toLowerCase();
    const rest = match[2].replace(/\\/g, '/');
    return `/mnt/${drive}/${rest}`;
}

function isDirectory(dirPath: string): boolean {
    try {
        return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
    } catch {
        return false;
    }
}

function scoreHomeDir(dirPath: string): number {
    let score = 0;
    if (isDirectory(path.join(dirPath, '.codeium', 'windsurf-next'))) score += 4;
    if (isDirectory(path.join(dirPath, '.codeium', 'windsurf'))) score += 3;
    if (isDirectory(path.join(dirPath, '.codeium'))) score += 2;
    return score;
}

function getWindowsHomeCandidates(): string[] {
    const candidates: string[] = [];
    const envProfile = process.env.USERPROFILE || '';
    const envHome = envProfile || ((process.env.HOMEDRIVE && process.env.HOMEPATH) ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}` : '');
    const envPath = toWslPath(envHome);
    if (envPath && isDirectory(envPath)) {
        candidates.push(envPath);
    }

    const userRoot = '/mnt/c/Users';
    if (isDirectory(userRoot)) {
        try {
            const entries = fs.readdirSync(userRoot, { withFileTypes: true });
            for (const entry of entries) {
                if (!entry.isDirectory()) continue;
                const name = entry.name;
                if (/^(public|default|default user|all users)$/i.test(name)) continue;
                const userDir = path.join(userRoot, name);
                if (isDirectory(path.join(userDir, '.codeium'))) {
                    candidates.push(userDir);
                }
            }
        } catch {
            // ignore
        }
    }

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const candidate of candidates) {
        const key = normalizePathForCompare(candidate);
        if (key && !seen.has(key)) {
            seen.add(key);
            unique.push(candidate);
        }
    }

    unique.sort((a, b) => scoreHomeDir(b) - scoreHomeDir(a));
    return unique;
}

function getCandidateHomeDirs(): string[] {
    const dirs: string[] = [];

    // Optional override for the Windows user profile/home (useful for WSL/remote cases).
    try {
        const cfg = vscode.workspace.getConfiguration('mcpService');
        const raw = String(cfg.get<string>('userHomeOverride', '') || '').trim();
        if (raw) {
            const expanded = raw.replace(/%USERPROFILE%/gi, process.env.USERPROFILE || '').trim();
            const candidate = isWslEnvironment() ? toWslPath(expanded) : expanded;
            if (candidate && isDirectory(candidate)) {
                dirs.push(candidate);
            }
        }
    } catch {
        // ignore
    }

    // On Windows, Windsurf stores user-level config under %USERPROFILE%\\.codeium\\...
    // Prefer USERPROFILE/HOMEDRIVE+HOMEPATH if they differ from os.homedir().
    if (process.platform === 'win32') {
        const envProfile = (process.env.USERPROFILE || '').trim();
        if (envProfile && isDirectory(envProfile)) {
            dirs.push(envProfile);
        }
        const driveHome = ((process.env.HOMEDRIVE && process.env.HOMEPATH) ? `${process.env.HOMEDRIVE}${process.env.HOMEPATH}` : '').trim();
        if (driveHome && isDirectory(driveHome)) {
            dirs.push(driveHome);
        }
    } else if (isWslEnvironment()) {
        // WSL: prefer Windows user profiles mounted under /mnt/c/Users.
        dirs.push(...getWindowsHomeCandidates());
    }

    dirs.push(os.homedir());

    const unique: string[] = [];
    const seen = new Set<string>();
    for (const dir of dirs) {
        const key = normalizePathForCompare(dir);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(dir);
    }
    unique.sort((a, b) => scoreHomeDir(b) - scoreHomeDir(a));
    return unique;
}

function getReadHomeDirs(): string[] {
    return getCandidateHomeDirs();
}

function getWriteHomeDirs(): string[] {
    const dirs = getCandidateHomeDirs();
    // Write to the best-scored dir, but keep a small same-user fallback set for reliability.
    return dirs.length > 0 ? dirs.slice(0, 5) : [os.homedir()];
}

function getWindsurfMcpConfigPaths(homeDirs: string[] = getWriteHomeDirs()): string[] {
    const baseDirs = ['.codeium'];
    const variants = ['windsurf', 'windsurf-next'];
    const paths: string[] = [];
    const seen = new Set<string>();

    for (const homeDir of homeDirs) {
        for (const base of baseDirs) {
            for (const variant of variants) {
                const configPath = path.join(homeDir, base, variant, 'mcp_config.json');
                const key = normalizePathForCompare(configPath);
                if (!seen.has(key)) {
                    seen.add(key);
                    paths.push(configPath);
                }
            }
        }
    }

    return paths;
}

function getWindsurfHooksConfigPaths(homeDirs: string[] = getWriteHomeDirs()): Array<{ variant: string; hooksPath: string }> {
    const variants = ['windsurf', 'windsurf-next'];
    const items: Array<{ variant: string; hooksPath: string }> = [];
    const seen = new Set<string>();
    for (const homeDir of homeDirs) {
        for (const variant of variants) {
            const hooksPath = path.join(homeDir, '.codeium', variant, 'hooks.json');
            const key = normalizePathForCompare(hooksPath);
            if (!seen.has(key)) {
                seen.add(key);
                items.push({ variant, hooksPath });
            }
        }
    }
    return items;
}

// Official Cascade hook events (per Windsurf docs).
const WINDSURF_HOOK_EVENTS = [
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

// Auto-install only what we enforce in the guard to reduce overhead.
const AUTO_INSTALL_HOOK_EVENTS = [
    'pre_run_command',
    'post_run_command',
    'pre_write_code',
    'post_write_code',
    'pre_mcp_tool_use',
    'post_mcp_tool_use',
    'pre_user_prompt',
    'post_cascade_response'
] as const;

const TRACKER_FILE_NAME = 'windsurf-auto-mcp-tracker.json';
const MEMORY_FILE_NAME = 'windsurf-auto-mcp-memories.json';
const GLOBAL_MEMORY_FILE_NAME = 'windsurf-auto-mcp-global-memories.json';
const ARTIFACT_ROOT_DIR = 'windsurf-auto-mcp';
const ARTIFACT_BRAIN_DIR = 'brain';
const AUDIT_FILE_NAME = 'audit.jsonl';
const INDEX_DIR_NAME = 'index';
const RAG_INDEX_FILE_NAME = 'rag-index.json';
const WAM_DIR_NAME = '.wam';
const WAM_COMMITS_DIR = 'commits';
const WAM_SNAPSHOTS_DIR = 'snapshots';
const WAM_REFS_DIR = 'refs';
const WAM_REFS_HEADS_DIR = 'heads';
const WAM_REFS_TAGS_DIR = 'tags';
const WAM_HEAD_TEXT_FILE = 'HEAD';
const WAM_HEAD_FILE = 'HEAD.json';
const WAM_SIGNING_KEY_FILE = 'SIGNING_KEY.json';
const WAM_GLOBAL_ID = 'global';
const WAM_STASH_DIR = 'stash';
const WAM_DEFAULT_BRANCH = 'main';
const WAM_DEFAULT_BRANCH_REF = `refs/heads/${WAM_DEFAULT_BRANCH}`;

type RagIndexEntry = {
    path: string; // workspace-relative, normalized with /
    mtimeMs: number;
    size: number;
    tokens?: string[];
    updatedAt: string;
};

type RagIndexData = {
    schemaVersion: 1;
    rootPath: string;
    createdAt: string;
    updatedAt: string;
    files: Record<string, RagIndexEntry>;
};

type WamHead = {
    head?: string;
    ref?: string; // e.g. refs/heads/main
    digest?: string;
    updatedAt?: string;
};

type WamCommit = {
    hash: string;
    parents: string[];
    createdAt: string;
    message: string;
    author: 'auto' | 'ai' | 'user';
    scope: 'project' | 'global';
    projectId?: string;
    rootPath?: string;
    digest: string;
    snapshots: Record<string, string>;
    signature?: string;
    signatureAlg?: 'hmac-sha256';
    signatureKeyId?: string;
    conflicts?: string[];
    changes?: any;
};

type WamSigningKeyFile = {
    schemaVersion: 1;
    keyId: string;
    alg: 'hmac-sha256';
    key: string; // base64
    createdAt: string;
};

function nowIso(): string {
    return new Date().toISOString();
}

function nowIsoNano(): string {
    const iso = new Date().toISOString();
    return iso.replace('Z', '000000Z');
}

function createProjectId(): string {
    try {
        return crypto.randomUUID();
    } catch {
        return `project_${Math.random().toString(36).slice(2, 12)}`;
    }
}

function sha256Hex(input: string): string {
    return crypto.createHash('sha256').update(input).digest('hex');
}

function stableJsonStringify(value: any): string {
    const normalize = (v: any): any => {
        if (v === undefined) return undefined;
        if (v === null) return null;
        const t = typeof v;
        if (t === 'string' || t === 'number' || t === 'boolean') return v;
        if (Array.isArray(v)) {
            // JSON.stringify turns undefined in arrays into null.
            return v.map((item) => (item === undefined ? null : normalize(item)));
        }
        if (t === 'object') {
            const out: any = {};
            const keys = Object.keys(v).sort();
            for (const k of keys) {
                const nv = normalize(v[k]);
                // JSON.stringify omits undefined object fields.
                if (nv !== undefined) out[k] = nv;
            }
            return out;
        }
        // Functions/symbols/etc are treated as null/omitted by JSON.stringify; stringify them as strings for determinism.
        return String(v);
    };
    return JSON.stringify(normalize(value));
}

function sha256HexParts(parts: Array<string | undefined | null>): string {
    const hash = crypto.createHash('sha256');
    for (const part of parts) {
        hash.update(String(part ?? ''));
        hash.update('\n');
    }
    return hash.digest('hex');
}

function normalizeWamItemStatus(status: any): TrackerItemStatus {
    if (status === 'doing' || status === 'done') return status;
    return 'todo';
}

function computeProjectWamDigest(project: ProjectTracker, memoryProject: ProjectMemoryStore): string {
    const planItems = Array.isArray(project?.plan?.items) ? [...project.plan.items] : [];
    planItems.sort((a, b) => String(a?.text || '').toLowerCase().localeCompare(String(b?.text || '').toLowerCase()));

    const memories = memoryProject?.memories && typeof memoryProject.memories === 'object' ? memoryProject.memories : {};
    const memoryKeys = Object.keys(memories).sort((a, b) => a.localeCompare(b));

    const parts: Array<string | undefined | null> = [];
    parts.push('wam-digest-v1');
    parts.push(project.projectId);
    parts.push(project.rootPath);
    parts.push(project.name);

    parts.push('overview');
    parts.push(project.overview?.updatedAt || '');
    parts.push(project.overview?.content || '');

    parts.push('prd');
    parts.push(project.prd?.status || '');
    parts.push(project.prd?.updatedAt || '');
    parts.push(project.prd?.approvedBy || '');
    parts.push(project.prd?.approvedAt || '');
    parts.push(project.prd?.reviewNote || '');
    parts.push(project.prd?.reviewedAt || '');
    parts.push(project.prd?.content || '');

    parts.push('plan');
    parts.push(project.plan?.summary || '');
    for (const it of planItems) {
        if (!it) continue;
        parts.push('plan_item');
        parts.push(String(it.text || '').trim());
        parts.push(normalizeWamItemStatus(it.status));
        parts.push(String(it.updatedAt || ''));
    }

    parts.push('walkthrough');
    parts.push(project.walkthrough?.updatedAt || '');
    parts.push(project.walkthrough?.content || '');

    parts.push('stats');
    parts.push(String(project.stats?.prdUpdates ?? 0));
    parts.push(String(project.stats?.prdApprovals ?? 0));
    parts.push(String(project.stats?.overviewUpdates ?? 0));
    parts.push(String(project.stats?.planUpdates ?? 0));
    parts.push(String(project.stats?.walkthroughUpdates ?? 0));
    parts.push(project.stats?.updatedAt || '');

    parts.push('memories');
    for (const key of memoryKeys) {
        const entry: any = (memories as any)[key];
        if (!entry) continue;
        parts.push('memory');
        parts.push(key);
        parts.push(entry.kind || '');
        parts.push(entry.createdAt || '');
        parts.push(entry.updatedAt || '');
        parts.push(entry.content || '');
        parts.push(Array.isArray(entry.tags) ? entry.tags.join(',') : '');
        parts.push(Array.isArray(entry.links) ? entry.links.join(',') : '');
    }
    return sha256HexParts(parts);
}

function computeGlobalWamDigest(global: GlobalMemoryData): string {
    const memories = global?.memories && typeof global.memories === 'object' ? global.memories : {};
    const keys = Object.keys(memories).sort((a, b) => a.localeCompare(b));
    const parts: Array<string | undefined | null> = [];
    parts.push('wam-global-digest-v1');
    for (const key of keys) {
        const entry: any = (memories as any)[key];
        if (!entry) continue;
        parts.push('memory');
        parts.push(key);
        parts.push(entry.kind || '');
        parts.push(entry.createdAt || '');
        parts.push(entry.updatedAt || '');
        parts.push(entry.content || '');
        parts.push(Array.isArray(entry.tags) ? entry.tags.join(',') : '');
        parts.push(Array.isArray(entry.links) ? entry.links.join(',') : '');
    }
    return sha256HexParts(parts);
}

function readTextFileSafe(filePath: string): string | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        const raw = fs.readFileSync(filePath, 'utf-8');
        return raw;
    } catch {
        return null;
    }
}

function writeTextFileSafe(filePath: string, text: string): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, text, 'utf-8');
}

function normalizeWorkspaceRelPath(rootPath: string, filePath: string): string {
    try {
        const rel = path.relative(rootPath, filePath);
        return String(rel || '').replace(/\\/g, '/');
    } catch {
        return String(filePath || '').replace(/\\/g, '/');
    }
}

function resolveExistingFile(candidates: string[]): string | null {
    let best: { filePath: string; mtimeMs: number } | null = null;
    for (const c of candidates) {
        if (!c) continue;
        try {
            if (!fs.existsSync(c) || !fs.statSync(c).isFile()) continue;
            const mtimeMs = fs.statSync(c).mtimeMs;
            if (!best || mtimeMs > best.mtimeMs) best = { filePath: c, mtimeMs };
        } catch {
            // ignore
        }
    }
    return best?.filePath || candidates.find(Boolean) || null;
}

function loadRagIndexData(rootPath: string, projectId: string): RagIndexData | null {
    try {
        const paths = getRagIndexPaths(getReadHomeDirs(), projectId).map((p) => p.indexPath);
        const chosen = resolveExistingFile(paths);
        if (!chosen || !fs.existsSync(chosen)) return null;
        const raw = fs.readFileSync(chosen, 'utf-8');
        if (!raw.trim()) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        if ((parsed as any).schemaVersion !== 1) return null;
        if (typeof (parsed as any).rootPath !== 'string') return null;
        if ((parsed as any).rootPath !== rootPath) return null;
        if (!(parsed as any).files || typeof (parsed as any).files !== 'object') return null;
        return parsed as RagIndexData;
    } catch {
        return null;
    }
}

function saveRagIndexData(projectId: string, data: RagIndexData): void {
    const targets = getRagIndexPaths(getWriteHomeDirs(), projectId);
    for (const { indexPath } of targets) {
        try {
            const dir = path.dirname(indexPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            const tmp = `${indexPath}.tmp`;
            fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
            fs.renameSync(tmp, indexPath);
        } catch (e: any) {
            outputChannel?.appendLine(`RAG index write failed: ${indexPath} - ${e?.message ?? String(e)}`);
        }
    }
}

function createEmptyRagIndex(rootPath: string): RagIndexData {
    const now = nowIso();
    return { schemaVersion: 1, rootPath, createdAt: now, updatedAt: now, files: {} };
}

function isValidWamRefName(name: string): boolean {
    if (!name) return false;
    if (name.length > 80) return false;
    if (!/^[a-zA-Z0-9._-]+$/.test(name)) return false;
    if (name.includes('..')) return false;
    if (name.startsWith('.') || name.endsWith('.')) return false;
    return true;
}

function wamRefPath(dir: string, ref: string): string | null {
    const r = String(ref || '').trim().replace(/\\/g, '/');
    if (!r.startsWith('refs/')) return null;
    const parts = r.split('/').filter(Boolean);
    if (parts.length !== 3) return null;
    const [, kind, name] = parts;
    if (kind !== 'heads' && kind !== 'tags') return null;
    if (!isValidWamRefName(name)) return null;
    return path.join(dir, WAM_REFS_DIR, kind, name);
}

function readWamRef(dir: string, ref: string): string {
    const p = wamRefPath(dir, ref);
    if (!p) return '';
    const raw = readTextFileSafe(p);
    return String(raw || '').trim();
}

function writeWamRef(dir: string, ref: string, hash: string): void {
    const p = wamRefPath(dir, ref);
    if (!p) return;
    writeTextFileSafe(p, `${String(hash || '').trim()}\n`);
}

function deleteWamRef(dir: string, ref: string): boolean {
    const p = wamRefPath(dir, ref);
    if (!p) return false;
    try {
        if (!fs.existsSync(p)) return false;
        fs.unlinkSync(p);
        return true;
    } catch {
        return false;
    }
}

function ensureWamRepoLayout(dir: string): void {
    const paths = [
        path.join(dir, WAM_COMMITS_DIR),
        path.join(dir, WAM_SNAPSHOTS_DIR),
        path.join(dir, WAM_REFS_DIR, WAM_REFS_HEADS_DIR),
        path.join(dir, WAM_REFS_DIR, WAM_REFS_TAGS_DIR),
        path.join(dir, WAM_STASH_DIR)
    ];
    for (const p of paths) {
        try {
            if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
        } catch {
            // ignore
        }
    }
}

function getTrackerPaths(homeDirs: string[] = getWriteHomeDirs()): Array<{ variant: string; trackerPath: string }> {
    const variants = ['windsurf', 'windsurf-next'];
    const items: Array<{ variant: string; trackerPath: string }> = [];
    const seen = new Set<string>();
    for (const homeDir of homeDirs) {
        for (const variant of variants) {
            const trackerPath = path.join(homeDir, '.codeium', variant, TRACKER_FILE_NAME);
            const key = normalizePathForCompare(trackerPath);
            if (!seen.has(key)) {
                seen.add(key);
                items.push({ variant, trackerPath });
            }
        }
    }
    return items;
}

function getMemoryPaths(homeDirs: string[] = getWriteHomeDirs()): Array<{ variant: string; memoryPath: string }> {
    const variants = ['windsurf', 'windsurf-next'];
    const items: Array<{ variant: string; memoryPath: string }> = [];
    const seen = new Set<string>();
    for (const homeDir of homeDirs) {
        for (const variant of variants) {
            const memoryPath = path.join(homeDir, '.codeium', variant, MEMORY_FILE_NAME);
            const key = normalizePathForCompare(memoryPath);
            if (!seen.has(key)) {
                seen.add(key);
                items.push({ variant, memoryPath });
            }
        }
    }
    return items;
}

function getProjectWamDirs(homeDirs: string[] = getWriteHomeDirs(), projectId: string): Array<{ variant: string; dir: string }> {
    const variants = ['windsurf', 'windsurf-next'];
    const items: Array<{ variant: string; dir: string }> = [];
    const seen = new Set<string>();
    for (const homeDir of homeDirs) {
        for (const variant of variants) {
            const dir = path.join(homeDir, '.codeium', variant, ARTIFACT_ROOT_DIR, WAM_DIR_NAME, projectId);
            const key = normalizePathForCompare(dir);
            if (!seen.has(key)) {
                seen.add(key);
                items.push({ variant, dir });
            }
        }
    }
    return items;
}

function getProjectWamReadDirs(homeDirs: string[] = getReadHomeDirs(), projectId: string): Array<{ variant: string; dir: string }> {
    return getProjectWamDirs(homeDirs, projectId);
}

function getGlobalWamDirs(homeDirs: string[] = getWriteHomeDirs()): Array<{ dir: string }> {
    // Global WAM is shared (not variant-specific), matching the global memory file location:
    // ~/.codeium/windsurf-auto-mcp/windsurf-auto-mcp-global-memories.json
    const items: Array<{ dir: string }> = [];
    const seen = new Set<string>();
    for (const homeDir of homeDirs) {
        const dir = path.join(homeDir, '.codeium', ARTIFACT_ROOT_DIR, WAM_DIR_NAME, WAM_GLOBAL_ID);
        const key = normalizePathForCompare(dir);
        if (!seen.has(key)) {
            seen.add(key);
            items.push({ dir });
        }
    }
    return items;
}

function getGlobalMemoryPaths(homeDirs: string[] = getWriteHomeDirs()): string[] {
    const items: string[] = [];
    const seen = new Set<string>();
    for (const homeDir of homeDirs) {
        const memoryPath = path.join(homeDir, '.codeium', ARTIFACT_ROOT_DIR, GLOBAL_MEMORY_FILE_NAME);
        const key = normalizePathForCompare(memoryPath);
        if (!seen.has(key)) {
            seen.add(key);
            items.push(memoryPath);
        }
    }
    return items;
}

type ArtifactSpec = {
    fileName: string;
    artifactType: string;
    content: string;
    summary?: string;
};

function getProjectBrainDirs(homeDirs: string[] = getWriteHomeDirs(), projectId: string): Array<{ variant: string; dir: string }> {
    const variants = ['windsurf', 'windsurf-next'];
    const items: Array<{ variant: string; dir: string }> = [];
    const seen = new Set<string>();
    for (const homeDir of homeDirs) {
        for (const variant of variants) {
            const dir = path.join(homeDir, '.codeium', variant, ARTIFACT_ROOT_DIR, ARTIFACT_BRAIN_DIR, projectId);
            const key = normalizePathForCompare(dir);
            if (!seen.has(key)) {
                seen.add(key);
                items.push({ variant, dir });
            }
        }
    }
    return items;
}

function getProjectIndexDirs(homeDirs: string[] = getWriteHomeDirs(), projectId: string): Array<{ variant: string; dir: string }> {
    const variants = ['windsurf', 'windsurf-next'];
    const items: Array<{ variant: string; dir: string }> = [];
    const seen = new Set<string>();
    for (const homeDir of homeDirs) {
        for (const variant of variants) {
            const dir = path.join(homeDir, '.codeium', variant, ARTIFACT_ROOT_DIR, INDEX_DIR_NAME, projectId);
            const key = normalizePathForCompare(dir);
            if (!seen.has(key)) {
                seen.add(key);
                items.push({ variant, dir });
            }
        }
    }
    return items;
}

function getRagIndexPaths(homeDirs: string[] = getWriteHomeDirs(), projectId: string): Array<{ variant: string; indexPath: string }> {
    return getProjectIndexDirs(homeDirs, projectId).map(({ variant, dir }) => ({
        variant,
        indexPath: path.join(dir, RAG_INDEX_FILE_NAME)
    }));
}

function readArtifactMetadata(metaPath: string): { version: number; summary?: string; updatedAt?: string } | null {
    try {
        if (!fs.existsSync(metaPath)) return null;
        const raw = fs.readFileSync(metaPath, 'utf-8');
        if (!raw.trim()) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return null;
        const parsedVersion = parseInt(String((data as any).version ?? '0'), 10);
        return {
            version: Number.isFinite(parsedVersion) ? parsedVersion : 0,
            summary: typeof (data as any).summary === 'string' ? (data as any).summary : undefined,
            updatedAt: typeof (data as any).updatedAt === 'string' ? (data as any).updatedAt : undefined
        };
    } catch {
        return null;
    }
}

function createArtifactSummary(content: string): string {
    const lines = String(content || '')
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
    if (lines.length === 0) return '';
    const first = lines[0].replace(/^#+\s*/, '').trim();
    if (!first) return '';
    if (first.length > 180) {
        return `${first.slice(0, 177)}...`;
    }
    return first;
}

function writeArtifactFiles(dir: string, spec: ArtifactSpec): boolean {
    const content = spec.content ?? '';
    if (!content.trim()) return false;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, spec.fileName);
    const resolvedPath = `${filePath}.resolved`;
    const metaPath = `${filePath}.metadata.json`;

    const existingResolved = fs.existsSync(resolvedPath) ? fs.readFileSync(resolvedPath, 'utf-8') : null;
    const existingMeta = readArtifactMetadata(metaPath);
    const existingVersion = existingMeta?.version ?? 0;
    const contentChanged = existingResolved === null || existingResolved !== content;
    const needsWrite = contentChanged || !fs.existsSync(filePath) || !fs.existsSync(resolvedPath) || !fs.existsSync(metaPath);

    if (!needsWrite) return false;

    if (existingResolved !== null && existingResolved !== content) {
        const snapshotPath = `${resolvedPath}.${existingVersion}`;
        if (!fs.existsSync(snapshotPath)) {
            fs.writeFileSync(snapshotPath, existingResolved, 'utf-8');
        }
    }

    fs.writeFileSync(filePath, content, 'utf-8');
    fs.writeFileSync(resolvedPath, content, 'utf-8');

    const version = contentChanged || !existingMeta ? existingVersion + 1 : existingVersion;
    const updatedAt = contentChanged || !existingMeta ? nowIsoNano() : (existingMeta.updatedAt || nowIsoNano());
    const summary = spec.summary || existingMeta?.summary;
    const metadata: Record<string, string> = {
        artifactType: spec.artifactType,
        updatedAt,
        version: String(version)
    };
    if (summary) metadata.summary = summary;
    fs.writeFileSync(metaPath, JSON.stringify(metadata, null, 2));
    return true;
}

function readJsonFileSafe<T>(filePath: string): T | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        let raw = fs.readFileSync(filePath, 'utf-8');
        raw = raw.replace(/^\uFEFF/, '');
        if (!raw.trim()) return null;
        return JSON.parse(raw) as T;
    } catch {
        return null;
    }
}

function writeJsonFileSafe(filePath: string, data: unknown): void {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

function isWamSigningEnabled(): boolean {
    try {
        const cfg = vscode.workspace.getConfiguration('mcpService');
        return cfg.get<boolean>('wamSigning', false) === true;
    } catch {
        return false;
    }
}

function listWamSigningKeyPaths(homeDirs: string[] = getWriteHomeDirs()): string[] {
    const dirs = getGlobalWamDirs(homeDirs);
    const paths: string[] = [];
    const seen = new Set<string>();
    for (const { dir } of dirs) {
        const p = path.join(dir, WAM_SIGNING_KEY_FILE);
        const key = normalizePathForCompare(p);
        if (!seen.has(key)) {
            seen.add(key);
            paths.push(p);
        }
    }
    return paths;
}

function parseWamSigningKeyFile(raw: any): { keyId: string; keyBytes: Buffer; alg: 'hmac-sha256' } | null {
    try {
        if (!raw || typeof raw !== 'object') return null;
        const alg = String((raw as any).alg || 'hmac-sha256') as 'hmac-sha256';
        if (alg !== 'hmac-sha256') return null;
        const keyId = String((raw as any).keyId || '').trim() || 'default';
        const key = String((raw as any).key || '').trim();
        if (!key) return null;
        const keyBytes = Buffer.from(key, 'base64');
        if (!keyBytes || keyBytes.length < 24) return null;
        return { keyId, keyBytes, alg };
    } catch {
        return null;
    }
}

function loadWamSigningKey(readonlyMode = true): { keyId: string; keyBytes: Buffer; alg: 'hmac-sha256' } | null {
    const paths = listWamSigningKeyPaths(readonlyMode ? getReadHomeDirs() : getWriteHomeDirs());
    for (const p of paths) {
        const data = readJsonFileSafe<WamSigningKeyFile>(p);
        const parsed = parseWamSigningKeyFile(data);
        if (parsed) return parsed;
    }
    return null;
}

function ensureWamSigningKey(): { keyId: string; keyBytes: Buffer; alg: 'hmac-sha256' } | null {
    if (!isWamSigningEnabled()) return null;

    const existing = loadWamSigningKey(false);
    if (existing) {
        // Best-effort: replicate to any missing dirs so both windsurf/windsurf-next stay consistent.
        try {
            const paths = listWamSigningKeyPaths(getWriteHomeDirs());
            const payload: WamSigningKeyFile = {
                schemaVersion: 1,
                keyId: existing.keyId,
                alg: existing.alg,
                key: existing.keyBytes.toString('base64'),
                createdAt: nowIsoNano()
            };
            for (const p of paths) {
                if (!fs.existsSync(p)) {
                    writeJsonFileSafe(p, payload);
                }
            }
        } catch {
            // ignore replication failures
        }
        return existing;
    }

    const keyBytes = crypto.randomBytes(32);
    const payload: WamSigningKeyFile = {
        schemaVersion: 1,
        keyId: 'default',
        alg: 'hmac-sha256',
        key: keyBytes.toString('base64'),
        createdAt: nowIsoNano()
    };

    const paths = listWamSigningKeyPaths(getWriteHomeDirs());
    for (const p of paths) {
        try {
            writeJsonFileSafe(p, payload);
        } catch {
            // ignore
        }
    }

    return { keyId: payload.keyId, keyBytes, alg: payload.alg };
}

function signWamHash(hash: string, signingKey: Buffer): string {
    return crypto.createHmac('sha256', signingKey).update(String(hash || '')).digest('hex');
}

/**
 * WAM (WindsurfAutoMcp) history: a lightweight, git-like snapshot log for project tracking + memory.
 * Stored under ~/.codeium/<variant>/windsurf-auto-mcp/.wam/<projectId>/.
 */
function readWamHead(dir: string): WamHead {
    const headPath = path.join(dir, WAM_HEAD_FILE);
    return readJsonFileSafe<WamHead>(headPath) || {};
}

function writeWamHead(dir: string, head: WamHead): void {
    ensureWamRepoLayout(dir);
    writeJsonFileSafe(path.join(dir, WAM_HEAD_FILE), head);
    try {
        const headTextPath = path.join(dir, WAM_HEAD_TEXT_FILE);
        const content = head.ref ? `ref: ${head.ref}\n` : (head.head ? `${head.head}\n` : '');
        if (content) {
            writeTextFileSafe(headTextPath, content);
        } else if (fs.existsSync(headTextPath)) {
            fs.unlinkSync(headTextPath);
        }
    } catch {
        // ignore
    }
}

function writeWamCommit(dir: string, commit: WamCommit, snapshots: Record<string, unknown>): void {
    ensureWamRepoLayout(dir);
    const commitsDir = path.join(dir, WAM_COMMITS_DIR);
    const snapshotDir = path.join(dir, WAM_SNAPSHOTS_DIR, commit.hash);
    if (!fs.existsSync(commitsDir)) fs.mkdirSync(commitsDir, { recursive: true });
    if (!fs.existsSync(snapshotDir)) fs.mkdirSync(snapshotDir, { recursive: true });

    for (const [name, data] of Object.entries(snapshots || {})) {
        if (!name) continue;
        writeJsonFileSafe(path.join(snapshotDir, `${name}.json`), data);
    }
    writeJsonFileSafe(path.join(commitsDir, `${commit.hash}.json`), commit);
    const prev = readWamHead(dir);
    const nextHead: WamHead = { head: commit.hash, digest: commit.digest, updatedAt: commit.createdAt, ref: prev.ref };
    writeWamHead(dir, nextHead);
    if (nextHead.ref) {
        try {
            writeWamRef(dir, nextHead.ref, commit.hash);
        } catch {
            // ignore
        }
    }
}

function readWamCommit(dir: string, hash: string): WamCommit | null {
    if (!hash) return null;
    return readJsonFileSafe<WamCommit>(path.join(dir, WAM_COMMITS_DIR, `${hash}.json`));
}

function readWamSnapshot(dir: string, hash: string, name: string): any | null {
    if (!hash || !name) return null;
    return readJsonFileSafe<any>(path.join(dir, WAM_SNAPSHOTS_DIR, hash, `${name}.json`));
}

function resolveWamHeadHash(dir: string): { head: WamHead; hash: string } {
    const head = readWamHead(dir);
    const hash = head.ref ? (readWamRef(dir, head.ref) || head.head || '') : (head.head || '');
    return { head, hash };
}

function walkWamHistory(dir: string, startHash: string, limit = 50): WamCommit[] {
    const out: WamCommit[] = [];
    const seen = new Set<string>();
    let current = String(startHash || '').trim();
    while (current && out.length < limit) {
        if (seen.has(current)) break;
        seen.add(current);
        const commit = readWamCommit(dir, current);
        if (!commit) break;
        out.push(commit);
        current = Array.isArray(commit.parents) && commit.parents.length > 0 ? String(commit.parents[0] || '') : '';
    }
    return out;
}

function looksLikeCommitHash(value: string): boolean {
    const v = String(value || '').trim();
    if (v.length < 8 || v.length > 80) return false;
    return /^[a-f0-9]+$/i.test(v);
}

function resolveWamHashFromSpecifier(dir: string, spec: string): string {
    const raw = String(spec || '').trim();
    if (!raw) return '';
    if (raw === 'HEAD') {
        return resolveWamHeadHash(dir).hash;
    }
    if (raw === 'WORKING') {
        return '';
    }
    if (raw.startsWith('refs/')) {
        return readWamRef(dir, raw);
    }
    if (isValidWamRefName(raw)) {
        const headRef = `refs/heads/${raw}`;
        const tagRef = `refs/tags/${raw}`;
        const branchHash = readWamRef(dir, headRef);
        if (branchHash) return branchHash;
        const tagHash = readWamRef(dir, tagRef);
        if (tagHash) return tagHash;
    }
    if (looksLikeCommitHash(raw)) return raw;
    return '';
}

function currentWamBranchName(head: WamHead): string {
    if (!head?.ref) return '';
    if (head.ref.startsWith('refs/heads/')) return head.ref.slice('refs/heads/'.length);
    return '';
}

function listWamRefs(dir: string, kind: 'heads' | 'tags'): Array<{ name: string; hash: string }> {
    try {
        const base = path.join(dir, WAM_REFS_DIR, kind);
        if (!fs.existsSync(base)) return [];
        const entries = fs.readdirSync(base).filter((n) => isValidWamRefName(n));
        const out: Array<{ name: string; hash: string }> = [];
        for (const name of entries) {
            const ref = `refs/${kind}/${name}`;
            out.push({ name, hash: readWamRef(dir, ref) });
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        return [];
    }
}

function listWamCommits(dir: string, limit = 50): WamCommit[] {
    try {
        const commitsDir = path.join(dir, WAM_COMMITS_DIR);
        if (!fs.existsSync(commitsDir)) return [];
        const entries = fs.readdirSync(commitsDir).filter((n) => n.endsWith('.json'));
        const commits: WamCommit[] = [];
        for (const entry of entries) {
            const commit = readJsonFileSafe<WamCommit>(path.join(commitsDir, entry));
            if (commit && commit.hash) commits.push(commit);
        }
        commits.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        return commits.slice(0, Math.max(1, limit));
    } catch {
        return [];
    }
}

function resolveExistingDir(candidates: string[]): string | null {
    for (const c of candidates) {
        if (!c) continue;
        try {
            if (fs.existsSync(c) && fs.statSync(c).isDirectory()) return c;
        } catch {
            // ignore
        }
    }
    return candidates.find(Boolean) || null;
}

function resolveProjectWamDir(projectId: string): string | null {
    if (!projectId) return null;
    const readDirs = getProjectWamReadDirs(getReadHomeDirs(), projectId).map((d) => d.dir);
    const writeDirs = getProjectWamDirs(getWriteHomeDirs(), projectId).map((d) => d.dir);
    return resolveExistingDir([...readDirs, ...writeDirs]);
}

function resolveGlobalWamDir(): string | null {
    const readDirs = getGlobalWamDirs(getReadHomeDirs()).map((d) => d.dir);
    const writeDirs = getGlobalWamDirs(getWriteHomeDirs()).map((d) => d.dir);
    return resolveExistingDir([...readDirs, ...writeDirs]);
}

function commitProjectWam(
    message: string,
    author: 'auto' | 'ai' | 'user' = 'auto',
    rootPathOverride?: string,
    parentsOverride?: string[],
    options?: { conflicts?: string[] }
): { committed: boolean; hash?: string; commit?: WamCommit } {
    try {
        const { data: trackerData, project, rootPath } = resolveProjectTracker(rootPathOverride);
        const { data: memoryData, project: memoryProject } = resolveProjectMemory(rootPath);
        if (!project.projectId) project.projectId = createProjectId();

        const normalizeMessage = (raw: string): string => {
            const oneLine = String(raw || '').replace(/\s+/g, ' ').trim();
            if (!oneLine) return '';
            return oneLine.length > 140 ? `${oneLine.slice(0, 137)}...` : oneLine;
        };

        const trackerSnapshot = {
            schemaVersion: 1,
            projectId: project.projectId,
            rootPath,
            tracker: project
        };
        const memorySnapshot = {
            schemaVersion: 1,
            projectId: project.projectId,
            rootPath,
            memory: memoryProject
        };

        const createdAt = nowIsoNano();
        const digest = computeProjectWamDigest(project, memoryProject);

        const dirs = getProjectWamDirs(getWriteHomeDirs(), project.projectId);
        for (const { dir } of dirs) ensureWamRepoLayout(dir);

        // Resolve current HEAD across variants (prefer branch ref if present).
        let resolvedRef: string | undefined;
        let resolvedHeadHash = '';
        let resolvedHeadDigest = '';
        for (const { dir } of dirs) {
            const head = readWamHead(dir);
            if (!resolvedRef && head?.ref) resolvedRef = head.ref;
            if (!resolvedHeadDigest && head?.digest) resolvedHeadDigest = head.digest;
            if (!resolvedHeadHash && head?.ref) {
                const refHash = readWamRef(dir, head.ref);
                if (refHash) resolvedHeadHash = refHash;
            }
            if (!resolvedHeadHash && head?.head) resolvedHeadHash = head.head;
        }

        // First commit: default to main branch unless the repo is explicitly detached.
        if (!resolvedRef && !resolvedHeadHash && !resolvedHeadDigest) {
            resolvedRef = WAM_DEFAULT_BRANCH_REF;
        }

        // Dedupe: if HEAD already matches current digest, skip.
        if (resolvedHeadDigest && resolvedHeadDigest === digest) {
            return { committed: false };
        }

        let parentList: string[] = Array.isArray(parentsOverride) ? parentsOverride.filter(Boolean) : [];
        if (parentList.length === 0) {
            parentList = resolvedHeadHash ? [resolvedHeadHash] : [];
        }

        const readDir = resolveProjectWamDir(project.projectId) || dirs[0]?.dir;
        const baseHashForDiff = parentList.length ? parentList[0] : resolvedHeadHash;
        const baseTrackerSnap = baseHashForDiff && readDir ? readWamSnapshot(readDir, baseHashForDiff, 'tracker') : null;
        const baseMemorySnap = baseHashForDiff && readDir ? readWamSnapshot(readDir, baseHashForDiff, 'memory') : null;
        const baseTracker = normalizeTrackerForMerge(
            baseTrackerSnap?.tracker ? JSON.parse(JSON.stringify(baseTrackerSnap.tracker)) : {},
            rootPath,
            project.projectId
        );
        const baseMemory = normalizeMemoryForMerge(baseMemorySnap?.memory ? JSON.parse(JSON.stringify(baseMemorySnap.memory)) : { memories: {}, timeline: [] });
        const workingTracker = normalizeTrackerForMerge(JSON.parse(JSON.stringify(project)), rootPath, project.projectId);
        const workingMemory = normalizeMemoryForMerge(JSON.parse(JSON.stringify(memoryProject)));

        const trackerDiff = {
            overviewChanged: String(baseTracker?.overview?.content || '') !== String(workingTracker?.overview?.content || ''),
            prdChanged:
                String(baseTracker?.prd?.content || '') !== String(workingTracker?.prd?.content || '') ||
                String(baseTracker?.prd?.status || '') !== String(workingTracker?.prd?.status || ''),
            planSummaryChanged: String(baseTracker?.plan?.summary || '') !== String(workingTracker?.plan?.summary || ''),
            planItems: diffPlanItems(baseTracker?.plan?.items || [], workingTracker?.plan?.items || []),
            walkthroughChanged: String(baseTracker?.walkthrough?.content || '') !== String(workingTracker?.walkthrough?.content || '')
        };
        const memoryDiff = diffMemoryKeys(baseMemory, workingMemory);

        const limitStrings = (arr: any[], maxItems = 20): string[] =>
            (Array.isArray(arr) ? arr : [])
                .map((v) => String(v || '').trim())
                .filter(Boolean)
                .slice(0, maxItems);
        const limitChanged = (
            arr: Array<{ text: string; from: string; to: string }>,
            maxItems = 20
        ): Array<{ text: string; from: string; to: string }> => (Array.isArray(arr) ? arr : []).slice(0, maxItems);

        const changes = {
            base: baseHashForDiff ? String(baseHashForDiff).slice(0, 10) : 'none',
            progress: computeProgress(workingTracker),
            tracker: {
                overviewChanged: trackerDiff.overviewChanged,
                prdChanged: trackerDiff.prdChanged,
                planSummaryChanged: trackerDiff.planSummaryChanged,
                planItems: {
                    added: { count: trackerDiff.planItems.added.length, samples: limitStrings(trackerDiff.planItems.added, 20) },
                    removed: { count: trackerDiff.planItems.removed.length, samples: limitStrings(trackerDiff.planItems.removed, 20) },
                    statusChanged: { count: trackerDiff.planItems.changed.length, samples: limitChanged(trackerDiff.planItems.changed, 20) }
                },
                walkthroughChanged: trackerDiff.walkthroughChanged
            },
            memory: {
                added: { count: memoryDiff.added.length, samples: limitStrings(memoryDiff.added, 20) },
                removed: { count: memoryDiff.removed.length, samples: limitStrings(memoryDiff.removed, 20) },
                changed: { count: memoryDiff.changed.length, samples: limitStrings(memoryDiff.changed, 20) }
            }
        };

        const formatTriplet = (added: number, removed: number, changed: number): string => {
            const parts: string[] = [];
            if (added) parts.push(`+${added}`);
            if (removed) parts.push(`-${removed}`);
            if (changed) parts.push(`~${changed}`);
            return parts.length ? parts.join(' ') : 'no-op';
        };
        const autoMessage = () => {
            if (!baseHashForDiff) {
                return `wam: init (${workingTracker.name || 'project'})`;
            }
            const aspects: string[] = [];
            if (trackerDiff.overviewChanged) aspects.push('overview');
            if (trackerDiff.prdChanged) aspects.push('prd');
            const planChanged =
                trackerDiff.planSummaryChanged ||
                trackerDiff.planItems.added.length > 0 ||
                trackerDiff.planItems.removed.length > 0 ||
                trackerDiff.planItems.changed.length > 0;
            if (planChanged) {
                const p = computeProgress(workingTracker);
                aspects.push(`plan ${p.done}/${p.total} (${formatTriplet(trackerDiff.planItems.added.length, trackerDiff.planItems.removed.length, trackerDiff.planItems.changed.length)})`);
            }
            if (trackerDiff.walkthroughChanged) aspects.push('walkthrough');
            const memChanged = memoryDiff.added.length + memoryDiff.removed.length + memoryDiff.changed.length;
            if (memChanged) aspects.push(`memory (${formatTriplet(memoryDiff.added.length, memoryDiff.removed.length, memoryDiff.changed.length)})`);
            return `wam: ${aspects.join(' + ') || 'snapshot'}`;
        };

        const finalMessage = normalizeMessage(message) || normalizeMessage(autoMessage());
        const hash = sha256Hex(`${createdAt}\n${parentList.join(',')}\n${finalMessage}\n${digest}`);

        const commit: WamCommit = {
            hash,
            parents: parentList,
            createdAt,
            message: finalMessage || 'update',
            author,
            scope: 'project',
            projectId: project.projectId,
            rootPath,
            digest,
            snapshots: {
                tracker: `${WAM_SNAPSHOTS_DIR}/${hash}/tracker.json`,
                memory: `${WAM_SNAPSHOTS_DIR}/${hash}/memory.json`
            },
            conflicts: Array.isArray(options?.conflicts) && options?.conflicts.length ? options?.conflicts : undefined,
            changes
        };

        // Optional commit signing to make WAM history harder to forge.
        const signing = ensureWamSigningKey();
        if (signing) {
            commit.signatureAlg = signing.alg;
            commit.signatureKeyId = signing.keyId;
            commit.signature = signWamHash(hash, signing.keyBytes);
        }

        for (const { dir } of dirs) {
            try {
                // Ensure refs are consistent across variants.
                const prev = readWamHead(dir);
                if (!prev.ref && resolvedRef) {
                    writeWamHead(dir, {
                        head: prev.head || resolvedHeadHash || '',
                        digest: prev.digest || resolvedHeadDigest || '',
                        updatedAt: prev.updatedAt || '',
                        ref: resolvedRef
                    });
                    if (resolvedHeadHash) {
                        writeWamRef(dir, resolvedRef, resolvedHeadHash);
                    }
                }
                writeWamCommit(dir, commit, { tracker: trackerSnapshot, memory: memorySnapshot });
            } catch (e: any) {
                outputChannel?.appendLine(`WAM commit write failed: ${dir} - ${e?.message ?? String(e)}`);
            }
        }

        // Record WAM commit time for UI/workflow status (not part of digest).
        try {
            project.stats = normalizeTrackerStats(project.stats);
            project.stats.lastWamCommitAt = nowIso();
        } catch {
            // ignore
        }

        // Ensure latest state is persisted.
        saveTrackerData(trackerData);
        saveMemoryData(memoryData);
        return { committed: true, hash, commit };
    } catch (e: any) {
        outputChannel?.appendLine(`WAM commit failed: ${e?.message ?? String(e)}`);
        return { committed: false };
    }
}

function autoWamCommit(
    message: string,
    author: 'auto' | 'ai' | 'user' = 'auto',
    rootPathOverride?: string
): { committed: boolean; hash?: string } {
    return commitProjectWam(message, author, rootPathOverride);
}

function autoWamCommitGlobal(
    message: string,
    author: 'auto' | 'ai' | 'user' = 'auto'
): { committed: boolean; hash?: string; commit?: WamCommit } {
    try {
        const globalMemory = loadGlobalMemoryData();
        const snapshot = {
            schemaVersion: 1,
            globalMemory
        };
        const createdAt = nowIsoNano();
        const digest = computeGlobalWamDigest(globalMemory);

        const normalizeMessage = (raw: string): string => {
            const oneLine = String(raw || '').replace(/\s+/g, ' ').trim();
            if (!oneLine) return '';
            return oneLine.length > 140 ? `${oneLine.slice(0, 137)}...` : oneLine;
        };

        const dirs = getGlobalWamDirs(getWriteHomeDirs());
        for (const { dir } of dirs) ensureWamRepoLayout(dir);

        let resolvedRef: string | undefined;
        let resolvedHeadHash = '';
        let resolvedHeadDigest = '';
        for (const { dir } of dirs) {
            const head = readWamHead(dir);
            if (!resolvedRef && head?.ref) resolvedRef = head.ref;
            if (!resolvedHeadDigest && head?.digest) resolvedHeadDigest = head.digest;
            if (!resolvedHeadHash && head?.ref) {
                const refHash = readWamRef(dir, head.ref);
                if (refHash) resolvedHeadHash = refHash;
            }
            if (!resolvedHeadHash && head?.head) resolvedHeadHash = head.head;
        }

        if (!resolvedRef && !resolvedHeadHash && !resolvedHeadDigest) {
            resolvedRef = WAM_DEFAULT_BRANCH_REF;
        }
        if (resolvedHeadDigest && resolvedHeadDigest === digest) {
            return { committed: false };
        }

        const readDir = resolveGlobalWamDir() || dirs[0]?.dir;
        const baseHashForDiff = resolvedHeadHash;
        const baseSnap = baseHashForDiff && readDir ? readWamSnapshot(readDir, baseHashForDiff, 'global_memory') : null;
        const baseGlobal = baseSnap?.globalMemory || { schemaVersion: 1, memories: {}, timeline: [] };
        const baseStore = normalizeMemoryForMerge({ memories: baseGlobal.memories || {}, timeline: baseGlobal.timeline || [] });
        const workingStore = normalizeMemoryForMerge({ memories: globalMemory.memories || {}, timeline: globalMemory.timeline || [] });
        const memDiff = diffMemoryKeys(baseStore, workingStore);
        const limitStrings = (arr: any[], maxItems = 20): string[] =>
            (Array.isArray(arr) ? arr : [])
                .map((v) => String(v || '').trim())
                .filter(Boolean)
                .slice(0, maxItems);
        const changes = {
            base: baseHashForDiff ? String(baseHashForDiff).slice(0, 10) : 'none',
            memory: {
                added: { count: memDiff.added.length, samples: limitStrings(memDiff.added, 20) },
                removed: { count: memDiff.removed.length, samples: limitStrings(memDiff.removed, 20) },
                changed: { count: memDiff.changed.length, samples: limitStrings(memDiff.changed, 20) }
            }
        };
        const formatTriplet = (added: number, removed: number, changed: number): string => {
            const parts: string[] = [];
            if (added) parts.push(`+${added}`);
            if (removed) parts.push(`-${removed}`);
            if (changed) parts.push(`~${changed}`);
            return parts.length ? parts.join(' ') : 'no-op';
        };
        const autoMessage = () => {
            if (!baseHashForDiff) return 'wam: init (global)';
            return `wam: global memory (${formatTriplet(memDiff.added.length, memDiff.removed.length, memDiff.changed.length)})`;
        };
        const finalMessage = normalizeMessage(message) || normalizeMessage(autoMessage());

        const parentList = resolvedHeadHash ? [resolvedHeadHash] : [];
        const hash = sha256Hex(`${createdAt}\n${parentList.join(',')}\n${finalMessage}\n${digest}`);
        const commit: WamCommit = {
            hash,
            parents: parentList,
            createdAt,
            message: finalMessage || 'update',
            author,
            scope: 'global',
            digest,
            snapshots: {
                global_memory: `${WAM_SNAPSHOTS_DIR}/${hash}/global_memory.json`
            },
            changes
        };

        // Optional commit signing to make WAM history harder to forge.
        const signing = ensureWamSigningKey();
        if (signing) {
            commit.signatureAlg = signing.alg;
            commit.signatureKeyId = signing.keyId;
            commit.signature = signWamHash(hash, signing.keyBytes);
        }

        for (const { dir } of dirs) {
            try {
                const prev = readWamHead(dir);
                if (!prev.ref && resolvedRef) {
                    writeWamHead(dir, { head: prev.head || resolvedHeadHash || '', digest: prev.digest || resolvedHeadDigest || '', updatedAt: prev.updatedAt || '', ref: resolvedRef });
                    if (resolvedHeadHash) writeWamRef(dir, resolvedRef, resolvedHeadHash);
                }
                writeWamCommit(dir, commit, { global_memory: snapshot });
            } catch (e: any) {
                outputChannel?.appendLine(`WAM global commit write failed: ${dir} - ${e?.message ?? String(e)}`);
            }
        }

        saveGlobalMemoryData(globalMemory);
        return { committed: true, hash, commit };
    } catch (e: any) {
        outputChannel?.appendLine(`WAM global commit failed: ${e?.message ?? String(e)}`);
        return { committed: false };
    }
}

function removeArtifactFiles(dir: string, fileName: string): void {
    if (!dir || !fileName) return;
    if (!fs.existsSync(dir)) return;
    const basePath = path.join(dir, fileName);
    const targets = [
        basePath,
        `${basePath}.resolved`,
        `${basePath}.metadata.json`
    ];
    for (const target of targets) {
        try {
            if (fs.existsSync(target)) fs.unlinkSync(target);
        } catch {
            // ignore cleanup failures
        }
    }
    try {
        const entries = fs.readdirSync(dir);
        const prefix = `${fileName}.resolved.`;
        for (const entry of entries) {
            if (entry.startsWith(prefix)) {
                const full = path.join(dir, entry);
                try {
                    if (fs.existsSync(full)) fs.unlinkSync(full);
                } catch {
                    // ignore cleanup failures
                }
            }
        }
    } catch {
        // ignore cleanup failures
    }
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

function readMemoryFile(memoryPath: string): MemoryData | null {
    try {
        if (!fs.existsSync(memoryPath)) return null;
        const raw = fs.readFileSync(memoryPath, 'utf-8');
        if (!raw.trim()) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return null;
        if (data.schemaVersion !== 1 || typeof data.projects !== 'object') return null;
        return data as MemoryData;
    } catch {
        return null;
    }
}

function readGlobalMemoryFile(memoryPath: string): GlobalMemoryData | null {
    try {
        if (!fs.existsSync(memoryPath)) return null;
        const raw = fs.readFileSync(memoryPath, 'utf-8');
        if (!raw.trim()) return null;
        const data = JSON.parse(raw);
        if (!data || typeof data !== 'object') return null;
        if (data.schemaVersion !== 1 || typeof (data as any).memories !== 'object') return null;
        return data as GlobalMemoryData;
    } catch {
        return null;
    }
}

function loadTrackerData(): TrackerData {
    const paths = getTrackerPaths(getReadHomeDirs());
    for (const { trackerPath } of paths) {
        const data = readTrackerFile(trackerPath);
        if (data) return data;
    }
    return { schemaVersion: 1, projects: {} };
}

function loadMemoryData(): MemoryData {
    const paths = getMemoryPaths(getReadHomeDirs());
    for (const { memoryPath } of paths) {
        const data = readMemoryFile(memoryPath);
        if (data) return data;
    }
    return { schemaVersion: 1, projects: {} };
}

function loadGlobalMemoryData(): GlobalMemoryData {
    const paths = getGlobalMemoryPaths(getReadHomeDirs());
    for (const memoryPath of paths) {
        const data = readGlobalMemoryFile(memoryPath);
        if (data) return data;
    }
    return { schemaVersion: 1, memories: {} };
}

function saveTrackerData(data: TrackerData): void {
    const paths = getTrackerPaths(getWriteHomeDirs());
    for (const { trackerPath } of paths) {
        const dir = path.dirname(trackerPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(trackerPath, JSON.stringify(data, null, 2));
    }
}

function saveMemoryData(data: MemoryData): void {
    const paths = getMemoryPaths(getWriteHomeDirs());
    for (const { memoryPath } of paths) {
        const dir = path.dirname(memoryPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(memoryPath, JSON.stringify(data, null, 2));
    }
}

function saveGlobalMemoryData(data: GlobalMemoryData): void {
    const paths = getGlobalMemoryPaths(getWriteHomeDirs());
    for (const memoryPath of paths) {
        const dir = path.dirname(memoryPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(memoryPath, JSON.stringify(data, null, 2));
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
            '# PRD (Project Requirements Document) — for complex work',
            '## One-liner',
            '## Problem / Background',
            '## Goals',
            '## Non-goals',
            '## Users / Personas',
            '## User stories (Agile)',
            '- As a ___, I want ___, so that ___.',
            '## Scope',
            '## Flow / Diagram (Mermaid)',
            '```mermaid',
            'flowchart LR',
            '  User --> App',
            '  App --> API',
            '```',
            '## Requirements (Functional)',
            '| ID | Requirement | Priority | Acceptance Criteria | Notes |',
            '| --- | --- | --- | --- | --- |',
            '| FR-1 |  |  |  |  |',
            '## Requirements (Non-Functional)',
            '| ID | Requirement | Priority | Acceptance Criteria | Notes |',
            '| --- | --- | --- | --- | --- |',
            '| NFR-1 |  |  |  |  |',
            '## UX / Workflow',
            '## Data / Analytics',
            '## Constraints',
            '## Dependencies / Integrations',
            '## Risks / Mitigations',
            '## Milestones (Sprints / Phases)',
            '## Acceptance Criteria (Release gate)',
            '## Open Questions',
            '## References (official docs / Context7)',
            ''
        ].join('\n');
    }
    return [
        '# PRD（项目需求文档）— 仅用于复杂任务',
        '## 一句话说明',
        '## 问题/背景',
        '## 目标',
        '## 非目标',
        '## 用户/角色',
        '## 用户故事（敏捷）',
        '- 作为___，我希望___，以便___。',
        '## 范围',
        '## 流程/示意图（Mermaid）',
        '```mermaid',
        'flowchart LR',
        '  用户 --> 产品',
        '  产品 --> 后端',
        '```',
        '## 需求（功能）',
        '| ID | 需求 | 优先级 | 验收标准 | 备注 |',
        '| --- | --- | --- | --- | --- |',
        '| FR-1 |  |  |  |  |',
        '## 需求（非功能）',
        '| ID | 需求 | 优先级 | 验收标准 | 备注 |',
        '| --- | --- | --- | --- | --- |',
        '| NFR-1 |  |  |  |  |',
        '## 体验/流程',
        '## 数据/埋点',
        '## 约束',
        '## 依赖/集成',
        '## 风险/缓解',
        '## 里程碑（迭代/阶段）',
        '## 验收标准（发布门禁）',
        '## 未决问题',
        '## 参考资料（官方文档/Context7）',
        ''
    ].join('\n');
}

function createDefaultTrackerStats(): ProjectTrackerStats {
    return {
        prdUpdates: 0,
        prdApprovals: 0,
        overviewUpdates: 0,
        planUpdates: 0,
        walkthroughUpdates: 0,
        lastPreflightAt: undefined,
        lastProjectStatusAt: undefined,
        lastCheckPlanAt: undefined,
        lastMemorySearchAt: undefined,
        lastRagSearchAt: undefined,
        lastWamStatusAt: undefined,
        lastPlanUpdateAt: undefined,
        lastWalkthroughUpdateAt: undefined,
        lastWamCommitAt: undefined
    };
}

function normalizeTrackerStats(raw: any): ProjectTrackerStats {
    const base = createDefaultTrackerStats();
    if (!raw || typeof raw !== 'object') return base;
    const safe = (value: any) => (Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0);
    return {
        prdUpdates: safe(raw.prdUpdates),
        prdApprovals: safe(raw.prdApprovals),
        overviewUpdates: safe(raw.overviewUpdates),
        planUpdates: safe(raw.planUpdates),
        walkthroughUpdates: safe(raw.walkthroughUpdates),
        updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : undefined,

        lastPreflightAt: typeof raw.lastPreflightAt === 'string' ? raw.lastPreflightAt : undefined,
        lastProjectStatusAt: typeof raw.lastProjectStatusAt === 'string' ? raw.lastProjectStatusAt : undefined,
        lastCheckPlanAt: typeof raw.lastCheckPlanAt === 'string' ? raw.lastCheckPlanAt : undefined,
        lastMemorySearchAt: typeof raw.lastMemorySearchAt === 'string' ? raw.lastMemorySearchAt : undefined,
        lastRagSearchAt: typeof raw.lastRagSearchAt === 'string' ? raw.lastRagSearchAt : undefined,
        lastWamStatusAt: typeof raw.lastWamStatusAt === 'string' ? raw.lastWamStatusAt : undefined,

        lastPlanUpdateAt: typeof raw.lastPlanUpdateAt === 'string' ? raw.lastPlanUpdateAt : undefined,
        lastWalkthroughUpdateAt: typeof raw.lastWalkthroughUpdateAt === 'string' ? raw.lastWalkthroughUpdateAt : undefined,

        lastWamCommitAt: typeof raw.lastWamCommitAt === 'string' ? raw.lastWamCommitAt : undefined
    };
}

function ensureProjectTracker(data: TrackerData, rootPath: string, lang: UiLanguage): ProjectTracker {
    const existing = data.projects[rootPath];
    if (existing) {
        if (!existing.projectId || typeof existing.projectId !== 'string') {
            existing.projectId = createProjectId();
        }
        existing.stats = normalizeTrackerStats(existing.stats);
        const legacy = existing as any;
        if (legacy.task) delete legacy.task;
        if (legacy.todos) delete legacy.todos;
        if (legacy.checklist) delete legacy.checklist;
        if (!existing.overview || typeof (existing as any).overview !== 'object') {
            (existing as any).overview = { content: '' };
        } else if (typeof (existing as any).overview.content !== 'string') {
            (existing as any).overview.content = '';
        }
        if (!existing.plan || typeof existing.plan !== 'object') {
            existing.plan = { summary: '', items: [] };
        } else {
            if (typeof existing.plan.summary !== 'string') existing.plan.summary = '';
            if (!Array.isArray(existing.plan.items)) existing.plan.items = [];
        }
        if (!Array.isArray(existing.sprints)) {
            existing.sprints = [];
        }
        if (!existing.walkthrough || typeof existing.walkthrough !== 'object') {
            existing.walkthrough = { content: '' };
        } else if (typeof existing.walkthrough.content !== 'string') {
            existing.walkthrough.content = '';
        }
        return existing;
    }
    const project: ProjectTracker = {
        projectId: createProjectId(),
        rootPath,
        name: getProjectNameFromPath(rootPath),
        overview: { content: '' },
        prd: {
            content: '',
            status: 'draft',
            updatedAt: nowIso()
        },
        plan: { summary: '', items: [] },
        sprints: [],
        walkthrough: { content: '' },
        stats: createDefaultTrackerStats(),
        updatedAt: nowIso()
    };
    data.projects[rootPath] = project;
    data.activeProject = rootPath;
    return project;
}

function computeProgress(project: ProjectTracker): { done: number; total: number; percent: number } {
    const total = project.plan.items.length;
    const done = project.plan.items.filter((item) => item.status === 'done').length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { done, total, percent };
}

function computeItemProgress(items: TrackerItem[]): { done: number; total: number; percent: number } {
    const total = items.length;
    const done = items.filter((item) => item.status === 'done').length;
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
            items.push({
                id: String(entry.id || `item_${Math.random().toString(36).slice(2, 10)}`),
                text,
                status,
                updatedAt: nowIso(),
                sprint: typeof entry.sprint === 'string' ? entry.sprint : undefined,
                points: typeof entry.points === 'number' ? entry.points : undefined,
                assignee: typeof entry.assignee === 'string' ? entry.assignee : undefined
            });
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

function escapeMarkdownTableCell(text: string): string {
    return String(text || '').replace(/\|/g, '\\|').replace(/\r?\n/g, '<br>');
}

function formatItemsTable(items: TrackerItem[], lang: UiLanguage): string {
    const emptyLabel = tr('panel.readOnlyEmpty', {}, lang);
    if (!items.length) return `_${emptyLabel}_`;
    const lines = [
        `| ${tr('artifact.tableStatus', {}, lang)} | ${tr('artifact.tableItem', {}, lang)} |`,
        '| --- | --- |'
    ];
    for (const item of items) {
        const status =
            item.status === 'done'
                ? tr('panel.itemDone', {}, lang)
                : item.status === 'doing'
                    ? tr('panel.itemDoing', {}, lang)
                    : tr('panel.itemTodo', {}, lang);
        lines.push(`| ${escapeMarkdownTableCell(status)} | ${escapeMarkdownTableCell(item.text)} |`);
    }
    return lines.join('\n');
}

function formatSummaryBlock(summary: string | undefined, lang: UiLanguage): string {
    const emptyLabel = tr('panel.readOnlyEmpty', {}, lang);
    const trimmed = typeof summary === 'string' ? summary.trim() : '';
    return trimmed ? trimmed : `_${emptyLabel}_`;
}

function buildPlanArtifactContent(project: ProjectTracker, lang: UiLanguage): string {
    const title = tr('panel.planTitle', {}, lang);
    const activeSprint = project.sprints?.find(s => s.id === project.activeSprintId);
    const activeHeader = activeSprint ? `Running: ${activeSprint.name}` : title;
    
    const sections = [];
    
    if (activeSprint) {
        const sprintInfo = `**Goal:** ${activeSprint.goal || '-'}<br>**Ends:** ${activeSprint.endDate ? activeSprint.endDate.slice(0, 10) : '-'}`;
        const activeItems = project.plan.items.filter(i => i.sprint === activeSprint.id);
        sections.push(
            `## 🏃 ${tr('panel.sectionItems', {}, lang)} (${activeSprint.name})\n${sprintInfo}\n${formatItemsTable(activeItems, lang)}`
        );
    }

    const backlogItems = project.plan.items.filter(i => !i.sprint || (activeSprint && i.sprint !== activeSprint.id));
    sections.push(
        `## 📦 ${tr('panel.sectionItems', {}, lang)} (Backlog)\n${formatItemsTable(backlogItems, lang)}`
    );

    sections.push(`## ${tr('panel.sectionSummary', {}, lang)}\n${formatSummaryBlock(project.plan.summary, lang)}`);

    const header = project.name ? `${project.name} - ${activeHeader}` : activeHeader;
    return [`# ${header}`, '', ...sections].join('\n\n');
}

function buildWalkthroughArtifactContent(project: ProjectTracker, lang: UiLanguage): string {
    const title = tr('panel.walkthroughTitle', {}, lang);
    const header = project.name ? `${title}: ${project.name}` : title;
    const content = project.walkthrough.content.trim()
        ? project.walkthrough.content.trim()
        : `_${tr('panel.readOnlyEmpty', {}, lang)}_`;
    return [`# ${header}`, '', content].join('\n');
}

function buildMemoryArtifactContent(
    projectName: string,
    memoryStore: ProjectMemoryStore,
    lang: UiLanguage
): string {
    const entries = Object.values(memoryStore.memories || {});
    if (entries.length === 0) return '';
    const title = tr('artifact.memoryTitle', {}, lang);
    const header = projectName ? `${title}: ${projectName}` : title;
    entries.sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
    const sections = entries.map((entry) => {
        const content = entry.content.trim() || `_${tr('panel.readOnlyEmpty', {}, lang)}_`;
        const updated = entry.updatedAt ? `${tr('artifact.memoryUpdated', {}, lang)}: ${entry.updatedAt}` : '';
        const metaLine = updated ? `\n\n${updated}` : '';
        return `## ${entry.key}\n${content}${metaLine}`;
    });
    return [`# ${header}`, '', ...sections].join('\n\n');
}

function buildTrackerSnapshot(project: ProjectTracker) {
    const progress = computeProgress(project);
    return {
        projectId: project.projectId,
        rootPath: project.rootPath,
        name: project.name,
        overview: {
            content: project.overview?.content || '',
            updatedAt: project.overview?.updatedAt || '',
            generatedBy: project.overview?.generatedBy || ''
        },
        prd: {
            status: project.prd.status,
            content: project.prd.content || '',
            reviewNote: project.prd.reviewNote || '',
            approvedBy: project.prd.approvedBy || '',
            approvedAt: project.prd.approvedAt || '',
            updatedAt: project.prd.updatedAt || '',
            generatedBy: project.prd.generatedBy || ''
        },
        plan: {
            summary: project.plan.summary || '',
            items: project.plan.items
        },
        walkthrough: {
            content: project.walkthrough.content || '',
            updatedAt: project.walkthrough.updatedAt || ''
        },
        planSummary: project.plan.summary || '',
        planText: formatChecklistText(project.plan.items),
        walkthroughText: project.walkthrough.content || '',
        progress,
        stats: normalizeTrackerStats(project.stats)
    };
}

type TrackerStatKey =
    | 'prdUpdates'
    | 'prdApprovals'
    | 'overviewUpdates'
    | 'planUpdates'
    | 'walkthroughUpdates';

function bumpProjectStat(project: ProjectTracker, key: TrackerStatKey) {
    project.stats = normalizeTrackerStats(project.stats);
    project.stats[key] = (project.stats[key] || 0) + 1;
    project.stats.updatedAt = nowIso();
}

function appendWalkthroughEntry(project: ProjectTracker, entry: string, lang: UiLanguage = getUiLanguage()) {
    const header = lang === 'en' ? '## Auto Updates' : '## 自动更新';
    let content = project.walkthrough.content || '';
    if (!content.includes(header)) {
        content = content.trimEnd();
        if (content) {
            content += '\n\n';
        }
        content += `${header}\n`;
    }
    if (!content.endsWith('\n')) {
        content += '\n';
    }
    content += `- ${nowIso()} ${entry}`;
    project.walkthrough.content = content.trimEnd();
    project.walkthrough.updatedAt = nowIso();
}

function buildHooksCommand(variantHooksDir: string): string {
    const guardPath = path.join(variantHooksDir, 'windsurf-auto-mcp-guard.py');
    if (process.platform === 'win32') {
        // Prefer the Python launcher on Windows, but fall back to python if needed.
        // Use cmd.exe so we can do a simple fallback without requiring a specific shell.
        return `cmd /c "py -3 \"${guardPath}\" || python \"${guardPath}\""`;
    }
    return `python3 "${guardPath}"`;
}

function isLegacyHookCommand(command: unknown): boolean {
    if (!command || typeof command !== 'string') return false;
    // Previous versions of *this extension* used PowerShell/JS guard scripts.
    // Do not treat arbitrary user hooks as "legacy" just because they use PowerShell.
    return /windsurf-auto-mcp-guard\.(ps1|js)/i.test(command);
}

function isOurHookCommand(command: unknown): boolean {
    if (!command || typeof command !== 'string') return false;
    return /windsurf-auto-mcp-guard\.py/i.test(command) && /windsurf-auto-mcp/i.test(command);
}

function dedupeHookList(list: any[]): any[] {
    const out: any[] = [];
    const seen = new Set<string>();
    for (const h of Array.isArray(list) ? list : []) {
        if (!h) continue;
        const cmd = String(h.command || '');
        if (!cmd) continue;
        if (seen.has(cmd)) continue;
        seen.add(cmd);
        const normalized: any = { command: cmd };
        if (typeof h.show_output === 'boolean') {
            normalized.show_output = h.show_output;
        }
        out.push(normalized);
    }
    return out;
}

function hooksContainCommand(config: any, command: string): boolean {
    if (!config || typeof config !== 'object') return false;
    if (!config.hooks || typeof config.hooks !== 'object') return false;
    for (const eventName of AUTO_INSTALL_HOOK_EVENTS) {
        const list = config.hooks[eventName];
        if (!Array.isArray(list) || !list.some((h: any) => h && h.command === command)) {
            return false;
        }
    }
    return true;
}

function hooksContainLegacyCommand(config: any): boolean {
    if (!config || typeof config !== 'object') return false;
    if (!config.hooks || typeof config.hooks !== 'object') return false;
    for (const eventName of WINDSURF_HOOK_EVENTS) {
        const list = config.hooks[eventName];
        if (!Array.isArray(list)) continue;
        if (list.some((h: any) => isLegacyHookCommand(h?.command))) return true;
    }
    return false;
}

function hooksContainWrongOrDuplicateOurCommand(config: any, desiredCommand: string): boolean {
    if (!config || typeof config !== 'object') return false;
    if (!config.hooks || typeof config.hooks !== 'object') return false;
    for (const eventName of WINDSURF_HOOK_EVENTS) {
        const list = config.hooks[eventName];
        if (!Array.isArray(list)) continue;
        const ours = list.filter((h: any) => isOurHookCommand(h?.command));
        if (ours.length === 0) continue;
        // Any our command that isn't the desired command is drift.
        if (ours.some((h: any) => String(h?.command || '') !== desiredCommand)) return true;
        // Duplicate desired command is also drift (can cause repeated runs).
        const desiredCount = ours.filter((h: any) => String(h?.command || '') === desiredCommand).length;
        if (desiredCount > 1) return true;
    }
    return false;
}

function filesAreEqual(a: string, b: string): boolean {
    try {
        const aBuf = fs.readFileSync(a);
        const bBuf = fs.readFileSync(b);
        return aBuf.length === bBuf.length && aBuf.equals(bBuf);
    } catch {
        return false;
    }
}

function installWindsurfHooks() {
    const homeDirs = getWriteHomeDirs();
    const items = getWindsurfHooksConfigPaths(homeDirs);
    const installed: string[] = [];
    const skipped: string[] = [];
    const failed: Array<{ path: string; error: string }> = [];

    const guardPySource = path.join(extensionContext.extensionPath, 'resources', 'hooks', 'windsurf-auto-mcp-guard.py');
    try {
        outputChannel.appendLine(`Install hooks: candidate home dirs = ${JSON.stringify(homeDirs)}`);
        outputChannel.appendLine(`Install hooks: target hooks.json paths = ${JSON.stringify(items.map((i) => i.hooksPath))}`);
    } catch {
        // ignore logging failures
    }

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
	                        config = parseJsonLenient(raw);
	                    } catch (e: any) {
	                        const lang = getUiLanguage();
	                        throw new Error(tr('ext.invalidHooksJson', { path: hooksPath, error: e?.message ?? String(e) }, lang));
	                    }
	                }
            }

	            const guardUpToDate = fs.existsSync(guardTarget) && filesAreEqual(guardPySource, guardTarget);
	            const needsCleanup = hooksContainLegacyCommand(config) || hooksContainWrongOrDuplicateOurCommand(config, command);
	            const alreadyInstalled = hooksContainCommand(config, command) && guardUpToDate && !needsCleanup;
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

		            // Align with official docs: show_output is only meaningful for hooks where stdout/stderr is surfaced.
		            // (In practice, pre_* hooks are the ones users debug most.)
			            const desiredHooks: Record<string, Array<any>> = {
			                pre_run_command: [{ command, show_output: true }],
			                post_run_command: [{ command }],
			                pre_write_code: [{ command, show_output: true }],
			                post_write_code: [{ command }],
			                pre_mcp_tool_use: [{ command, show_output: true }],
			                post_mcp_tool_use: [{ command }],
			                pre_user_prompt: [{ command }],
			                post_cascade_response: [{ command }]
			            };

	            if (!config.hooks || typeof config.hooks !== 'object') config.hooks = {};

	            // Normalize hook lists, remove legacy + stale entries that point to our guard.
	            for (const eventName of WINDSURF_HOOK_EVENTS) {
	                if (!Array.isArray(config.hooks[eventName])) continue;
	                config.hooks[eventName] = config.hooks[eventName].filter((h: any) => {
	                    const cmd = String(h?.command || '');
	                    if (!cmd) return false;
	                    if (isLegacyHookCommand(cmd)) return false;
	                    // Remove any of our previous guard commands that don't match the current desired command.
	                    if (isOurHookCommand(cmd) && cmd !== command) return false;
	                    return true;
	                });
	                config.hooks[eventName] = dedupeHookList(config.hooks[eventName]);
	                if (config.hooks[eventName].length === 0) delete config.hooks[eventName];
	            }

	            // Install our Python guard for the minimal set of events we enforce.
	            for (const [eventName, hooks] of Object.entries(desiredHooks)) {
	                if (!Array.isArray(config.hooks[eventName])) config.hooks[eventName] = [];
	                // Ensure our desired command is unique (and show_output is enabled).
	                config.hooks[eventName] = (config.hooks[eventName] as any[]).filter((h: any) => {
	                    const cmd = String(h?.command || '');
	                    if (!cmd) return false;
	                    if (isLegacyHookCommand(cmd)) return false;
	                    if (isOurHookCommand(cmd) && cmd !== command) return false;
	                    return true;
	                });
	                for (const hook of hooks) {
	                    const exists = config.hooks[eventName].some((h: any) => h && h.command === hook.command);
	                    if (!exists) config.hooks[eventName].push(hook);
	                }
	                config.hooks[eventName] = dedupeHookList(config.hooks[eventName]);
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
    const items = getWindsurfHooksConfigPaths(getWriteHomeDirs());
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
	                        config = parseJsonLenient(raw);
	                    } catch (e: any) {
	                        const lang = getUiLanguage();
	                        throw new Error(tr('ext.invalidHooksJson', { path: hooksPath, error: e?.message ?? String(e) }, lang));
	                    }
                    if (config?.hooks && typeof config.hooks === 'object') {
                        for (const ev of WINDSURF_HOOK_EVENTS) {
                            if (!Array.isArray(config.hooks[ev])) continue;
                            config.hooks[ev] = config.hooks[ev].filter(
                                (h: any) => {
                                    if (!h) return false;
                                    const cmd = String(h.command || '');
                                    if (cmd === command) return false;
                                    if (/windsurf-auto-mcp-guard\.py/i.test(cmd)) return false;
                                    if (isLegacyHookCommand(cmd)) return false;
                                    return true;
                                }
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

	// 统计数据 - comprehensive tracking for all tools
	    let stats = {
		    totalCalls: 0,
		    askUserCalls: 0,
		    askQuestionCalls: 0,
		    askContinueCalls: 0,
		    preflightCalls: 0,
		    setPrdCalls: 0,
		    updateOverviewCalls: 0,
		    generateOverviewCalls: 0,
		    updatePlanCalls: 0,
		    planChangeRequestCalls: 0,
		    updateWalkthroughCalls: 0,
		    ragSearchCalls: 0,
		    memorySearchCalls: 0,
		    memoryHygieneCalls: 0,
		    recordLessonCalls: 0,
		    getProjectStatusCalls: 0,
		    checkPlanCalls: 0,
		    ensureReleaseGateCalls: 0,
		    wamStatusCalls: 0,
		    wamCommitCalls: 0,
		    wamLogCalls: 0,
		    wamShowCalls: 0,
		    wamCheckoutCalls: 0,
	    wamMergeCalls: 0,
	    wamBranchCalls: 0,
	    wamTagCalls: 0,
	    wamDiffCalls: 0,
	    wamVerifyCalls: 0,
	    wamResetCalls: 0,
    wamStashCalls: 0,
	    saveMemoryCalls: 0,
	    getMemoryCalls: 0,
	    listMemoryCalls: 0,
	    workflowStatusCalls: 0,
	    verifyActionCalls: 0,
	    generateUserStoriesCalls: 0,
	    wamClearCalls: 0,
	    codeReviewCalls: 0,
	    imageUploads: 0,
	    startTime: Date.now()
	};

// 待处理请求
const pendingRequests = new Map<string, {
    resolve: (value: any) => void;
    reject: (reason: any) => void;
    timestamp: number;
}>();

function prunePendingRequests(maxAgeMs = 2 * 60 * 60 * 1000) {
    const now = Date.now();
    for (const [requestId, pending] of pendingRequests.entries()) {
        if (!pending) continue;
        if (now - pending.timestamp <= maxAgeMs) continue;
        try {
            pending.reject(new Error('Dialog request timed out'));
        } catch {
            // ignore
        }
        pendingRequests.delete(requestId);
    }
}

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
        description: 'Ask single-choice clarification questions (any number of options) with optional extra text / 单选澄清问题（选项数量不限），可附加补充文本',
        inputSchema: {
            type: 'object',
            properties: {
                title: { type: 'string', description: 'Dialog title / 对话框标题' },
                message: { type: 'string', description: 'Context or prompt for the question(s) / 问题上下文或提示' },
                options: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Single-question options (any count) / 单问题选项（数量不限）'
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
	                rationale: { type: 'string', description: 'Why you are doing this (required by hooks) / 为什么要做（hooks 要求）' },
	                content: { type: 'string', description: 'PRD content / PRD 内容' }
	            },
	            required: ['rationale', 'content']
	        }
	    },
	    {
	        name: 'approve_prd',
	        description: 'Open PRD review dialog and set approval status (without rewriting PRD content) / 打开 PRD 审核对话框并设置审批状态（不改写 PRD 内容）',
	        inputSchema: {
	            type: 'object',
	            properties: {
	                rationale: { type: 'string', description: 'Why you are approving/reviewing PRD (required by hooks) / 为什么审批/审核 PRD（hooks 要求）' },
	                content: { type: 'string', description: 'Optional PRD content to review (defaults to current PRD) / 可选 PRD 内容（默认使用当前 PRD）' },
	                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
	            },
	            required: ['rationale']
	        }
	    },
		    {
		        name: 'update_plan',
		        description: 'Update plan (include tasks/checklist); default merges, avoid accidental loss / 更新计划（含任务/清单）；默认合并，避免误覆盖',
		        inputSchema: {
		            type: 'object',
		            properties: {
		                rationale: { type: 'string', description: 'Why you are updating the plan (required by hooks) / 为什么更新计划（hooks 要求）' },
		                mode: { type: 'string', enum: ['merge', 'replace'], description: 'Update mode: merge (default) or replace / 更新模式：merge（默认）或 replace' },
		                summary: { type: 'string', description: 'Plan summary / 计划摘要' },
		                items: {
	                    type: 'array',
	                    description: 'Plan items (tasks/checklist) / 计划条目（任务/清单）',
	                    items: {
	                        type: 'object',
                        properties: {
                            text: { type: 'string' },
                            status: { type: 'string', enum: ['todo', 'doing', 'done'] },
                            sprint: { type: 'string', description: 'Sprint ID or name ("backlog")' },
                            points: { type: 'number', description: 'Story points' },
                            assignee: { type: 'string', description: 'Assignee ("ai", "user")' }
                        },
                        required: ['text']
	                    }
	                },
	                text: { type: 'string', description: 'Plan text lines (supports [x]/[~]/[ ]) / 计划文本（支持 [x]/[~]/[ ]）' }
		            },
		            required: ['rationale']
		        }
		    },
		    {
		        name: 'plan_change_request',
		        description: 'Request a plan change with explicit merge/replace approval / 申请变更计划并显式选择 merge/replace',
		        inputSchema: {
		            type: 'object',
		            properties: {
		                rationale: { type: 'string', description: 'Why you are changing the plan (required by hooks) / 为什么变更计划（hooks 要求）' },
		                summary: { type: 'string', description: 'Plan summary / 计划摘要' },
		                items: {
		                    type: 'array',
		                    description: 'Proposed Plan items / 计划条目（提案）',
		                    items: {
		                        type: 'object',
		                        properties: {
		                            text: { type: 'string' },
		                            status: { type: 'string', enum: ['todo', 'doing', 'done'] }
		                        },
		                        required: ['text']
		                    }
		                },
		                text: { type: 'string', description: 'Proposed plan text (supports [x]/[~]/[ ]) / 计划文本（支持 [x]/[~]/[ ]）' }
		            },
		            required: ['rationale']
		        }
		    },
	    {
	        name: 'update_overview',
	        description: 'Set/update project overview (architecture/context) / 设置或更新项目概览（架构/上下文）',
	        inputSchema: {
	            type: 'object',
	            properties: {
	                rationale: { type: 'string', description: 'Why you are updating the overview (required by hooks) / 为什么更新概览（hooks 要求）' },
	                content: { type: 'string', description: 'Overview content (Markdown) / 概览内容（Markdown）' }
	            },
	            required: ['rationale', 'content']
	        }
	    },
	    {
	        name: 'generate_overview',
	        description: 'Auto-generate project overview from workspace / 从工作区自动生成项目概览',
	        inputSchema: {
	            type: 'object',
	            properties: {
	                rationale: { type: 'string', description: 'Why you are generating the overview (required by hooks) / 为什么生成概览（hooks 要求）' },
	                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
	            },
	            required: ['rationale']
	        }
	    },
    {
        name: 'rag_search',
        description: 'Search workspace context (RAG) for faster/safer edits / 通过检索增强（RAG）搜索工作区上下文',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query / 查询内容' },
                maxResults: { type: 'number', description: 'Max results / 最大返回数量' },
                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
            },
            required: ['query']
        }
    },
    {
        name: 'memory_search',
        description: 'Search project/global memories / 搜索项目/全局记忆',
        inputSchema: {
            type: 'object',
            properties: {
                query: { type: 'string', description: 'Search query / 查询内容' },
                scope: { type: 'string', enum: ['project', 'global', 'both'], description: 'Search scope / 搜索范围' },
                kinds: {
                    type: 'array',
                    items: { type: 'string', enum: ['short', 'long', 'lesson'] },
                    description: 'Filter by kinds / 类型过滤'
                },
                maxResults: { type: 'number', description: 'Max results / 最大返回数量' },
                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
            },
            required: ['query']
        }
    },
	    {
	        name: 'memory_hygiene',
	        description: 'Review/apply memory hygiene (promote/dedupe/auto-link lessons) / 记忆整理（提升/去重/自动链接经验）',
	        inputSchema: {
	            type: 'object',
	            properties: {
	                rationale: { type: 'string', description: 'Why you are running memory hygiene (required by hooks) / 为什么整理记忆（hooks 要求）' },
	                scope: { type: 'string', enum: ['project', 'global', 'both'], description: 'Which memory scope to process / 处理范围' },
	                apply: { type: 'boolean', description: 'If true, ask user confirmation and apply changes / 若为 true，将请求用户确认并应用变更' },
	                promote: { type: 'boolean', description: 'Promote eligible short→long / 提升符合条件的 short→long' },
	                dedupe: { type: 'boolean', description: 'Dedupe near-duplicates / 近重复去重' },
	                autoLinkLessons: { type: 'boolean', description: 'Auto-link lessons to files/commands / 自动为经验添加文件/命令链接' },
	                similarity: { type: 'number', description: 'Duplicate similarity threshold (0-1) / 去重相似度阈值（0-1）' },
	                maxEntries: { type: 'number', description: 'Max entries to consider for dedupe / 去重最大处理条目数' }
	            },
	            required: ['rationale']
	        }
	    },
	    {
	        name: 'record_lesson',
	        description: 'Record a lesson learned from a mistake (human-like learning) / 记录错误经验（类人学习）',
	        inputSchema: {
	            type: 'object',
	            properties: {
	                rationale: { type: 'string', description: 'Why you are recording this lesson (required by hooks) / 为什么记录（hooks 要求）' },
	                title: { type: 'string', description: 'Short title / 标题' },
	                mistake: { type: 'string', description: 'What went wrong / 错误描述' },
	                fix: { type: 'string', description: 'How it was fixed / 修复方式' },
	                prevention: { type: 'string', description: 'How to prevent it / 预防措施' },
	                scope: { type: 'string', enum: ['project', 'global', 'both'], description: 'Where to store / 保存范围' },
                tags: { type: 'array', items: { type: 'string' }, description: 'Tags / 标签' }
	            },
            required: ['rationale', 'mistake', 'fix']
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
	        name: 'preflight',
	        description: 'Run required preflight checks (status/plan/memory/rag/wam) / 运行必需预检（状态/计划/记忆/RAG/WAM）',
	        inputSchema: {
	            type: 'object',
	            properties: {
	                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' },
	                userPrompt: { type: 'string', description: 'Current user prompt (used as search query) / 当前用户提示（用作检索 query）' },
	                query: { type: 'string', description: 'Fallback query for memory/rag search / 记忆/RAG 检索的兜底 query' },
	                ragQuery: { type: 'string', description: 'Override query for rag_search / rag_search 专用 query' },
	                memoryQuery: { type: 'string', description: 'Override query for memory_search / memory_search 专用 query' },
	                ragMaxResults: { type: 'number', description: 'Max rag_search results / rag_search 最大返回数量' },
	                memoryMaxResults: { type: 'number', description: 'Max memory_search results / memory_search 最大返回数量' },
	                memoryScope: { type: 'string', enum: ['project', 'global', 'both'], description: 'Memory search scope / 记忆检索范围' }
	            }
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
    },
	    {
	        name: 'check_plan',
	        description: 'Check current Plan progress and remaining items / 检查当前 Plan 进度与未完成项',
	        inputSchema: {
	            type: 'object',
	            properties: {
	                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
	            }
	        }
	    },
		    {
		        name: 'ensure_release_gate',
		        description: 'Ensure the Plan contains a release gate checklist (tests/lint/security/perf/docs) / 确保 Plan 包含发布门禁清单（测试/检查/安全/性能/文档）',
		        inputSchema: {
		            type: 'object',
		            properties: {
		                rationale: { type: 'string', description: 'Why you are adding the release gate (required by hooks) / 为什么添加门禁（hooks 要求）' },
		                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
		            },
		            required: ['rationale']
		        }
		    },
	    // ==================== WAM (History) Tools ====================
	    {
	        name: 'wam_status',
	        description: 'Get WAM (git-like) status: head + clean/dirty / 获取 WAM（类 git）状态：HEAD + 是否干净',
        inputSchema: {
            type: 'object',
            properties: {
                scope: { type: 'string', enum: ['project', 'global'], description: 'Scope: project or global / 范围：项目或全局' },
                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
            }
        }
    },
	    {
	        name: 'wam_commit',
	        description: 'Create a WAM commit (snapshots tracker+memory) / 创建 WAM 提交（快照：跟踪+记忆）',
		        inputSchema: {
		            type: 'object',
		            properties: {
		                rationale: { type: 'string', description: 'Why you are committing (required by hooks) / 为什么提交（hooks 要求）' },
		                scope: { type: 'string', enum: ['project', 'global'], description: 'Scope: project or global / 范围：项目或全局' },
		                message: { type: 'string', description: 'Commit message (optional; auto-generated if omitted) / 提交说明（可选；留空则自动生成）' },
		                author: { type: 'string', enum: ['auto', 'ai', 'user'], description: 'Author / 作者' },
		                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
		            },
		            required: ['rationale']
		        }
		    },
    {
        name: 'wam_log',
        description: 'List WAM commit history / 列出 WAM 提交历史',
        inputSchema: {
            type: 'object',
            properties: {
                scope: { type: 'string', enum: ['project', 'global'], description: 'Scope: project or global / 范围：项目或全局' },
                limit: { type: 'number', description: 'Max commits / 最多条数' },
                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
            }
        }
    },
    {
        name: 'wam_show',
        description: 'Show a WAM commit by hash / 查看指定 hash 的 WAM 提交',
        inputSchema: {
            type: 'object',
            properties: {
                scope: { type: 'string', enum: ['project', 'global'], description: 'Scope: project or global / 范围：项目或全局' },
                hash: { type: 'string', description: 'Commit hash / 提交 hash' },
                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
            },
            required: ['hash']
        }
    },
    {
        name: 'wam_verify',
        description: 'Verify WAM integrity (hash chain + snapshot digest) / 校验 WAM 完整性（hash 链 + 快照 digest）',
        inputSchema: {
            type: 'object',
            properties: {
                scope: { type: 'string', enum: ['project', 'global'], description: 'Scope: project or global / 范围：项目或全局' },
                target: { type: 'string', description: 'Commit/ref specifier (hash/HEAD/branch/tag) / 目标（hash/HEAD/分支/tag）' },
                maxCommits: { type: 'number', description: 'Max commits to verify / 最大校验提交数' },
                verifySnapshots: { type: 'boolean', description: 'Verify snapshot files + digest / 校验快照文件与 digest' },
                verifySignature: { type: 'boolean', description: 'Verify optional WAM commit signatures (if present) / 校验可选的 WAM 提交签名（若存在）' },
                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
            }
        }
    },
		    {
		        name: 'wam_checkout',
		        description: 'Restore tracker/memory from a WAM commit (rollback) / 从 WAM 提交恢复跟踪/记忆（回滚）',
		        inputSchema: {
		            type: 'object',
		            properties: {
		                rationale: { type: 'string', description: 'Why you are checking out (required by hooks) / 为什么检出/回滚（hooks 要求）' },
		                scope: { type: 'string', enum: ['project', 'global'], description: 'Scope: project or global / 范围：项目或全局' },
		                target: { type: 'string', description: 'Commit/ref specifier (hash, HEAD, branch, refs/...) / 目标（hash/HEAD/分支/refs/...）' },
		                hash: { type: 'string', description: 'Legacy: commit hash / 兼容：提交 hash' },
		                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
		            },
		            required: ['rationale']
		        }
		    },
		    {
		        name: 'wam_merge',
		        description: 'Merge another WAM commit into current state (3-way merge with conflicts) / 合并另一条 WAM 提交到当前状态（三方合并 + 冲突记录）',
		        inputSchema: {
		            type: 'object',
		            properties: {
		                rationale: { type: 'string', description: 'Why you are merging (required by hooks) / 为什么合并（hooks 要求）' },
		                otherHash: { type: 'string', description: 'Other commit specifier (hash/branch/tag/refs/...) / 另一提交（hash/分支/tag/refs/...）' },
		                message: { type: 'string', description: 'Merge commit message / 合并提交说明' },
		                author: { type: 'string', enum: ['auto', 'ai', 'user'], description: 'Author / 作者' },
		                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
		            },
		            required: ['rationale', 'otherHash', 'message']
		        }
		    },
		    {
		        name: 'wam_branch',
		        description: 'Manage WAM branches (refs/heads) / 管理 WAM 分支（refs/heads）',
		        inputSchema: {
		            type: 'object',
		            properties: {
		                rationale: { type: 'string', description: 'Why you are managing branches (required by hooks) / 为什么管理分支（hooks 要求）' },
		                scope: { type: 'string', enum: ['project', 'global'], description: 'Scope: project or global / 范围：项目或全局' },
		                action: { type: 'string', enum: ['list', 'create', 'delete'], description: 'Action / 操作' },
		                name: { type: 'string', description: 'Branch name / 分支名' },
		                startPoint: { type: 'string', description: 'Optional start point (hash/HEAD/tag/branch) / 可选起点（hash/HEAD/tag/分支）' },
		                force: { type: 'boolean', description: 'Force overwrite (create) / 强制覆盖（创建）' },
		                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
		            },
		            required: ['rationale', 'action']
		        }
		    },
		    {
		        name: 'wam_tag',
		        description: 'Manage WAM tags (refs/tags) / 管理 WAM 标签（refs/tags）',
		        inputSchema: {
		            type: 'object',
		            properties: {
		                rationale: { type: 'string', description: 'Why you are managing tags (required by hooks) / 为什么管理标签（hooks 要求）' },
		                scope: { type: 'string', enum: ['project', 'global'], description: 'Scope: project or global / 范围：项目或全局' },
		                action: { type: 'string', enum: ['list', 'create', 'delete'], description: 'Action / 操作' },
		                name: { type: 'string', description: 'Tag name / 标签名' },
		                target: { type: 'string', description: 'Target (hash/HEAD/branch) / 目标（hash/HEAD/分支）' },
		                force: { type: 'boolean', description: 'Force overwrite (create) / 强制覆盖（创建）' },
		                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
		            },
		            required: ['rationale', 'action']
		        }
		    },
	    {
	        name: 'wam_diff',
	        description: 'Diff WAM snapshots (tracker+memory) / 对比 WAM 快照（跟踪+记忆）',
	        inputSchema: {
	            type: 'object',
	            properties: {
	                scope: { type: 'string', enum: ['project', 'global'], description: 'Scope: project or global / 范围：项目或全局' },
	                a: { type: 'string', description: 'Left spec (default: HEAD) / 左侧（默认 HEAD）' },
	                b: { type: 'string', description: 'Right spec (default: WORKING) / 右侧（默认 WORKING）' },
	                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
	            }
	        }
	    },
		    {
		        name: 'wam_reset',
		        description: 'Reset current branch/HEAD to a commit and restore snapshots (hard) / 重置当前分支/HEAD 到某提交并恢复快照（hard）',
		        inputSchema: {
		            type: 'object',
		            properties: {
		                rationale: { type: 'string', description: 'Why you are resetting (required by hooks) / 为什么重置（hooks 要求）' },
		                scope: { type: 'string', enum: ['project', 'global'], description: 'Scope: project or global / 范围：项目或全局' },
		                target: { type: 'string', description: 'Target spec (hash/HEAD/branch/tag/refs/...) / 目标（hash/HEAD/分支/tag/refs/...）' },
		                mode: { type: 'string', enum: ['hard'], description: 'Reset mode (only hard supported) / 重置模式（仅支持 hard）' },
		                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
		            },
		            required: ['rationale', 'target']
		        }
		    },
		    {
		        name: 'wam_stash',
		        description: 'Stash/apply WAM working state (tracker+memory) / 暂存/应用 WAM 工作状态（跟踪+记忆）',
		        inputSchema: {
		            type: 'object',
		            properties: {
		                rationale: { type: 'string', description: 'Why you are using stash (required by hooks) / 为什么使用暂存（hooks 要求）' },
		                scope: { type: 'string', enum: ['project', 'global'], description: 'Scope: project or global / 范围：项目或全局' },
		                action: { type: 'string', enum: ['push', 'list', 'apply', 'pop', 'drop'], description: 'Action / 操作' },
		                message: { type: 'string', description: 'Stash message (push) / 暂存说明（push）' },
		                id: { type: 'string', description: 'Stash id (apply/pop/drop); default latest / 暂存 id（apply/pop/drop，默认最新）' },
		                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
		            },
		            required: ['rationale', 'action']
		        }
		    },
	    // ==================== Memory Tools ====================
	    {
	        name: 'save_memory',
	        description: 'Save development context/learnings for this project (persists across sessions) / 保存开发上下文/经验（跨会话持久化）',
	        inputSchema: {
	            type: 'object',
	            properties: {
	                rationale: { type: 'string', description: 'Why you are saving this memory (required by hooks) / 为什么保存（hooks 要求）' },
	                key: { type: 'string', description: 'Memory key identifier / 内存键标识符' },
	                value: { type: 'string', description: 'Memory value to store / 要存储的内存值' },
	                scope: { type: 'string', enum: ['project', 'global', 'both'], description: 'Where to store / 保存范围' },
	                kind: { type: 'string', enum: ['short', 'long', 'lesson'], description: 'Memory kind / 记忆类型' },
	                tags: { type: 'array', items: { type: 'string' }, description: 'Tags / 标签' },
	                links: { type: 'array', items: { type: 'string' }, description: 'Related keys / 关联键' }
            },
            required: ['rationale', 'key', 'value']
        }
    },
    {
        name: 'manage_sprint',
        description: 'Manage sprints: create, start, complete, list. / 管理 Sprint：创建、开始、完成、列出。',
        inputSchema: {
            type: 'object',
            properties: {
                rationale: { type: 'string', description: 'Why you are managing sprints (required) / 为什么管理 Sprint（必填）' },
                action: { type: 'string', enum: ['create', 'start', 'complete', 'list'], description: 'Action to perform' },
                name: { type: 'string', description: 'Sprint name (e.g. "Sprint 1") / Sprint 名称' },
                goal: { type: 'string', description: 'Sprint goal / Sprint 目标' },
                durationDays: { type: 'number', description: 'Duration in days (default 14) / 持续天数（默认 14）' },
                sprintId: { type: 'string', description: 'Sprint ID (for start/complete) / Sprint ID' },
                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
            },
            required: ['rationale', 'action']
        }
    },
    {
        name: 'generate_commit_message',
        description: 'Generate a conventional commit message based on recent changes and context. / 根据近期变更和上下文生成符合规范的 Git 提交信息。',
        inputSchema: {
            type: 'object',
            properties: {
                rationale: { type: 'string', description: 'Why you are generating a message (required) / 为什么生成消息（必填）' },
                context: { type: 'string', description: 'Extra context about what was done (optional) / 额外上下文' },
                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
            },
            required: ['rationale']
        }
    },
    {
        name: 'get_memory',
        description: 'Retrieve saved memory by key / 通过键获取保存的内存',
        inputSchema: {
            type: 'object',
            properties: {
                key: { type: 'string', description: 'Memory key to retrieve / 要获取的内存键' }
            },
            required: ['key']
        }
    },
    {
        name: 'list_memories',
        description: 'List all saved memory keys for this project / 列出此项目的所有保存的内存键',
        inputSchema: {
            type: 'object',
            properties: {}
        }
    },
	    {
	        name: 'update_walkthrough',
	        description: 'Update walkthrough summary / 更新 Walkthrough 总结',
	        inputSchema: {
	            type: 'object',
	            properties: {
	                rationale: { type: 'string', description: 'Why you are updating the walkthrough (required by hooks) / 为什么更新走查（hooks 要求）' },
	                content: { type: 'string', description: 'Walkthrough markdown content / 摘要 Markdown 内容' }
	            },
	            required: ['rationale', 'content']
	        }
	    },
	    {
	        name: 'generate_walkthrough',
	        description: 'Auto-generate walkthrough summary from project state (PRD, Plan, decisions, progress) / 从项目状态自动生成走查摘要（PRD、计划、决策、进度）',
	        inputSchema: {
	            type: 'object',
	            properties: {
	                rationale: { type: 'string', description: 'Why you are generating the walkthrough (required by hooks) / 为什么生成走查（hooks 要求）' },
	                includeDecisions: { type: 'boolean', description: 'Include key decisions / 包含关键决策' },
	                includeLessons: { type: 'boolean', description: 'Include lessons learned / 包含经验教训' },
	                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
	            },
	            required: ['rationale']
	        }
	    },
    // ==================== Workflow & Self-Check Tools ====================
    {
        name: 'workflow_status',
        description: 'Check current workflow state and get guidance on next required step / 检查当前工作流状态并获取下一步指引',
        inputSchema: {
            type: 'object',
            properties: {
                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
            }
        }
    },
    {
        name: 'verify_action',
        description: 'Self-verify after completing an action: report what was done, check for errors, confirm success / 完成操作后自检：报告执行内容、检查错误、确认成功',
        inputSchema: {
            type: 'object',
            properties: {
                action: { type: 'string', description: 'What action was performed / 执行了什么操作' },
                result: { type: 'string', description: 'Outcome of the action / 操作结果' },
                errors: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Any errors encountered / 遇到的错误'
                },
                nextStep: { type: 'string', description: 'Proposed next step / 建议的下一步' },
                selfQuestions: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Self-reflection questions asked / 自问自答的问题'
                }
            },
            required: ['action', 'result']
        }
    },
    {
        name: 'generate_user_stories',
        description: 'Generate production-ready user stories with Given/When/Then acceptance criteria / 生成带有 Given/When/Then 验收标准的生产就绪用户故事',
        inputSchema: {
            type: 'object',
            properties: {
                rationale: { type: 'string', description: 'Why you are generating user stories (required by hooks) / 为什么生成用户故事（hooks 要求）' },
                epic: { type: 'string', description: 'Epic name / 史诗名称' },
                stories: {
                    type: 'array',
                    description: 'User stories to generate / 要生成的用户故事',
                    items: {
                        type: 'object',
                        properties: {
                            title: { type: 'string', description: 'Story title / 故事标题' },
                            asA: { type: 'string', description: 'As a [role] / 作为[角色]' },
                            iWant: { type: 'string', description: 'I want [feature] / 我想要[功能]' },
                            soThat: { type: 'string', description: 'So that [benefit] / 以便[收益]' },
                            acceptanceCriteria: {
                                type: 'array',
                                description: 'Given/When/Then acceptance criteria / Given/When/Then 验收标准',
                                items: {
                                    type: 'object',
                                    properties: {
                                        given: { type: 'string', description: 'Given [precondition] / 给定[前置条件]' },
                                        when: { type: 'string', description: 'When [action] / 当[操作]' },
                                        then: { type: 'string', description: 'Then [expected result] / 则[期望结果]' }
                                    },
                                    required: ['given', 'when', 'then']
                                }
                            },
                            priority: { type: 'string', enum: ['must', 'should', 'could', 'wont'], description: 'MoSCoW priority / MoSCoW 优先级' },
                            storyPoints: { type: 'number', description: 'Story points estimate / 故事点估算' },
                            tags: { type: 'array', items: { type: 'string' }, description: 'Tags / 标签' }
                        },
                        required: ['title', 'asA', 'iWant', 'soThat', 'acceptanceCriteria']
                    }
                },
                outputFormat: { type: 'string', enum: ['markdown', 'json', 'jira'], description: 'Output format / 输出格式' },
                savePath: { type: 'string', description: 'Path to save user stories (in .wam folder) / 保存用户故事的路径（在 .wam 文件夹中）' }
            },
            required: ['stories']
        }
    },
    {
        name: 'wam_clear',
        description: 'Clear/reset all WAM data for the current project (tracker, memory, commits). Requires user confirmation. / 清除/重置当前项目的所有 WAM 数据（跟踪、记忆、提交）。需用户确认。',
        inputSchema: {
            type: 'object',
            properties: {
                rationale: { type: 'string', description: 'Why you are clearing WAM data (required) / 为什么清除 WAM 数据（必填）' },
                scope: { type: 'string', enum: ['project', 'all'], description: 'Scope: project only or all data / 范围：仅项目或所有数据' },
                keepMemory: { type: 'boolean', description: 'Keep memory/lessons (default: false) / 保留记忆/经验（默认: false）' },
                rootPath: { type: 'string', description: 'Optional project root path / 可选项目根路径' }
            },
            required: ['rationale']
        }
    },
    {
        name: 'code_review',
        description: 'Perform code review before completion: check quality, security, gaps, acceptance criteria. Required before ask_continue. / 完成前执行代码审查：检查质量、安全、缺口、验收标准。ask_continue 前必须调用。',
        inputSchema: {
            type: 'object',
            properties: {
                rationale: { type: 'string', description: 'Why you are doing code review (required by hooks) / 为什么进行代码审查（hooks 要求）' },
                filesReviewed: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'List of files reviewed / 已审查的文件列表'
                },
                qualityChecks: {
                    type: 'object',
                    description: 'Quality checks performed / 执行的质量检查',
                    properties: {
                        lintPassed: { type: 'boolean', description: 'Lint/format passed / Lint/格式化通过' },
                        testsPassed: { type: 'boolean', description: 'Tests passed / 测试通过' },
                        buildPassed: { type: 'boolean', description: 'Build succeeded / 构建成功' },
                        securityChecked: { type: 'boolean', description: 'Security review done / 安全审查完成' }
                    }
                },
                gaps: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Identified gaps or issues / 识别的缺口或问题'
                },
                acceptanceCriteriaMet: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Acceptance criteria verified as met / 已验证满足的验收标准'
                },
                summary: { type: 'string', description: 'Review summary / 审查摘要' }
            },
            required: ['summary']
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
    // RAG index: keep a fast, per-project cache under ~/.codeium/... (no workspace writes).
    void initializeRagIndexing();
    context.subscriptions.push(new vscode.Disposable(() => disposeRagIndexing()));

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

    // Best-effort cleanup to avoid leaking pending dialog requests.
    try {
        const timer = setInterval(() => prunePendingRequests(), 5 * 60 * 1000);
        context.subscriptions.push(new vscode.Disposable(() => clearInterval(timer)));
    } catch {
        // ignore
    }

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
    disposeRagIndexing();
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
	                    serverInfo: { name: 'windsurf_auto_mcp', version: '1.0.11' },
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
        case 'manage_sprint':
            result = await handleManageSprint(args);
            break;
        case 'generate_commit_message':
            result = await handleGenerateCommitMessage(args);
            break;
        case 'ask_user':
            stats.askUserCalls++;
            result = await handleAskUser(args);
            break;
        case 'ask_question':
            stats.askQuestionCalls++;
            result = await handleAskQuestion(args);
            break;
        case 'set_prd':
            stats.setPrdCalls++;
            result = await handleSetPrd(args);
            break;
        case 'approve_prd':
            result = await handleApprovePrd(args);
            break;
        case 'update_overview':
            stats.updateOverviewCalls++;
            result = await handleUpdateOverview(args);
            break;
        case 'generate_overview':
            stats.generateOverviewCalls++;
            result = await handleGenerateOverview(args);
            break;
        case 'update_plan':
            stats.updatePlanCalls++;
            result = await handleUpdatePlan(args);
            break;
        case 'plan_change_request':
            stats.planChangeRequestCalls++;
            result = await handlePlanChangeRequest(args);
            break;
        case 'rag_search':
            stats.ragSearchCalls++;
            result = await handleRagSearch(args);
            break;
        case 'memory_search':
            stats.memorySearchCalls++;
            result = await handleMemorySearch(args);
            break;
        case 'memory_hygiene':
            stats.memoryHygieneCalls++;
            result = await handleMemoryHygiene(args);
            break;
        case 'record_lesson':
            stats.recordLessonCalls++;
            result = await handleRecordLesson(args);
            break;
        case 'get_project_status':
            stats.getProjectStatusCalls++;
            result = await handleGetProjectStatus(args);
            break;
        case 'preflight':
            stats.preflightCalls++;
            result = await handlePreflight(args);
            break;
        case 'wam_status':
            stats.wamStatusCalls++;
            result = await handleWamStatus(args);
            break;
        case 'wam_commit':
            stats.wamCommitCalls++;
            result = await handleWamCommit(args);
            break;
        case 'wam_log':
            stats.wamLogCalls++;
            result = await handleWamLog(args);
            break;
        case 'wam_show':
            stats.wamShowCalls++;
            result = await handleWamShow(args);
            break;
        case 'wam_verify':
            stats.wamVerifyCalls++;
            result = await handleWamVerify(args);
            break;
        case 'wam_checkout':
            stats.wamCheckoutCalls++;
            result = await handleWamCheckout(args);
            break;
	        case 'wam_merge':
	            stats.wamMergeCalls++;
	            result = await handleWamMerge(args);
	            break;
	        case 'wam_branch':
	            stats.wamBranchCalls++;
	            result = await handleWamBranch(args);
	            break;
	        case 'wam_tag':
	            stats.wamTagCalls++;
	            result = await handleWamTag(args);
	            break;
	        case 'wam_diff':
	            stats.wamDiffCalls++;
	            result = await handleWamDiff(args);
	            break;
	        case 'wam_reset':
	            stats.wamResetCalls++;
	            result = await handleWamReset(args);
	            break;
	        case 'wam_stash':
	            stats.wamStashCalls++;
	            result = await handleWamStash(args);
	            break;
	        case 'ask_continue':
	            stats.askContinueCalls++;
	            result = await handleAskContinue(args);
	            break;
		        case 'check_plan':
		            stats.checkPlanCalls++;
		            result = await handleCheckPlan(args);
		            break;
		        case 'ensure_release_gate':
		            stats.ensureReleaseGateCalls++;
		            result = await handleEnsureReleaseGate(args);
		            break;
	        case 'save_memory':
	            stats.saveMemoryCalls++;
	            result = await handleSaveMemory(args);
	            break;
        case 'get_memory':
            stats.getMemoryCalls++;
            result = await handleGetMemory(args);
            break;
        case 'list_memories':
            stats.listMemoryCalls++;
            result = await handleListMemories(args);
            break;
        case 'update_walkthrough':
            stats.updateWalkthroughCalls++;
            result = await handleUpdateWalkthrough(args);
            break;
        case 'generate_walkthrough':
            stats.updateWalkthroughCalls++;
            result = await handleGenerateWalkthrough(args);
            break;
        case 'workflow_status':
            stats.workflowStatusCalls++;
            result = await handleWorkflowStatus(args);
            break;
        case 'verify_action':
            stats.verifyActionCalls++;
            result = await handleVerifyAction(args);
            break;
        case 'generate_user_stories':
            stats.generateUserStoriesCalls++;
            result = await handleGenerateUserStories(args);
            break;
        case 'wam_clear':
            stats.wamClearCalls++;
            result = await handleWamClear(args);
            break;
        case 'code_review':
            stats.codeReviewCalls++;
            result = await handleCodeReview(args);
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

    if (type === 'confirm' || type === 'info') {
        const yes = tr('tool.confirmYes', {}, lang);
        const no = tr('tool.confirmNo', {}, lang);
        const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const promptText = typeof message === 'string' ? message : String(message ?? '');
        const confirmMode: ConfirmDialogType = type === 'info' ? 'info' : 'confirm';

        return new Promise((resolve) => {
            sidebarProvider?.showInputDialog(requestId, title || 'WindsurfAutoMcp', promptText, false, {
                mode: 'confirm',
                confirmType: confirmMode
            });

            pendingRequests.set(requestId, {
                resolve: (value: any) => {
                    pendingRequests.delete(requestId);
                    const confirmed = value?.confirmed === true;
                    if (type === 'confirm') {
                        const choice = confirmed ? yes : no;
                        resolve({ content: [{ type: 'text', text: tr('tool.userChoice', { choice }, lang) }] });
                        return;
                    }
                    if (confirmed) {
                        resolve({ content: [{ type: 'text', text: tr('tool.userConfirmed', {}, lang) }] });
                    } else {
                        resolve({ content: [{ type: 'text', text: tr('tool.userCanceled', {}, lang) }] });
                    }
                },
                reject: () => {
                    pendingRequests.delete(requestId);
                    if (type === 'confirm') {
                        resolve({ content: [{ type: 'text', text: tr('tool.userChoice', { choice: no }, lang) }] });
                        return;
                    }
                    resolve({ content: [{ type: 'text', text: tr('tool.userCanceled', {}, lang) }] });
                },
                timestamp: Date.now()
            });
        });
    }

    // input type - 使用webview获取更丰富的输入
    const allowImages = allowImage !== false;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve) => {
        // 发送到webview
        sidebarProvider?.showInputDialog(requestId, title || 'WindsurfAutoMcp', message, allowImages);

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

function resolveProjectMemory(rootPathOverride?: string): { data: MemoryData; project: ProjectMemoryStore; rootPath: string } {
    const lang = getUiLanguage();
    const rootPath = rootPathOverride || getWorkspaceRootPath();
    if (!rootPath) {
        const msg = lang === 'en' ? 'Workspace is required for memories.' : '记忆需要打开工作区。';
        throw new Error(msg);
    }
    const data = loadMemoryData();
    if (!data.projects[rootPath]) {
        data.projects[rootPath] = { memories: {} };
    }
    if (!Array.isArray(data.projects[rootPath].timeline)) {
        data.projects[rootPath].timeline = [];
    }
    return { data, project: data.projects[rootPath], rootPath };
}

function saveTrackerAndNotify(
    data: TrackerData,
    project: ProjectTracker
) {
    saveTrackerData(data);
    try {
        syncProjectArtifacts(project);
    } catch (e: any) {
        outputChannel?.appendLine(`Artifact sync failed: ${e?.message ?? String(e)}`);
    }
    const snapshot = buildTrackerSnapshot(project);
    sidebarProvider?.postMessage({ type: 'tracker', data: snapshot });
    refreshOpenPanels(project);
}

function saveMemoryAndNotify(data: MemoryData): void {
    saveMemoryData(data);
}

function removeProjectArtifacts(project: ProjectTracker, fileNames: string[]): void {
    if (!project.projectId) return;
    const dirs = getProjectBrainDirs(getWriteHomeDirs(), project.projectId);
    for (const { dir } of dirs) {
        for (const fileName of fileNames) {
            removeArtifactFiles(dir, fileName);
        }
    }
}

function cleanupLegacyArtifacts(project: ProjectTracker): void {
    removeProjectArtifacts(project, ['task.md', 'implementation_plan.md']);
}

function syncProjectArtifacts(project: ProjectTracker): void {
    const lang = getUiLanguage();
    const specs: ArtifactSpec[] = [];
    if (!project.projectId) {
        project.projectId = createProjectId();
    }
    cleanupLegacyArtifacts(project);

    const overviewContent = project.overview?.content?.trim() || '';
    if (overviewContent) {
        specs.push({
            fileName: 'overview.md',
            artifactType: 'ARTIFACT_TYPE_OVERVIEW',
            content: overviewContent,
            summary: createArtifactSummary(overviewContent)
        });
    }

    const prdContent = project.prd.content?.trim() || '';
    if (project.prd.generatedBy === 'ai' && prdContent) {
        specs.push({
            fileName: 'prd.md',
            artifactType: 'ARTIFACT_TYPE_PRD',
            content: prdContent,
            summary: createArtifactSummary(prdContent)
        });
    }

    const hasPlan = !!project.plan.summary?.trim() || project.plan.items.length > 0;
    if (hasPlan) {
        const content = buildPlanArtifactContent(project, lang);
        specs.push({
            fileName: 'plan.md',
            artifactType: 'ARTIFACT_TYPE_PLAN',
            content,
            summary: createArtifactSummary(content)
        });
    }

    if (project.walkthrough.content?.trim()) {
        const content = buildWalkthroughArtifactContent(project, lang);
        specs.push({
            fileName: 'walkthrough.md',
            artifactType: 'ARTIFACT_TYPE_WALKTHROUGH',
            content,
            summary: createArtifactSummary(content)
        });
    }

    if (specs.length === 0) return;
    const dirs = getProjectBrainDirs(getWriteHomeDirs(), project.projectId);
    for (const { variant, dir } of dirs) {
        for (const spec of specs) {
            try {
                writeArtifactFiles(dir, spec);
            } catch (e: any) {
                outputChannel?.appendLine(
                    `Artifact write failed (${variant}): ${spec.fileName} - ${e?.message ?? String(e)}`
                );
            }
        }
    }
}

async function requestConfirmation(message: string, title?: string, confirmType: ConfirmDialogType = 'confirm'): Promise<boolean> {
    const requestId = `confirm_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    return new Promise((resolve) => {
        sidebarProvider?.showInputDialog(requestId, title || 'WindsurfAutoMcp', message, false, {
            mode: 'confirm',
            confirmType
        });

        pendingRequests.set(requestId, {
            resolve: (value: any) => {
                pendingRequests.delete(requestId);
                resolve(value?.confirmed === true);
            },
            reject: () => {
                pendingRequests.delete(requestId);
                resolve(false);
            },
            timestamp: Date.now()
        });
    });
}

function resetPrdState(project: ProjectTracker) {
    project.prd.content = '';
    project.prd.status = 'draft';
    project.prd.approvedBy = undefined;
    project.prd.approvedAt = undefined;
    project.prd.reviewedAt = undefined;
    project.prd.reviewNote = '';
    project.prd.generatedBy = undefined;
    project.prd.updatedAt = nowIso();
}

async function clearProjectPrd() {
    const lang = getUiLanguage();
    const confirmed = await requestConfirmation(tr('sidebar.clearPrdConfirm', {}, lang), tr('sidebar.clearTitle', {}, lang));
    if (!confirmed) return;
    const { data, project } = resolveProjectTracker();
    resetPrdState(project);
    bumpProjectStat(project, 'prdUpdates');
    appendWalkthroughEntry(project, lang === 'en' ? 'PRD cleared by user.' : 'PRD 已被清空。', lang);
    project.updatedAt = nowIso();
    removeProjectArtifacts(project, ['prd.md']);
    saveTrackerAndNotify(data, project);
}

async function clearProjectOverview() {
    const lang = getUiLanguage();
    const confirmed = await requestConfirmation(tr('sidebar.clearOverviewConfirm', {}, lang), tr('sidebar.clearTitle', {}, lang));
    if (!confirmed) return;
    const { data, project } = resolveProjectTracker();
    project.overview = { content: '', updatedAt: nowIso(), generatedBy: undefined };
    bumpProjectStat(project, 'overviewUpdates');
    appendWalkthroughEntry(project, lang === 'en' ? 'Overview cleared by user.' : '项目概览已被清空。', lang);
    project.updatedAt = nowIso();
    removeProjectArtifacts(project, ['overview.md']);
    saveTrackerAndNotify(data, project);
}

async function clearProjectPlan() {
    const lang = getUiLanguage();
    const confirmed = await requestConfirmation(tr('sidebar.clearPlanConfirm', {}, lang), tr('sidebar.clearTitle', {}, lang));
    if (!confirmed) return;
    const { data, project } = resolveProjectTracker();
    project.plan.summary = '';
    project.plan.items = [];
    bumpProjectStat(project, 'planUpdates');
    appendWalkthroughEntry(project, lang === 'en' ? 'Plan cleared by user.' : '计划已被清空。', lang);
    project.updatedAt = nowIso();
    removeProjectArtifacts(project, ['plan.md']);
    saveTrackerAndNotify(data, project);
}

async function clearProjectWalkthrough() {
    const lang = getUiLanguage();
    const confirmed = await requestConfirmation(tr('sidebar.clearWalkthroughConfirm', {}, lang), tr('sidebar.clearTitle', {}, lang));
    if (!confirmed) return;
    const { data, project } = resolveProjectTracker();
    project.walkthrough = { content: '', updatedAt: nowIso() };
    bumpProjectStat(project, 'walkthroughUpdates');
    project.updatedAt = nowIso();
    removeProjectArtifacts(project, ['walkthrough.md']);
    saveTrackerAndNotify(data, project);
}

async function clearProjectAudit() {
    const lang = getUiLanguage();
    const confirmed = await requestConfirmation(tr('sidebar.clearAuditConfirm', {}, lang), tr('sidebar.clearTitle', {}, lang));
    if (!confirmed) return;
    const { data, project } = resolveProjectTracker();
    if (!project.projectId) {
        project.projectId = createProjectId();
        project.updatedAt = nowIso();
        saveTrackerData(data);
    }
    const dirs = getProjectBrainDirs(getWriteHomeDirs(), project.projectId);
    for (const { dir } of dirs) {
        const p = path.join(dir, AUDIT_FILE_NAME);
        try {
            if (fs.existsSync(p)) fs.unlinkSync(p);
        } catch {
            // ignore
        }
    }
    appendWalkthroughEntry(project, lang === 'en' ? 'Audit log cleared by user.' : 'Audit 日志已被用户清空。', lang);
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);
}

async function clearProjectTracking() {
    const lang = getUiLanguage();
    const confirmed = await requestConfirmation(tr('sidebar.clearTrackingConfirm', {}, lang), tr('sidebar.clearTitle', {}, lang));
    if (!confirmed) return;
    const { data, project } = resolveProjectTracker();
    project.overview = { content: '', updatedAt: nowIso(), generatedBy: undefined };
    resetPrdState(project);
    project.plan.summary = '';
    project.plan.items = [];
    project.walkthrough = { content: '', updatedAt: nowIso() };
    project.stats = createDefaultTrackerStats();
    project.updatedAt = nowIso();
    removeProjectArtifacts(project, ['overview.md', 'prd.md', 'plan.md', 'walkthrough.md']);
    saveTrackerAndNotify(data, project);
}

function syncMemoryArtifacts(project: ProjectTracker, memoryStore: ProjectMemoryStore): void {
    const lang = getUiLanguage();
    const content = buildMemoryArtifactContent(project.name, memoryStore, lang);
    if (!content.trim()) return;
    if (!project.projectId) {
        project.projectId = createProjectId();
    }
    const spec: ArtifactSpec = {
        fileName: 'memory.md',
        artifactType: 'ARTIFACT_TYPE_MEMORY',
        content,
        summary: createArtifactSummary(content)
    };
    const dirs = getProjectBrainDirs(getWriteHomeDirs(), project.projectId);
    for (const { variant, dir } of dirs) {
        try {
            writeArtifactFiles(dir, spec);
        } catch (e: any) {
            outputChannel?.appendLine(
                `Artifact write failed (${variant}): ${spec.fileName} - ${e?.message ?? String(e)}`
            );
        }
    }
}

type PrdApprovalResult = {
    approved: boolean;
    note?: string;
    approver?: string;
};

async function requestPrdApproval(content: string, projectName: string): Promise<PrdApprovalResult> {
    const lang = getUiLanguage();
    const requestId = `prd_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const title = lang === 'en' ? 'PRD Review' : 'PRD 审核';
    const message = lang === 'en' ? 'Review the PRD and approve or request changes.' : '请审核 PRD，并选择审批或要求修改。';

    return new Promise((resolve) => {
        showDialogPanel(requestId, 'input', title, message, false, {
            mode: 'prd',
            prdContent: content,
            projectName
        });

        pendingRequests.set(requestId, {
            resolve: (value: any) => {
                pendingRequests.delete(requestId);
                if (!value) {
                    resolve({ approved: false, note: lang === 'en' ? 'User canceled PRD review.' : '用户取消了 PRD 审核。' });
                    return;
                }
                resolve({
                    approved: value.approved === true,
                    note: typeof value.note === 'string' ? value.note.trim() : undefined,
                    approver: typeof value.approver === 'string' ? value.approver.trim() : undefined
                });
            },
            reject: () => {
                pendingRequests.delete(requestId);
                resolve({ approved: false, note: lang === 'en' ? 'PRD review canceled.' : 'PRD 审核已取消。' });
            },
            timestamp: Date.now()
        });
    });
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
    project.prd.generatedBy = 'ai';
    project.prd.reviewNote = '';
    project.prd.reviewedAt = undefined;
    bumpProjectStat(project, 'prdUpdates');
    appendWalkthroughEntry(project, lang === 'en' ? 'PRD draft updated.' : 'PRD 草案已更新。', lang);
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);

    const approval = await requestPrdApproval(content, project.name);
    if (approval.approved) {
        if (!approval.approver) {
            approval.approver = lang === 'en' ? 'user' : '用户';
        }
        project.prd.status = 'approved';
        project.prd.approvedBy = approval.approver;
        project.prd.approvedAt = nowIso();
        bumpProjectStat(project, 'prdApprovals');
        appendWalkthroughEntry(project, lang === 'en' ? 'PRD approved.' : 'PRD 已审批。', lang);
    } else if (approval.note) {
        project.prd.reviewNote = approval.note;
    }
    project.prd.reviewedAt = nowIso();
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);

    const text = approval.approved
        ? (lang === 'en' ? 'PRD approved by user.' : 'PRD 已由用户审批。')
        : (lang === 'en' ? 'PRD review complete (changes requested).' : 'PRD 审核完成（需修改）。');
    return {
        content: [
            { type: 'text', text },
            { type: 'text', text: `PRD_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` }
        ]
    };
}

async function handleApprovePrd(args: any): Promise<any> {
    const lang = getUiLanguage();
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const { data, project } = resolveProjectTracker(rootPath);

    const reviewContent = typeof args?.content === 'string' ? args.content.trim() : '';
    const content = reviewContent || String(project.prd?.content || '').trim();
    if (!content) {
        const msg = lang === 'en' ? 'approve_prd requires existing PRD content (or pass content).' : 'approve_prd 需要已有 PRD 内容（或传入 content）。';
        throw new Error(msg);
    }

    const approval = await requestPrdApproval(content, project.name);
    if (approval.approved) {
        if (!approval.approver) {
            approval.approver = lang === 'en' ? 'user' : '用户';
        }
        project.prd.status = 'approved';
        project.prd.approvedBy = approval.approver;
        project.prd.approvedAt = nowIso();
        bumpProjectStat(project, 'prdApprovals');
        appendWalkthroughEntry(project, lang === 'en' ? 'PRD approved.' : 'PRD 已审批。', lang);
    } else if (approval.note) {
        project.prd.reviewNote = approval.note;
    }
    project.prd.reviewedAt = nowIso();
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);

    const text = approval.approved
        ? (lang === 'en' ? 'PRD approved by user.' : 'PRD 已由用户审批。')
        : (lang === 'en' ? 'PRD review complete (changes requested).' : 'PRD 审核完成（需修改）。');
    return {
        content: [
            { type: 'text', text },
            { type: 'text', text: `PRD_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` }
        ]
    };
}

function isIgnoredOverviewDir(name: string): boolean {
    const n = String(name || '').toLowerCase();
    return [
        '.git',
        'node_modules',
        '.vscode',
        '.windsurf',
        '.idea',
        'dist',
        'out',
        'build',
        '.next',
        '.turbo',
        '.cache',
        'target',
        '.venv',
        'venv',
        '__pycache__'
    ].includes(n);
}

function buildProjectTree(rootPath: string, maxDepth = 4, maxEntriesPerDir = 80, maxTotalEntries = 1200): string {
    const lines: string[] = [];
    let total = 0;

    const walk = (dir: string, depth: number, prefix: string) => {
        if (total >= maxTotalEntries) return;
        if (depth > maxDepth) return;
        let entries: fs.Dirent[] = [];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        entries = entries
            .filter((e) => !!e && !!e.name && !isIgnoredOverviewDir(e.name))
            .sort((a, b) => {
                const ad = a.isDirectory() ? 0 : 1;
                const bd = b.isDirectory() ? 0 : 1;
                if (ad !== bd) return ad - bd;
                return a.name.localeCompare(b.name);
            });

        const shown = entries.slice(0, maxEntriesPerDir);
        const remaining = entries.length - shown.length;

        for (const entry of shown) {
            if (total >= maxTotalEntries) return;
            total += 1;
            const isDir = entry.isDirectory();
            const label = isDir ? `${entry.name}/` : entry.name;
            lines.push(`${prefix}- ${label}`);
            if (isDir) {
                walk(path.join(dir, entry.name), depth + 1, `${prefix}  `);
            }
        }
        if (remaining > 0 && total < maxTotalEntries) {
            lines.push(`${prefix}- … (${remaining} more)`);
        }
    };

    walk(rootPath, 1, '');
    return lines.join('\n');
}

function detectKeyPaths(rootPath: string): string[] {
    const candidates = [
        'README.md',
        'README_EN.md',
        'AGENTS.md',
        'package.json',
        'tsconfig.json',
        'pnpm-lock.yaml',
        'yarn.lock',
        'package-lock.json',
        'pyproject.toml',
        'requirements.txt',
        'Cargo.toml',
        'go.mod',
        '.github/workflows',
        'src',
        'lib',
        'app',
        'apps',
        'packages',
        'docs',
        'tests',
        'test'
    ];
    const out: string[] = [];
    for (const rel of candidates) {
        const p = path.join(rootPath, rel);
        if (fs.existsSync(p)) out.push(rel.endsWith('/') ? rel : (fs.statSync(p).isDirectory() ? `${rel}/` : rel));
    }
    return out.slice(0, 40);
}

function detectProjectSignals(rootPath: string): string[] {
    const signals: string[] = [];
    const has = (p: string) => fs.existsSync(path.join(rootPath, p));

    if (has('package.json')) signals.push('Node.js / package.json');
    if (has('pnpm-lock.yaml')) signals.push('pnpm');
    if (has('yarn.lock')) signals.push('yarn');
    if (has('package-lock.json')) signals.push('npm');
    if (has('tsconfig.json')) signals.push('TypeScript');
    if (has('pyproject.toml') || has('requirements.txt')) signals.push('Python');
    if (has('go.mod')) signals.push('Go');
    if (has('Cargo.toml')) signals.push('Rust');
    if (has('pom.xml') || has('build.gradle') || has('build.gradle.kts')) signals.push('Java/Kotlin');
    if (has('.github/workflows')) signals.push('GitHub Actions');
    return signals;
}

function readPackageJsonSummary(rootPath: string): string {
    try {
        const pkgPath = path.join(rootPath, 'package.json');
        if (!fs.existsSync(pkgPath)) return '';
        const raw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw);
        const name = typeof pkg?.name === 'string' ? pkg.name : '';
        const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? Object.keys(pkg.scripts) : [];
        const deps = pkg?.dependencies && typeof pkg.dependencies === 'object' ? Object.keys(pkg.dependencies) : [];
        const devDeps = pkg?.devDependencies && typeof pkg.devDependencies === 'object' ? Object.keys(pkg.devDependencies) : [];
        const lines: string[] = [];
        if (name) lines.push(`- name: ${name}`);
        if (scripts.length) lines.push(`- scripts: ${scripts.slice(0, 12).join(', ')}${scripts.length > 12 ? '…' : ''}`);
        if (deps.length) lines.push(`- dependencies: ${deps.slice(0, 12).join(', ')}${deps.length > 12 ? '…' : ''}`);
        if (devDeps.length) lines.push(`- devDependencies: ${devDeps.slice(0, 12).join(', ')}${devDeps.length > 12 ? '…' : ''}`);
        return lines.join('\n');
    } catch {
        return '';
    }
}

function readPackageJsonScripts(rootPath: string): Array<{ name: string; command: string }> {
    try {
        const pkgPath = path.join(rootPath, 'package.json');
        if (!fs.existsSync(pkgPath)) return [];
        const raw = fs.readFileSync(pkgPath, 'utf-8');
        const pkg = JSON.parse(raw);
        const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
        const preferred = ['dev', 'start', 'build', 'test', 'lint', 'typecheck', 'format'];
        const keys = Array.from(new Set([...preferred, ...Object.keys(scripts)])).filter(Boolean);
        const out: Array<{ name: string; command: string }> = [];
        for (const k of keys) {
            const v = scripts?.[k];
            if (typeof v !== 'string') continue;
            const cmd = v.trim();
            if (!cmd) continue;
            out.push({ name: String(k), command: cmd });
            if (out.length >= 16) break;
        }
        return out;
    } catch {
        return [];
    }
}

function readTextFileExcerpt(absPath: string, maxChars = 8000, maxLines = 48): string {
    try {
        if (!absPath || !fs.existsSync(absPath)) return '';
        const stat = fs.statSync(absPath);
        if (!stat.isFile() || stat.size <= 0) return '';
        const raw = fs.readFileSync(absPath, 'utf-8');
        const text = raw.slice(0, Math.min(raw.length, maxChars));
        const lines = text.replace(/\r\n/g, '\n').split('\n').slice(0, maxLines);
        return lines.join('\n').trim();
    } catch {
        return '';
    }
}

function readReadmeExcerpt(rootPath: string): { relPath: string; excerpt: string } | null {
    const candidates = ['README.md', 'README_EN.md', 'docs/README.md', 'docs/README_EN.md'];
    for (const rel of candidates) {
        const abs = path.join(rootPath, rel);
        const excerpt = readTextFileExcerpt(abs, 9000, 56);
        if (excerpt) {
            return { relPath: rel, excerpt };
        }
    }
    return null;
}

function generateOverviewMarkdown(project: ProjectTracker, lang: UiLanguage): string {
    const rootPath = project.rootPath;
    const title = lang === 'en' ? 'Project Overview' : '项目概览';

    const signals = detectProjectSignals(rootPath);
    const tree = buildProjectTree(rootPath, 5, 110, 1800);
    const pkgSummary = readPackageJsonSummary(rootPath);
    const pkgScripts = readPackageJsonScripts(rootPath);
    const keyPaths = detectKeyPaths(rootPath);
    const readme = readReadmeExcerpt(rootPath);

    const signalLines = signals.length ? signals.map((s) => `- ${s}`).join('\n') : `_${tr('panel.readOnlyEmpty', {}, lang)}_`;
    const pkgLines = pkgSummary ? pkgSummary : `_${tr('panel.readOnlyEmpty', {}, lang)}_`;
    const keyPathLines = keyPaths.length ? keyPaths.map((p) => `- ${p}`).join('\n') : `_${tr('panel.readOnlyEmpty', {}, lang)}_`;
    const scriptLines = pkgScripts.length
        ? pkgScripts.map((s) => `- ${s.name}: ${s.command}`).join('\n')
        : `_${tr('panel.readOnlyEmpty', {}, lang)}_`;

    const suggestedCmds = (() => {
        const has = (p: string) => fs.existsSync(path.join(rootPath, p));
        const lines: string[] = [];
        if (has('package.json')) {
            lines.push(lang === 'en' ? '- Install: npm install' : '- 安装：npm install');
            lines.push(lang === 'en' ? '- Build: npm run build' : '- 构建：npm run build');
            lines.push(lang === 'en' ? '- Test: npm test' : '- 测试：npm test');
            lines.push(lang === 'en' ? '- Lint: npm run lint' : '- Lint：npm run lint');
        } else if (has('pyproject.toml') || has('requirements.txt')) {
            lines.push(lang === 'en' ? '- Tests: python -m pytest' : '- 测试：python -m pytest');
        } else if (has('go.mod')) {
            lines.push(lang === 'en' ? '- Tests: go test ./...' : '- 测试：go test ./...');
        } else if (has('Cargo.toml')) {
            lines.push(lang === 'en' ? '- Tests: cargo test' : '- 测试：cargo test');
        }
        if (!lines.length) {
            lines.push(lang === 'en' ? '_No commands detected. Fill in the correct commands for this repo._' : '_未检测到命令，请补充本项目正确的命令。_');
        }
        return lines.join('\n');
    })();

    const onboarding = lang === 'en'
        ? [
            '- One-liner: What is this project?',
            '- Primary users/personas',
            '- Key modules (folder → responsibility)',
            '- Runtime/deploy model (local/serverless/container/etc)',
            '- External integrations (DB, APIs, queues)',
            '- Dev workflow: install/build/test/lint + expected outputs',
            '- Conventions: code style, naming, branch/release strategy',
            '- Risks/constraints (security/perf/compat)'
        ].map((l) => `- ${l.replace(/^\-\s*/, '')}`).join('\n')
        : [
            '- 一句话：这个项目是做什么的？',
            '- 主要用户/角色',
            '- 核心模块（目录 → 职责）',
            '- 运行/部署方式（本地/服务端/容器/Serverless 等）',
            '- 外部集成（DB、API、队列等）',
            '- 开发流程：安装/构建/测试/Lint + 期望结果',
            '- 约定：代码风格、命名、分支/发布策略',
            '- 风险/约束（安全/性能/兼容性）'
        ].map((l) => `- ${l.replace(/^\-\s*/, '')}`).join('\n');

    const archTemplate = lang === 'en'
        ? [
            'Fill this after reading key files (README, entrypoints, configs).',
            '',
            '### Components',
            '- (TBD) UI / client',
            '- (TBD) API / server',
            '- (TBD) Data store',
            '- (TBD) Background jobs',
            '',
            '### Key flows',
            '- (TBD) Request → validation → business logic → persistence',
            '',
            '### Boundaries & contracts',
            '- (TBD) Public APIs, internal modules, invariants'
        ].join('\n')
        : [
            '请在阅读关键文件（README、入口文件、配置）后补全。',
            '',
            '### 组件',
            '-（待补全）前端/客户端',
            '-（待补全）API/服务端',
            '-（待补全）数据存储',
            '-（待补全）后台任务',
            '',
            '### 关键流程',
            '-（待补全）请求 → 校验 → 业务逻辑 → 持久化',
            '',
            '### 边界与契约',
            '-（待补全）对外接口、内部模块、不变量'
        ].join('\n');

    const readmeBlock = readme
        ? [
            `## ${lang === 'en' ? `README excerpt (${readme.relPath})` : `README 摘要（${readme.relPath}）`}`,
            '```text',
            readme.excerpt,
            '```'
        ].join('\n')
        : `## ${lang === 'en' ? 'README excerpt' : 'README 摘要'}\n_${tr('panel.readOnlyEmpty', {}, lang)}_`;

    return [
        `# ${project.name ? `${project.name} - ${title}` : title}`,
        '',
        `## ${lang === 'en' ? 'What this overview is for' : '本概览用于做什么'}`,
        lang === 'en'
            ? 'This is the workspace project baseline (not the MCP/extension). Use it as the architecture record and onboarding map.'
            : '这是“工作区项目”的基线概览（不是 MCP/插件本身）。用于作为架构记录与上手地图。',
        '',
        `## ${lang === 'en' ? 'Onboarding checklist (fill in)' : '上手清单（请补全）'}`,
        onboarding,
        '',
        `## ${lang === 'en' ? 'Signals' : '技术信号'}`,
        signalLines,
        '',
        `## ${lang === 'en' ? 'Key paths (quick map)' : '关键路径（快速定位）'}`,
        keyPathLines,
        '',
        `## ${lang === 'en' ? 'Suggested commands (verify for this repo)' : '建议命令（请以本仓库为准）'}`,
        suggestedCmds,
        '',
        `## ${lang === 'en' ? 'package.json summary' : 'package.json 摘要'}`,
        pkgLines,
        '',
        `## ${lang === 'en' ? 'package.json scripts (selected)' : 'package.json scripts（节选）'}`,
        scriptLines,
        '',
        readmeBlock,
        '',
        `## ${lang === 'en' ? 'Architecture record (fill in)' : '架构记录（请补全）'}`,
        archTemplate,
        '',
        `## ${lang === 'en' ? 'Folder tree (trimmed)' : '目录结构（节选）'}`,
        '```text',
        tree || tr('panel.readOnlyEmpty', {}, lang),
        '```',
        ''
    ].join('\n');
}

function isIgnoredRagFile(filePath: string): boolean {
    const p = normalizePathForCompare(filePath);
    if (!p) return true;
    const name = path.basename(p);
    if (name.startsWith('.env')) return true;
    if (name.includes('id_rsa') || name.includes('id_ed25519')) return true;
    const blockedExt = [
        '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico',
        '.zip', '.7z', '.tar', '.gz', '.rar',
        '.exe', '.dll', '.so', '.dylib',
        '.pdf', '.mp4', '.mov', '.avi',
        '.lock'
    ];
    if (blockedExt.some((ext) => name.endsWith(ext))) return true;
    return false;
}

function decodeUtf8(bytes: Uint8Array): string {
    try {
        return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
    } catch {
        // Node < 11 fallback not needed in this environment
        return Buffer.from(bytes).toString('utf-8');
    }
}

function pickBestSnippet(content: string, queryTokens: string[], maxLines = 5): { snippet: string; startLine: number } {
    const lines = String(content || '').split(/\r?\n/);
    let bestIdx = 0;
    let bestScore = 0;
    for (let i = 0; i < lines.length; i++) {
        const s = scoreByTokenOverlap(queryTokens, lines[i]);
        if (s > bestScore) {
            bestScore = s;
            bestIdx = i;
        }
    }
    const half = Math.max(1, Math.floor(maxLines / 2));
    const start = Math.max(0, bestIdx - half);
    const end = Math.min(lines.length, start + maxLines);
    return { snippet: lines.slice(start, end).join('\n'), startLine: start + 1 };
}

async function handleRagSearch(args: any): Promise<any> {
    const lang = getUiLanguage();
    const query = typeof args?.query === 'string' ? args.query.trim() : '';
    if (!query) {
        const msg = lang === 'en' ? 'rag_search requires query.' : 'rag_search 需要 query。';
        throw new Error(msg);
    }
    const maxResults = Number.isFinite(args?.maxResults) ? Math.max(1, Math.min(10, Math.floor(args.maxResults))) : 6;
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : (getWorkspaceRootPath() || '');
    if (!rootPath) {
        const msg = lang === 'en' ? 'Workspace is required for rag_search.' : 'rag_search 需要打开工作区。';
        throw new Error(msg);
    }

    // Record that we refreshed workspace context for this project (used by hooks to enforce "RAG before edits").
    try {
        const trackerInfo = resolveProjectTracker(rootPath);
        trackerInfo.project.stats = normalizeTrackerStats(trackerInfo.project.stats);
        trackerInfo.project.stats.lastRagSearchAt = nowIso();
        saveTrackerData(trackerInfo.data);
    } catch {
        // ignore
    }

    const queryTokens = tokenizeForSearch(query);
    const expandedTokens = expandSemanticTokens(queryTokens);
    const searchTokens = expandedTokens.length ? expandedTokens : queryTokens;

    // Prefer indexed ranking for speed; fall back to path-only scan when no index exists yet.
    const state = await ensureRagIndexRuntimeInitialized(rootPath);
    if (state && !state.enumerated) {
        // Ensure we at least have file metadata for ranking.
        void enumerateWorkspaceIntoRagIndex();
    }

    const querySet = new Set<string>(searchTokens.map((t) => String(t || '').trim()).filter(Boolean));
    const scoreTokenIntersection = (tokens: string[] | undefined): number => {
        if (!tokens || tokens.length === 0 || querySet.size === 0) return 0;
        let s = 0;
        for (const t of tokens) {
            if (querySet.has(t)) s += 1;
        }
        return s;
    };

    let fastMatches: FastWorkspaceMatch[] = [];
    if (state && state.data && state.data.files && Object.keys(state.data.files).length > 0) {
        const ranked: Array<{ uri: vscode.Uri; pathScore: number }> = [];
        for (const entry of Object.values(state.data.files)) {
            if (!entry || !entry.path) continue;
            const absPath = path.resolve(rootPath, entry.path);
            if (!isUnderRoot(rootPath, absPath)) continue;
            if (isIgnoredRagFile(absPath)) continue;
            const pathOverlap = scoreByTokenOverlap(searchTokens, entry.path);
            const heuristic = scoreRagPathHeuristic(entry.path);
            const tokenScore = scoreTokenIntersection(entry.tokens);
            const score = pathOverlap * 4 + heuristic + tokenScore * 6;
            if (score <= 0) continue;
            ranked.push({ uri: vscode.Uri.file(absPath), pathScore: score });
        }
        ranked.sort((a, b) => (b.pathScore - a.pathScore) || a.uri.fsPath.localeCompare(b.uri.fsPath));
        fastMatches = ranked.slice(0, 220);
    }

    if (fastMatches.length === 0) {
        fastMatches = await rankWorkspaceFilesByPath(searchTokens, {
            exclude: RAG_EXCLUDE_GLOB,
            maxFiles: 180,
            maxTotalMatches: 0,
            timeBudgetMs: 650
        });
    }

    const candidates: Array<{ uri: vscode.Uri; path: string; score: number; snippet: string; startLine: number }> = [];

    for (const match of fastMatches) {
        const filePath = match.uri.fsPath;
        if (isIgnoredRagFile(filePath)) continue;
        try {
            const stat = await vscode.workspace.fs.stat(match.uri);
            if (stat.size > 420_000) continue;
            const raw = await vscode.workspace.fs.readFile(match.uri);
            if (raw.length === 0) continue;
            const head = raw.subarray(0, Math.min(raw.length, 2048));
            if (head.includes(0)) continue;
            const text = decodeUtf8(raw.subarray(0, Math.min(raw.length, 120_000)));
            const score = match.pathScore * 2 + scoreByTokenOverlap(searchTokens, `${filePath}\n${text}`);
            if (score <= 0) continue;
            const { snippet, startLine } = pickBestSnippet(text, searchTokens, 7);
            candidates.push({ uri: match.uri, path: filePath, score, snippet, startLine });

            // Lazily refresh index tokens for files we touched.
            if (state && isUnderRoot(rootPath, filePath)) {
                const rel = normalizeWorkspaceRelPath(rootPath, filePath);
                const existing = state.data.files[rel];
                const needsTokenUpdate = !existing || !existing.tokens || existing.mtimeMs !== stat.mtime || existing.size !== stat.size;
                if (needsTokenUpdate) {
                    state.data.files[rel] = {
                        path: rel,
                        mtimeMs: stat.mtime,
                        size: stat.size,
                        tokens: tokenizeForIndex(text, 180),
                        updatedAt: nowIso()
                    };
                    markRagIndexDirty();
                    flushRagIndexSoon();
                }
            }
        } catch {
            // ignore unreadable files
        }
        if (candidates.length >= 80) break;
    }

    candidates.sort((a, b) => (b.score - a.score) || a.path.localeCompare(b.path));
    const top = candidates.slice(0, maxResults);
    const header = lang === 'en' ? `RAG results (${top.length})` : `RAG 结果（${top.length}）`;
    const lines = top.map((r, i) => `${i + 1}. ${r.path}:${r.startLine}\n${r.snippet}`);

    return {
        content: [
            { type: 'text', text: header },
            { type: 'text', text: lines.join('\n\n') || (lang === 'en' ? 'No matches.' : '无匹配结果。') },
            { type: 'text', text: `RAG_JSON:\n${JSON.stringify({ query, tokens: searchTokens, results: top.map((r) => ({ path: r.path, startLine: r.startLine, score: r.score })) }, null, 2)}` }
        ]
    };
}

async function handleUpdateOverview(args: any): Promise<any> {
    const lang = getUiLanguage();
    const content = typeof args?.content === 'string' ? args.content.trim() : '';
    if (!content) {
        const msg = lang === 'en' ? 'update_overview requires content.' : 'update_overview 需要提供 content。';
        throw new Error(msg);
    }
    const { data, project } = resolveProjectTracker();
    project.overview = { content, updatedAt: nowIso(), generatedBy: 'ai' };
    bumpProjectStat(project, 'overviewUpdates');
    appendWalkthroughEntry(project, lang === 'en' ? 'Overview updated.' : '项目概览已更新。', lang);
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);
    const text = lang === 'en' ? 'Overview updated.' : '项目概览已更新。';
    return { content: [{ type: 'text', text }, { type: 'text', text: `OVERVIEW_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` }] };
}

async function handleGenerateOverview(args: any): Promise<any> {
    const lang = getUiLanguage();
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const { data, project } = resolveProjectTracker(rootPath);

    const content = generateOverviewMarkdown(project, lang);
    project.overview = { content, updatedAt: nowIso(), generatedBy: 'auto' };
    bumpProjectStat(project, 'overviewUpdates');
    appendWalkthroughEntry(project, lang === 'en' ? 'Overview generated.' : '项目概览已生成。', lang);
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);

    // Bootstrap new projects:
    // - Initialize layered project memory (so hooks don't block implementation)
    // - Initialize WAM history (HEAD.json) so WAM gating works from first run
    try {
        const mem = resolveProjectMemory(project.rootPath);
        const memKeys = Object.keys(mem.project.memories || {});
        if (memKeys.length === 0) {
            const baselineKey = 'baseline:project';
            const baselineValue = [
                `# ${project.name || 'Project'} — Baseline (auto)`,
                `GeneratedAt: ${nowIso()}`,
                `RootPath: ${project.rootPath}`,
                '',
                '## Overview',
                (project.overview?.content || '').slice(0, 6000),
                '',
                '## Notes',
                lang === 'en'
                    ? '- Fill in missing architecture details in Overview (components/flows/contracts).'
                    : '- 请在 Overview 中补全架构细节（组件/流程/契约）。'
            ].join('\n');
            await handleSaveMemory({
                key: baselineKey,
                value: baselineValue,
                scope: 'project',
                kind: 'long',
                tags: ['baseline', 'architecture', 'auto']
            });

            const rulesKey = 'baseline:dev_workflow';
            const rulesValue = [
                `# ${project.name || 'Project'} — Dev workflow (auto)`,
                '',
                lang === 'en'
                    ? 'Validate and replace the commands below with the repo-true commands:'
                    : '请以本仓库真实命令为准，校验/替换下列命令：',
                '',
                (readPackageJsonScripts(project.rootPath).map((s) => `- npm run ${s.name}  # ${s.command}`).join('\n') || ''),
                '',
                lang === 'en'
                    ? 'Recommended baseline:'
                    : '建议基线：',
                '- npm install',
                '- npm run build',
                '- npm test',
                '- npm run lint'
            ].filter(Boolean).join('\n');
            await handleSaveMemory({
                key: rulesKey,
                value: rulesValue,
                scope: 'project',
                kind: 'long',
                tags: ['baseline', 'workflow', 'auto']
            });

            // Make an initial WAM snapshot so future hooks can reliably enforce WAM cleanliness.
            commitProjectWam('wam: init baseline (generate_overview)', 'auto', project.rootPath);
        }
    } catch {
        // best-effort
    }

    const text = lang === 'en' ? 'Overview generated.' : '项目概览已生成。';
    return { content: [{ type: 'text', text }, { type: 'text', text: `OVERVIEW_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` }] };
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

function extractSummaryFromArgs(args: any): string | undefined {
    if (typeof args?.summary === 'string' && args.summary.trim()) {
        return args.summary.trim();
    }
    if (typeof args?.content === 'string' && args.content.trim()) {
        return args.content.trim();
    }
    return undefined;
}

function normalizePlanItemKey(text: string): string {
    return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function mergePlanItems(existing: TrackerItem[], incoming: TrackerItem[]): TrackerItem[] {
    const out: TrackerItem[] = Array.isArray(existing) ? existing.map((i) => ({ ...i })) : [];
    const existingIndex = new Map<string, number>();
    for (let i = 0; i < out.length; i++) {
        const it = out[i];
        const key = normalizePlanItemKey(it?.text);
        if (!key) continue;
        if (!existingIndex.has(key)) existingIndex.set(key, i);
    }

    for (const inc of incoming || []) {
        if (!inc || !inc.text) continue;
        const key = normalizePlanItemKey(inc.text);
        if (!key) continue;
        const idx = existingIndex.get(key);
        if (idx === undefined) {
            out.push({
                id: inc.id || `item_${Math.random().toString(36).slice(2, 10)}`,
                text: String(inc.text || '').trim(),
                status: inc.status === 'doing' || inc.status === 'done' ? inc.status : 'todo',
                updatedAt: inc.updatedAt || nowIso()
            });
            existingIndex.set(key, out.length - 1);
            continue;
        }
        const cur = out[idx];
        const curRank = statusRank(cur.status);
        const incRank = statusRank(inc.status);
        const nextStatus = incRank > curRank ? inc.status : cur.status;
        const nextUpdatedAt = chooseNewerIso(cur.updatedAt, cur.updatedAt, inc.updatedAt || nowIso(), inc.updatedAt || nowIso());
        out[idx] = {
            ...cur,
            text: String(inc.text || cur.text || '').trim(),
            status: nextStatus,
            updatedAt: nextUpdatedAt
        };
    }
    return out;
}

function countPlanStatuses(items: TrackerItem[]): { total: number; todo: number; doing: number; done: number } {
    const out = { total: 0, todo: 0, doing: 0, done: 0 };
    for (const it of items || []) {
        if (!it || !it.text) continue;
        out.total += 1;
        if (it.status === 'done') out.done += 1;
        else if (it.status === 'doing') out.doing += 1;
        else out.todo += 1;
    }
    return out;
}

async function handlePlanChangeRequest(args: any): Promise<any> {
    const lang = getUiLanguage();
    const { data, project } = resolveProjectTracker();
    const items = extractItemsFromArgs(args);
    const summary = extractSummaryFromArgs(args);

    if (items.length === 0 && !summary) {
        const msg = lang === 'en' ? 'plan_change_request requires items/text or summary.' : 'plan_change_request 需要 items/text 或 summary。';
        throw new Error(msg);
    }

    const existingItems = Array.isArray(project.plan.items) ? project.plan.items : [];
    const existingSummary = String(project.plan.summary || '').trim();
    const existingCounts = countPlanStatuses(existingItems);
    const incomingCounts = countPlanStatuses(items);

    let added = 0;
    let updated = 0;
    try {
        const existingIndex = new Map<string, TrackerItem>();
        for (const it of existingItems) {
            const key = normalizePlanItemKey(it?.text || '');
            if (!key) continue;
            if (!existingIndex.has(key)) existingIndex.set(key, it);
        }
        for (const inc of items) {
            const key = normalizePlanItemKey(inc?.text || '');
            if (!key) continue;
            const cur = existingIndex.get(key);
            if (!cur) {
                added += 1;
                continue;
            }
            const curRank = statusRank(cur.status);
            const incRank = statusRank(inc.status);
            if (incRank > curRank || String(inc.text || '').trim() !== String(cur.text || '').trim()) {
                updated += 1;
            }
        }
    } catch {
        // ignore preview failures
    }

    const maxPreviewItems = 18;
    const proposedPreview = items.slice(0, maxPreviewItems).map((it) => `- [${it.status === 'done' ? 'x' : it.status === 'doing' ? '~' : ' '}] ${it.text}`);
    if (items.length > maxPreviewItems) proposedPreview.push(`- … (${items.length - maxPreviewItems} more)`);

    const summaryLine =
        summary && summary.trim()
            ? (lang === 'en' ? `Proposed summary: ${summary.trim()}` : `提案摘要：${summary.trim()}`)
            : (lang === 'en' ? 'Proposed summary: (no change)' : '提案摘要：（不变）');

    const previewLines: string[] = [];
    previewLines.push(lang === 'en' ? 'Plan change request' : '计划变更请求');
    previewLines.push('');
    previewLines.push(lang === 'en' ? `Current items: ${existingCounts.total} (todo=${existingCounts.todo}, doing=${existingCounts.doing}, done=${existingCounts.done})` : `当前条目：${existingCounts.total}（todo=${existingCounts.todo}, doing=${existingCounts.doing}, done=${existingCounts.done}）`);
    previewLines.push(summaryLine);
    if (items.length > 0) {
        previewLines.push('');
        previewLines.push(lang === 'en' ? `Proposed items: ${incomingCounts.total} (adds=${added}, updates=${updated})` : `提案条目：${incomingCounts.total}（新增=${added}，更新=${updated}）`);
        previewLines.push(...proposedPreview);
    }
    previewLines.push('');
    previewLines.push(lang === 'en' ? 'Choose how to apply:' : '请选择应用方式：');

    const options =
        lang === 'en'
            ? ['Merge into current Plan (recommended)', 'Replace the Plan (dangerous)', 'Cancel']
            : ['合并到现有 Plan（推荐）', '替换整个 Plan（危险）', '取消'];

    const choiceRes = await handleAskQuestion({
        title: lang === 'en' ? 'Plan change request' : '计划变更请求',
        message: previewLines.join('\n'),
        options,
        allowText: false,
        allowImage: false
    });

    const choicePayload = extractMarkerJson(choiceRes, 'CHOICE_JSON:') || {};
    const selectedText = String(choicePayload?.choices?.[0]?.choiceText || '').trim();
    if (!selectedText || selectedText.toLowerCase().includes('cancel') || selectedText.includes('取消')) {
        const text = lang === 'en' ? 'Plan change canceled.' : '已取消计划变更。';
        return { content: [{ type: 'text', text }, { type: 'text', text: `PLAN_CHANGE_REQUEST_JSON:\n${JSON.stringify({ applied: false, mode: 'cancel' }, null, 2)}` }] };
    }

    const mode: 'merge' | 'replace' =
        selectedText.toLowerCase().includes('replace') || selectedText.includes('替换') ? 'replace' : 'merge';

    if (summary !== undefined) {
        project.plan.summary = summary;
        bumpProjectStat(project, 'planUpdates');
    }
    if (items.length > 0) {
        project.plan.items = mode === 'replace' ? items : mergePlanItems(project.plan.items, items);
        const hasDoing = project.plan.items.some((it) => it && it.status === 'doing');
        if (!hasDoing) {
            const firstTodo = project.plan.items.find((it) => it && it.status === 'todo');
            if (firstTodo) {
                firstTodo.status = 'doing';
                firstTodo.updatedAt = nowIso();
            }
        }
        bumpProjectStat(project, 'planUpdates');
    }

    appendWalkthroughEntry(
        project,
        mode === 'replace'
            ? (lang === 'en' ? 'Plan replaced via plan_change_request.' : '通过 plan_change_request 替换了计划。')
            : (lang === 'en' ? 'Plan merged via plan_change_request.' : '通过 plan_change_request 合并了计划。'),
        lang
    );
    project.stats = normalizeTrackerStats(project.stats);
    project.stats.lastPlanUpdateAt = nowIso();
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);

    const text = lang === 'en' ? `Plan updated (${mode}).` : `计划已更新（${mode === 'replace' ? '替换' : '合并'}）。`;
    return {
        content: [
            { type: 'text', text },
            { type: 'text', text: `PLAN_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` },
            { type: 'text', text: `PLAN_CHANGE_REQUEST_JSON:\n${JSON.stringify({ applied: true, mode, added, updated }, null, 2)}` }
        ]
    };
}

async function handleUpdatePlan(args: any): Promise<any> {
    const lang = getUiLanguage();
    const { data, project } = resolveProjectTracker();
    const items = extractItemsFromArgs(args);
    const summary = extractSummaryFromArgs(args);
    const mode: 'merge' | 'replace' = args?.mode === 'replace' ? 'replace' : 'merge';
    if (items.length === 0 && !summary) {
        const msg = lang === 'en' ? 'update_plan requires items/text or summary.' : 'update_plan 需要 items/text 或 summary。';
        throw new Error(msg);
    }
    
    // Capture progress before update for milestone detection
    const beforeProgress = calculatePlanProgress(project.plan?.items || []);
    
    if (summary !== undefined) {
        project.plan.summary = summary;
        bumpProjectStat(project, 'planUpdates');
    }
    if (items.length > 0) {
        project.plan.items = mode === 'replace' ? items : mergePlanItems(project.plan.items, items);
        // Ensure there is an active "doing" item when there are todos.
        const hasDoing = project.plan.items.some((it) => it && it.status === 'doing');
        if (!hasDoing) {
            const firstTodo = project.plan.items.find((it) => it && it.status === 'todo');
            if (firstTodo) {
                firstTodo.status = 'doing';
                firstTodo.updatedAt = nowIso();
            }
        }
        bumpProjectStat(project, 'planUpdates');
    }
    
    // Calculate progress after update
    const afterProgress = calculatePlanProgress(project.plan?.items || []);
    
    // Detect milestones (25%, 50%, 75%, 100%)
    const milestones = [25, 50, 75, 100];
    const crossedMilestones: number[] = [];
    for (const m of milestones) {
        if (beforeProgress.percent < m && afterProgress.percent >= m) {
            crossedMilestones.push(m);
        }
    }
    
    // Build detailed walkthrough entry
    const walkthroughLines: string[] = [];
    walkthroughLines.push(lang === 'en' 
        ? `Plan updated: ${afterProgress.done}/${afterProgress.total} (${afterProgress.percent}%)`
        : `计划更新: ${afterProgress.done}/${afterProgress.total} (${afterProgress.percent}%)`);
    
    if (crossedMilestones.length > 0) {
        const milestoneStr = crossedMilestones.join(', ');
        walkthroughLines.push(lang === 'en'
            ? `🎯 Milestone reached: ${milestoneStr}%`
            : `🎯 里程碑达成: ${milestoneStr}%`);
    }
    
    // List recently completed items
    const recentlyDone = items.filter(it => it.status === 'done').slice(0, 3);
    if (recentlyDone.length > 0) {
        const doneTexts = recentlyDone.map(it => it.text.slice(0, 50)).join('; ');
        walkthroughLines.push(lang === 'en'
            ? `Completed: ${doneTexts}`
            : `已完成: ${doneTexts}`);
    }
    
    appendWalkthroughEntry(project, walkthroughLines.join(' | '), lang);
    project.stats = normalizeTrackerStats(project.stats);
    project.stats.lastPlanUpdateAt = nowIso();
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);
    
    // Build response with progress info
    const responseLines: string[] = [];
    responseLines.push(lang === 'en' ? 'Plan updated.' : '计划已更新。');
    responseLines.push(lang === 'en'
        ? `Progress: ${afterProgress.done}/${afterProgress.total} (${afterProgress.percent}%)`
        : `进度: ${afterProgress.done}/${afterProgress.total} (${afterProgress.percent}%)`);
    
    if (crossedMilestones.length > 0) {
        responseLines.push(lang === 'en'
            ? `🎯 Milestone: ${crossedMilestones.join(', ')}% reached!`
            : `🎯 里程碑: ${crossedMilestones.join(', ')}% 已达成!`);
    }
    
    if (afterProgress.percent === 100) {
        responseLines.push(lang === 'en'
            ? '✅ All items complete! Call ask_continue() to finish.'
            : '✅ 所有项目已完成！调用 ask_continue() 完成交付。');
    } else {
        const nextTodo = project.plan.items?.find(it => it.status === 'todo' || it.status === 'doing');
        if (nextTodo) {
            responseLines.push(lang === 'en'
                ? `Next: ${nextTodo.text.slice(0, 60)}`
                : `下一项: ${nextTodo.text.slice(0, 60)}`);
        }
    }
    
    const text = responseLines.join('\n');
    return { content: [{ type: 'text', text }, { type: 'text', text: `PLAN_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` }] };
}

function calculatePlanProgress(items: TrackerItem[]): { total: number; done: number; percent: number } {
    const validItems = items.filter(it => it && it.text);
    const total = validItems.length;
    const done = validItems.filter(it => it.status === 'done').length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;
    return { total, done, percent };
}

async function handleGetProjectStatus(args: any): Promise<any> {
    const lang = getUiLanguage();
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const { data, project } = resolveProjectTracker(rootPath);
    try {
        project.stats = normalizeTrackerStats(project.stats);
        project.stats.lastProjectStatusAt = nowIso();
        saveTrackerData(data);
    } catch {
        // ignore
    }
    try {
        syncProjectArtifacts(project);
        const { project: memoryStore } = resolveProjectMemory(rootPath);
        syncMemoryArtifacts(project, memoryStore);
    } catch (e: any) {
        outputChannel?.appendLine(`Artifact sync failed (status): ${e?.message ?? String(e)}`);
    }
    const snapshot = buildTrackerSnapshot(project);
    const text = lang === 'en' ? 'Project status:' : '项目状态：';
    return { content: [{ type: 'text', text }, { type: 'text', text: `STATUS_JSON:\n${JSON.stringify(snapshot, null, 2)}` }] };
}

function extractMarkerJson(result: any, markerPrefix: string): any | null {
    try {
        const content = Array.isArray(result?.content) ? result.content : [];
        for (const item of content) {
            if (!item || item.type !== 'text') continue;
            const text = typeof item.text === 'string' ? item.text : '';
            if (!text.startsWith(markerPrefix)) continue;
            const idx = text.indexOf('\n');
            const jsonText = idx >= 0 ? text.slice(idx + 1).trim() : '';
            if (!jsonText) return null;
            return JSON.parse(jsonText);
        }
        return null;
    } catch {
        return null;
    }
}

async function handlePreflight(args: any): Promise<any> {
    const lang = getUiLanguage();
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;

    const userPrompt = typeof args?.userPrompt === 'string' ? args.userPrompt.trim() : '';
    const query = typeof args?.query === 'string' ? args.query.trim() : '';
    const ragQuery = typeof args?.ragQuery === 'string' ? args.ragQuery.trim() : '';
    const memoryQuery = typeof args?.memoryQuery === 'string' ? args.memoryQuery.trim() : '';

    const memoryScope: 'project' | 'global' | 'both' =
        args?.memoryScope === 'global' || args?.memoryScope === 'both' ? args.memoryScope : 'both';
    const ragMaxResults = clampNumber(args?.ragMaxResults, 1, 10, 6);
    const memoryMaxResults = clampNumber(args?.memoryMaxResults, 1, 20, 8);

    const baseQuery = userPrompt || query || '';
    const effectiveRagQuery = ragQuery || baseQuery || (lang === 'en' ? 'project structure' : '项目结构');
    const effectiveMemoryQuery = memoryQuery || baseQuery || (lang === 'en' ? 'plan, rules, lessons' : '计划 规则 经验');

    const startedAt = nowIso();

    const runCheck = async (fn: () => Promise<any>) => {
        try {
            const out = await fn();
            return { ok: true as const, out };
        } catch (e: any) {
            return { ok: false as const, error: e?.message ?? String(e) };
        }
    };

    const statusRes = await runCheck(() => handleGetProjectStatus({ rootPath }));
    const planRes = await runCheck(() => handleCheckPlan({ rootPath }));
    const memoryRes = await runCheck(() =>
        handleMemorySearch({ query: effectiveMemoryQuery, scope: memoryScope, maxResults: memoryMaxResults, rootPath })
    );
    const ragRes = await runCheck(() => handleRagSearch({ query: effectiveRagQuery, maxResults: ragMaxResults, rootPath }));
    const wamRes = await runCheck(() => handleWamStatus({ scope: 'project', rootPath }));

    // Mark the project as having completed a preflight (separate from last* tool timestamps).
    try {
        const trackerInfo = resolveProjectTracker(rootPath);
        trackerInfo.project.stats = normalizeTrackerStats(trackerInfo.project.stats);
        trackerInfo.project.stats.lastPreflightAt = nowIso();
        saveTrackerData(trackerInfo.data);
    } catch {
        // ignore
    }

    const payload: any = {
        startedAt,
        finishedAt: nowIso(),
        rootPath: rootPath || getWorkspaceRootPath() || '',
        queries: {
            baseQuery,
            ragQuery: effectiveRagQuery,
            memoryQuery: effectiveMemoryQuery,
            memoryScope,
            ragMaxResults,
            memoryMaxResults
        },
        checks: {
            project_status: statusRes.ok
                ? { ok: true, status: extractMarkerJson(statusRes.out, 'STATUS_JSON:') }
                : { ok: false, error: statusRes.error },
            check_plan: planRes.ok
                ? { ok: true, plan: extractMarkerJson(planRes.out, 'PLAN_STATUS_JSON:') }
                : { ok: false, error: planRes.error },
            memory_search: memoryRes.ok
                ? { ok: true, memory: extractMarkerJson(memoryRes.out, 'MEMORY_SEARCH_JSON:') }
                : { ok: false, error: memoryRes.error },
            rag_search: ragRes.ok ? { ok: true, rag: extractMarkerJson(ragRes.out, 'RAG_JSON:') } : { ok: false, error: ragRes.error },
            wam_status: wamRes.ok
                ? { ok: true, wam: extractMarkerJson(wamRes.out, 'WAM_STATUS_JSON:') }
                : { ok: false, error: wamRes.error }
        }
    };

    const lines: string[] = [];
    lines.push(lang === 'en' ? 'Preflight checks:' : '预检检查：');
    const addLine = (name: string, ok: boolean, error?: string) => {
        const badge = ok ? (lang === 'en' ? 'OK' : '通过') : (lang === 'en' ? 'FAIL' : '失败');
        lines.push(`- ${name}: ${badge}${!ok && error ? ` — ${error}` : ''}`);
    };
    addLine('get_project_status', statusRes.ok, (statusRes as any).error);
    addLine('check_plan', planRes.ok, (planRes as any).error);
    addLine('memory_search', memoryRes.ok, (memoryRes as any).error);
    addLine('rag_search', ragRes.ok, (ragRes as any).error);
    addLine('wam_status', wamRes.ok, (wamRes as any).error);

    const text = lines.join('\n');
    return { content: [{ type: 'text', text }, { type: 'text', text: `PREFLIGHT_JSON:\n${JSON.stringify(payload, null, 2)}` }] };
}

function parseWamScope(args: any): 'project' | 'global' {
    return args?.scope === 'global' ? 'global' : 'project';
}

function clampNumber(raw: any, min: number, max: number, fallback: number): number {
    const n = Number(raw);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.floor(n)));
}

function buildCurrentProjectWamState(rootPathOverride?: string): {
    trackerData: TrackerData;
    memoryData: MemoryData;
    project: ProjectTracker;
    memoryProject: ProjectMemoryStore;
    rootPath: string;
    projectId: string;
    trackerSnapshot: any;
    memorySnapshot: any;
    digest: string;
    wamDir: string | null;
} {
    const { data: trackerData, project, rootPath } = resolveProjectTracker(rootPathOverride);
    const { data: memoryData, project: memoryProject } = resolveProjectMemory(rootPath);
    if (!project.projectId) {
        project.projectId = createProjectId();
        trackerData.projects[rootPath] = project;
        saveTrackerData(trackerData);
    }
    const projectId = project.projectId;
    const trackerSnapshot = { schemaVersion: 1, projectId, rootPath, tracker: project };
    const memorySnapshot = { schemaVersion: 1, projectId, rootPath, memory: memoryProject };
    const digest = computeProjectWamDigest(project, memoryProject);
    const wamDir = resolveProjectWamDir(projectId);
    return { trackerData, memoryData, project, memoryProject, rootPath, projectId, trackerSnapshot, memorySnapshot, digest, wamDir };
}

function buildCurrentGlobalWamState(): { snapshot: any; digest: string; wamDir: string | null } {
    const globalMemory = loadGlobalMemoryData();
    const snapshot = { schemaVersion: 1, globalMemory };
    const digest = computeGlobalWamDigest(globalMemory);
    const wamDir = resolveGlobalWamDir();
    return { snapshot, digest, wamDir };
}

async function handleWamStatus(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope = parseWamScope(args);
    if (scope === 'global') {
        const { digest, wamDir } = buildCurrentGlobalWamState();
        const head = wamDir ? readWamHead(wamDir) : {};
        const headHash = wamDir ? (resolveWamHeadHash(wamDir).hash) : '';
        const clean = !!headHash && head?.digest === digest;
        const branch =
            head?.ref?.startsWith('refs/heads/')
                ? head.ref.replace('refs/heads/', '')
                : (head?.ref?.startsWith('refs/tags/') ? head.ref.replace('refs/tags/', '') : '');
        const text =
            lang === 'en'
                ? `WAM(global): ${clean ? 'clean' : 'dirty'} (HEAD=${headHash || 'none'}${branch ? `, ${branch}` : ''})`
                : `WAM（全局）：${clean ? '干净' : '有改动'}（HEAD=${headHash || '无'}${branch ? `，${branch}` : ''}）`;
        return { content: [{ type: 'text', text }, { type: 'text', text: `WAM_STATUS_JSON:\n${JSON.stringify({ scope, clean, head: { ...head, head: headHash }, digest }, null, 2)}` }] };
    }
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const state = buildCurrentProjectWamState(rootPath);
    try {
        state.project.stats = normalizeTrackerStats(state.project.stats);
        state.project.stats.lastWamStatusAt = nowIso();
        saveTrackerData(state.trackerData);
    } catch {
        // ignore
    }
    const head = state.wamDir ? readWamHead(state.wamDir) : {};
    const headHash = state.wamDir ? resolveWamHeadHash(state.wamDir).hash : '';
    const clean = !!headHash && head?.digest === state.digest;
    const branch =
        head?.ref?.startsWith('refs/heads/')
            ? head.ref.replace('refs/heads/', '')
            : (head?.ref?.startsWith('refs/tags/') ? head.ref.replace('refs/tags/', '') : '');
    const text =
        lang === 'en'
            ? `WAM(project): ${clean ? 'clean' : 'dirty'} (HEAD=${headHash || 'none'}${branch ? `, ${branch}` : ''})`
            : `WAM（项目）：${clean ? '干净' : '有改动'}（HEAD=${headHash || '无'}${branch ? `，${branch}` : ''}）`;
    return { content: [{ type: 'text', text }, { type: 'text', text: `WAM_STATUS_JSON:\n${JSON.stringify({ scope, clean, head: { ...head, head: headHash }, digest: state.digest, projectId: state.projectId, rootPath: state.rootPath }, null, 2)}` }] };
}

async function handleWamCommit(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope = parseWamScope(args);
    const author: 'auto' | 'ai' | 'user' = args?.author === 'ai' || args?.author === 'user' ? args.author : 'auto';
    const message = typeof args?.message === 'string' ? args.message.trim() : '';
    if (scope === 'global') {
        const result = autoWamCommitGlobal(message, author);
        const text =
            lang === 'en'
                ? (result.committed ? `WAM(global) committed: ${result.hash}` : 'WAM(global) no changes; skipped.')
                : (result.committed ? `WAM（全局）已提交：${result.hash}` : 'WAM（全局）无变化，跳过。');
        const payload = {
            scope,
            committed: result.committed,
            hash: result.hash || '',
            message: result.commit?.message || '',
            changes: result.commit?.changes || null
        };
        return { content: [{ type: 'text', text }, { type: 'text', text: `WAM_COMMIT_JSON:\n${JSON.stringify(payload, null, 2)}` }] };
    }
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const result = commitProjectWam(message, author, rootPath);
    const text =
        lang === 'en'
            ? (result.committed ? `WAM(project) committed: ${result.hash}` : 'WAM(project) no changes; skipped.')
            : (result.committed ? `WAM（项目）已提交：${result.hash}` : 'WAM（项目）无变化，跳过。');
    const payload = {
        scope,
        committed: result.committed,
        hash: result.hash || '',
        message: result.commit?.message || '',
        changes: result.commit?.changes || null
    };
    return { content: [{ type: 'text', text }, { type: 'text', text: `WAM_COMMIT_JSON:\n${JSON.stringify(payload, null, 2)}` }] };
}

async function handleWamLog(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope = parseWamScope(args);
    const limit = clampNumber(args?.limit, 1, 200, 20);

    let dir: string | null = null;
    let headInfo: { head: WamHead; hash: string } | null = null;
    if (scope === 'global') {
        dir = resolveGlobalWamDir();
    } else {
        const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
        const state = buildCurrentProjectWamState(rootPath);
        dir = state.wamDir;
    }

    if (!dir) {
        const text = lang === 'en' ? 'WAM: no history directory found yet.' : 'WAM：尚未找到历史目录。';
        return { content: [{ type: 'text', text }] };
    }
    ensureWamRepoLayout(dir);
    headInfo = resolveWamHeadHash(dir);
    const commits = headInfo.hash ? walkWamHistory(dir, headInfo.hash, limit) : listWamCommits(dir, limit);
    const lines = commits.map((c) => {
        const parents = Array.isArray(c.parents) && c.parents.length ? ` (${c.parents.length}p)` : '';
        const conflicts = Array.isArray(c.conflicts) && c.conflicts.length ? ` ⚠${c.conflicts.length}` : '';
        return `${c.hash.slice(0, 10)}${parents}${conflicts}  ${c.createdAt}  ${c.author}  ${c.message}`;
    });
    const branchLabel =
        headInfo?.head?.ref?.startsWith('refs/heads/')
            ? headInfo.head.ref.replace('refs/heads/', '')
            : (headInfo?.head?.ref?.startsWith('refs/tags/') ? headInfo.head.ref.replace('refs/tags/', '') : '');
    const headLabel = headInfo?.hash ? headInfo.hash.slice(0, 10) : 'none';
    const header =
        lang === 'en'
            ? `WAM log (${scope}) — HEAD=${headLabel}${branchLabel ? ` (${branchLabel})` : ''}`
            : `WAM 日志（${scope === 'global' ? '全局' : '项目'}）— HEAD=${headLabel}${branchLabel ? `（${branchLabel}）` : ''}`;
    return { content: [{ type: 'text', text: header }, { type: 'text', text: lines.join('\n') || (lang === 'en' ? '(empty)' : '（空）') }, { type: 'text', text: `WAM_LOG_JSON:\n${JSON.stringify({ scope, dir, commits }, null, 2)}` }] };
}

async function handleWamShow(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope = parseWamScope(args);
    const hash = typeof args?.hash === 'string' ? args.hash.trim() : '';
    if (!hash) {
        throw new Error(lang === 'en' ? 'wam_show requires hash.' : 'wam_show 需要 hash。');
    }
    let dir: string | null = null;
    if (scope === 'global') {
        dir = resolveGlobalWamDir();
    } else {
        const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
        dir = buildCurrentProjectWamState(rootPath).wamDir;
    }
    if (!dir) {
        const text = lang === 'en' ? 'WAM: no history directory found yet.' : 'WAM：尚未找到历史目录。';
        return { content: [{ type: 'text', text }] };
    }
    const commit = readWamCommit(dir, hash);
    if (!commit) {
        const text = lang === 'en' ? `WAM commit not found: ${hash}` : `未找到 WAM 提交：${hash}`;
        return { content: [{ type: 'text', text }] };
    }
    const text = lang === 'en' ? `WAM commit: ${hash}` : `WAM 提交：${hash}`;
    return { content: [{ type: 'text', text }, { type: 'text', text: `WAM_COMMIT_JSON:\n${JSON.stringify(commit, null, 2)}` }] };
}

function verifyWamIntegrity(
    dir: string,
    scope: 'project' | 'global',
    targetHash: string,
    options?: { maxCommits?: number; verifySnapshots?: boolean; verifySignature?: boolean; signingKey?: Buffer | null }
): { ok: boolean; checked: number; issues: string[] } {
    const maxCommits = options?.maxCommits ? Math.max(1, Math.min(800, Math.floor(options.maxCommits))) : 200;
    const verifySnapshots = options?.verifySnapshots !== false;
    const verifySignature = options?.verifySignature === true;
    const signingKey = options?.signingKey || null;
    const issues: string[] = [];
    const queue: string[] = [];
    const seen = new Set<string>();

    const pushIssue = (msg: string) => {
        if (issues.length >= 60) return;
        issues.push(msg);
    };

    const normalizeHash = (h: any) => (typeof h === 'string' ? h.trim() : '');
    const expectedHash = (commit: WamCommit): string => {
        const createdAt = String(commit.createdAt || '');
        const parents = Array.isArray(commit.parents) ? commit.parents : [];
        const message = String(commit.message || '');
        const digest = String(commit.digest || '');
        return sha256Hex(`${createdAt}\n${parents.join(',')}\n${message}\n${digest}`);
    };

    queue.push(targetHash);

    while (queue.length > 0 && seen.size < maxCommits) {
        const hash = normalizeHash(queue.shift());
        if (!hash) continue;
        if (seen.has(hash)) continue;
        seen.add(hash);

        const commit = readWamCommit(dir, hash);
        if (!commit) {
            pushIssue(`Missing commit object: ${hash}`);
            continue;
        }
        if (commit.hash !== hash) {
            pushIssue(`Commit hash mismatch (file=${hash}, commit.hash=${commit.hash})`);
        }
        const exp = expectedHash(commit);
        if (exp !== commit.hash) {
            pushIssue(`Commit content hash mismatch: ${commit.hash} (expected ${exp})`);
        }

        const hasSignature = typeof (commit as any).signature === 'string' && String((commit as any).signature).trim().length > 0;
        if ((verifySignature || hasSignature) && !signingKey) {
            pushIssue(`Cannot verify signature (missing signing key): ${hash}`);
        }
        if (signingKey && (verifySignature || hasSignature)) {
            const sigAlg = String((commit as any).signatureAlg || 'hmac-sha256');
            if (sigAlg !== 'hmac-sha256') {
                pushIssue(`Unknown signature algorithm: ${hash} (${sigAlg})`);
            } else if (!hasSignature) {
                pushIssue(`Missing signature: ${hash}`);
            } else {
                const sig = String((commit as any).signature || '').trim();
                const expectedSig = signWamHash(hash, signingKey);
                if (sig !== expectedSig) {
                    pushIssue(`Signature mismatch: ${hash}`);
                }
            }
        }

        if (verifySnapshots) {
            if (scope === 'global') {
                const snap = readWamSnapshot(dir, hash, 'global_memory');
                const gm = snap?.globalMemory;
                if (!gm) {
                    pushIssue(`Missing global snapshot: ${hash}`);
                } else {
                    const dig = computeGlobalWamDigest(gm);
                    if (dig !== commit.digest) {
                        pushIssue(`Digest mismatch (global): ${hash}`);
                    }
                }
            } else {
                const trackerSnap = readWamSnapshot(dir, hash, 'tracker');
                const memorySnap = readWamSnapshot(dir, hash, 'memory');
                const tracker = trackerSnap?.tracker as any;
                const memory = memorySnap?.memory as any;
                if (!tracker || !memory) {
                    pushIssue(`Missing project snapshots (tracker/memory): ${hash}`);
                } else {
                    const dig = computeProjectWamDigest(tracker as ProjectTracker, memory as ProjectMemoryStore);
                    if (dig !== commit.digest) {
                        pushIssue(`Digest mismatch (project): ${hash}`);
                    }
                }
            }
        }

        const parents = Array.isArray(commit.parents) ? commit.parents : [];
        for (const p of parents) {
            const ph = normalizeHash(p);
            if (!ph) continue;
            if (!readWamCommit(dir, ph)) {
                pushIssue(`Missing parent commit: ${commit.hash} -> ${ph}`);
                continue;
            }
            queue.push(ph);
        }
    }

    return { ok: issues.length === 0, checked: seen.size, issues };
}

async function handleWamVerify(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope = parseWamScope(args);
    const verifySnapshots = args?.verifySnapshots !== false;
    const verifySignature = args?.verifySignature === true;
    const maxCommits = clampNumber(args?.maxCommits, 1, 800, 200);
    const targetSpec = typeof args?.target === 'string' ? args.target.trim() : 'HEAD';

    let dir: string | null = null;
    if (scope === 'global') {
        dir = resolveGlobalWamDir();
    } else {
        const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
        dir = buildCurrentProjectWamState(rootPath).wamDir;
    }

    if (!dir) {
        const text = lang === 'en' ? 'WAM: no history directory found yet.' : 'WAM：尚未找到历史目录。';
        return { content: [{ type: 'text', text }] };
    }

    ensureWamRepoLayout(dir);
    const resolvedHash = resolveWamHashFromSpecifier(dir, targetSpec);
    if (!resolvedHash) {
        const text = lang === 'en' ? `WAM: cannot resolve target: ${targetSpec}` : `WAM：无法解析目标：${targetSpec}`;
        return { content: [{ type: 'text', text }] };
    }

    const signing = loadWamSigningKey(true);
    const result = verifyWamIntegrity(dir, scope, resolvedHash, {
        maxCommits,
        verifySnapshots,
        verifySignature,
        signingKey: signing?.keyBytes || null
    });
    const text =
        lang === 'en'
            ? `WAM verify (${scope}): ${result.ok ? 'OK' : 'FAIL'} (checked=${result.checked}, issues=${result.issues.length})`
            : `WAM 校验（${scope === 'global' ? '全局' : '项目'}）：${result.ok ? '通过' : '失败'}（检查=${result.checked}，问题=${result.issues.length}）`;

    return {
        content: [
            { type: 'text', text },
            { type: 'text', text: result.issues.length ? result.issues.map((l) => `- ${l}`).join('\n') : (lang === 'en' ? '(no issues)' : '（无问题）') },
            { type: 'text', text: `WAM_VERIFY_JSON:\n${JSON.stringify({ scope, target: targetSpec, resolvedHash, ...result, verifySnapshots, verifySignature, maxCommits, signatureKeyPresent: !!signing }, null, 2)}` }
        ]
    };
}

async function handleWamCheckout(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope = parseWamScope(args);
    const targetSpec = typeof args?.target === 'string' ? args.target.trim() : (typeof args?.hash === 'string' ? args.hash.trim() : '');
    if (!targetSpec) {
        throw new Error(lang === 'en' ? 'wam_checkout requires target/hash.' : 'wam_checkout 需要 target/hash。');
    }

    if (scope === 'global') {
        const dir = resolveGlobalWamDir();
        if (!dir) {
            const text = lang === 'en' ? 'WAM(global): no history directory found yet.' : 'WAM（全局）：尚未找到历史目录。';
            return { content: [{ type: 'text', text }] };
        }
        ensureWamRepoLayout(dir);
        const resolvedHash = resolveWamHashFromSpecifier(dir, targetSpec);
        const commit = readWamCommit(dir, resolvedHash);
        const snapshot = readWamSnapshot(dir, resolvedHash, 'global_memory');
        if (!resolvedHash || !commit || !snapshot?.globalMemory) {
            const text = lang === 'en' ? `WAM(global) commit not found or missing snapshot: ${targetSpec}` : `WAM（全局）未找到提交或快照缺失：${targetSpec}`;
            return { content: [{ type: 'text', text }] };
        }
        saveGlobalMemoryData(snapshot.globalMemory);
        const globalDigest = computeGlobalWamDigest(snapshot.globalMemory);
        const raw = targetSpec.replace(/\\/g, '/');
        let nextRef: string | undefined;
        if (raw.startsWith('refs/heads/')) nextRef = raw;
        else if (isValidWamRefName(raw) && readWamRef(dir, `refs/heads/${raw}`)) nextRef = `refs/heads/${raw}`;
        // tags / hashes => detached
        writeWamHead(dir, { head: resolvedHash, digest: globalDigest, updatedAt: nowIsoNano(), ref: nextRef });
        if (nextRef) writeWamRef(dir, nextRef, resolvedHash);
        const text = lang === 'en' ? `WAM(global) restored: ${resolvedHash}` : `WAM（全局）已恢复：${resolvedHash}`;
        return { content: [{ type: 'text', text }] };
    }

    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const state = buildCurrentProjectWamState(rootPath);
    if (!state.wamDir) {
        const text = lang === 'en' ? 'WAM(project): no history directory found yet.' : 'WAM（项目）：尚未找到历史目录。';
        return { content: [{ type: 'text', text }] };
    }
    ensureWamRepoLayout(state.wamDir);
    const resolvedHash = resolveWamHashFromSpecifier(state.wamDir, targetSpec);
    const commit = readWamCommit(state.wamDir, resolvedHash);
    const trackerSnap = readWamSnapshot(state.wamDir, resolvedHash, 'tracker');
    const memorySnap = readWamSnapshot(state.wamDir, resolvedHash, 'memory');
    const restoredProject = trackerSnap?.tracker;
    const restoredMemory = memorySnap?.memory;
    const snapRoot = String(trackerSnap?.rootPath || '');
    if (!resolvedHash || !commit || !restoredProject || !restoredMemory) {
        const text = lang === 'en' ? `WAM(project) commit not found or missing snapshot: ${targetSpec}` : `WAM（项目）未找到提交或快照缺失：${targetSpec}`;
        return { content: [{ type: 'text', text }] };
    }
    if (snapRoot && normalizePathForCompare(snapRoot) !== normalizePathForCompare(state.rootPath)) {
        const text =
            lang === 'en'
                ? `Refusing to checkout: commit rootPath differs (commit=${snapRoot}, current=${state.rootPath})`
                : `拒绝恢复：提交 rootPath 不匹配（commit=${snapRoot}，current=${state.rootPath}）`;
        return { content: [{ type: 'text', text }] };
    }

    const trackerData = loadTrackerData();
    trackerData.projects[state.rootPath] = restoredProject;
    trackerData.activeProject = state.rootPath;
    saveTrackerData(trackerData);

    const memoryData = loadMemoryData();
    memoryData.projects[state.rootPath] = restoredMemory;
    if (!Array.isArray(memoryData.projects[state.rootPath].timeline)) {
        memoryData.projects[state.rootPath].timeline = [];
    }
    saveMemoryData(memoryData);

    try {
        syncProjectArtifacts(restoredProject);
        syncMemoryArtifacts(restoredProject, restoredMemory);
    } catch (e: any) {
        outputChannel?.appendLine(`WAM checkout artifact sync failed: ${e?.message ?? String(e)}`);
    }
    sidebarProvider?.postMessage({ type: 'tracker', data: buildTrackerSnapshot(restoredProject) });
    refreshOpenPanels(restoredProject);

    // Update HEAD to reflect the restored working state (clean).
    const nextDigest = computeProjectWamDigest(restoredProject, restoredMemory);
    let nextRef: string | undefined;
    const raw = targetSpec.replace(/\\/g, '/');
    if (raw.startsWith('refs/heads/')) nextRef = raw;
    else if (isValidWamRefName(raw) && readWamRef(state.wamDir, `refs/heads/${raw}`)) nextRef = `refs/heads/${raw}`;
    else nextRef = undefined; // detached for tags/hashes
    writeWamHead(state.wamDir, { head: resolvedHash, digest: nextDigest, updatedAt: nowIsoNano(), ref: nextRef });
    if (nextRef) writeWamRef(state.wamDir, nextRef, resolvedHash);

    const text = lang === 'en' ? `WAM(project) restored: ${resolvedHash}` : `WAM（项目）已恢复：${resolvedHash}`;
    return { content: [{ type: 'text', text }] };
}

function statusRank(status: TrackerItemStatus): number {
    if (status === 'done') return 3;
    if (status === 'doing') return 2;
    return 1;
}

function prdStatusRank(status: any): number {
    if (status === 'approved') return 2;
    return 1;
}

function mergePrdStatusThreeWay(
    base: any,
    ours: any,
    theirs: any,
    oursUpdatedAt: string | undefined,
    theirsUpdatedAt: string | undefined,
    conflicts: string[]
): 'draft' | 'approved' {
    const b = base === 'approved' ? 'approved' : 'draft';
    const o = ours === 'approved' ? 'approved' : 'draft';
    const t = theirs === 'approved' ? 'approved' : 'draft';
    if (o === t) return o;
    if (o === b) return t;
    if (t === b) return o;
    conflicts.push('prd.status');
    if (prdStatusRank(o) !== prdStatusRank(t)) return prdStatusRank(o) > prdStatusRank(t) ? o : t;
    return chooseNewerIso(o, oursUpdatedAt, t, theirsUpdatedAt);
}

function normalizeTrackerForMerge(project: any, rootPath: string, projectId?: string): ProjectTracker {
    const lang = getUiLanguage();
    const data: TrackerData = { schemaVersion: 1, projects: {} as any };
    data.projects[rootPath] = (project && typeof project === 'object') ? project : ({} as any);
    const normalized = ensureProjectTracker(data, rootPath, lang);
    if (projectId) normalized.projectId = projectId;
    return JSON.parse(JSON.stringify(normalized));
}

function normalizeMemoryForMerge(store: any): ProjectMemoryStore {
    const base: ProjectMemoryStore = { memories: {}, timeline: [] };
    if (!store || typeof store !== 'object') return base;
    const memories = store.memories && typeof store.memories === 'object' ? store.memories : {};
    base.memories = JSON.parse(JSON.stringify(memories));
    if (Array.isArray(store.timeline)) base.timeline = JSON.parse(JSON.stringify(store.timeline));
    return base;
}

function mergeProjectTrackerThreeWay(
    base: ProjectTracker,
    ours: ProjectTracker,
    theirs: ProjectTracker,
    rootPath: string,
    conflicts: string[]
): ProjectTracker {
    const merged: ProjectTracker = JSON.parse(JSON.stringify(ours));
    merged.rootPath = rootPath;
    merged.projectId = ours.projectId;
    merged.name = ours.name || theirs.name || getProjectNameFromPath(rootPath);

    merged.overview = merged.overview || { content: '', updatedAt: nowIso() };
    merged.overview.content = threeWayMergeString(
        'overview.content',
        String(base.overview?.content || ''),
        String(ours.overview?.content || ''),
        String(theirs.overview?.content || ''),
        ours.overview?.updatedAt,
        theirs.overview?.updatedAt,
        conflicts
    );
    merged.overview.updatedAt = nowIso();

    const basePrd = base.prd || ({} as any);
    const ourPrd = ours.prd || ({} as any);
    const theirPrd = theirs.prd || ({} as any);
    merged.prd = merged.prd || { content: '', status: 'draft' };
    merged.prd.status = mergePrdStatusThreeWay(basePrd.status, ourPrd.status, theirPrd.status, ourPrd.updatedAt, theirPrd.updatedAt, conflicts);
    merged.prd.content = threeWayMergeString(
        'prd.content',
        String(basePrd.content || ''),
        String(ourPrd.content || ''),
        String(theirPrd.content || ''),
        ourPrd.updatedAt,
        theirPrd.updatedAt,
        conflicts
    );
    merged.prd.reviewNote = threeWayMergeString(
        'prd.reviewNote',
        String(basePrd.reviewNote || ''),
        String(ourPrd.reviewNote || ''),
        String(theirPrd.reviewNote || ''),
        ourPrd.reviewedAt,
        theirPrd.reviewedAt,
        conflicts
    );
    merged.prd.approvedBy = threeWayMergeString(
        'prd.approvedBy',
        String(basePrd.approvedBy || ''),
        String(ourPrd.approvedBy || ''),
        String(theirPrd.approvedBy || ''),
        ourPrd.approvedAt,
        theirPrd.approvedAt,
        conflicts
    );
    merged.prd.approvedAt = threeWayMergeString(
        'prd.approvedAt',
        String(basePrd.approvedAt || ''),
        String(ourPrd.approvedAt || ''),
        String(theirPrd.approvedAt || ''),
        ourPrd.approvedAt,
        theirPrd.approvedAt,
        conflicts
    );
    merged.prd.updatedAt = nowIso();
    merged.prd.reviewedAt = threeWayMergeString(
        'prd.reviewedAt',
        String(basePrd.reviewedAt || ''),
        String(ourPrd.reviewedAt || ''),
        String(theirPrd.reviewedAt || ''),
        ourPrd.reviewedAt,
        theirPrd.reviewedAt,
        conflicts
    );
    merged.prd.generatedBy = ourPrd.generatedBy || theirPrd.generatedBy;

    merged.plan = merged.plan || { summary: '', items: [] };
    merged.plan.summary = threeWayMergeString(
        'plan.summary',
        String(base.plan?.summary || ''),
        String(ours.plan?.summary || ''),
        String(theirs.plan?.summary || ''),
        ours.updatedAt,
        theirs.updatedAt,
        conflicts
    );
    merged.plan.items = threeWayMergePlanItems(base.plan?.items || [], ours.plan?.items || [], theirs.plan?.items || [], conflicts);

    merged.walkthrough = merged.walkthrough || { content: '' };
    merged.walkthrough.content = threeWayMergeString(
        'walkthrough.content',
        String(base.walkthrough?.content || ''),
        String(ours.walkthrough?.content || ''),
        String(theirs.walkthrough?.content || ''),
        ours.walkthrough?.updatedAt,
        theirs.walkthrough?.updatedAt,
        conflicts
    );
    merged.walkthrough.updatedAt = nowIso();

    merged.stats = normalizeTrackerStats({
        prdUpdates: Math.max(base.stats?.prdUpdates || 0, ours.stats?.prdUpdates || 0, theirs.stats?.prdUpdates || 0),
        prdApprovals: Math.max(base.stats?.prdApprovals || 0, ours.stats?.prdApprovals || 0, theirs.stats?.prdApprovals || 0),
        overviewUpdates: Math.max(base.stats?.overviewUpdates || 0, ours.stats?.overviewUpdates || 0, theirs.stats?.overviewUpdates || 0),
        planUpdates: Math.max(base.stats?.planUpdates || 0, ours.stats?.planUpdates || 0, theirs.stats?.planUpdates || 0),
        walkthroughUpdates: Math.max(base.stats?.walkthroughUpdates || 0, ours.stats?.walkthroughUpdates || 0, theirs.stats?.walkthroughUpdates || 0),
        updatedAt: nowIso()
    });

    merged.updatedAt = nowIso();
    return merged;
}

function chooseNewerIso<T>(a: T, aIso: string | undefined, b: T, bIso: string | undefined): T {
    const aTs = Date.parse(aIso || '');
    const bTs = Date.parse(bIso || '');
    if (Number.isFinite(aTs) && Number.isFinite(bTs)) {
        return bTs > aTs ? b : a;
    }
    // Fall back to "a wins" if timestamps are missing/unparseable.
    return a;
}

function getWamCommit(dir: string, hash: string): WamCommit | null {
    return readWamCommit(dir, hash);
}

function listCommitParents(dir: string, hash: string): string[] {
    const commit = getWamCommit(dir, hash);
    const parents = Array.isArray(commit?.parents) ? commit!.parents : [];
    return parents.filter(Boolean);
}

function collectAncestorDepths(dir: string, start: string, maxNodes = 5000): Map<string, number> {
    const depths = new Map<string, number>();
    const queue: Array<{ hash: string; depth: number }> = [];
    const root = String(start || '').trim();
    if (!root) return depths;
    queue.push({ hash: root, depth: 0 });
    while (queue.length > 0 && depths.size < maxNodes) {
        const { hash, depth } = queue.shift()!;
        if (!hash || depths.has(hash)) continue;
        depths.set(hash, depth);
        for (const parent of listCommitParents(dir, hash)) {
            if (!depths.has(parent)) queue.push({ hash: parent, depth: depth + 1 });
        }
    }
    return depths;
}

function findMergeBase(dir: string, a: string, b: string): string {
    const aMap = collectAncestorDepths(dir, a);
    const bMap = collectAncestorDepths(dir, b);
    let best = '';
    let bestScore = Number.POSITIVE_INFINITY;
    let bestTime = '';
    for (const [hash, da] of aMap.entries()) {
        const db = bMap.get(hash);
        if (db === undefined) continue;
        const score = da + db;
        const createdAt = getWamCommit(dir, hash)?.createdAt || '';
        if (score < bestScore) {
            best = hash;
            bestScore = score;
            bestTime = createdAt;
            continue;
        }
        if (score === bestScore && createdAt && createdAt > bestTime) {
            best = hash;
            bestTime = createdAt;
        }
    }
    return best;
}

function threeWayMergeString(
    field: string,
    base: string,
    ours: string,
    theirs: string,
    oursUpdatedAt: string | undefined,
    theirsUpdatedAt: string | undefined,
    conflicts: string[]
): string {
    if (ours === theirs) return ours;
    if (ours === base) return theirs;
    if (theirs === base) return ours;
    conflicts.push(field);
    const chosen = chooseNewerIso(ours, oursUpdatedAt, theirs, theirsUpdatedAt);
    return chosen;
}

function normalizeItemForCompare(it: any): { text: string; status: TrackerItemStatus; updatedAt: string } | null {
    if (!it) return null;
    const text = String(it.text || '').trim();
    if (!text) return null;
    const status: TrackerItemStatus = it.status === 'doing' || it.status === 'done' ? it.status : 'todo';
    const updatedAt = typeof it.updatedAt === 'string' ? it.updatedAt : '';
    return { text, status, updatedAt };
}

function threeWayMergePlanItems(
    baseItems: TrackerItem[],
    ourItems: TrackerItem[],
    theirItems: TrackerItem[],
    conflicts: string[]
): TrackerItem[] {
    const toMap = (items: TrackerItem[]) => {
        const map = new Map<string, { text: string; status: TrackerItemStatus; updatedAt: string; raw: TrackerItem }>();
        for (const raw of items || []) {
            const normalized = normalizeItemForCompare(raw);
            if (!normalized) continue;
            const key = normalized.text.toLowerCase();
            map.set(key, { ...normalized, raw });
        }
        return map;
    };
    const base = toMap(baseItems);
    const ours = toMap(ourItems);
    const theirs = toMap(theirItems);
    const keys = new Set<string>([...base.keys(), ...ours.keys(), ...theirs.keys()]);
    const out: TrackerItem[] = [];
    for (const key of Array.from(keys).sort()) {
        const b = base.get(key);
        const o = ours.get(key);
        const t = theirs.get(key);
        if (!o && !t) continue;
        if (!b) {
            if (o && !t) {
                out.push(o.raw);
                continue;
            }
            if (!o && t) {
                out.push(t.raw);
                continue;
            }
            if (o && t) {
                if (o.status === t.status) {
                    out.push(chooseNewerIso(o.raw, o.updatedAt, t.raw, t.updatedAt));
                } else {
                    conflicts.push(`plan.item:${o.text}`);
                    const better = statusRank(o.status) >= statusRank(t.status) ? o : t;
                    const newer = chooseNewerIso(o, o.updatedAt, t, t.updatedAt);
                    out.push({ ...newer.raw, status: better.status, updatedAt: newer.updatedAt || nowIso(), id: newer.raw.id || createProjectId() });
                }
                continue;
            }
        } else {
            const baseStatus = b.status;
            const baseText = b.text;
            const oEq = !!o && o.status === baseStatus && o.text === baseText;
            const tEq = !!t && t.status === baseStatus && t.text === baseText;
            if (oEq && t) {
                out.push(t.raw);
                continue;
            }
            if (tEq && o) {
                out.push(o.raw);
                continue;
            }
            if (o && t) {
                if (o.status === t.status) {
                    out.push(chooseNewerIso(o.raw, o.updatedAt, t.raw, t.updatedAt));
                } else {
                    conflicts.push(`plan.item:${o.text}`);
                    const better = statusRank(o.status) >= statusRank(t.status) ? o : t;
                    const newer = chooseNewerIso(o, o.updatedAt, t, t.updatedAt);
                    out.push({ ...newer.raw, status: better.status, updatedAt: newer.updatedAt || nowIso(), id: newer.raw.id || createProjectId() });
                }
                continue;
            }
            if (o && !t) {
                out.push(o.raw);
                continue;
            }
            if (!o && t) {
                out.push(t.raw);
                continue;
            }
        }
    }
    // Keep order: done -> doing -> todo, then text.
    out.sort((a, b) => {
        const ra = statusRank(a.status);
        const rb = statusRank(b.status);
        if (ra !== rb) return rb - ra;
        return String(a.text || '').localeCompare(String(b.text || ''));
    });
    return out;
}

function threeWayMergeMemory(
    base: ProjectMemoryStore,
    ours: ProjectMemoryStore,
    theirs: ProjectMemoryStore,
    conflicts: string[]
): ProjectMemoryStore {
    const out: ProjectMemoryStore = { memories: {}, timeline: [] };
    const bMem = base?.memories || {};
    const oMem = ours?.memories || {};
    const tMem = theirs?.memories || {};
    const keys = new Set<string>([...Object.keys(bMem), ...Object.keys(oMem), ...Object.keys(tMem)]);
    for (const key of Array.from(keys).sort()) {
        const b = (bMem as any)[key];
        const o = (oMem as any)[key];
        const t = (tMem as any)[key];
        if (!o && !t) continue;
        if (!b) {
            if (o && !t) out.memories[key] = o;
            else if (!o && t) out.memories[key] = t;
            else if (o && t) {
                if (o.content === t.content && o.kind === t.kind) out.memories[key] = chooseNewerIso(o, o.updatedAt, t, t.updatedAt);
                else {
                    conflicts.push(`memory:${key}`);
                    out.memories[key] = chooseNewerIso(o, o.updatedAt, t, t.updatedAt);
                }
            }
            continue;
        }
        const bSig = `${b.kind || ''}|${b.content || ''}`;
        const oSig = o ? `${o.kind || ''}|${o.content || ''}` : '';
        const tSig = t ? `${t.kind || ''}|${t.content || ''}` : '';
        if (o && t) {
            if (oSig == tSig) out.memories[key] = chooseNewerIso(o, o.updatedAt, t, t.updatedAt);
            else if (oSig == bSig) out.memories[key] = t;
            else if (tSig == bSig) out.memories[key] = o;
            else {
                conflicts.push(`memory:${key}`);
                out.memories[key] = chooseNewerIso(o, o.updatedAt, t, t.updatedAt);
            }
        } else if (o && !t) {
            out.memories[key] = o;
        } else if (!o && t) {
            out.memories[key] = t;
        }
    }
    out.timeline = Array.isArray(ours.timeline) ? [...ours.timeline] : [];
    if (Array.isArray(theirs.timeline)) out.timeline.push(...theirs.timeline);
    out.timeline = out.timeline
        .filter((e) => e && typeof e === 'object')
        .sort((a: any, b: any) => String(b.at || '').localeCompare(String(a.at || '')))
        .slice(0, 800);
    return out;
}

function mergeProjectTrackerState(current: ProjectTracker, other: ProjectTracker, rootPath: string): ProjectTracker {
    const merged: ProjectTracker = JSON.parse(JSON.stringify(current));
    merged.rootPath = rootPath;
    merged.name = current.name || other.name || getProjectNameFromPath(rootPath);

    merged.overview = chooseNewerIso(current.overview, current.overview?.updatedAt, other.overview, other.overview?.updatedAt);
    merged.prd = chooseNewerIso(current.prd, current.prd?.updatedAt, other.prd, other.prd?.updatedAt);
    merged.walkthrough = chooseNewerIso(current.walkthrough, current.walkthrough?.updatedAt, other.walkthrough, other.walkthrough?.updatedAt);

    // Plan: merge summary by newest; items merged by normalized text + best status/newest.
    merged.plan.summary = chooseNewerIso(current.plan.summary, current.updatedAt, other.plan.summary, other.updatedAt);
    const byKey = new Map<string, TrackerItem>();
    const add = (it: any) => {
        if (!it || typeof it !== 'object') return;
        const text = String(it.text || '').trim();
        if (!text) return;
        const key = text.toLowerCase();
        const existing = byKey.get(key);
        const normalized: TrackerItem = {
            id: typeof it.id === 'string' ? it.id : createProjectId(),
            text,
            status: it.status === 'doing' || it.status === 'done' ? it.status : 'todo',
            updatedAt: typeof it.updatedAt === 'string' ? it.updatedAt : nowIso()
        };
        if (!existing) {
            byKey.set(key, normalized);
            return;
        }
        const betterStatus = statusRank(normalized.status) > statusRank(existing.status) ? normalized.status : existing.status;
        const newer = chooseNewerIso(existing, existing.updatedAt, normalized, normalized.updatedAt);
        byKey.set(key, { ...newer, status: betterStatus });
    };
    for (const it of current.plan.items || []) add(it);
    for (const it of other.plan.items || []) add(it);
    merged.plan.items = Array.from(byKey.values()).sort((a, b) => statusRank(b.status) - statusRank(a.status));

    // Stats: take max to keep monotonic.
    merged.stats = normalizeTrackerStats({
        prdUpdates: Math.max(current.stats?.prdUpdates || 0, other.stats?.prdUpdates || 0),
        prdApprovals: Math.max(current.stats?.prdApprovals || 0, other.stats?.prdApprovals || 0),
        overviewUpdates: Math.max(current.stats?.overviewUpdates || 0, other.stats?.overviewUpdates || 0),
        planUpdates: Math.max(current.stats?.planUpdates || 0, other.stats?.planUpdates || 0),
        walkthroughUpdates: Math.max(current.stats?.walkthroughUpdates || 0, other.stats?.walkthroughUpdates || 0),
        updatedAt: nowIso()
    });
    merged.updatedAt = nowIso();
    return merged;
}

function mergeProjectMemoryState(current: ProjectMemoryStore, other: ProjectMemoryStore): ProjectMemoryStore {
    const merged: ProjectMemoryStore = { memories: {}, timeline: [] };
    const allKeys = new Set<string>([...Object.keys(current.memories || {}), ...Object.keys(other.memories || {})]);
    for (const key of allKeys) {
        const a = current.memories?.[key];
        const b = other.memories?.[key];
        if (!a && b) merged.memories[key] = b;
        else if (a && !b) merged.memories[key] = a;
        else if (a && b) {
            const chosen = chooseNewerIso(a, a.updatedAt, b, b.updatedAt);
            const tags = Array.from(new Set([...(a.tags || []), ...(b.tags || [])]));
            const links = Array.from(new Set([...(a.links || []), ...(b.links || [])]));
            merged.memories[key] = { ...chosen, tags, links };
        }
    }
    merged.timeline = Array.isArray(current.timeline) ? [...current.timeline] : [];
    if (Array.isArray(other.timeline)) {
        merged.timeline.push(...other.timeline);
    }
    merged.timeline = merged.timeline
        .filter((e) => e && typeof e === 'object')
        .sort((a: any, b: any) => String(b.at || '').localeCompare(String(a.at || '')))
        .slice(0, 800);
    return merged;
}

async function handleWamMerge(args: any): Promise<any> {
    const lang = getUiLanguage();
    const otherSpec = typeof args?.otherHash === 'string' ? args.otherHash.trim() : '';
    const message = typeof args?.message === 'string' ? args.message.trim() : '';
    if (!otherSpec || !message) {
        throw new Error(lang === 'en' ? 'wam_merge requires otherHash and message.' : 'wam_merge 需要 otherHash 和 message。');
    }
    const author: 'auto' | 'ai' | 'user' = args?.author === 'ai' || args?.author === 'user' ? args.author : 'auto';
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const state = buildCurrentProjectWamState(rootPath);
    if (!state.wamDir) {
        const text = lang === 'en' ? 'WAM(project): no history directory found yet.' : 'WAM（项目）：尚未找到历史目录。';
        return { content: [{ type: 'text', text }] };
    }

    ensureWamRepoLayout(state.wamDir);
    const oursHeadInfo = resolveWamHeadHash(state.wamDir);
    const oursHash = oursHeadInfo.hash;
	    if (!oursHash) {
	        const text =
	            lang === 'en'
	                ? 'WAM(project): no HEAD commit yet. Call wam_commit() first.'
	                : 'WAM（项目）：尚无 HEAD 提交，请先调用 wam_commit()。';
	        return { content: [{ type: 'text', text }] };
	    }

    const theirsHash = resolveWamHashFromSpecifier(state.wamDir, otherSpec);
    const otherCommit = readWamCommit(state.wamDir, theirsHash);
    const otherTrackerSnap = readWamSnapshot(state.wamDir, theirsHash, 'tracker');
    const otherMemorySnap = readWamSnapshot(state.wamDir, theirsHash, 'memory');
    if (!theirsHash || !otherCommit || !otherTrackerSnap?.tracker || !otherMemorySnap?.memory) {
        const text =
            lang === 'en'
                ? `WAM(project): other commit not found or missing snapshot: ${otherSpec}`
                : `WAM（项目）：未找到另一提交或快照缺失：${otherSpec}`;
        return { content: [{ type: 'text', text }] };
    }

    const snapRoot = String(otherTrackerSnap.rootPath || '');
    if (snapRoot && normalizePathForCompare(snapRoot) !== normalizePathForCompare(state.rootPath)) {
        const text =
            lang === 'en'
                ? `Refusing to merge: other commit rootPath differs (other=${snapRoot}, current=${state.rootPath})`
                : `拒绝合并：另一提交 rootPath 不匹配（other=${snapRoot}，current=${state.rootPath}）`;
        return { content: [{ type: 'text', text }] };
    }

    const baseHash = findMergeBase(state.wamDir, oursHash, theirsHash);
    const baseTrackerSnap = baseHash ? readWamSnapshot(state.wamDir, baseHash, 'tracker') : null;
    const baseMemorySnap = baseHash ? readWamSnapshot(state.wamDir, baseHash, 'memory') : null;

    const conflicts: string[] = [];
    const baseTracker = normalizeTrackerForMerge(baseTrackerSnap?.tracker || {}, state.rootPath, state.projectId);
    const oursTracker = normalizeTrackerForMerge(state.project, state.rootPath, state.projectId);
    const theirsTracker = normalizeTrackerForMerge(otherTrackerSnap.tracker, state.rootPath, state.projectId);
    const mergedProject = mergeProjectTrackerThreeWay(baseTracker, oursTracker, theirsTracker, state.rootPath, conflicts);

    const baseMemory = normalizeMemoryForMerge(baseMemorySnap?.memory);
    const oursMemory = normalizeMemoryForMerge(state.memoryProject);
    const theirsMemory = normalizeMemoryForMerge(otherMemorySnap.memory);
    const mergedMemory = threeWayMergeMemory(baseMemory, oursMemory, theirsMemory, conflicts);

    const trackerData = loadTrackerData();
    trackerData.projects[state.rootPath] = mergedProject;
    trackerData.activeProject = state.rootPath;
    saveTrackerData(trackerData);
    const memoryData = loadMemoryData();
    memoryData.projects[state.rootPath] = mergedMemory;
    saveMemoryData(memoryData);

    try {
        syncProjectArtifacts(mergedProject);
        syncMemoryArtifacts(mergedProject, mergedMemory);
    } catch (e: any) {
        outputChannel?.appendLine(`WAM merge artifact sync failed: ${e?.message ?? String(e)}`);
    }
    sidebarProvider?.postMessage({ type: 'tracker', data: buildTrackerSnapshot(mergedProject) });
    refreshOpenPanels(mergedProject);

    try {
        appendWalkthroughEntry(
            mergedProject,
            lang === 'en'
                ? `Merged WAM commit ${theirsHash.slice(0, 10)} (base=${baseHash ? baseHash.slice(0, 10) : 'none'})${conflicts.length ? ` with conflicts: ${conflicts.join(', ')}` : '.'}`
                : `已合并 WAM 提交 ${theirsHash.slice(0, 10)}（base=${baseHash ? baseHash.slice(0, 10) : '无'}）${conflicts.length ? `，存在冲突：${conflicts.join('，')}` : '。'}`,
            lang
        );
    } catch {
        // ignore
    }

    const commitResult = commitProjectWam(message, author, state.rootPath, [oursHash, theirsHash], { conflicts });

    const text =
        lang === 'en'
            ? `WAM(project) merged ${theirsHash} (base=${baseHash || 'none'}) → new commit ${commitResult.hash || '(none)'}${conflicts.length ? ` (conflicts: ${conflicts.length})` : ''}`
            : `WAM（项目）已合并 ${theirsHash}（base=${baseHash || '无'}）→ 新提交 ${commitResult.hash || '（无）'}${conflicts.length ? `（冲突：${conflicts.length}）` : ''}`;
    return { content: [{ type: 'text', text }] };
}

type WamStashEntry = {
    id: string;
    createdAt: string;
    message: string;
    scope: 'project' | 'global';
    projectId?: string;
    rootPath?: string;
    baseHead?: string;
    baseRef?: string;
    digest: string;
    snapshots: Record<string, any>;
};

function normalizeWamSpec(value: any, fallback: string): string {
    const raw = typeof value === 'string' ? value.trim() : '';
    return raw || fallback;
}

function isWorkingSpec(spec: string): boolean {
    const s = String(spec || '').trim().toLowerCase();
    return s === 'working' || s === 'worktree' || s === 'work' || s === 'current';
}

function resolveWamDirForScope(
    scope: 'project' | 'global',
    rootPathOverride?: string
): { dir: string; rootPath?: string; projectId?: string } | null {
    if (scope === 'global') {
        const dir = resolveGlobalWamDir();
        if (!dir) return null;
        ensureWamRepoLayout(dir);
        return { dir };
    }
    const state = buildCurrentProjectWamState(rootPathOverride);
    if (!state.wamDir) return null;
    ensureWamRepoLayout(state.wamDir);
    return { dir: state.wamDir, rootPath: state.rootPath, projectId: state.projectId };
}

function readWamStash(dir: string, id: string): WamStashEntry | null {
    if (!id) return null;
    return readJsonFileSafe<WamStashEntry>(path.join(dir, WAM_STASH_DIR, `${id}.json`));
}

function listWamStashes(dir: string): WamStashEntry[] {
    try {
        const stashDir = path.join(dir, WAM_STASH_DIR);
        if (!fs.existsSync(stashDir)) return [];
        const entries = fs.readdirSync(stashDir).filter((n) => n.endsWith('.json'));
        const stashes: WamStashEntry[] = [];
        for (const entry of entries) {
            const stash = readJsonFileSafe<WamStashEntry>(path.join(stashDir, entry));
            if (stash?.id) stashes.push(stash);
        }
        stashes.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        return stashes;
    } catch {
        return [];
    }
}

async function handleWamBranch(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope = parseWamScope(args);
    const action = args?.action === 'create' || args?.action === 'delete' ? args.action : 'list';
    const name = typeof args?.name === 'string' ? args.name.trim() : '';
    const startPoint = typeof args?.startPoint === 'string' ? args.startPoint.trim() : '';
    const force = args?.force === true;
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;

    const resolved = resolveWamDirForScope(scope, rootPath);
    if (!resolved) {
        const text = lang === 'en' ? 'WAM: no history directory found yet.' : 'WAM：尚未找到历史目录。';
        return { content: [{ type: 'text', text }] };
    }
    const dir = resolved.dir;
    const head = readWamHead(dir);
    const currentBranch = currentWamBranchName(head);

    if (action === 'list') {
        const branches = listWamRefs(dir, 'heads');
        const lines = branches.map((b) => `${b.name === currentBranch ? '*' : ' '} ${b.name}  ${String(b.hash || '').slice(0, 10) || '(none)'}`);
        const text =
            lang === 'en'
                ? `WAM branches (${scope}):\n${lines.join('\n') || '(empty)'}`
                : `WAM 分支（${scope === 'global' ? '全局' : '项目'}）：\n${lines.join('\n') || '（空）'}`;
        return { content: [{ type: 'text', text }] };
    }

    if (!name || !isValidWamRefName(name)) {
        throw new Error(lang === 'en' ? 'wam_branch requires a valid name.' : 'wam_branch 需要有效的 name。');
    }
    const ref = `refs/heads/${name}`;

    if (action === 'create') {
        const existing = readWamRef(dir, ref);
        if (existing && !force) {
            throw new Error(lang === 'en' ? `Branch already exists: ${name}` : `分支已存在：${name}`);
        }
        const target = startPoint ? resolveWamHashFromSpecifier(dir, startPoint) : resolveWamHeadHash(dir).hash;
        if (!target || !readWamCommit(dir, target)) {
            throw new Error(lang === 'en' ? `Invalid startPoint: ${startPoint || 'HEAD'}` : `无效起点：${startPoint || 'HEAD'}`);
        }
        writeWamRef(dir, ref, target);
        const text = lang === 'en' ? `WAM branch created: ${name} -> ${target}` : `已创建分支：${name} -> ${target}`;
        return { content: [{ type: 'text', text }] };
    }

    if (action === 'delete') {
        if (name === currentBranch) {
            throw new Error(lang === 'en' ? 'Refusing to delete the current branch.' : '拒绝删除当前分支。');
        }
        const ok = deleteWamRef(dir, ref);
        const text = ok
            ? (lang === 'en' ? `WAM branch deleted: ${name}` : `已删除分支：${name}`)
            : (lang === 'en' ? `WAM branch not found: ${name}` : `未找到分支：${name}`);
        return { content: [{ type: 'text', text }] };
    }

    return { content: [{ type: 'text', text: lang === 'en' ? 'Unknown branch action.' : '未知分支操作。' }] };
}

async function handleWamTag(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope = parseWamScope(args);
    const action = args?.action === 'create' || args?.action === 'delete' ? args.action : 'list';
    const name = typeof args?.name === 'string' ? args.name.trim() : '';
    const targetSpec = typeof args?.target === 'string' ? args.target.trim() : '';
    const force = args?.force === true;
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;

    const resolved = resolveWamDirForScope(scope, rootPath);
    if (!resolved) {
        const text = lang === 'en' ? 'WAM: no history directory found yet.' : 'WAM：尚未找到历史目录。';
        return { content: [{ type: 'text', text }] };
    }
    const dir = resolved.dir;

    if (action === 'list') {
        const tags = listWamRefs(dir, 'tags');
        const lines = tags.map((t) => `${t.name}  ${String(t.hash || '').slice(0, 10) || '(none)'}`);
        const text =
            lang === 'en'
                ? `WAM tags (${scope}):\n${lines.join('\n') || '(empty)'}`
                : `WAM 标签（${scope === 'global' ? '全局' : '项目'}）：\n${lines.join('\n') || '（空）'}`;
        return { content: [{ type: 'text', text }] };
    }

    if (!name || !isValidWamRefName(name)) {
        throw new Error(lang === 'en' ? 'wam_tag requires a valid name.' : 'wam_tag 需要有效的 name。');
    }
    const ref = `refs/tags/${name}`;

    if (action === 'create') {
        const existing = readWamRef(dir, ref);
        if (existing && !force) {
            throw new Error(lang === 'en' ? `Tag already exists: ${name}` : `标签已存在：${name}`);
        }
        const target = resolveWamHashFromSpecifier(dir, targetSpec || 'HEAD');
        if (!target || !readWamCommit(dir, target)) {
            throw new Error(lang === 'en' ? `Invalid target: ${targetSpec || 'HEAD'}` : `无效目标：${targetSpec || 'HEAD'}`);
        }
        writeWamRef(dir, ref, target);
        const text = lang === 'en' ? `WAM tag created: ${name} -> ${target}` : `已创建标签：${name} -> ${target}`;
        return { content: [{ type: 'text', text }] };
    }

    if (action === 'delete') {
        const ok = deleteWamRef(dir, ref);
        const text = ok
            ? (lang === 'en' ? `WAM tag deleted: ${name}` : `已删除标签：${name}`)
            : (lang === 'en' ? `WAM tag not found: ${name}` : `未找到标签：${name}`);
        return { content: [{ type: 'text', text }] };
    }

    return { content: [{ type: 'text', text: lang === 'en' ? 'Unknown tag action.' : '未知标签操作。' }] };
}

function diffPlanItems(a: TrackerItem[], b: TrackerItem[]) {
    const toMap = (items: TrackerItem[]) => {
        const m = new Map<string, TrackerItem>();
        for (const it of items || []) {
            if (!it) continue;
            const text = String(it.text || '').trim();
            if (!text) continue;
            m.set(text.toLowerCase(), it);
        }
        return m;
    };
    const am = toMap(a);
    const bm = toMap(b);
    const keys = new Set<string>([...am.keys(), ...bm.keys()]);
    const added: string[] = [];
    const removed: string[] = [];
    const changed: Array<{ text: string; from: string; to: string }> = [];
    for (const key of Array.from(keys).sort()) {
        const ai = am.get(key);
        const bi = bm.get(key);
        if (!ai && bi) added.push(bi.text);
        else if (ai && !bi) removed.push(ai.text);
        else if (ai && bi) {
            const as = ai.status || 'todo';
            const bs = bi.status || 'todo';
            if (as !== bs) changed.push({ text: bi.text, from: as, to: bs });
        }
    }
    return { added, removed, changed };
}

function diffMemoryKeys(a: ProjectMemoryStore, b: ProjectMemoryStore) {
    const aMem = a?.memories || {};
    const bMem = b?.memories || {};
    const keys = new Set<string>([...Object.keys(aMem), ...Object.keys(bMem)]);
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];
    for (const key of Array.from(keys).sort()) {
        const av: any = (aMem as any)[key];
        const bv: any = (bMem as any)[key];
        if (!av && bv) added.push(key);
        else if (av && !bv) removed.push(key);
        else if (av && bv) {
            const aSig = `${av.kind || ''}|${av.content || ''}|${av.updatedAt || ''}`;
            const bSig = `${bv.kind || ''}|${bv.content || ''}|${bv.updatedAt || ''}`;
            if (aSig !== bSig) changed.push(key);
        }
    }
    return { added, removed, changed };
}

async function handleWamDiff(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope = parseWamScope(args);
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const aSpec = normalizeWamSpec(args?.a, 'HEAD');
    const bSpec = normalizeWamSpec(args?.b, 'WORKING');

    if (scope === 'global') {
        const dir = resolveGlobalWamDir();
        if (!dir) {
            const text = lang === 'en' ? 'WAM(global): no history directory found yet.' : 'WAM（全局）：尚未找到历史目录。';
            return { content: [{ type: 'text', text }] };
        }
        ensureWamRepoLayout(dir);
        const current = loadGlobalMemoryData();
        const resolveGlobal = (spec: string) => {
            if (isWorkingSpec(spec)) return { label: 'WORKING', globalMemory: current };
            const hash = resolveWamHashFromSpecifier(dir, spec);
            const snap = readWamSnapshot(dir, hash, 'global_memory');
            return { label: hash || spec, globalMemory: snap?.globalMemory || { schemaVersion: 1, memories: {}, timeline: [] } };
        };
        const left = resolveGlobal(aSpec);
        const right = resolveGlobal(bSpec);
        const diff = diffMemoryKeys(normalizeMemoryForMerge({ memories: left.globalMemory.memories, timeline: left.globalMemory.timeline }), normalizeMemoryForMerge({ memories: right.globalMemory.memories, timeline: right.globalMemory.timeline }));
        const text = lang === 'en' ? `WAM diff (global): ${left.label} -> ${right.label}` : `WAM 对比（全局）：${left.label} -> ${right.label}`;
        return { content: [{ type: 'text', text }, { type: 'text', text: `WAM_DIFF_JSON:\n${JSON.stringify({ scope, a: left.label, b: right.label, memory: diff }, null, 2)}` }] };
    }

    const state = buildCurrentProjectWamState(rootPath);
    if (!state.wamDir) {
        const text = lang === 'en' ? 'WAM(project): no history directory found yet.' : 'WAM（项目）：尚未找到历史目录。';
        return { content: [{ type: 'text', text }] };
    }
    ensureWamRepoLayout(state.wamDir);

    const resolveProject = (spec: string) => {
        if (isWorkingSpec(spec)) return { label: 'WORKING', tracker: state.project, memory: state.memoryProject };
        const hash = resolveWamHashFromSpecifier(state.wamDir!, spec);
        const t = readWamSnapshot(state.wamDir!, hash, 'tracker');
        const m = readWamSnapshot(state.wamDir!, hash, 'memory');
        return { label: hash || spec, tracker: t?.tracker || {}, memory: m?.memory || { memories: {}, timeline: [] } };
    };
    const left = resolveProject(aSpec);
    const right = resolveProject(bSpec);

    const trackerDiff = {
        overviewChanged: String(left.tracker?.overview?.content || '') !== String(right.tracker?.overview?.content || ''),
        prdChanged: String(left.tracker?.prd?.content || '') !== String(right.tracker?.prd?.content || '') || String(left.tracker?.prd?.status || '') !== String(right.tracker?.prd?.status || ''),
        planSummaryChanged: String(left.tracker?.plan?.summary || '') !== String(right.tracker?.plan?.summary || ''),
        planItems: diffPlanItems(left.tracker?.plan?.items || [], right.tracker?.plan?.items || []),
        walkthroughChanged: String(left.tracker?.walkthrough?.content || '') !== String(right.tracker?.walkthrough?.content || '')
    };
    const memoryDiff = diffMemoryKeys(normalizeMemoryForMerge(left.memory), normalizeMemoryForMerge(right.memory));

    const text = lang === 'en' ? `WAM diff (project): ${left.label} -> ${right.label}` : `WAM 对比（项目）：${left.label} -> ${right.label}`;
    return { content: [{ type: 'text', text }, { type: 'text', text: `WAM_DIFF_JSON:\n${JSON.stringify({ scope, a: left.label, b: right.label, tracker: trackerDiff, memory: memoryDiff }, null, 2)}` }] };
}

async function handleWamReset(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope = parseWamScope(args);
    const mode = args?.mode === 'hard' ? 'hard' : 'hard';
    const targetSpec = typeof args?.target === 'string' ? args.target.trim() : '';
    if (!targetSpec) {
        throw new Error(lang === 'en' ? 'wam_reset requires target.' : 'wam_reset 需要 target。');
    }
    if (mode !== 'hard') {
        throw new Error(lang === 'en' ? 'Only hard reset is supported.' : '仅支持 hard 重置。');
    }

    if (scope === 'global') {
        const dir = resolveGlobalWamDir();
        if (!dir) {
            const text = lang === 'en' ? 'WAM(global): no history directory found yet.' : 'WAM（全局）：尚未找到历史目录。';
            return { content: [{ type: 'text', text }] };
        }
        ensureWamRepoLayout(dir);
        const head = readWamHead(dir);
        const currentRef = head?.ref?.startsWith('refs/heads/') ? head.ref : undefined;
        const resolvedHash = resolveWamHashFromSpecifier(dir, targetSpec);
        const commit = readWamCommit(dir, resolvedHash);
        const snap = readWamSnapshot(dir, resolvedHash, 'global_memory');
        if (!resolvedHash || !commit || !snap?.globalMemory) {
            const text = lang === 'en' ? `WAM(global): commit not found: ${targetSpec}` : `WAM（全局）：未找到提交：${targetSpec}`;
            return { content: [{ type: 'text', text }] };
        }
        saveGlobalMemoryData(snap.globalMemory);
        const digest = computeGlobalWamDigest(snap.globalMemory);
        writeWamHead(dir, { head: resolvedHash, digest, updatedAt: nowIsoNano(), ref: currentRef });
        if (currentRef) writeWamRef(dir, currentRef, resolvedHash);
        const text = lang === 'en' ? `WAM(global) reset --hard to ${resolvedHash}` : `WAM（全局）已 hard 重置到 ${resolvedHash}`;
        return { content: [{ type: 'text', text }] };
    }

    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const state = buildCurrentProjectWamState(rootPath);
    if (!state.wamDir) {
        const text = lang === 'en' ? 'WAM(project): no history directory found yet.' : 'WAM（项目）：尚未找到历史目录。';
        return { content: [{ type: 'text', text }] };
    }
    ensureWamRepoLayout(state.wamDir);
    const head = readWamHead(state.wamDir);
    const currentRef = head?.ref?.startsWith('refs/heads/') ? head.ref : undefined;
    const resolvedHash = resolveWamHashFromSpecifier(state.wamDir, targetSpec);
    const commit = readWamCommit(state.wamDir, resolvedHash);
    const trackerSnap = readWamSnapshot(state.wamDir, resolvedHash, 'tracker');
    const memorySnap = readWamSnapshot(state.wamDir, resolvedHash, 'memory');
    if (!resolvedHash || !commit || !trackerSnap?.tracker || !memorySnap?.memory) {
        const text = lang === 'en' ? `WAM(project): commit not found: ${targetSpec}` : `WAM（项目）：未找到提交：${targetSpec}`;
        return { content: [{ type: 'text', text }] };
    }
    const snapRoot = String(trackerSnap.rootPath || '');
    if (snapRoot && normalizePathForCompare(snapRoot) !== normalizePathForCompare(state.rootPath)) {
        const text =
            lang === 'en'
                ? `Refusing to reset: commit rootPath differs (commit=${snapRoot}, current=${state.rootPath})`
                : `拒绝重置：提交 rootPath 不匹配（commit=${snapRoot}，current=${state.rootPath}）`;
        return { content: [{ type: 'text', text }] };
    }

    const trackerData = loadTrackerData();
    trackerData.projects[state.rootPath] = trackerSnap.tracker;
    trackerData.activeProject = state.rootPath;
    saveTrackerData(trackerData);
    const memoryData = loadMemoryData();
    memoryData.projects[state.rootPath] = memorySnap.memory;
    saveMemoryData(memoryData);

    try {
        appendWalkthroughEntry(trackerSnap.tracker, lang === 'en' ? `WAM reset --hard to ${resolvedHash.slice(0, 10)}.` : `WAM 已 hard 重置到 ${resolvedHash.slice(0, 10)}。`, lang);
    } catch {
        // ignore
    }
    try {
        syncProjectArtifacts(trackerSnap.tracker);
        syncMemoryArtifacts(trackerSnap.tracker, memorySnap.memory);
    } catch (e: any) {
        outputChannel?.appendLine(`WAM reset artifact sync failed: ${e?.message ?? String(e)}`);
    }
    sidebarProvider?.postMessage({ type: 'tracker', data: buildTrackerSnapshot(trackerSnap.tracker) });
    refreshOpenPanels(trackerSnap.tracker);

    const digest = computeProjectWamDigest(trackerSnap.tracker, memorySnap.memory);
    writeWamHead(state.wamDir, { head: resolvedHash, digest, updatedAt: nowIsoNano(), ref: currentRef });
    if (currentRef) writeWamRef(state.wamDir, currentRef, resolvedHash);

    const text = lang === 'en' ? `WAM(project) reset --hard to ${resolvedHash}` : `WAM（项目）已 hard 重置到 ${resolvedHash}`;
    return { content: [{ type: 'text', text }] };
}

async function handleWamStash(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope = parseWamScope(args);
    const action = args?.action === 'push' || args?.action === 'apply' || args?.action === 'pop' || args?.action === 'drop' ? args.action : 'list';
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const resolved = resolveWamDirForScope(scope, rootPath);
    if (!resolved) {
        const text = lang === 'en' ? 'WAM: no history directory found yet.' : 'WAM：尚未找到历史目录。';
        return { content: [{ type: 'text', text }] };
    }
    const dir = resolved.dir;
    ensureWamRepoLayout(dir);

    const headInfo = resolveWamHeadHash(dir);
    const head = headInfo.head;
    const headHash = headInfo.hash;
    const currentRef = head?.ref?.startsWith('refs/heads/') ? head.ref : undefined;

    const stashes = listWamStashes(dir);

    const resolveLatestId = () => {
        const provided = typeof args?.id === 'string' ? args.id.trim() : '';
        if (provided) return provided;
        return stashes[0]?.id || '';
    };

    if (action === 'list') {
        const lines = stashes.map((s) => `${s.id.slice(0, 10)}  ${s.createdAt}  ${s.message || ''}`);
        const text =
            lang === 'en'
                ? `WAM stash (${scope}):\n${lines.join('\n') || '(empty)'}`
                : `WAM 暂存（${scope === 'global' ? '全局' : '项目'}）：\n${lines.join('\n') || '（空）'}`;
        return { content: [{ type: 'text', text }] };
    }

	    if (action === 'push') {
	        if (!headHash) {
	            const text = lang === 'en' ? 'WAM stash: no HEAD commit yet. Call wam_commit() first.' : 'WAM 暂存：尚无 HEAD 提交，请先调用 wam_commit()。';
	            return { content: [{ type: 'text', text }] };
	        }
        const msg = typeof args?.message === 'string' ? args.message.trim() : '';
        if (scope === 'global') {
            const current = loadGlobalMemoryData();
            const digest = computeGlobalWamDigest(current);
            const createdAt = nowIsoNano();
            const id = sha256Hex(`${createdAt}\n${msg}\n${digest}`);
            const entry: WamStashEntry = {
                id,
                createdAt,
                message: msg || 'stash',
                scope,
                baseHead: headHash,
                baseRef: currentRef,
                digest,
                snapshots: { global_memory: { schemaVersion: 1, globalMemory: current } }
            };
            writeJsonFileSafe(path.join(dir, WAM_STASH_DIR, `${id}.json`), entry);
            // Reset working to HEAD snapshot (clean).
            const headSnap = readWamSnapshot(dir, headHash, 'global_memory');
            if (headSnap?.globalMemory) {
                saveGlobalMemoryData(headSnap.globalMemory);
            }
            const text = lang === 'en' ? `WAM stash pushed: ${id}` : `WAM 暂存已保存：${id}`;
            return { content: [{ type: 'text', text }] };
        }

        const state = buildCurrentProjectWamState(rootPath);
        if (!state.wamDir) {
            const text = lang === 'en' ? 'WAM(project): no history directory found yet.' : 'WAM（项目）：尚未找到历史目录。';
            return { content: [{ type: 'text', text }] };
        }
        const digest = computeProjectWamDigest(state.project, state.memoryProject);
        const createdAt = nowIsoNano();
        const id = sha256Hex(`${createdAt}\n${msg}\n${digest}`);
        const entry: WamStashEntry = {
            id,
            createdAt,
            message: msg || 'stash',
            scope,
            projectId: state.projectId,
            rootPath: state.rootPath,
            baseHead: headHash,
            baseRef: currentRef,
            digest,
            snapshots: {
                tracker: { schemaVersion: 1, projectId: state.projectId, rootPath: state.rootPath, tracker: state.project },
                memory: { schemaVersion: 1, projectId: state.projectId, rootPath: state.rootPath, memory: state.memoryProject }
            }
        };
        writeJsonFileSafe(path.join(dir, WAM_STASH_DIR, `${id}.json`), entry);

        // Reset working to HEAD snapshot (clean).
        const headTrackerSnap = readWamSnapshot(state.wamDir, headHash, 'tracker');
        const headMemorySnap = readWamSnapshot(state.wamDir, headHash, 'memory');
        if (headTrackerSnap?.tracker && headMemorySnap?.memory) {
            const trackerData = loadTrackerData();
            trackerData.projects[state.rootPath] = headTrackerSnap.tracker;
            trackerData.activeProject = state.rootPath;
            saveTrackerData(trackerData);
            const memoryData = loadMemoryData();
            memoryData.projects[state.rootPath] = headMemorySnap.memory;
            saveMemoryData(memoryData);
            try {
                syncProjectArtifacts(headTrackerSnap.tracker);
                syncMemoryArtifacts(headTrackerSnap.tracker, headMemorySnap.memory);
            } catch {
                // ignore
            }
            sidebarProvider?.postMessage({ type: 'tracker', data: buildTrackerSnapshot(headTrackerSnap.tracker) });
            refreshOpenPanels(headTrackerSnap.tracker);
        }

        const text = lang === 'en' ? `WAM stash pushed: ${id}` : `WAM 暂存已保存：${id}`;
        return { content: [{ type: 'text', text }] };
    }

    const id = resolveLatestId();
    if (!id) {
        const text = lang === 'en' ? 'WAM stash is empty.' : 'WAM 暂存为空。';
        return { content: [{ type: 'text', text }] };
    }
    const entry = readWamStash(dir, id);
    if (!entry) {
        const text = lang === 'en' ? `WAM stash not found: ${id}` : `未找到 WAM 暂存：${id}`;
        return { content: [{ type: 'text', text }] };
    }

	    const applyEntry = () => {
	        if (scope === 'global') {
	            const snap = entry.snapshots?.global_memory;
	            const globalMemory = snap?.globalMemory || snap?.global_memory || snap;
	            if (globalMemory && typeof globalMemory === 'object' && globalMemory.memories) {
	                saveGlobalMemoryData(globalMemory as any);
	            }
	            return;
	        }
        const tracker = entry.snapshots?.tracker?.tracker || entry.snapshots?.tracker;
        const memory = entry.snapshots?.memory?.memory || entry.snapshots?.memory;
        if (!tracker || !memory) return;
        const root = entry.rootPath || tracker.rootPath || '';
        if (!root) return;
        const trackerData = loadTrackerData();
        trackerData.projects[root] = tracker;
        trackerData.activeProject = root;
        saveTrackerData(trackerData);
        const memoryData = loadMemoryData();
        memoryData.projects[root] = memory;
        saveMemoryData(memoryData);
        try {
            syncProjectArtifacts(tracker);
            syncMemoryArtifacts(tracker, memory);
        } catch {
            // ignore
        }
        sidebarProvider?.postMessage({ type: 'tracker', data: buildTrackerSnapshot(tracker) });
        refreshOpenPanels(tracker);
    };

    if (action === 'apply' || action === 'pop') {
        applyEntry();
        if (action === 'pop') {
            try {
                fs.unlinkSync(path.join(dir, WAM_STASH_DIR, `${id}.json`));
            } catch {
                // ignore
            }
        }
        const text =
            lang === 'en'
                ? `WAM stash ${action}ed: ${id}`
                : `WAM 暂存已${action === 'apply' ? '应用' : '弹出'}：${id}`;
        return { content: [{ type: 'text', text }] };
    }

	    if (action === 'drop') {
	        try {
	            fs.unlinkSync(path.join(dir, WAM_STASH_DIR, `${id}.json`));
	        } catch {
	            // ignore
        }
        const text = lang === 'en' ? `WAM stash dropped: ${id}` : `WAM 暂存已删除：${id}`;
        return { content: [{ type: 'text', text }] };
    }

    return { content: [{ type: 'text', text: lang === 'en' ? 'Unknown stash action.' : '未知暂存操作。' }] };
}

// ==================== Memory Handlers ====================

const STOP_WORDS = new Set<string>([
    'a', 'an', 'the', 'and', 'or', 'but', 'if', 'then', 'else', 'for', 'to', 'of', 'in', 'on', 'at', 'by', 'with',
    'is', 'are', 'was', 'were', 'be', 'been', 'being', 'as', 'it', 'this', 'that', 'these', 'those', 'from', 'into',
    'we', 'you', 'they', 'he', 'she', 'i', 'me', 'my', 'our', 'your', 'their', 'them', 'can', 'could', 'should',
    'would', 'may', 'might', 'must', 'not', 'no', 'yes', 'do', 'does', 'did', 'done'
]);

function tokenizeForSearch(text: string): string[] {
    const raw = String(text || '').toLowerCase();
    const parts = raw.split(/[^a-z0-9_\u4e00-\u9fff]+/g).filter(Boolean);
    const tokens: string[] = [];
    for (const p of parts) {
        if (p.length <= 1) continue;
        if (/^[a-z]+$/.test(p) && STOP_WORDS.has(p)) continue;
        tokens.push(p);
    }
    return tokens.slice(0, 64);
}

const SEMANTIC_SYNONYMS: Record<string, string[]> = {
    delete: ['remove', 'rm', 'unlink', 'erase'],
    remove: ['delete', 'rm', 'unlink'],
    auth: ['authentication', 'authorize', 'authorization', 'login'],
    login: ['auth', 'authenticate', 'signin', 'sign-in'],
    perf: ['performance', 'optimize', 'latency', 'slow'],
    bug: ['issue', 'error', 'crash', 'fix'],
    config: ['configuration', 'settings', 'env', 'dotenv']
};

function expandSemanticTokens(tokens: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    const push = (t: string) => {
        const v = String(t || '').trim().toLowerCase();
        if (!v) return;
        if (v.length <= 1) return;
        if (seen.has(v)) return;
        seen.add(v);
        out.push(v);
    };
    for (const t of tokens) {
        push(t);
        const syn = SEMANTIC_SYNONYMS[String(t || '').toLowerCase()];
        if (Array.isArray(syn)) {
            for (const s of syn) push(s);
        }
    }
    return out.slice(0, 28);
}

type FastWorkspaceMatch = {
    uri: vscode.Uri;
    pathScore: number;
};

function scoreRagPathHeuristic(filePath: string): number {
    const p = normalizePathForCompare(filePath);
    if (!p) return 0;
    const ext = path.extname(p);
    let score = 0;
    if (p.includes('/src/')) score += 4;
    if (p.includes('/lib/')) score += 3;
    if (p.includes('/app/')) score += 3;
    if (p.includes('/packages/')) score += 3;
    if (p.includes('/components/')) score += 2;
    if (p.includes('/server/')) score += 2;
    if (p.includes('/api/')) score += 2;
    if (p.includes('/tests/') || p.includes('/test/')) score += 1;
    if (['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.go', '.rs', '.java', '.kt', '.cs', '.cpp', '.cc', '.c', '.h', '.hpp'].includes(ext)) {
        score += 3;
    } else if (['.md', '.json', '.yaml', '.yml', '.toml', '.ini', '.env', '.txt'].includes(ext)) {
        score += 1;
    }
    return score;
}

async function rankWorkspaceFilesByPath(
    tokens: string[],
    options: { exclude: string; maxFiles: number; maxTotalMatches: number; timeBudgetMs: number }
): Promise<FastWorkspaceMatch[]> {
    const cleaned = Array.from(new Set((tokens || []).map((t) => String(t || '').trim()).filter(Boolean))).slice(0, 24);
    if (cleaned.length === 0) return [];

    // Use a fast path-only heuristic to reduce reads: rank files by token overlap on path.
    // This keeps rag_search responsive on large repos without requiring newer VS Code APIs.
    const files = await vscode.workspace.findFiles('**/*', options.exclude, 2600);
    const ranked: Array<{ uri: vscode.Uri; pathScore: number }> = [];
    for (const uri of files) {
        const filePath = uri.fsPath;
        if (isIgnoredRagFile(filePath)) continue;
        const overlap = scoreByTokenOverlap(cleaned, filePath);
        const heuristic = scoreRagPathHeuristic(filePath);
        const score = overlap * 4 + heuristic;
        if (score <= 0) continue;
        ranked.push({ uri, pathScore: score });
    }
    ranked.sort((a, b) => (b.pathScore - a.pathScore) || a.uri.fsPath.localeCompare(b.uri.fsPath));
    return ranked.slice(0, options.maxFiles);
}

function scoreByTokenOverlap(queryTokens: string[], text: string): number {
    if (queryTokens.length === 0) return 0;
    const hay = String(text || '').toLowerCase();
    let score = 0;
    for (const token of queryTokens) {
        if (!token) continue;
        let idx = hay.indexOf(token);
        while (idx !== -1) {
            score += 1;
            idx = hay.indexOf(token, idx + token.length);
        }
    }
    return score;
}

const RAG_EXCLUDE_GLOB = '{**/.git/**,**/node_modules/**,**/.windsurf/**,**/.vscode/**,**/dist/**,**/out/**,**/build/**,**/target/**,**/.venv/**,**/venv/**,**/__pycache__/**}';

type RagIndexRuntime = {
    rootPath: string;
    projectId: string;
    data: RagIndexData;
    dirty: boolean;
    enumerated: boolean;
    flushTimer: NodeJS.Timeout | null;
};

let ragIndexRuntime: RagIndexRuntime | null = null;
let ragIndexWatcher: vscode.FileSystemWatcher | null = null;

function tokenizeForIndex(text: string, maxTokens = 180): string[] {
    const raw = String(text || '').toLowerCase();
    const parts = raw.split(/[^a-z0-9_\u4e00-\u9fff]+/g).filter(Boolean);
    const seen = new Set<string>();
    const tokens: string[] = [];
    for (const p of parts) {
        if (p.length <= 1) continue;
        if (/^[a-z]+$/.test(p) && STOP_WORDS.has(p)) continue;
        if (seen.has(p)) continue;
        seen.add(p);
        tokens.push(p);
        if (tokens.length >= maxTokens) break;
    }
    return tokens;
}

function isUnderRoot(rootPath: string, filePath: string): boolean {
    const root = normalizePathForCompare(rootPath).replace(/\/+$/, '');
    const file = normalizePathForCompare(filePath);
    return !!root && (file === root || file.startsWith(`${root}/`));
}

function markRagIndexDirty() {
    if (!ragIndexRuntime) return;
    ragIndexRuntime.dirty = true;
    ragIndexRuntime.data.updatedAt = nowIso();
}

function flushRagIndexSoon(delayMs = 1200) {
    if (!ragIndexRuntime) return;
    if (ragIndexRuntime.flushTimer) return;
    ragIndexRuntime.flushTimer = setTimeout(() => {
        try {
            ragIndexRuntime && (ragIndexRuntime.flushTimer = null);
            flushRagIndexNow();
        } catch {
            // ignore
        }
    }, delayMs);
}

function flushRagIndexNow() {
    if (!ragIndexRuntime || !ragIndexRuntime.dirty) return;
    ragIndexRuntime.dirty = false;
    try {
        saveRagIndexData(ragIndexRuntime.projectId, ragIndexRuntime.data);
    } catch (e: any) {
        outputChannel?.appendLine(`RAG index flush failed: ${e?.message ?? String(e)}`);
    }
}

async function ensureRagIndexRuntimeInitialized(rootPathOverride?: string): Promise<RagIndexRuntime | null> {
    const rootPath = rootPathOverride || getWorkspaceRootPath();
    if (!rootPath) return null;

    if (ragIndexRuntime && ragIndexRuntime.rootPath === rootPath) return ragIndexRuntime;

    try {
        const trackerInfo = resolveProjectTracker(rootPath);
        if (!trackerInfo.project.projectId) {
            trackerInfo.project.projectId = createProjectId();
            trackerInfo.project.updatedAt = nowIso();
            saveTrackerData(trackerInfo.data);
        }
        const projectId = trackerInfo.project.projectId;

        const loaded = loadRagIndexData(rootPath, projectId) || createEmptyRagIndex(rootPath);
        ragIndexRuntime = { rootPath, projectId, data: loaded, dirty: false, enumerated: false, flushTimer: null };
    } catch (e: any) {
        outputChannel?.appendLine(`RAG index init failed: ${e?.message ?? String(e)}`);
        ragIndexRuntime = null;
        return null;
    }

    return ragIndexRuntime;
}

async function enumerateWorkspaceIntoRagIndex(): Promise<void> {
    const state = await ensureRagIndexRuntimeInitialized();
    if (!state || state.enumerated) return;
    state.enumerated = true;
    try {
        const files = await vscode.workspace.findFiles('**/*', RAG_EXCLUDE_GLOB, 6000);
        let changed = 0;
        for (const uri of files) {
            if (uri.scheme !== 'file') continue;
            const abs = uri.fsPath;
            if (!isUnderRoot(state.rootPath, abs)) continue;
            if (isIgnoredRagFile(abs)) continue;
            let stat: vscode.FileStat;
            try {
                stat = await vscode.workspace.fs.stat(uri);
            } catch {
                continue;
            }
            const rel = normalizeWorkspaceRelPath(state.rootPath, abs);
            const existing = state.data.files[rel];
            if (!existing) {
                state.data.files[rel] = { path: rel, mtimeMs: stat.mtime, size: stat.size, updatedAt: nowIso() };
                changed += 1;
            } else if (existing.mtimeMs !== stat.mtime || existing.size !== stat.size) {
                existing.mtimeMs = stat.mtime;
                existing.size = stat.size;
                existing.updatedAt = nowIso();
                // leave existing tokens; they may be updated lazily on search or file-change events
                changed += 1;
            }
        }
        if (changed > 0) {
            markRagIndexDirty();
            flushRagIndexSoon(800);
        }
    } catch (e: any) {
        outputChannel?.appendLine(`RAG index enumerate failed: ${e?.message ?? String(e)}`);
    }
}

async function upsertRagIndexForUri(uri: vscode.Uri) {
    const state = await ensureRagIndexRuntimeInitialized();
    if (!state) return;
    if (uri.scheme !== 'file') return;
    const abs = uri.fsPath;
    if (!isUnderRoot(state.rootPath, abs)) return;
    if (isIgnoredRagFile(abs)) return;

    let stat: vscode.FileStat;
    try {
        stat = await vscode.workspace.fs.stat(uri);
    } catch {
        return;
    }
    const rel = normalizeWorkspaceRelPath(state.rootPath, abs);
    const existing = state.data.files[rel];

    // Always update metadata; tokens are updated for smaller text files (best-effort).
    const entry: RagIndexEntry = existing || { path: rel, mtimeMs: stat.mtime, size: stat.size, updatedAt: nowIso() };
    entry.mtimeMs = stat.mtime;
    entry.size = stat.size;
    entry.updatedAt = nowIso();

    const shouldRead = stat.size > 0 && stat.size <= 180_000;
    if (shouldRead) {
        try {
            const raw = await vscode.workspace.fs.readFile(uri);
            if (raw.length > 0) {
                const head = raw.subarray(0, Math.min(raw.length, 2048));
                if (!head.includes(0)) {
                    const text = decodeUtf8(raw.subarray(0, Math.min(raw.length, 120_000)));
                    entry.tokens = tokenizeForIndex(text, 180);
                }
            }
        } catch {
            // ignore
        }
    }

    state.data.files[rel] = entry;
    markRagIndexDirty();
    flushRagIndexSoon();
}

async function removeRagIndexForUri(uri: vscode.Uri) {
    const state = await ensureRagIndexRuntimeInitialized();
    if (!state) return;
    if (uri.scheme !== 'file') return;
    const abs = uri.fsPath;
    if (!isUnderRoot(state.rootPath, abs)) return;
    const rel = normalizeWorkspaceRelPath(state.rootPath, abs);
    if (state.data.files[rel]) {
        delete state.data.files[rel];
        markRagIndexDirty();
        flushRagIndexSoon(600);
    }
}

function disposeRagIndexing() {
    try {
        if (ragIndexRuntime?.flushTimer) clearTimeout(ragIndexRuntime.flushTimer);
    } catch {
        // ignore
    }
    try {
        flushRagIndexNow();
    } catch {
        // ignore
    }
    ragIndexRuntime = null;
    try {
        ragIndexWatcher?.dispose();
    } catch {
        // ignore
    }
    ragIndexWatcher = null;
}

async function initializeRagIndexing() {
    await ensureRagIndexRuntimeInitialized();
    // Enumerate once (metadata only) to enable fast ranking even before tokenization.
    void enumerateWorkspaceIntoRagIndex();

    try {
        ragIndexWatcher?.dispose();
    } catch {
        // ignore
    }
    ragIndexWatcher = vscode.workspace.createFileSystemWatcher('**/*');
    ragIndexWatcher.onDidCreate((uri) => { void upsertRagIndexForUri(uri); });
    ragIndexWatcher.onDidChange((uri) => { void upsertRagIndexForUri(uri); });
    ragIndexWatcher.onDidDelete((uri) => { void removeRagIndexForUri(uri); });
}

function pushTimelineEntry(
    timeline: Array<{ at: string; kind: 'short' | 'long' | 'lesson'; key: string; summary: string }>,
    entry: { kind: 'short' | 'long' | 'lesson'; key: string; content: string }
) {
    const summary = String(entry.content || '').trim().replace(/\s+/g, ' ').slice(0, 160);
    timeline.push({ at: nowIso(), kind: entry.kind, key: entry.key, summary });
    if (timeline.length > 800) {
        timeline.splice(0, timeline.length - 800);
    }
}

function normalizeMemoryKind(kind: any): 'short' | 'long' | 'lesson' {
    if (kind === 'short' || kind === 'lesson') return kind;
    return 'long';
}

function normalizeStringArray(raw: any, maxItems = 24): string[] {
    if (!Array.isArray(raw)) return [];
    const out: string[] = [];
    for (const item of raw) {
        if (typeof item !== 'string') continue;
        const v = item.trim();
        if (!v) continue;
        out.push(v);
        if (out.length >= maxItems) break;
    }
    return out;
}

function pruneShortMemories(store: ProjectMemoryStore | GlobalMemoryData, maxAgeDays = 7): void {
    const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;
    const memories = (store as any).memories as Record<string, MemoryEntry>;
    for (const [key, entry] of Object.entries(memories || {})) {
        if (!entry) continue;
        if (entry.kind !== 'short') continue;
        const updatedAt = Date.parse(entry.updatedAt || '');
        if (Number.isFinite(updatedAt) && updatedAt < cutoff) {
            delete memories[key];
        }
    }
}

function uniqStrings(items: string[], maxItems = 24): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of items || []) {
        const v = String(raw || '').trim();
        if (!v) continue;
        const key = v.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(v);
        if (out.length >= maxItems) break;
    }
    return out;
}

function extractAutoLinksFromText(text: string, maxLinks = 12): string[] {
    const src = String(text || '');
    const found: string[] = [];

    const push = (v: string) => {
        const s = String(v || '').trim();
        if (!s) return;
        if (s.length > 260) return;
        found.push(s);
    };

    // File paths (best-effort, avoid spaces).
    const patterns: RegExp[] = [
        /[A-Za-z]:\\[^\s"'<>]+/g,
        /(\.{1,2}\/[^\s"'<>]+)+/g,
        /(\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)+)/g
    ];
    for (const re of patterns) {
        const matches = src.match(re);
        if (!matches) continue;
        for (const m of matches.slice(0, 20)) {
            push(`file:${m}`);
        }
    }

    // Commands (common guard/lesson formats).
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const m1 = line.match(/^Command:\s*(.+)$/i);
        if (m1 && m1[1]) {
            push(`cmd:${m1[1].trim()}`);
            continue;
        }
        if (/^Command:\s*$/i.test(line) && i + 1 < lines.length) {
            const next = lines[i + 1].trim();
            if (next) push(`cmd:${next}`);
        }
        const m2 = line.match(/^Blocked(?: write)?(?: to)? sensitive path:\s*(.+)$/i);
        if (m2 && m2[1]) {
            push(`file:${m2[1].trim()}`);
        }
        const m3 = line.match(/^MCP tool (?:failed|error):\s*([A-Za-z0-9_.-]+)\\.([A-Za-z0-9_.-]+).*$/i);
        if (m3) {
            push(`mcp:${m3[1]}.${m3[2]}`);
        }
    }

    return uniqStrings(found, maxLinks);
}

async function handleSaveMemory(args: any): Promise<any> {
    const lang = getUiLanguage();
    const key = typeof args?.key === 'string' ? args.key.trim() : '';
    const value = typeof args?.value === 'string' ? args.value : '';
    if (!key) {
        const msg = lang === 'en' ? 'save_memory requires a key.' : 'save_memory 需要提供 key。';
        throw new Error(msg);
    }
    const scope = args?.scope === 'global' || args?.scope === 'both' ? args.scope : 'project';
    const kind = normalizeMemoryKind(args?.kind);
    const tags = normalizeStringArray(args?.tags);
    const links = normalizeStringArray(args?.links);

    const now = nowIso();
    const writeProject = scope === 'project' || scope === 'both';
    const writeGlobal = scope === 'global' || scope === 'both';

    let rootPath: string | undefined;

    if (writeProject) {
        const resolved = resolveProjectMemory();
        rootPath = resolved.rootPath;
        const { data, project } = resolved;
        const existing = project.memories[key];
        project.memories[key] = {
            key,
            content: value,
            kind,
            tags,
            links,
            createdAt: existing?.createdAt || now,
            updatedAt: now
        };
        if (!Array.isArray(project.timeline)) project.timeline = [];
        pushTimelineEntry(project.timeline, { kind, key, content: value });
        pruneShortMemories(project);
        saveMemoryAndNotify(data);
        try {
            const trackerInfo = resolveProjectTracker(rootPath);
            saveTrackerData(trackerInfo.data);
            syncMemoryArtifacts(trackerInfo.project, project);
            refreshOpenPanels(trackerInfo.project);
	        } catch (e: any) {
	            outputChannel?.appendLine(`Memory artifact sync failed: ${e?.message ?? String(e)}`);
	        }
	    }

    if (writeGlobal) {
        const global = loadGlobalMemoryData();
        if (!global.timeline) global.timeline = [];
        const existing = global.memories[key];
        global.memories[key] = {
            key,
            content: value,
            kind,
            tags,
            links,
            createdAt: existing?.createdAt || now,
            updatedAt: now
        };
	        pushTimelineEntry(global.timeline, { kind, key, content: value });
	        pruneShortMemories(global);
	        saveGlobalMemoryData(global);
	    }
    try {
        // Best-effort: refresh panels so global memory changes show up when Memory panel is open.
        const trackerInfo = resolveProjectTracker(rootPath);
        refreshOpenPanels(trackerInfo.project);
    } catch {
        // ignore
    }

    const where =
        scope === 'both'
            ? (lang === 'en' ? 'project + global' : '项目 + 全局')
            : scope === 'global'
                ? (lang === 'en' ? 'global' : '全局')
                : (lang === 'en' ? 'project' : '项目');
    const text = lang === 'en' ? `Memory saved (${where}): ${key}` : `内存已保存（${where}）: ${key}`;
    return { content: [{ type: 'text', text }] };
}

async function handleGetMemory(args: any): Promise<any> {
    const lang = getUiLanguage();
    const key = typeof args?.key === 'string' ? args.key.trim() : '';
    if (!key) {
        const msg = lang === 'en' ? 'get_memory requires a key.' : 'get_memory 需要提供 key。';
        throw new Error(msg);
    }
    const { project } = resolveProjectMemory();
    let entry = project.memories?.[key];
    let source: 'project' | 'global' = 'project';
    if (!entry) {
        const global = loadGlobalMemoryData();
        entry = global.memories?.[key];
        source = 'global';
    }
    if (!entry) {
        const text = lang === 'en' ? `Memory not found: ${key}` : `未找到内存: ${key}`;
        return { content: [{ type: 'text', text }] };
    }
    const text = lang === 'en' ? `Memory [${key}]:` : `内存 [${key}]:`;
    const head = lang === 'en' ? `${text} (${source})` : `${text}（${source === 'global' ? '全局' : '项目'}）`;
    return { content: [{ type: 'text', text: head }, { type: 'text', text: entry.content }] };
}

async function handleListMemories(_args: any): Promise<any> {
    const lang = getUiLanguage();
    const { project } = resolveProjectMemory();
    const global = loadGlobalMemoryData();
    const projectKeys = Object.keys(project.memories || {});
    const globalKeys = Object.keys(global.memories || {});
    const lines: string[] = [];
    lines.push(lang === 'en' ? `Project (${projectKeys.length})` : `项目（${projectKeys.length}）`);
    lines.push(...projectKeys.sort().slice(0, 200).map((k) => `- ${k}`));
    if (projectKeys.length > 200) lines.push(`- … (${projectKeys.length - 200} more)`);
    lines.push('');
    lines.push(lang === 'en' ? `Global (${globalKeys.length})` : `全局（${globalKeys.length}）`);
    lines.push(...globalKeys.sort().slice(0, 200).map((k) => `- ${k}`));
    if (globalKeys.length > 200) lines.push(`- … (${globalKeys.length - 200} more)`);

    const text = lang === 'en' ? 'Saved memory keys:' : '保存的内存键：';
    return { content: [{ type: 'text', text }, { type: 'text', text: lines.join('\n') }] };
}

async function handleMemorySearch(args: any): Promise<any> {
    const lang = getUiLanguage();
    const query = typeof args?.query === 'string' ? args.query.trim() : '';
    if (!query) {
        const msg = lang === 'en' ? 'memory_search requires query.' : 'memory_search 需要 query。';
        throw new Error(msg);
    }

    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;

    // Record that we refreshed memory context for this project (used by hooks to enforce "memory_search before edits").
    try {
        const trackerInfo = resolveProjectTracker(rootPath);
        trackerInfo.project.stats = normalizeTrackerStats(trackerInfo.project.stats);
        trackerInfo.project.stats.lastMemorySearchAt = nowIso();
        saveTrackerData(trackerInfo.data);
    } catch {
        // ignore
    }

    const scope: 'project' | 'global' | 'both' = args?.scope === 'global' || args?.scope === 'both' ? args.scope : 'project';
    const kinds = Array.isArray(args?.kinds) ? args.kinds.filter((k: any) => k === 'short' || k === 'long' || k === 'lesson') : [];
    const maxResults = Number.isFinite(args?.maxResults) ? Math.max(1, Math.min(20, Math.floor(args.maxResults))) : 8;

    const queryTokens = tokenizeForSearch(query);
    const results: Array<{ scope: 'project' | 'global'; key: string; kind: string; updatedAt: string; score: number; snippet: string }> = [];

    const consider = (scopeName: 'project' | 'global', memories: Record<string, MemoryEntry>) => {
        for (const [key, entry] of Object.entries(memories || {})) {
            if (!entry) continue;
            const kind = normalizeMemoryKind(entry.kind);
            if (kinds.length > 0 && !kinds.includes(kind)) continue;
            const combined = `${key}\n${entry.content}\n${(entry.tags || []).join(' ')}\n${(entry.links || []).join(' ')}`;
            const score = scoreByTokenOverlap(queryTokens, combined);
            if (score <= 0) continue;
            const snippet = String(entry.content || '').trim().replace(/\s+/g, ' ').slice(0, 220);
            results.push({ scope: scopeName, key, kind, updatedAt: entry.updatedAt || '', score, snippet });
        }
    };

    if (scope === 'project' || scope === 'both') {
        const { project } = resolveProjectMemory(rootPath);
        consider('project', project.memories || {});
    }
    if (scope === 'global' || scope === 'both') {
        const global = loadGlobalMemoryData();
        consider('global', global.memories || {});
    }

    results.sort((a, b) => (b.score - a.score) || (b.updatedAt.localeCompare(a.updatedAt)));
    const top = results.slice(0, maxResults);

    const header = lang === 'en' ? `Memory search results (${top.length})` : `记忆检索结果（${top.length}）`;
    const lines = top.map((r, i) => {
        const scopeLabel = r.scope === 'global' ? (lang === 'en' ? 'global' : '全局') : (lang === 'en' ? 'project' : '项目');
        return `${i + 1}. [${scopeLabel}] (${r.kind}) ${r.key} — ${r.snippet}`;
    });

    return {
        content: [
            { type: 'text', text: header },
            { type: 'text', text: lines.join('\n') || (lang === 'en' ? 'No matches.' : '无匹配结果。') },
            { type: 'text', text: `MEMORY_SEARCH_JSON:\n${JSON.stringify({ query, scope, kinds, results: top }, null, 2)}` }
        ]
    };
}

async function handleMemoryHygiene(args: any): Promise<any> {
    const lang = getUiLanguage();
    const scope: 'project' | 'global' | 'both' = args?.scope === 'global' || args?.scope === 'both' ? args.scope : 'project';
    const apply = args?.apply === true;
    const promote = args?.promote !== false;
    const dedupe = args?.dedupe !== false;
    const autoLinkLessons = args?.autoLinkLessons !== false;
    const similarityRaw = Number(args?.similarity);
    const similarity = Number.isFinite(similarityRaw) ? Math.max(0.75, Math.min(0.98, similarityRaw)) : 0.9;
    const maxEntries = clampNumber(args?.maxEntries, 40, 220, 120);

    const shouldIgnoreKey = (key: string): boolean => {
        const k = String(key || '').trim().toLowerCase();
        if (!k) return true;
        if (k.startsWith('hook:')) return true;
        if (k.startsWith('temp:') || k.startsWith('scratch:')) return true;
        return false;
    };

    const buildTokens = (text: string): Set<string> => {
        const tokens = tokenizeForSearch(String(text || ''));
        const out = new Set<string>();
        for (const t of tokens.slice(0, 180)) {
            const v = String(t || '').trim().toLowerCase();
            if (!v) continue;
            if (v.length < 3) continue;
            out.add(v);
            if (out.size >= 160) break;
        }
        return out;
    };

    const jaccard = (a: Set<string>, b: Set<string>): number => {
        if (!a.size || !b.size) return 0;
        let inter = 0;
        const [small, big] = a.size < b.size ? [a, b] : [b, a];
        for (const t of small) {
            if (big.has(t)) inter += 1;
        }
        const union = a.size + b.size - inter;
        return union > 0 ? inter / union : 0;
    };

    type OpPromote = { op: 'promote'; scope: 'project' | 'global'; key: string; from: string; to: string; reason: string };
    type OpLink = { op: 'add_links'; scope: 'project' | 'global'; key: string; add: string[] };
    type OpDedupe = { op: 'dedupe'; scope: 'project' | 'global'; keep: string; drop: string[]; similarity: number };
    const ops: { promote: OpPromote[]; links: OpLink[]; dedupe: OpDedupe[] } = { promote: [], links: [], dedupe: [] };

    const analyzeStore = (scopeName: 'project' | 'global', store: Record<string, MemoryEntry>) => {
        const entries = Object.entries(store || {})
            .map(([key, entry]) => ({ key, entry }))
            .filter((it) => it.entry && typeof it.entry === 'object' && !shouldIgnoreKey(it.key));

        if (autoLinkLessons) {
            for (const { key, entry } of entries) {
                const kind = normalizeMemoryKind(entry.kind);
                if (kind !== 'lesson') continue;
                const extracted = extractAutoLinksFromText(entry.content || '', 12);
                if (extracted.length === 0) continue;
                const merged = uniqStrings([...(entry.links || []), ...extracted], 24);
                const add = merged.filter((v) => !(entry.links || []).includes(v));
                if (add.length > 0) {
                    ops.links.push({ op: 'add_links', scope: scopeName, key, add });
                }
            }
        }

        if (promote) {
            const promoteTags = new Set(['decision', 'architecture', 'arch', 'rule', 'policy', 'important', 'security', 'design']);
            for (const { key, entry } of entries) {
                const kind = normalizeMemoryKind(entry.kind);
                if (kind !== 'short') continue;
                const content = String(entry.content || '');
                if (content.length < 220) continue;
                const tags = (entry.tags || []).map((t) => String(t || '').toLowerCase());
                const tagHit = tags.some((t) => promoteTags.has(t));
                const keyHit = /decision|arch|rule|policy|security|design/i.test(key);
                if (!tagHit && !keyHit) continue;
                ops.promote.push({
                    op: 'promote',
                    scope: scopeName,
                    key,
                    from: 'short',
                    to: 'long',
                    reason: tagHit ? 'tag' : 'key'
                });
            }
        }

        if (dedupe) {
            const candidates = entries
                .filter((it) => String(it.entry.content || '').trim().length >= 80)
                .sort((a, b) => String(b.entry.updatedAt || '').localeCompare(String(a.entry.updatedAt || '')))
                .slice(0, maxEntries);

            if (candidates.length < 2) return;

            const tokens = candidates.map((c) => buildTokens(`${c.key}\n${c.entry.content || ''}`));
            const parent = Array.from({ length: candidates.length }, (_, i) => i);
            const find = (i: number): number => {
                while (parent[i] !== i) {
                    parent[i] = parent[parent[i]];
                    i = parent[i];
                }
                return i;
            };
            const union = (a: number, b: number) => {
                const ra = find(a);
                const rb = find(b);
                if (ra !== rb) parent[rb] = ra;
            };

            for (let i = 0; i < candidates.length; i++) {
                for (let j = i + 1; j < candidates.length; j++) {
                    const sim = jaccard(tokens[i], tokens[j]);
                    if (sim >= similarity) {
                        union(i, j);
                    }
                }
            }

            const groups = new Map<number, number[]>();
            for (let i = 0; i < candidates.length; i++) {
                const r = find(i);
                const arr = groups.get(r) || [];
                arr.push(i);
                groups.set(r, arr);
            }

            const kindRank = (k: string) => (k === 'lesson' ? 3 : k === 'long' ? 2 : 1);
            for (const idxs of groups.values()) {
                if (idxs.length < 2) continue;
                idxs.sort((a, b) => {
                    const ka = kindRank(normalizeMemoryKind(candidates[a].entry.kind));
                    const kb = kindRank(normalizeMemoryKind(candidates[b].entry.kind));
                    if (ka !== kb) return kb - ka;
                    return String(candidates[b].entry.updatedAt || '').localeCompare(String(candidates[a].entry.updatedAt || ''));
                });
                const keep = candidates[idxs[0]].key;
                const drop = idxs.slice(1).map((i) => candidates[i].key).filter((k) => k !== keep);
                if (drop.length > 0) {
                    ops.dedupe.push({ op: 'dedupe', scope: scopeName, keep, drop, similarity });
                }
            }
        }
    };

    let trackerInfo: { data: TrackerData; project: ProjectTracker } | null = null;
    try {
        trackerInfo = resolveProjectTracker();
    } catch {
        trackerInfo = null;
    }

    let projectMemory: { data: MemoryData; project: ProjectMemoryStore; rootPath: string } | null = null;
    if (scope === 'project' || scope === 'both') {
        projectMemory = resolveProjectMemory();
        analyzeStore('project', projectMemory.project.memories || {});
    }
    let globalMemory: GlobalMemoryData | null = null;
    if (scope === 'global' || scope === 'both') {
        globalMemory = loadGlobalMemoryData();
        analyzeStore('global', globalMemory.memories || {});
    }

    const summary = {
        scope,
        promote: ops.promote.length,
        addLinks: ops.links.length,
        dedupeGroups: ops.dedupe.length,
        similarity,
        maxEntries
    };

    if (!apply) {
        const text = lang === 'en' ? 'Memory hygiene suggestions generated.' : '已生成记忆整理建议。';
        return { content: [{ type: 'text', text }, { type: 'text', text: `MEMORY_HYGIENE_JSON:\n${JSON.stringify({ summary, ops }, null, 2)}` }] };
    }

    const confirmMsg =
        lang === 'en'
            ? `Apply memory hygiene?\n- promote: ${ops.promote.length}\n- dedupe groups: ${ops.dedupe.length}\n- add lesson links: ${ops.links.length}\n\nThis may delete duplicate memory keys.`
            : `是否应用记忆整理？\n- 提升：${ops.promote.length}\n- 去重组：${ops.dedupe.length}\n- 为经验添加链接：${ops.links.length}\n\n这可能会删除重复的记忆键。`;
    const confirmed = await requestConfirmation(confirmMsg, lang === 'en' ? 'Memory hygiene' : '记忆整理');
    if (!confirmed) {
        const text = lang === 'en' ? 'Memory hygiene canceled.' : '已取消记忆整理。';
        return { content: [{ type: 'text', text }, { type: 'text', text: `MEMORY_HYGIENE_JSON:\n${JSON.stringify({ summary, ops, applied: false }, null, 2)}` }] };
    }

    const now = nowIso();
    const applyToStore = (scopeName: 'project' | 'global', store: Record<string, MemoryEntry>, timeline?: any[]) => {
        const byKey = store || {};

        for (const op of ops.dedupe.filter((o) => o.scope === scopeName)) {
            const keep = byKey[op.keep];
            if (!keep) continue;
            const mergedTags: string[] = [];
            const mergedLinks: string[] = [];
            for (const k of [op.keep, ...op.drop]) {
                const e = byKey[k];
                if (!e) continue;
                mergedTags.push(...(e.tags || []));
                mergedLinks.push(...(e.links || []));
            }
            keep.tags = uniqStrings(mergedTags, 36);
            keep.links = uniqStrings([...mergedLinks, ...op.drop.map((k) => `memory:${k}`)], 48);
            keep.updatedAt = now;
            byKey[op.keep] = keep;
            for (const k of op.drop) {
                if (k !== op.keep) delete byKey[k];
            }
            if (Array.isArray(timeline)) {
                pushTimelineEntry(timeline, { kind: normalizeMemoryKind(keep.kind), key: op.keep, content: keep.content || '' });
            }
        }

        for (const op of ops.promote.filter((o) => o.scope === scopeName)) {
            const e = byKey[op.key];
            if (!e) continue;
            if (normalizeMemoryKind(e.kind) !== 'short') continue;
            e.kind = 'long';
            e.updatedAt = now;
            byKey[op.key] = e;
            if (Array.isArray(timeline)) {
                pushTimelineEntry(timeline, { kind: 'long', key: op.key, content: e.content || '' });
            }
        }

        for (const op of ops.links.filter((o) => o.scope === scopeName)) {
            const e = byKey[op.key];
            if (!e) continue;
            const next = uniqStrings([...(e.links || []), ...op.add], 48);
            e.links = next;
            e.updatedAt = now;
            byKey[op.key] = e;
            if (Array.isArray(timeline)) {
                pushTimelineEntry(timeline, { kind: normalizeMemoryKind(e.kind), key: op.key, content: e.content || '' });
            }
        }
    };

    if (projectMemory) {
        if (!Array.isArray(projectMemory.project.timeline)) projectMemory.project.timeline = [];
        applyToStore('project', projectMemory.project.memories || {}, projectMemory.project.timeline);
        pruneShortMemories(projectMemory.project);
        saveMemoryAndNotify(projectMemory.data);
        if (trackerInfo) {
            try {
                syncMemoryArtifacts(trackerInfo.project, projectMemory.project);
            } catch (e: any) {
                outputChannel?.appendLine(`Memory artifact sync failed (hygiene): ${e?.message ?? String(e)}`);
            }
        }
    }

    if (globalMemory) {
        if (!Array.isArray(globalMemory.timeline)) globalMemory.timeline = [];
        applyToStore('global', globalMemory.memories || {}, globalMemory.timeline);
        pruneShortMemories(globalMemory);
        saveGlobalMemoryData(globalMemory);
    }

    if (trackerInfo && (ops.promote.length || ops.dedupe.length || ops.links.length)) {
        appendWalkthroughEntry(
            trackerInfo.project,
            lang === 'en'
                ? `Memory hygiene applied: promote=${ops.promote.length}, dedupe=${ops.dedupe.length}, links=${ops.links.length}.`
                : `记忆整理已应用：提升=${ops.promote.length}，去重=${ops.dedupe.length}，链接=${ops.links.length}。`,
            lang
        );
        trackerInfo.project.updatedAt = nowIso();
        saveTrackerAndNotify(trackerInfo.data, trackerInfo.project);
    } else if (trackerInfo) {
        refreshOpenPanels(trackerInfo.project);
    }

    const text = lang === 'en' ? 'Memory hygiene applied.' : '记忆整理已应用。';
    return { content: [{ type: 'text', text }, { type: 'text', text: `MEMORY_HYGIENE_JSON:\n${JSON.stringify({ summary, ops, applied: true }, null, 2)}` }] };
}

async function handleRecordLesson(args: any): Promise<any> {
    const lang = getUiLanguage();
    const title = typeof args?.title === 'string' ? args.title.trim() : '';
    const mistake = typeof args?.mistake === 'string' ? args.mistake.trim() : '';
    const fix = typeof args?.fix === 'string' ? args.fix.trim() : '';
    const prevention = typeof args?.prevention === 'string' ? args.prevention.trim() : '';
    if (!mistake || !fix) {
        const msg = lang === 'en' ? 'record_lesson requires mistake and fix.' : 'record_lesson 需要 mistake 和 fix。';
        throw new Error(msg);
    }
    const tags = normalizeStringArray(args?.tags);
    const scope: 'project' | 'global' | 'both' = args?.scope === 'global' || args?.scope === 'both' ? args.scope : 'both';
    const keyBase = title || mistake.slice(0, 48) || 'lesson';
    const key = `lesson:${keyBase}`.replace(/\s+/g, ' ').trim();
    const content = [
        `# Lesson Learned${title ? `: ${title}` : ''}`,
        '',
        `## Mistake`,
        mistake,
        '',
        `## Fix`,
        fix,
        '',
        `## Prevention`,
        prevention || (lang === 'en' ? '(none)' : '（无）'),
        tags.length ? `\n## Tags\n- ${tags.join('\n- ')}` : ''
    ].join('\n');

    const autoLinks = extractAutoLinksFromText([mistake, fix, prevention].filter(Boolean).join('\n'), 12);
    await handleSaveMemory({ key, value: content, kind: 'lesson', scope, tags, links: autoLinks });
    const text = lang === 'en' ? `Lesson recorded: ${key}` : `经验已记录: ${key}`;
    return { content: [{ type: 'text', text }] };
}

// ==================== Walkthrough Handler ====================

async function handleManageSprint(args: any): Promise<any> {
    const lang = getUiLanguage();
    const action = args.action;
    const { data, project } = resolveProjectTracker(args.rootPath);
    if (!Array.isArray(project.sprints)) project.sprints = [];

    const formatSprintList = (sprints: Sprint[]) => {
        if (!sprints.length) return lang === 'en' ? '(no sprints)' : '(无 Sprint)';
        return sprints.map(s => `[${s.status.toUpperCase()}] ${s.name} (Goal: ${s.goal || '-'})`).join('\n');
    };

    if (action === 'list') {
        return { content: [{ type: 'text', text: formatSprintList(project.sprints) }] };
    }

    if (action === 'create') {
        const name = args.name || `Sprint ${project.sprints.length + 1}`;
        const id = `sprint_${Math.random().toString(36).slice(2, 10)}`;
        const newSprint: Sprint = {
            id,
            name,
            goal: args.goal || '',
            status: 'planning',
            createdAt: nowIso()
        };
        project.sprints.push(newSprint);
        project.updatedAt = nowIso();
        saveTrackerAndNotify(data, project);
        const text = lang === 'en' ? `Sprint created: ${name} (${id})` : `Sprint 已创建：${name} (${id})`;
        return { content: [{ type: 'text', text }] };
    }

    if (action === 'start') {
        const id = args.sprintId;
        const sprint = project.sprints.find(s => s.id === id || s.name === id);
        if (!sprint) throw new Error(`Sprint not found: ${id}`);
        if (project.activeSprintId) {
            throw new Error(lang === 'en' ? 'Another sprint is already active. Complete it first.' : '已有活跃的 Sprint，请先完成。');
        }
        sprint.status = 'active';
        sprint.startDate = nowIso();
        if (args.durationDays) {
            const end = new Date();
            end.setDate(end.getDate() + Number(args.durationDays));
            sprint.endDate = end.toISOString();
        }
        project.activeSprintId = sprint.id;
        project.updatedAt = nowIso();
        saveTrackerAndNotify(data, project);
        return { content: [{ type: 'text', text: `Sprint started: ${sprint.name}` }] };
    }

    if (action === 'complete') {
        const id = args.sprintId || project.activeSprintId;
        const sprint = project.sprints.find(s => s.id === id || s.name === id);
        if (!sprint) throw new Error(`Sprint not found: ${id}`);
        sprint.status = 'completed';
        sprint.completedAt = nowIso();
        if (project.activeSprintId === sprint.id) {
            project.activeSprintId = undefined;
        }
        project.updatedAt = nowIso();
        saveTrackerAndNotify(data, project);
        return { content: [{ type: 'text', text: `Sprint completed: ${sprint.name}` }] };
    }

    throw new Error(`Unknown action: ${action}`);
}

async function handleGenerateCommitMessage(args: any): Promise<any> {
    const lang = getUiLanguage();
    const { project } = resolveProjectTracker(args.rootPath);
    // Heuristic: look at recent walkthrough entries or plan completions
    const recentWalkthrough = (project.walkthrough.content || '').split('\n').slice(-10).join('\n');
    const recentDone = (project.plan.items || []).filter(i => i.status === 'done').slice(-3).map(i => i.text).join(', ');
    
    // In a real agent scenario, the LLM would generate this. Here we construct a template/prompt.
    // But wait, the tool *is* the LLM tool. The *output* of this tool goes back to the LLM.
    // The user wants the *agent* to generate it.
    // Actually, this tool might be redundant if the agent just does it. 
    // BUT the user asked for a "generate commit message" feature. 
    // Let's provide a structured suggestion based on tracker state.
    
    const context = args.context || '';
    const suggestion = `feat: update project progress\n\n- Completed: ${recentDone || 'various tasks'}\n- Context: ${context || 'routine update'}`;
    
    return { content: [{ type: 'text', text: `Suggested commit message:\n\n${suggestion}` }] };
}

async function handleUpdateWalkthrough(args: any): Promise<any> {
    const lang = getUiLanguage();
    const content = typeof args?.content === 'string' ? args.content.trim() : '';
    if (!content) {
        const msg = lang === 'en' ? 'update_walkthrough requires content.' : 'update_walkthrough 需要提供 content。';
        throw new Error(msg);
    }
    const { data, project } = resolveProjectTracker();
    project.walkthrough = {
        content,
        updatedAt: nowIso()
    };
    bumpProjectStat(project, 'walkthroughUpdates');
    project.stats = normalizeTrackerStats(project.stats);
    project.stats.lastWalkthroughUpdateAt = nowIso();
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);

    const text = lang === 'en' ? 'Walkthrough updated.' : 'Walkthrough 已更新。';
    return { content: [{ type: 'text', text }] };
}

async function handleGenerateWalkthrough(args: any): Promise<any> {
    const lang = getUiLanguage();
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const includeDecisions = args?.includeDecisions !== false;
    const includeLessons = args?.includeLessons !== false;
    
    const { data, project } = resolveProjectTracker(rootPath);
    const snapshot = buildTrackerSnapshot(project);
    
    // Build auto-generated walkthrough content
    const lines: string[] = [];
    
    // Header
    lines.push(lang === 'en' ? '# Project Walkthrough' : '# 项目走查');
    lines.push(`*${lang === 'en' ? 'Auto-generated' : '自动生成'}: ${nowIso()}*`);
    lines.push('');
    
    // Project Overview
    if (project.overview?.content) {
        lines.push(lang === 'en' ? '## Overview' : '## 概览');
        lines.push(project.overview.content.slice(0, 500));
        if (project.overview.content.length > 500) lines.push('...');
        lines.push('');
    }
    
    // PRD Summary
    if (project.prd?.content) {
        lines.push(lang === 'en' ? '## PRD Summary' : '## PRD 摘要');
        const prdLines = project.prd.content.split('\n').slice(0, 10);
        lines.push(prdLines.join('\n').slice(0, 400));
        if (project.prd.content.length > 400) lines.push('...');
        lines.push(`*${lang === 'en' ? 'Status' : '状态'}: ${project.prd.status === 'approved' ? '✅ Approved' : '⏳ Pending'}*`);
        lines.push('');
    }
    
    // Plan Progress
    lines.push(lang === 'en' ? '## Plan Progress' : '## 计划进度');
    const progress = snapshot.progress;
    lines.push(`**${lang === 'en' ? 'Progress' : '进度'}:** ${progress.done}/${progress.total} (${progress.percent}%)`);
    if (project.plan?.summary) {
        lines.push(`**${lang === 'en' ? 'Summary' : '摘要'}:** ${project.plan.summary.slice(0, 200)}`);
    }
    
    // Show plan items
    if (project.plan?.items?.length) {
        lines.push('');
        const doneItems = project.plan.items.filter(it => it.status === 'done').slice(-5);
        const doingItems = project.plan.items.filter(it => it.status === 'doing');
        const todoItems = project.plan.items.filter(it => it.status === 'todo').slice(0, 3);
        
        if (doneItems.length > 0) {
            lines.push(lang === 'en' ? '### Recently Completed' : '### 最近完成');
            doneItems.forEach(it => lines.push(`- [x] ${it.text.slice(0, 60)}`));
        }
        if (doingItems.length > 0) {
            lines.push(lang === 'en' ? '### In Progress' : '### 进行中');
            doingItems.forEach(it => lines.push(`- [~] ${it.text.slice(0, 60)}`));
        }
        if (todoItems.length > 0) {
            lines.push(lang === 'en' ? '### Next Up' : '### 待处理');
            todoItems.forEach(it => lines.push(`- [ ] ${it.text.slice(0, 60)}`));
        }
    }
    lines.push('');
    
    // Key Decisions (from existing walkthrough)
    if (includeDecisions && project.walkthrough?.content) {
        const existingContent = project.walkthrough.content;
        // Extract decision-like entries
        const decisionPatterns = ['decision', 'chose', 'decided', 'selected', '决定', '选择', '采用'];
        const existingLines = existingContent.split('\n');
        const decisions = existingLines.filter(line => 
            decisionPatterns.some(p => line.toLowerCase().includes(p))
        ).slice(-5);
        
        if (decisions.length > 0) {
            lines.push(lang === 'en' ? '## Key Decisions' : '## 关键决策');
            decisions.forEach(d => lines.push(`- ${d.slice(0, 100)}`));
            lines.push('');
        }
    }
    
    // Lessons Learned
    if (includeLessons) {
        try {
            const { project: memoryStore } = resolveProjectMemory(rootPath);
            const memories = memoryStore.memories || {};
            const lessons = Object.entries(memories)
                .filter(([k, v]) => k.startsWith('lesson:') || v.kind === 'lesson')
                .slice(-3);
            
            if (lessons.length > 0) {
                lines.push(lang === 'en' ? '## Lessons Learned' : '## 经验教训');
                for (const [key, entry] of lessons) {
                    const title = key.replace('lesson:', '').slice(0, 50);
                    lines.push(`- **${title}**: ${(entry.content || '').slice(0, 80)}...`);
                }
                lines.push('');
            }
        } catch {
            // ignore memory errors
        }
    }
    
    // Stats
    lines.push(lang === 'en' ? '## Session Stats' : '## 会话统计');
    const stats = project.stats || {};
    lines.push(`- ${lang === 'en' ? 'Plan Updates' : '计划更新'}: ${stats.planUpdates || 0}`);
    lines.push(`- ${lang === 'en' ? 'Overview Updates' : '概览更新'}: ${stats.overviewUpdates || 0}`);
    lines.push(`- ${lang === 'en' ? 'Walkthrough Updates' : '走查更新'}: ${stats.walkthroughUpdates || 0}`);
    lines.push(`- ${lang === 'en' ? 'Last Preflight' : '上次预检'}: ${(stats as any).lastPreflightAt || 'N/A'}`);
    
    const content = lines.join('\n');
    
    // Update walkthrough
    project.walkthrough = {
        content,
        updatedAt: nowIso()
    };
    bumpProjectStat(project, 'walkthroughUpdates');
    project.stats = normalizeTrackerStats(project.stats);
    project.stats.lastWalkthroughUpdateAt = nowIso();
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);
    
    const text = lang === 'en' ? 'Walkthrough auto-generated.' : '走查已自动生成。';
    return { content: [{ type: 'text', text }, { type: 'text', text: `WALKTHROUGH_JSON:\n${JSON.stringify({ content }, null, 2)}` }] };
}

// ==================== Workflow & Self-Check Handlers ====================

async function handleWorkflowStatus(args: any): Promise<any> {
    const lang = getUiLanguage();
    try {
        const { project } = resolveProjectTracker();
        const snapshot = buildTrackerSnapshot(project);
        
        // Determine workflow state based on tracker state
        const checks = {
            hasOverview: !!project.overview?.content,
            hasPlan: !!project.plan?.summary || (project.plan?.items?.length || 0) > 0,
            hasPrd: !!project.prd?.content,
            hasWalkthrough: !!project.walkthrough?.content,
            planProgress: snapshot.progress,
            lastPreflight: (project.stats as any)?.lastPreflightAt,
            lastPlanUpdate: project.stats?.lastPlanUpdateAt,
            lastWamCommit: (project.stats as any)?.lastWamCommitAt
        };
        
        // Determine next required step
        const nextSteps: string[] = [];
        if (!checks.lastPreflight) {
            nextSteps.push(lang === 'en' ? 'Run preflight() first' : '请先运行 preflight()');
        }
        if (!checks.hasOverview) {
            nextSteps.push(lang === 'en' ? 'Generate overview' : '生成概览');
        }
        if (!checks.hasPlan) {
            nextSteps.push(lang === 'en' ? 'Create plan with checklist' : '创建带清单的计划');
        }
        if (checks.hasPlan && checks.planProgress.done < checks.planProgress.total) {
            nextSteps.push(lang === 'en' 
                ? `Complete plan items (${checks.planProgress.done}/${checks.planProgress.total})` 
                : `完成计划项 (${checks.planProgress.done}/${checks.planProgress.total})`);
        }
        if (checks.planProgress.done === checks.planProgress.total && checks.planProgress.total > 0) {
            nextSteps.push(lang === 'en' ? 'Call ask_continue() to finish' : '调用 ask_continue() 完成');
        }
        
        const status = {
            checks,
            nextSteps,
            guidance: lang === 'en'
                ? 'Workflow: PREFLIGHT → READ → PLAN → ACT → VERIFY → ASK'
                : '工作流: PREFLIGHT → READ → PLAN → ACT → VERIFY → ASK'
        };
        
        return { content: [{ type: 'text', text: JSON.stringify(status, null, 2) }] };
    } catch (e: any) {
        const msg = lang === 'en' 
            ? `workflow_status error: ${e?.message}` 
            : `workflow_status 错误: ${e?.message}`;
        return { content: [{ type: 'text', text: msg }] };
    }
}

async function handleVerifyAction(args: any): Promise<any> {
    const lang = getUiLanguage();
    const { action, result, errors, nextStep, selfQuestions } = args;
    
    const verification = {
        action: action || '',
        result: result || '',
        errors: Array.isArray(errors) ? errors : [],
        nextStep: nextStep || '',
        selfQuestions: Array.isArray(selfQuestions) ? selfQuestions : [],
        timestamp: nowIso(),
        hasErrors: Array.isArray(errors) && errors.length > 0
    };
    
    // Log to walkthrough for audit trail
    try {
        const { data, project } = resolveProjectTracker();
        const entry = lang === 'en'
            ? `[Verify] ${action}: ${verification.hasErrors ? 'ERRORS' : 'OK'} - ${result.slice(0, 100)}`
            : `[验证] ${action}: ${verification.hasErrors ? '错误' : '成功'} - ${result.slice(0, 100)}`;
        appendWalkthroughEntry(project, entry, lang);
        project.updatedAt = nowIso();
        saveTrackerAndNotify(data, project);
    } catch {
        // best-effort
    }
    
    // Build response with guidance
    const guidance: string[] = [];
    if (verification.hasErrors) {
        guidance.push(lang === 'en' 
            ? '⚠️ Errors detected. Review and fix before proceeding.'
            : '⚠️ 检测到错误。继续之前请检查并修复。');
    } else {
        guidance.push(lang === 'en' 
            ? '✓ Action verified successfully.'
            : '✓ 操作验证成功。');
    }
    if (nextStep) {
        guidance.push(lang === 'en' 
            ? `Next: ${nextStep}`
            : `下一步: ${nextStep}`);
    }
    
    return { 
        content: [{ 
            type: 'text', 
            text: JSON.stringify({ verification, guidance }, null, 2) 
        }] 
    };
}

async function handleGenerateUserStories(args: any): Promise<any> {
    const lang = getUiLanguage();
    const { epic, stories, outputFormat = 'markdown', savePath } = args;
    
    if (!Array.isArray(stories) || stories.length === 0) {
        const msg = lang === 'en' 
            ? 'generate_user_stories requires at least one story.'
            : 'generate_user_stories 需要至少一个用户故事。';
        throw new Error(msg);
    }
    
    // Format stories
    const formattedStories = stories.map((story: any, idx: number) => {
        const ac = Array.isArray(story.acceptanceCriteria) ? story.acceptanceCriteria : [];
        return {
            id: `US-${String(idx + 1).padStart(3, '0')}`,
            title: story.title || '',
            asA: story.asA || '',
            iWant: story.iWant || '',
            soThat: story.soThat || '',
            acceptanceCriteria: ac.map((criteria: any, cIdx: number) => ({
                id: `AC-${idx + 1}.${cIdx + 1}`,
                given: criteria.given || '',
                when: criteria.when || '',
                then: criteria.then || ''
            })),
            priority: story.priority || 'should',
            storyPoints: story.storyPoints || 0,
            tags: Array.isArray(story.tags) ? story.tags : []
        };
    });
    
    let output = '';
    
    if (outputFormat === 'json') {
        output = JSON.stringify({ epic, stories: formattedStories }, null, 2);
    } else if (outputFormat === 'jira') {
        // JIRA-compatible format
        const jiraStories = formattedStories.map((s: any) => ({
            summary: s.title,
            description: `*As a* ${s.asA}\n*I want* ${s.iWant}\n*So that* ${s.soThat}\n\nh3. Acceptance Criteria\n${s.acceptanceCriteria.map((ac: any) => 
                `* *Given* ${ac.given}\n  *When* ${ac.when}\n  *Then* ${ac.then}`
            ).join('\n')}`,
            priority: s.priority === 'must' ? 'Highest' : s.priority === 'should' ? 'High' : s.priority === 'could' ? 'Medium' : 'Low',
            storyPoints: s.storyPoints,
            labels: s.tags
        }));
        output = JSON.stringify({ epic, stories: jiraStories }, null, 2);
    } else {
        // Markdown format
        const lines: string[] = [];
        if (epic) lines.push(`# Epic: ${epic}\n`);
        
        for (const s of formattedStories) {
            lines.push(`## ${s.id}: ${s.title}`);
            lines.push(`**Priority:** ${s.priority.toUpperCase()} | **Story Points:** ${s.storyPoints}`);
            if (s.tags.length) lines.push(`**Tags:** ${s.tags.join(', ')}`);
            lines.push('');
            lines.push(`> **As a** ${s.asA}`);
            lines.push(`> **I want** ${s.iWant}`);
            lines.push(`> **So that** ${s.soThat}`);
            lines.push('');
            lines.push('### Acceptance Criteria');
            for (const ac of s.acceptanceCriteria) {
                lines.push(`#### ${ac.id}`);
                lines.push(`- **Given** ${ac.given}`);
                lines.push(`- **When** ${ac.when}`);
                lines.push(`- **Then** ${ac.then}`);
                lines.push('');
            }
            lines.push('---\n');
        }
        output = lines.join('\n');
    }
    
    // Save to .wam folder if path provided
    if (savePath) {
        try {
            const rootPath = getWorkspaceRootPath() || '';
            const wamDir = path.join(rootPath, '.wam');
            const fullPath = path.join(wamDir, savePath);
            const dir = path.dirname(fullPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(fullPath, output, 'utf-8');
            const savedMsg = lang === 'en' 
                ? `User stories saved to: ${fullPath}`
                : `用户故事已保存到: ${fullPath}`;
            return { content: [{ type: 'text', text: `${savedMsg}\n\n${output}` }] };
        } catch (e: any) {
            const errMsg = lang === 'en'
                ? `Failed to save: ${e?.message}`
                : `保存失败: ${e?.message}`;
            return { content: [{ type: 'text', text: `${errMsg}\n\n${output}` }] };
        }
    }
    
    return { content: [{ type: 'text', text: output }] };
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
    let resolvedReason = String(reason || '').trim() || getDefaultReason(lang);
    
    // Build project context for final output
    let projectContext: any = null;
    try {
        const { data, project } = resolveProjectTracker();
        const snapshot = buildTrackerSnapshot(project);
        const progress = snapshot.progress;
        
        projectContext = {
            project,
            snapshot,
            progress,
            data
        };
        
        if (progress.total > 0) {
            const prefix = lang === 'en' ? '[Auto]' : '【自动】';
            const progLine =
                lang === 'en'
                    ? `${prefix} Plan progress: ${progress.done}/${progress.total} (${progress.percent}%)`
                    : `${prefix} Plan 进度：${progress.done}/${progress.total}（${progress.percent}%）`;
            const warnLine =
                progress.done < progress.total
                    ? (lang === 'en'
                        ? `${prefix} Warning: Plan is not complete — update_plan before final delivery.`
                        : `${prefix} 警告：Plan 未完成 —— 请先 update_plan 更新进度再交付。`)
                    : '';
            const appendix = [progLine, warnLine].filter(Boolean).join('\n');
            if (appendix && !resolvedReason.includes(progLine)) {
                resolvedReason = `${resolvedReason}\n\n${appendix}`.trim();
            }
        }

        // Always keep Walkthrough up-to-date: record that we reached a completion gate.
        try {
            const snippet = resolvedReason.replace(/\s+/g, ' ').slice(0, 140);
            const entry = lang === 'en'
                ? `ask_continue called (completion gate). Reason snippet: ${snippet}`
                : `已调用 ask_continue（交付门禁）。原因摘要：${snippet}`;
            const recent = String(project.walkthrough?.content || '').slice(-240);
            if (!recent.includes('ask_continue')) {
                bumpProjectStat(project, 'walkthroughUpdates');
                appendWalkthroughEntry(project, entry, lang);
                project.updatedAt = nowIso();
                saveTrackerAndNotify(data, project);
            }
        } catch {
            // ignore
        }
    } catch {
        // best-effort
    }

    const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    return new Promise((resolve) => {
        sidebarProvider?.showContinueDialog(requestId, resolvedReason);

        pendingRequests.set(requestId, {
            resolve: (value: any) => {
                pendingRequests.delete(requestId);
                
                // User wants to continue
                if (value && value.continue) {
                    const content: any[] = [];
                    let text = tr('tool.userContinue', {}, lang);
                    if (value.instruction) {
                        text += tr('tool.newInstruction', { instruction: value.instruction }, lang);
                    }
                    content.push({ type: 'text', text });
                    // Handle images
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
                    resolve({ content });
                } else {
                    // User ended - generate FINAL OUTPUT
                    const finalOutput = generateFinalOutput(projectContext, lang, resolvedReason);
                    resolve({ content: [{ type: 'text', text: finalOutput }] });
                }
            },
            reject: () => {
                pendingRequests.delete(requestId);
                // User cancelled - also generate final output
                const finalOutput = generateFinalOutput(projectContext, lang, resolvedReason);
                resolve({ content: [{ type: 'text', text: finalOutput }] });
            },
            timestamp: Date.now()
        });
    });
}

async function handleWamClear(args: any): Promise<any> {
    const lang = getUiLanguage();
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const scope = args?.scope === 'all' ? 'all' : 'project';
    const keepMemory = args?.keepMemory === true;
    
    // Require user confirmation
    const confirmMsg = lang === 'en'
        ? `⚠️ WARNING: This will permanently delete all WAM data for this project!\n\nScope: ${scope}\nKeep Memory: ${keepMemory}\n\nAre you sure you want to proceed?`
        : `⚠️ 警告：这将永久删除此项目的所有 WAM 数据！\n\n范围: ${scope}\n保留记忆: ${keepMemory}\n\n确定要继续吗？`;
    
    const confirmed = await requestConfirmation(confirmMsg, lang === 'en' ? 'Clear WAM Data' : '清除 WAM 数据');
    if (!confirmed) {
        const text = lang === 'en' ? 'WAM clear canceled.' : 'WAM 清除已取消。';
        return { content: [{ type: 'text', text }] };
    }
    
    try {
        const { data, project, rootPath: resolvedRoot } = resolveProjectTracker(rootPath);
        
        // Clear project tracker data
        project.plan = { summary: '', items: [] };
        project.prd = { content: '', status: 'draft' };
        project.overview = { content: '', updatedAt: nowIso() };
        project.walkthrough = { content: '', updatedAt: nowIso() };
        project.stats = normalizeTrackerStats({});
        project.updatedAt = nowIso();
        
        // Clear memory unless keepMemory is true
        if (!keepMemory) {
            try {
                const { data: memData, project: memProject } = resolveProjectMemory(resolvedRoot);
                memProject.memories = {};
                memProject.timeline = [];
                saveMemoryData(memData);
            } catch {
                // ignore memory errors
            }
        }
        
        // Clear WAM commits directory
        if (project.projectId) {
            try {
                const wamDir = resolveProjectWamDir(project.projectId);
                if (wamDir && fs.existsSync(wamDir)) {
                    fs.rmSync(wamDir, { recursive: true, force: true });
                }
            } catch {
                // ignore
            }
        }
        
        saveTrackerAndNotify(data, project);
        
        const text = lang === 'en' 
            ? `✅ WAM data cleared for project. ${keepMemory ? 'Memory preserved.' : 'Memory also cleared.'}`
            : `✅ 项目 WAM 数据已清除。${keepMemory ? '记忆已保留。' : '记忆也已清除。'}`;
        return { content: [{ type: 'text', text }] };
    } catch (e: any) {
        const msg = lang === 'en' 
            ? `WAM clear failed: ${e?.message}`
            : `WAM 清除失败: ${e?.message}`;
        throw new Error(msg);
    }
}

async function handleCodeReview(args: any): Promise<any> {
    const lang = getUiLanguage();
    const { filesReviewed, qualityChecks, gaps, acceptanceCriteriaMet, summary } = args;
    
    if (!summary) {
        const msg = lang === 'en' ? 'code_review requires summary.' : 'code_review 需要 summary。';
        throw new Error(msg);
    }
    
    const review = {
        timestamp: nowIso(),
        filesReviewed: Array.isArray(filesReviewed) ? filesReviewed : [],
        qualityChecks: qualityChecks || {},
        gaps: Array.isArray(gaps) ? gaps : [],
        acceptanceCriteriaMet: Array.isArray(acceptanceCriteriaMet) ? acceptanceCriteriaMet : [],
        summary: summary || ''
    };
    
    // Calculate review score
    const checks = review.qualityChecks;
    const passedChecks = [checks.lintPassed, checks.testsPassed, checks.buildPassed, checks.securityChecked].filter(Boolean).length;
    const totalChecks = 4;
    const checkScore = Math.round((passedChecks / totalChecks) * 100);
    
    // Determine if ready for completion
    const hasGaps = review.gaps.length > 0;
    const allChecksPassed = passedChecks === totalChecks;
    const readyForCompletion = allChecksPassed && !hasGaps;
    
    // Log to walkthrough
    try {
        const { data, project } = resolveProjectTracker();
        const entry = lang === 'en'
            ? `[Code Review] Score: ${checkScore}% | Gaps: ${review.gaps.length} | Ready: ${readyForCompletion ? 'Yes' : 'No'}`
            : `[代码审查] 得分: ${checkScore}% | 缺口: ${review.gaps.length} | 就绪: ${readyForCompletion ? '是' : '否'}`;
        appendWalkthroughEntry(project, entry, lang);
        project.updatedAt = nowIso();
        saveTrackerAndNotify(data, project);
    } catch {
        // best-effort
    }
    
    // Build response
    const lines: string[] = [];
    lines.push(lang === 'en' ? '## Code Review Results' : '## 代码审查结果');
    lines.push('');
    lines.push(`**${lang === 'en' ? 'Summary' : '摘要'}:** ${summary}`);
    lines.push(`**${lang === 'en' ? 'Quality Score' : '质量得分'}:** ${checkScore}%`);
    lines.push('');
    
    lines.push(lang === 'en' ? '### Quality Checks' : '### 质量检查');
    lines.push(`- Lint/Format: ${checks.lintPassed ? '✅' : '❌'}`);
    lines.push(`- Tests: ${checks.testsPassed ? '✅' : '❌'}`);
    lines.push(`- Build: ${checks.buildPassed ? '✅' : '❌'}`);
    lines.push(`- Security: ${checks.securityChecked ? '✅' : '❌'}`);
    lines.push('');
    
    if (review.gaps.length > 0) {
        lines.push(lang === 'en' ? '### ⚠️ Identified Gaps' : '### ⚠️ 识别的缺口');
        review.gaps.forEach(gap => lines.push(`- ${gap}`));
        lines.push('');
    }
    
    if (review.acceptanceCriteriaMet.length > 0) {
        lines.push(lang === 'en' ? '### ✅ Acceptance Criteria Met' : '### ✅ 已满足的验收标准');
        review.acceptanceCriteriaMet.forEach(ac => lines.push(`- ${ac}`));
        lines.push('');
    }
    
    if (review.filesReviewed.length > 0) {
        lines.push(lang === 'en' ? '### Files Reviewed' : '### 已审查文件');
        review.filesReviewed.slice(0, 10).forEach(f => lines.push(`- ${f}`));
        if (review.filesReviewed.length > 10) {
            lines.push(`... ${lang === 'en' ? 'and' : '及'} ${review.filesReviewed.length - 10} ${lang === 'en' ? 'more' : '更多'}`);
        }
        lines.push('');
    }
    
    // Verdict
    lines.push('---');
    if (readyForCompletion) {
        lines.push(lang === 'en' 
            ? '✅ **READY FOR COMPLETION** - You may now call ask_continue()'
            : '✅ **已就绪** - 现在可以调用 ask_continue()');
    } else {
        lines.push(lang === 'en'
            ? '❌ **NOT READY** - Fix gaps and ensure all checks pass before calling ask_continue()'
            : '❌ **未就绪** - 请修复缺口并确保所有检查通过后再调用 ask_continue()');
    }
    
    const responseText = lines.join('\n');
    return { 
        content: [
            { type: 'text', text: responseText },
            { type: 'text', text: `CODE_REVIEW_JSON:\n${JSON.stringify({ review, checkScore, readyForCompletion }, null, 2)}` }
        ] 
    };
}

function generateFinalOutput(projectContext: any, lang: UiLanguage, reason: string): string {
    const lines: string[] = [];
    
    // Header
    lines.push('=' .repeat(60));
    lines.push(lang === 'en' ? '🎯 FINAL OUTPUT - TASK COMPLETED' : '🎯 最终输出 - 任务完成');
    lines.push('='.repeat(60));
    lines.push('');
    
    // Completion reason
    lines.push(lang === 'en' ? '## Completion Summary' : '## 完成摘要');
    lines.push(reason.slice(0, 500));
    lines.push('');
    
    if (projectContext) {
        const { project, progress } = projectContext;
        
        // Progress
        lines.push(lang === 'en' ? '## Plan Progress' : '## 计划进度');
        lines.push(`**${lang === 'en' ? 'Status' : '状态'}:** ${progress.done}/${progress.total} (${progress.percent}%)`);
        if (progress.percent === 100) {
            lines.push(lang === 'en' ? '✅ All plan items completed!' : '✅ 所有计划项已完成！');
        } else {
            lines.push(lang === 'en' ? '⚠️ Some items remain incomplete' : '⚠️ 部分项目未完成');
        }
        lines.push('');
        
        // Completed items
        const doneItems = (project.plan?.items || []).filter((it: any) => it.status === 'done');
        if (doneItems.length > 0) {
            lines.push(lang === 'en' ? '## Completed Items' : '## 已完成项目');
            doneItems.slice(-10).forEach((it: any) => {
                lines.push(`✓ ${it.text.slice(0, 80)}`);
            });
            if (doneItems.length > 10) {
                lines.push(`... ${lang === 'en' ? 'and' : '及'} ${doneItems.length - 10} ${lang === 'en' ? 'more' : '项'}`);
            }
            lines.push('');
        }
        
        // Remaining items (if any)
        const remainingItems = (project.plan?.items || []).filter((it: any) => it.status !== 'done');
        if (remainingItems.length > 0) {
            lines.push(lang === 'en' ? '## Remaining Items (if continuing later)' : '## 剩余项目（待后续处理）');
            remainingItems.slice(0, 5).forEach((it: any) => {
                const status = it.status === 'doing' ? '🔄' : '○';
                lines.push(`${status} ${it.text.slice(0, 80)}`);
            });
            if (remainingItems.length > 5) {
                lines.push(`... ${lang === 'en' ? 'and' : '及'} ${remainingItems.length - 5} ${lang === 'en' ? 'more' : '项'}`);
            }
            lines.push('');
        }
        
        // Key deliverables
        lines.push(lang === 'en' ? '## Key Deliverables' : '## 主要交付物');
        if (project.overview?.content) {
            lines.push(`✓ ${lang === 'en' ? 'Project Overview' : '项目概览'}`);
        }
        if (project.prd?.content) {
            lines.push(`✓ ${lang === 'en' ? 'PRD Document' : 'PRD 文档'} (${project.prd.status === 'approved' ? '✅ Approved' : '⏳ Draft'})`);
        }
        if (project.plan?.items?.length) {
            lines.push(`✓ ${lang === 'en' ? 'Plan with' : '计划包含'} ${project.plan.items.length} ${lang === 'en' ? 'items' : '项'}`);
        }
        if (project.walkthrough?.content) {
            lines.push(`✓ ${lang === 'en' ? 'Walkthrough Documentation' : '走查文档'}`);
        }
        lines.push('');
    }
    
    // Footer
    lines.push('='.repeat(60));
    lines.push(lang === 'en' 
        ? '👋 Session ended. Use "Continue" button to resume with new instructions.'
        : '👋 会话已结束。点击"继续"按钮可输入新指令继续。');
    lines.push('='.repeat(60));
    
    return lines.join('\n');
}

async function handleCheckPlan(args: any): Promise<any> {
    const lang = getUiLanguage();
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const { data, project } = resolveProjectTracker(rootPath);
    project.stats = normalizeTrackerStats(project.stats);
    project.stats.lastCheckPlanAt = nowIso();
    saveTrackerData(data);
    const snapshot = buildTrackerSnapshot(project);
    const progress = snapshot.progress;
    const remaining = (project.plan.items || []).filter((i) => i && i.status !== 'done').map((i) => i.text).slice(0, 50);

    const header = lang === 'en' ? 'Plan status:' : 'Plan 状态：';
    const summary =
        lang === 'en'
            ? `Progress: ${progress.done}/${progress.total} (${progress.percent}%)`
            : `进度：${progress.done}/${progress.total}（${progress.percent}%）`;
    const remainingLabel = lang === 'en' ? 'Remaining (top 50):' : '未完成（最多 50 条）：';
    const remainingText = remaining.length ? remaining.map((t) => `- ${t}`).join('\n') : (lang === 'en' ? '(none)' : '（无）');
    return {
        content: [
            { type: 'text', text: header },
            { type: 'text', text: summary },
            { type: 'text', text: `${remainingLabel}\n${remainingText}` },
            { type: 'text', text: `PLAN_STATUS_JSON:\n${JSON.stringify({ progress, remaining }, null, 2)}` }
        ]
    };
}

async function handleEnsureReleaseGate(args: any): Promise<any> {
    const lang = getUiLanguage();
    const rootPath = typeof args?.rootPath === 'string' ? args.rootPath : undefined;
    const { data, project } = resolveProjectTracker(rootPath);
    const now = nowIso();

    const signals = detectProjectSignals(project.rootPath);
    const hasNode = signals.includes('Node.js');
    const hasPython = signals.includes('Python');
    const hasGo = signals.includes('Go');
    const hasRust = signals.includes('Rust');
    const hasJava = signals.includes('Java/Kotlin');

    const heading = lang === 'en' ? 'Release Gate (before shipping)' : '发布门禁（交付前）';
    const items: string[] = [
        heading,
        lang === 'en' ? 'Run build / compile' : '运行 build / compile',
        lang === 'en' ? 'Run tests (unit/integration) and verify locally' : '运行测试（单元/集成）并本地验证',
        lang === 'en' ? 'Run lint/format and fix warnings' : '运行 lint/format 并修复警告',
        lang === 'en'
            ? 'Dependency/security scan: outdated + vulnerable packages (npm audit + OSV/Dependabot or stack equivalent)'
            : '依赖/安全扫描：过时 + 漏洞包（npm audit + OSV/Dependabot 或同类工具）',
        lang === 'en' ? 'Security review: secrets, sensitive writes, permissions, injection risks' : '安全复审：密钥/敏感写入/权限/注入风险',
        lang === 'en' ? 'Performance review: avoid leaks, large sync I/O, hotspots' : '性能复审：避免泄漏、过多同步 I/O、热点',
        lang === 'en' ? 'Docs: README/update notes, usage, restart requirements (hooks)' : '文档：README/更新说明/用法/重启要求（hooks）',
        lang === 'en' ? 'Final code review (gaps/edge-cases) and verify acceptance criteria' : '最终代码审查（缺口/边界情况）并验证验收标准',
        lang === 'en' ? 'Update Plan progress and run check_plan' : '更新 Plan 进度并运行 check_plan',
        lang === 'en' ? 'Record lessons (record_lesson) for any mistakes/rollbacks' : '记录经验（record_lesson），包含错误/回滚',
        lang === 'en' ? 'Finish via ask_continue(reason)' : '用 ask_continue(reason) 收尾'
    ];

    const stackHints: string[] = [];
    if (hasNode) stackHints.push(lang === 'en' ? 'Suggested commands: npm run build / npm test / npm run lint' : '建议命令：npm run build / npm test / npm run lint');
    if (hasPython) stackHints.push(lang === 'en' ? 'Suggested commands: python -m pytest / ruff / black' : '建议命令：python -m pytest / ruff / black');
    if (hasGo) stackHints.push(lang === 'en' ? 'Suggested commands: go test ./... / go vet ./...' : '建议命令：go test ./... / go vet ./...');
    if (hasRust) stackHints.push(lang === 'en' ? 'Suggested commands: cargo test / cargo clippy' : '建议命令：cargo test / cargo clippy');
    if (hasJava) stackHints.push(lang === 'en' ? 'Suggested commands: mvn test / gradle test' : '建议命令：mvn test / gradle test');

    const existingTexts = new Set<string>((project.plan.items || []).map((i) => normalizePathForCompare(String(i?.text || '').trim())));
    const added: TrackerItem[] = [];
    for (const text of items) {
        const normalized = normalizePathForCompare(String(text || '').trim());
        if (!normalized || existingTexts.has(normalized)) continue;
        const item: TrackerItem = {
            id: `item_${Math.random().toString(36).slice(2, 10)}`,
            text,
            status: 'todo',
            updatedAt: now
        };
        project.plan.items.push(item);
        existingTexts.add(normalized);
        added.push(item);
    }

    if (!project.plan.summary?.trim()) {
        const hint = stackHints.length ? `\n\n${stackHints.map((h) => `- ${h}`).join('\n')}` : '';
        project.plan.summary = (lang === 'en'
            ? `This Plan is a single checklist. Use it to track progress and keep the release gate at the end.${hint}`
            : `本 Plan 仅保留一份 Checklist，用于跟踪进度；发布门禁放在末尾。${hint}`).trim();
    }

    bumpProjectStat(project, 'planUpdates');
    appendWalkthroughEntry(project, lang === 'en' ? 'Release gate ensured in Plan.' : '已在 Plan 中加入发布门禁。', lang);
    project.updatedAt = nowIso();
    saveTrackerAndNotify(data, project);

    const text =
        added.length > 0
            ? (lang === 'en' ? `Release gate added to Plan (${added.length} items).` : `已将发布门禁加入 Plan（新增 ${added.length} 条）。`)
            : (lang === 'en' ? 'Release gate already present in Plan.' : 'Plan 中已存在发布门禁。');
    return { content: [{ type: 'text', text }, { type: 'text', text: `PLAN_JSON:\n${JSON.stringify(buildTrackerSnapshot(project), null, 2)}` }] };
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

// ==================== Popup Panels (PRD/Task/Plan/etc) ====================

let prdPanel: vscode.WebviewPanel | null = null;
let overviewPanel: vscode.WebviewPanel | null = null;
let planPanel: vscode.WebviewPanel | null = null;
let walkthroughPanel: vscode.WebviewPanel | null = null;
let memoryPanel: vscode.WebviewPanel | null = null;
let wamPanel: vscode.WebviewPanel | null = null;
let auditPanel: vscode.WebviewPanel | null = null;

function resolveProjectForPanel(): ProjectTracker | null {
    try {
        const { data, project } = resolveProjectTracker();
        saveTrackerData(data);
        return project;
    } catch (e: any) {
        vscode.window.showErrorMessage(e?.message ?? String(e));
        return null;
    }
}

function refreshOpenPanels(project: ProjectTracker) {
    const lang = getUiLanguage();
    if (overviewPanel) overviewPanel.webview.html = getOverviewPanelHtml(project, lang, overviewPanel.webview);
    if (prdPanel) prdPanel.webview.html = getPrdPanelHtml(project, lang, prdPanel.webview);
    if (planPanel) planPanel.webview.html = getPlanPanelHtml(project, lang, planPanel.webview);
    if (walkthroughPanel) walkthroughPanel.webview.html = getWalkthroughPanelHtml(project, lang, walkthroughPanel.webview);
    if (memoryPanel) {
        try {
            const { project: memoryStore } = resolveProjectMemory(project.rootPath);
            const globalMemory = loadGlobalMemoryData();
            memoryPanel.webview.html = getMemoryPanelHtml(project, memoryStore, globalMemory, lang, memoryPanel.webview);
        } catch (e: any) {
            outputChannel?.appendLine(`Memory panel refresh failed: ${e?.message ?? String(e)}`);
        }
    }
    if (wamPanel) {
        try {
            wamPanel.webview.html = getWamPanelHtml(project, lang, wamPanel.webview);
        } catch (e: any) {
            outputChannel?.appendLine(`WAM panel refresh failed: ${e?.message ?? String(e)}`);
        }
    }
    if (auditPanel) {
        try {
            auditPanel.webview.html = getAuditPanelHtml(project, lang, auditPanel.webview);
        } catch (e: any) {
            outputChannel?.appendLine(`Audit panel refresh failed: ${e?.message ?? String(e)}`);
        }
    }
}

function showOverviewPanel() {
    const project = resolveProjectForPanel();
    if (!project) return;
    const lang = getUiLanguage();
    if (overviewPanel) overviewPanel.dispose();
    overviewPanel = vscode.window.createWebviewPanel(
        'mcpOverview',
        tr('panel.overviewTitle', {}, lang),
        vscode.ViewColumn.Two,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionContext.extensionUri] }
    );
    overviewPanel.webview.html = getOverviewPanelHtml(project, lang, overviewPanel.webview);
    overviewPanel.onDidDispose(() => { overviewPanel = null; });
}

function showPrdPanel() {
    const project = resolveProjectForPanel();
    if (!project) return;
    const lang = getUiLanguage();
    if (prdPanel) prdPanel.dispose();
    prdPanel = vscode.window.createWebviewPanel(
        'mcpPrd',
        tr('panel.prdPanelTitle', {}, lang),
        vscode.ViewColumn.Two,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionContext.extensionUri] }
    );
    prdPanel.webview.html = getPrdPanelHtml(project, lang, prdPanel.webview);
    prdPanel.onDidDispose(() => { prdPanel = null; });
}

function showPlanPanel() {
    const project = resolveProjectForPanel();
    if (!project) return;
    const lang = getUiLanguage();
    if (planPanel) planPanel.dispose();
    planPanel = vscode.window.createWebviewPanel(
        'mcpPlan',
        tr('panel.planTitle', {}, lang),
        vscode.ViewColumn.Two,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionContext.extensionUri] }
    );
    planPanel.webview.html = getPlanPanelHtml(project, lang, planPanel.webview);
    planPanel.onDidDispose(() => { planPanel = null; });
}

function showWalkthroughPanel() {
    const project = resolveProjectForPanel();
    if (!project) return;
    const lang = getUiLanguage();
    if (walkthroughPanel) walkthroughPanel.dispose();
    walkthroughPanel = vscode.window.createWebviewPanel(
        'mcpWalkthrough',
        tr('panel.walkthroughTitle', {}, lang),
        vscode.ViewColumn.Two,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionContext.extensionUri] }
    );
    walkthroughPanel.webview.html = getWalkthroughPanelHtml(project, lang, walkthroughPanel.webview);
    walkthroughPanel.onDidDispose(() => { walkthroughPanel = null; });
}

function showMemoryPanel() {
    const project = resolveProjectForPanel();
    if (!project) return;
    const lang = getUiLanguage();
    const { project: memoryStore } = resolveProjectMemory(project.rootPath);
    const globalMemory = loadGlobalMemoryData();
    if (memoryPanel) memoryPanel.dispose();
    memoryPanel = vscode.window.createWebviewPanel(
        'mcpMemory',
        tr('panel.memoryTitle', {}, lang),
        vscode.ViewColumn.Two,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionContext.extensionUri] }
    );
    memoryPanel.webview.html = getMemoryPanelHtml(project, memoryStore, globalMemory, lang, memoryPanel.webview);
    memoryPanel.onDidDispose(() => { memoryPanel = null; });
}

function showWamPanel() {
    const project = resolveProjectForPanel();
    if (!project) return;
    const lang = getUiLanguage();
    if (wamPanel) wamPanel.dispose();
    wamPanel = vscode.window.createWebviewPanel(
        'mcpWam',
        tr('panel.wamTitle', {}, lang),
        vscode.ViewColumn.Two,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionContext.extensionUri] }
    );
    wamPanel.webview.html = getWamPanelHtml(project, lang, wamPanel.webview);
    wamPanel.onDidDispose(() => { wamPanel = null; });
}

function showAuditPanel() {
    const project = resolveProjectForPanel();
    if (!project) return;
    const lang = getUiLanguage();
    if (auditPanel) auditPanel.dispose();
    auditPanel = vscode.window.createWebviewPanel(
        'mcpAudit',
        tr('panel.auditTitle', {}, lang),
        vscode.ViewColumn.Two,
        { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [extensionContext.extensionUri] }
    );
    auditPanel.webview.html = getAuditPanelHtml(project, lang, auditPanel.webview);
    auditPanel.onDidDispose(() => { auditPanel = null; });
}

function getPanelShellHtml(
    webview: vscode.Webview,
    title: string,
    subtitle: string,
    badge: string,
    body: string,
    lang: UiLanguage,
    options?: { mermaid?: boolean; extraScript?: string }
): string {
    const nonce = getNonce();
    const csp = [
        `default-src 'none'`,
        `img-src ${webview.cspSource} data: blob:`,
        `style-src 'unsafe-inline' ${webview.cspSource}`,
        `script-src 'nonce-${nonce}' ${webview.cspSource}`,
        `font-src 'none'`,
        `connect-src 'none'`
    ].join('; ');
    const safeTitle = escapeHtml(title);
    const safeSubtitle = subtitle ? escapeHtml(subtitle) : '';
    const safeBadge = badge ? escapeHtml(badge) : '';
    const subtitleHtml = safeSubtitle ? `<div class="subtitle">${safeSubtitle}</div>` : '';
    const badgeHtml = safeBadge ? `<div class="badge">${safeBadge}</div>` : '';

    const useMermaid = options?.mermaid === true;
    const extraScript = typeof options?.extraScript === 'string' ? options.extraScript : '';
    const mermaidUri = useMermaid
        ? webview.asWebviewUri(vscode.Uri.joinPath(extensionContext.extensionUri, 'resources', 'vendor', 'mermaid.min.js')).toString()
        : '';
	    const mermaidScripts = useMermaid
	        ? `
	    <script nonce="${nonce}" src="${mermaidUri}"></script>
	    <script nonce="${nonce}">
        (function () {
            try {
                if (!window.mermaid) return;
                window.mermaid.initialize({
                    startOnLoad: false,
                    theme: 'dark',
                    securityLevel: 'strict'
                });
                const nodes = document.querySelectorAll('.mermaid');
                if (nodes && nodes.length > 0) {
                    window.mermaid.run({ nodes });
                }
            } catch (e) {
                // best-effort; keep panel usable even if rendering fails
            }
        })();
	    </script>`
	        : '';
	    const extraScriptHtml = extraScript ? `<script nonce="${nonce}">${extraScript}</script>` : '';

    return `<!DOCTYPE html>
<html lang="${lang === 'en' ? 'en' : 'zh-CN'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>${safeTitle}</title>
    <style>
        :root {
            --radius: 4px;
            --font-family: var(--vscode-font-family, "Segoe UI", sans-serif);
        }
        body {
            margin: 0;
            padding: 24px;
            color: var(--vscode-foreground);
            font-family: var(--font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            line-height: 1.5;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .stage {
            display: flex;
            flex-direction: column;
            gap: 20px;
            max-width: 1000px;
            margin: 0 auto;
        }

        .hero {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: var(--radius);
            padding: 16px;
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .hero h1 { font-size: 20px; font-weight: 600; margin: 0; color: var(--vscode-foreground); }
        .subtitle { font-size: 12px; color: var(--vscode-descriptionForeground); }
        .badge {
            align-self: flex-start;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            text-transform: uppercase;
        }

        .grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 16px;
        }

        .card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-widget-border);
            border-radius: var(--radius);
            padding: 16px;
            display: flex;
            flex-direction: column;
        }
        .card-title {
            font-size: 11px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
            font-weight: 600;
            letter-spacing: 0.5px;
        }
        .card-body {
            font-size: 13px;
            line-height: 1.6;
            color: var(--vscode-foreground);
        }

        /* Markdown Styles */
        .markdown { white-space: normal; }
        .markdown h1, .markdown h2, .markdown h3, .markdown h4 {
            margin: 16px 0 8px;
            font-weight: 600;
            color: var(--vscode-foreground);
        }
        .markdown h1 { font-size: 18px; }
        .markdown h2 { font-size: 16px; }
        .markdown h3 { font-size: 14px; }
        .markdown p { margin: 0 0 12px; }
        .markdown ul, .markdown ol { margin: 0 0 12px 20px; padding: 0; }
        .markdown li { margin-bottom: 4px; }
        .markdown code {
            font-family: var(--vscode-editor-font-family, monospace);
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
            font-size: 12px;
        }
        .markdown pre {
            background: var(--vscode-textCodeBlock-background);
            border: 1px solid var(--vscode-widget-border);
            padding: 12px;
            border-radius: var(--radius);
            overflow-x: auto;
            margin-bottom: 12px;
        }
        .markdown pre code { background: transparent; padding: 0; }
        .markdown blockquote {
            border-left: 4px solid var(--vscode-textBlockQuote-border);
            background: var(--vscode-textBlockQuote-background);
            margin: 0 0 12px;
            padding: 8px 12px;
        }
        .markdown table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 12px;
            font-size: 12px;
        }
        .markdown th, .markdown td {
            border: 1px solid var(--vscode-widget-border);
            padding: 8px;
            text-align: left;
        }
        .markdown th { background: var(--vscode-list-hoverBackground); font-weight: 600; }
        .markdown .mermaid svg { max-width: 100%; height: auto; background: var(--vscode-editor-background); }

        /* Helpers */
        .empty { color: var(--vscode-descriptionForeground); font-style: italic; }

        /* Progress Bar */
        .progress { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; }
        .progress-bar {
            height: 6px;
            border-radius: 3px;
            background: var(--vscode-widget-border);
            overflow: hidden;
        }
        .progress-fill {
            height: 100%;
            background: var(--vscode-progressBar-background);
            width: 0%;
            transition: width 0.3s ease;
        }
        .progress-meta {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            justify-content: space-between;
        }

        /* Lists */
        .list { display: flex; flex-direction: column; gap: 8px; }
        .item {
            display: flex;
            gap: 12px;
            padding: 10px;
            border-radius: var(--radius);
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            align-items: flex-start;
        }
        .dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            margin-top: 6px;
            flex-shrink: 0;
        }
        .item.todo .dot { background: var(--vscode-descriptionForeground); }
        .item.doing .dot { background: var(--vscode-editorWarning-foreground); }
        .item.done .dot { background: var(--vscode-testing-iconPassed); }
        .item-content { flex: 1; min-width: 0; }
        .item-text { font-size: 13px; line-height: 1.5; word-wrap: break-word; }
        .item-meta { font-size: 11px; color: var(--vscode-descriptionForeground); margin-top: 2px; }

        /* Animations */
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        .card, .hero { animation: fadeIn 0.3s ease-out; }
    </style>
</head>
<body>
    <div class="stage">
        <div class="hero">
            <div>
                <h1>${safeTitle}</h1>
                ${subtitleHtml}
            </div>
            ${badgeHtml}
        </div>
        ${body}
    </div>
    ${mermaidScripts}
    ${extraScriptHtml}
</body>
</html>`;
	}

function renderTrackerItems(items: TrackerItem[], lang: UiLanguage): string {
    if (!items.length) {
        return `<div class="empty">${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</div>`;
    }
    return items
        .map((item, index) => {
            const label =
                item.status === 'done'
                    ? tr('panel.itemDone', {}, lang)
                    : item.status === 'doing'
                        ? tr('panel.itemDoing', {}, lang)
                        : tr('panel.itemTodo', {}, lang);
            const safeText = escapeHtml(item.text);
            return `<div class="item ${item.status}" style="animation-delay:${index * 40}ms">
                <div class="dot"></div>
                <div>
                    <div class="item-text">${safeText}</div>
                    <div class="item-meta">${escapeHtml(label)}</div>
                </div>
            </div>`;
        })
        .join('');
}

function getOverviewPanelHtml(project: ProjectTracker, lang: UiLanguage, webview: vscode.Webview): string {
    const content = project.overview?.content
        ? renderMarkdownToHtml(project.overview.content)
        : `<p>${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</p>`;
    const needsMermaid = content.includes('class="mermaid"');
    const body = `
        <section class="card">
            <div class="card-title">${escapeHtml(tr('panel.overviewTitle', {}, lang))}</div>
            <div class="card-body markdown">${content}</div>
        </section>
    `;
    return getPanelShellHtml(webview, tr('panel.overviewTitle', {}, lang), project.name, '', body, lang, { mermaid: needsMermaid });
}

function getPrdPanelHtml(project: ProjectTracker, lang: UiLanguage, webview: vscode.Webview): string {
    const statusLabel = project.prd.status === 'approved'
        ? tr('panel.prdStatusApproved', {}, lang)
        : tr('panel.prdStatusDraft', {}, lang);
    const badge = statusLabel;
    const content = project.prd.content
        ? renderMarkdownToHtml(project.prd.content)
        : `<p>${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</p>`;
    const needsMermaid = content.includes('class="mermaid"');
    const reviewNote = project.prd.reviewNote
        ? renderMarkdownToHtml(project.prd.reviewNote)
        : '';

    const body = `
        <div class="grid">
            <section class="card">
                <div class="card-title">${escapeHtml(tr('panel.sectionSummary', {}, lang))}</div>
                <div class="card-body markdown">${content}</div>
            </section>
            <section class="card">
                <div class="card-title">${escapeHtml(tr('panel.reviewNoteLabel', {}, lang))}</div>
                <div class="card-body markdown">${reviewNote || `<p class="empty">${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</p>`}</div>
            </section>
        </div>
    `;

    return getPanelShellHtml(webview, tr('panel.prdPanelTitle', {}, lang), project.name, badge, body, lang, { mermaid: needsMermaid });
}

function getPlanPanelHtml(project: ProjectTracker, lang: UiLanguage, webview: vscode.Webview): string {
    const activeSprint = project.sprints?.find(s => s.id === project.activeSprintId);
    
    let activeSection = '';
    if (activeSprint) {
        const activeItems = project.plan.items.filter(i => i.sprint === activeSprint.id);
        const progress = computeItemProgress(activeItems);
        activeSection = `
            <section class="card" style="border-left: 4px solid var(--vscode-charts-green)">
                <div class="card-title">🏃 ${escapeHtml(activeSprint.name)} (${activeSprint.status.toUpperCase()})</div>
                <div style="font-size: 12px; margin-bottom: 8px; color: var(--vscode-descriptionForeground)">
                    Goal: ${escapeHtml(activeSprint.goal || '-')}<br>
                    Ends: ${activeSprint.endDate ? activeSprint.endDate.slice(0, 10) : '-'}
                </div>
                <div class="progress">
                    <div class="progress-bar">
                        <div class="progress-fill" style="width:${progress.percent}%"></div>
                    </div>
                    <div class="progress-meta">${progress.done}/${progress.total} • ${progress.percent}%</div>
                </div>
                <div class="list">
                    ${renderTrackerItems(activeItems, lang)}
                </div>
            </section>
        `;
    }

    const backlogItems = project.plan.items.filter(i => !i.sprint || (activeSprint && i.sprint !== activeSprint.id));
    const summaryHtml = project.plan.summary
        ? `<div class="card-body markdown">${renderMarkdownToHtml(project.plan.summary)}</div>`
        : `<p class="empty">${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</p>`;

    const needsMermaid = summaryHtml.includes('class="mermaid"');
    const body = `
        ${activeSection}
        
        <section class="card">
            <div class="card-title">📦 Backlog</div>
            <div class="list">
                ${renderTrackerItems(backlogItems, lang)}
            </div>
        </section>

        <section class="card">
            <div class="card-title">${escapeHtml(tr('panel.sectionSummary', {}, lang))}</div>
            <div class="card-body markdown">${summaryHtml}</div>
        </section>
    `;
    const progress = computeItemProgress(project.plan.items); // Global progress
    const badge = activeSprint ? 'Running' : (progress.total > 0 ? `${progress.percent}%` : '');
    return getPanelShellHtml(webview, tr('panel.planTitle', {}, lang), project.name, badge, body, lang, { mermaid: needsMermaid });
}

function getWalkthroughPanelHtml(project: ProjectTracker, lang: UiLanguage, webview: vscode.Webview): string {
    const content = project.walkthrough.content
        ? renderMarkdownToHtml(project.walkthrough.content)
        : `<p>${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</p>`;
    const needsMermaid = content.includes('class="mermaid"');
    const body = `
        <section class="card">
            <div class="card-title">${escapeHtml(tr('panel.walkthroughSubtitle', {}, lang))}</div>
            <div class="card-body markdown">${content}</div>
        </section>
    `;
    return getPanelShellHtml(webview, tr('panel.walkthroughTitle', {}, lang), project.name, '', body, lang, { mermaid: needsMermaid });
}

function renderMemoryDetailsList(entries: MemoryEntry[], lang: UiLanguage): string {
    if (!entries.length) {
        return `<p class="empty">${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</p>`;
    }
    return entries
        .map((entry) => {
            const key = escapeHtml(entry.key);
            const kindValue = entry.kind === 'long' || entry.kind === 'lesson' ? entry.kind : 'short';
            const kind = escapeHtml(kindValue);
            const updatedAt = escapeHtml(entry.updatedAt || '');
            const tags = Array.isArray(entry.tags) ? entry.tags.filter(Boolean).map((t) => `<span class="chip">${escapeHtml(String(t))}</span>`).join('') : '';
            const links = Array.isArray(entry.links) ? entry.links.filter(Boolean).map((l) => `<span class="chip chip-link">${escapeHtml(String(l))}</span>`).join('') : '';
            const content = entry.content ? renderMarkdownToHtml(entry.content) : `<p class="empty">${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</p>`;
            return `
                <details class="mem-item">
                    <summary>
                        <span class="mem-key">${key}</span>
                        <span class="pill kind-${kindValue}">${kind}</span>
                        <span class="meta">${updatedAt}</span>
                    </summary>
                    <div class="mem-meta-row">${tags}${links}</div>
                    <div class="mem-body markdown">${content}</div>
                </details>
            `;
        })
        .join('');
}

function getMemoryPanelHtml(
    project: ProjectTracker,
    memoryStore: ProjectMemoryStore,
    globalMemory: GlobalMemoryData,
    lang: UiLanguage,
    webview: vscode.Webview
): string {
    const projectEntries = Object.values(memoryStore?.memories || {}).filter(Boolean) as MemoryEntry[];
    projectEntries.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
    const globalEntries = Object.values(globalMemory?.memories || {}).filter(Boolean) as MemoryEntry[];
    globalEntries.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));

    const body = `
        <style>
            .mem-grid { display: grid; grid-template-columns: 1.3fr 1fr; gap: 16px; margin-bottom: 16px; }
            .mem-count { color: var(--vscode-descriptionForeground); font-size: 12px; margin-bottom: 8px; }
            
            .mem-item { 
                border: 1px solid var(--vscode-widget-border); 
                border-radius: var(--radius); 
                background: var(--vscode-editor-background); 
                margin-bottom: 8px; 
                overflow: hidden; 
            }
            .mem-item summary { 
                list-style: none; 
                cursor: pointer; 
                padding: 10px 12px; 
                display: flex; 
                align-items: center; 
                gap: 10px; 
            }
            .mem-item summary:hover { background: var(--vscode-list-hoverBackground); }
            .mem-item summary::-webkit-details-marker { display: none; }
            
            .mem-key { font-weight: 600; font-size: 13px; color: var(--vscode-foreground); }
            
            .pill { 
                padding: 2px 8px; 
                border-radius: 12px; 
                font-size: 11px; 
                border: 1px solid var(--vscode-widget-border); 
                color: var(--vscode-descriptionForeground); 
            }
            .pill.kind-long { color: var(--vscode-symbolIcon-classForeground); border-color: var(--vscode-symbolIcon-classForeground); }
            .pill.kind-short { color: var(--vscode-symbolIcon-functionForeground); border-color: var(--vscode-symbolIcon-functionForeground); }
            .pill.kind-lesson { color: var(--vscode-symbolIcon-variableForeground); border-color: var(--vscode-symbolIcon-variableForeground); }
            
            .meta { margin-left: auto; color: var(--vscode-descriptionForeground); font-size: 11px; }
            
            .mem-meta-row { padding: 0 12px 10px; display: flex; flex-wrap: wrap; gap: 6px; }
            
            .chip { 
                font-size: 11px; 
                padding: 2px 6px; 
                border-radius: 4px; 
                background: var(--vscode-textCodeBlock-background); 
                border: 1px solid var(--vscode-widget-border); 
                color: var(--vscode-textPreformat-foreground); 
            }
            .chip-link { color: var(--vscode-textLink-foreground); cursor: pointer; }
            .chip-link:hover { text-decoration: underline; }
            
            .mem-body { padding: 0 12px 12px; font-size: 13px; color: var(--vscode-foreground); border-top: 1px solid var(--vscode-widget-border); margin-top: 4px; padding-top: 10px; }
            
            .graph-wrap { 
                width: 100%; 
                height: 400px; 
                border-radius: var(--radius); 
                border: 1px solid var(--vscode-widget-border); 
                background: var(--vscode-editor-background); 
                overflow: hidden; 
                position: relative; 
            }
            .graph-svg { width: 100%; height: 100%; }
            .graph-empty { color: var(--vscode-descriptionForeground); font-size: 12px; padding: 14px; text-align: center; }
            
            .graph-detail { 
                margin-top: 12px; 
                border-radius: var(--radius); 
                border: 1px solid var(--vscode-widget-border); 
                background: var(--vscode-editor-inactiveSelectionBackground); 
                padding: 12px; 
            }
            .graph-detail h3 { font-size: 13px; margin: 0 0 6px 0; font-weight: 600; }
            .graph-detail pre { 
                white-space: pre-wrap; 
                font-size: 12px; 
                line-height: 1.5; 
                margin: 0; 
                font-family: var(--vscode-editor-font-family); 
                color: var(--vscode-foreground);
            }
        </style>

        <div class="mem-grid">
            <section class="card">
                <div class="card-title">${escapeHtml(tr('panel.memoryProjectTitle', {}, lang))}</div>
                <div class="card-body">
                    <div class="mem-count">${projectEntries.length}</div>
                    ${renderMemoryDetailsList(projectEntries, lang)}
                </div>
            </section>

            <section class="card">
                <div class="card-title">${escapeHtml(tr('panel.memoryGraphTitle', {}, lang))}</div>
                <div class="card-body">
                    <div class="graph-wrap" id="graphWrap">
                        <svg class="graph-svg" id="memGraph" viewBox="0 0 900 420" preserveAspectRatio="xMidYMid meet"></svg>
                        <div class="graph-empty" id="graphEmpty" style="display:none;"></div>
                    </div>
                    <div class="graph-detail" id="memDetail">
                        <h3>${escapeHtml(tr('panel.memoryGraphHintTitle', {}, lang))}</h3>
                        <div class="empty">${escapeHtml(tr('panel.memoryGraphHintBody', {}, lang))}</div>
                    </div>
                </div>
            </section>
        </div>

        <section class="card">
            <div class="card-title">${escapeHtml(tr('panel.memoryGlobalTitle', {}, lang))}</div>
            <div class="card-body">
                <div class="mem-count">${globalEntries.length}</div>
                ${renderMemoryDetailsList(globalEntries, lang)}
            </div>
        </section>
    `;

    const script = `
        (function () {
            const msgs = ${safeJson({
                empty: tr('panel.memoryGraphEmpty', {}, lang),
                tooMany: tr('panel.memoryGraphTooMany', {}, lang)
            })};
            const data = ${safeJson({ nodes: projectEntries.map((e) => ({
                key: e.key,
                kind: e.kind || 'short',
                updatedAt: e.updatedAt || '',
                content: e.content || '',
                tags: Array.isArray(e.tags) ? e.tags : [],
                links: Array.isArray(e.links) ? e.links : []
            })) })};

            const svg = document.getElementById('memGraph');
            const emptyEl = document.getElementById('graphEmpty');
            const detail = document.getElementById('memDetail');
            const maxNodes = 120;
            const nodes = Array.isArray(data.nodes) ? data.nodes : [];
            if (!svg || !detail || !emptyEl) return;
            if (nodes.length === 0) {
                emptyEl.style.display = 'block';
                emptyEl.textContent = msgs.empty;
                return;
            }
            if (nodes.length > maxNodes) {
                emptyEl.style.display = 'block';
                emptyEl.textContent = msgs.tooMany + ' (' + nodes.length + ').';
                return;
            }

            function esc(s) {
                return String(s || '')
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#39;');
            }

            const width = 900;
            const height = 420;
            const padX = 90;
            const padY = 40;
            
            // "Neural" layout: central cluster for 'long', dispersed for others?
            // Actually, keep columns but make them organic.
            const colX = {
                long: padX + (Math.random() * 20 - 10),
                short: Math.floor(width / 2) + (Math.random() * 40 - 20),
                lesson: width - padX + (Math.random() * 20 - 10)
            };
            const byKind = { long: [], short: [], lesson: [] };
            for (const n of nodes) {
                const k = (n.kind === 'long' || n.kind === 'lesson') ? n.kind : 'short';
                byKind[k].push(n);
            }
            // Sort by connectivity? Or just simple sort.
            for (const k of Object.keys(byKind)) {
                byKind[k].sort((a, b) => String(a.key).localeCompare(String(b.key)));
            }

            const positions = new Map();
            for (const kind of ['long', 'short', 'lesson']) {
                const list = byKind[kind];
                const step = list.length > 1 ? (height - padY * 2) / (list.length - 1) : 0;
                list.forEach((n, idx) => {
                    // Add some jitter for "brain" feel
                    const jitterX = Math.random() * 30 - 15;
                    const jitterY = Math.random() * 10 - 5;
                    positions.set(n.key, { 
                        x: colX[kind] + jitterX, 
                        y: (list.length === 1 ? height / 2 : padY + (step * idx)) + jitterY
                    });
                });
            }

            const keySet = new Set(nodes.map((n) => n.key));
            const edges = [];
            for (const n of nodes) {
                const from = positions.get(n.key);
                if (!from) continue;
                const links = Array.isArray(n.links) ? n.links : [];
                for (const lk of links) {
                    const toKey = String(lk || '').trim();
                    if (!toKey || !keySet.has(toKey)) continue;
                    const to = positions.get(toKey);
                    if (!to) continue;
                    edges.push({ from: n.key, to: toKey, x1: from.x, y1: from.y, x2: to.x, y2: to.y });
                }
            }

            function setDetail(node) {
                detail.innerHTML =
                    '<h3>' + esc(node.key) + ' <span style="color:var(--vscode-descriptionForeground);font-size:12px;">(' + esc(node.kind) + ')</span></h3>' +
                    '<div style="color:var(--vscode-descriptionForeground);font-size:11px;margin-bottom:8px;">' + esc(node.updatedAt) + '</div>' +
                    '<pre>' + esc(node.content) + '</pre>';
            }

            svg.innerHTML = '';
            
            // Defs for glow
            const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
            const glow = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
            glow.setAttribute('id', 'glow');
            glow.innerHTML = '<feGaussianBlur stdDeviation="2.5" result="coloredBlur"/><feMerge><feMergeNode in="coloredBlur"/><feMergeNode in="SourceGraphic"/></feMerge>';
            defs.appendChild(glow);
            svg.appendChild(defs);

            const edgeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            edgeGroup.setAttribute('stroke', 'var(--vscode-editorRuler-foreground)'); // Very faint
            edgeGroup.setAttribute('stroke-width', '1');
            edgeGroup.setAttribute('stroke-opacity', '0.4');
            edgeGroup.setAttribute('fill', 'none');
            
            for (const e of edges) {
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                const midX = (e.x1 + e.x2) / 2;
                // Bezier curve for organic connection
                const d = 'M ' + e.x1 + ' ' + e.y1 + ' C ' + midX + ' ' + e.y1 + ', ' + midX + ' ' + e.y2 + ', ' + e.x2 + ' ' + e.y2;
                path.setAttribute('d', d);
                edgeGroup.appendChild(path);
            }
            svg.appendChild(edgeGroup);

            const nodeGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
            for (const n of nodes) {
                const pos = positions.get(n.key);
                if (!pos) continue;
                const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
                g.setAttribute('cursor', 'pointer');
                
                // Node circle
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', String(pos.x));
                circle.setAttribute('cy', String(pos.y));
                circle.setAttribute('r', '6');
                // Use theme colors but distinct
                const fill = n.kind === 'long' ? 'var(--vscode-symbolIcon-classForeground)' : (n.kind === 'lesson' ? 'var(--vscode-symbolIcon-variableForeground)' : 'var(--vscode-symbolIcon-functionForeground)');
                circle.setAttribute('fill', fill);
                circle.setAttribute('filter', 'url(#glow)'); // Add glow
                
                // Label
                const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                label.setAttribute('x', String(pos.x + 10));
                label.setAttribute('y', String(pos.y + 4));
                label.setAttribute('fill', 'var(--vscode-foreground)');
                label.setAttribute('font-size', '11');
                label.setAttribute('font-family', 'var(--vscode-font-family)');
                label.textContent = String(n.key);
                
                g.appendChild(circle);
                g.appendChild(label);
                g.addEventListener('click', () => setDetail(n));
                nodeGroup.appendChild(g);
            }
            svg.appendChild(nodeGroup);
            setDetail(nodes[0]);
        })();
    `;

    return getPanelShellHtml(webview, tr('panel.memoryTitle', {}, lang), project.name, '', body, lang, { extraScript: script });
}

type AuditEntry = {
    at?: string;
    action?: string;
    severity?: string;
    message?: string;
    [key: string]: any;
};

function readAuditEntries(project: ProjectTracker): Array<AuditEntry & { variant: string }> {
    const entries: Array<AuditEntry & { variant: string }> = [];
    if (!project.projectId) return entries;
    const dirs = getProjectBrainDirs(getReadHomeDirs(), project.projectId);
    for (const { variant, dir } of dirs) {
        try {
            const p = path.join(dir, AUDIT_FILE_NAME);
            if (!fs.existsSync(p)) continue;
            const raw = fs.readFileSync(p, 'utf-8');
            if (!raw.trim()) continue;
            const lines = raw.split(/\r?\n/).filter((l) => l.trim());
            for (const line of lines.slice(-600)) {
                try {
                    const parsed = JSON.parse(line);
                    if (parsed && typeof parsed === 'object') {
                        entries.push({ variant, ...(parsed as any) });
                    }
                } catch {
                    // ignore malformed lines
                }
            }
        } catch {
            // ignore read failures
        }
    }
    entries.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
    return entries.slice(0, 260);
}

function getAuditPanelHtml(project: ProjectTracker, lang: UiLanguage, webview: vscode.Webview): string {
    const entries = readAuditEntries(project);
    const badge = entries.length ? String(entries.length) : '';

    const rows = entries.length
        ? entries
            .map((e) => {
                const at = escapeHtml(String(e.at || ''));
                const severityRaw = String(e.severity || '').toLowerCase();
                const severity = severityRaw || 'info';
                const action = escapeHtml(String(e.action || ''));
                const message = escapeHtml(String(e.message || '')).replace(/\n/g, '<br/>');
                const variant = escapeHtml(String(e.variant || ''));
                const pillClass =
                    severity === 'block' || severity === 'error'
                        ? 'sev-bad'
                        : severity === 'warn' || severity === 'warning'
                            ? 'sev-warn'
                            : 'sev-ok';
                const sevLabel =
                    severity === 'block'
                        ? 'BLOCK'
                        : severity === 'error'
                            ? 'ERROR'
                            : severity === 'warn' || severity === 'warning'
                                ? 'WARN'
                                : 'INFO';
                return `
                    <tr>
                        <td class="col-at">${at}</td>
                        <td class="col-sev"><span class="sev ${pillClass}">${sevLabel}</span></td>
                        <td class="col-action">${action}</td>
                        <td class="col-msg">${message}</td>
                        <td class="col-variant">${variant}</td>
                    </tr>
                `;
            })
            .join('')
        : `<div class="empty">${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</div>`;

    const body = `
        <style>
            .table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            .table th, .table td { 
                border-bottom: 1px solid var(--vscode-widget-border); 
                padding: 10px 10px; 
                vertical-align: top; 
                font-size: 12px;
            }
            .table th { 
                text-align: left; 
                color: var(--vscode-descriptionForeground); 
                font-size: 11px; 
                text-transform: uppercase; 
                letter-spacing: 0.05em; 
                font-weight: 600;
            }
            .col-at { width: 140px; color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; }
            .col-sev { width: 80px; }
            .col-action { width: 150px; font-weight: 600; color: var(--vscode-foreground); }
            .col-variant { width: 90px; color: var(--vscode-descriptionForeground); font-size: 11px; white-space: nowrap; }
            .col-msg { white-space: pre-wrap; font-size: 12px; line-height: 1.5; color: var(--vscode-foreground); }
            
            .sev { 
                display: inline-flex; 
                align-items: center; 
                justify-content: center; 
                padding: 2px 8px; 
                border-radius: 12px; 
                font-size: 10px; 
                font-weight: 600;
                border: 1px solid transparent;
            }
            .sev-ok { color: var(--vscode-testing-iconPassed); border-color: var(--vscode-testing-iconPassed); background: transparent; }
            .sev-warn { color: var(--vscode-editorWarning-foreground); border-color: var(--vscode-editorWarning-foreground); background: transparent; }
            .sev-bad { color: var(--vscode-errorForeground); border-color: var(--vscode-errorForeground); background: transparent; }
        </style>
        <section class="card">
            <div class="card-title">${escapeHtml(lang === 'en' ? 'Recent hook audit events' : '最近 Hook 审计事件')}</div>
            <div class="card-body">
                ${entries.length ? `
                <table class="table">
                    <thead>
                        <tr>
                            <th>${lang === 'en' ? 'Time' : '时间'}</th>
                            <th>${lang === 'en' ? 'Severity' : '级别'}</th>
                            <th>${lang === 'en' ? 'Hook' : 'Hook'}</th>
                            <th>${lang === 'en' ? 'Message' : '信息'}</th>
                            <th>${lang === 'en' ? 'Variant' : '版本'}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${rows}
                    </tbody>
                </table>
                ` : rows}
            </div>
        </section>
    `;

    return getPanelShellHtml(webview, tr('panel.auditTitle', {}, lang), project.name, badge, body, lang);
}

function getWamPanelHtml(project: ProjectTracker, lang: UiLanguage, webview: vscode.Webview): string {
    const state = buildCurrentProjectWamState(project.rootPath);
    const wamDir = state.wamDir;
    const head = wamDir ? readWamHead(wamDir) : {};
    const headHash = wamDir ? resolveWamHeadHash(wamDir).hash : '';
    const clean = !!headHash && head?.digest === state.digest;
    const branch =
        head?.ref?.startsWith('refs/heads/')
            ? head.ref.replace('refs/heads/', '')
            : (head?.ref?.startsWith('refs/tags/') ? head.ref.replace('refs/tags/', '') : '');

    const badge =
        lang === 'en'
            ? `${clean ? 'clean' : 'dirty'}${branch ? ` • ${branch}` : ''}`
            : `${clean ? '干净' : '有改动'}${branch ? ` • ${branch}` : ''}`;

    const titleStatus = lang === 'en' ? 'Status' : '状态';
    const titleRecent = lang === 'en' ? 'Recent commits' : '最近提交';
    const titleRefs = lang === 'en' ? 'Refs' : '引用';
    const titleStash = lang === 'en' ? 'Stash' : '暂存';

    if (!wamDir) {
        const body = `
            <section class="card">
                <div class="card-title">${escapeHtml(titleStatus)}</div>
                <div class="card-body">${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</div>
            </section>
        `;
        return getPanelShellHtml(webview, tr('panel.wamTitle', {}, lang), project.name, badge, body, lang);
    }

    ensureWamRepoLayout(wamDir);
    const heads = listWamRefs(wamDir, 'heads');
    const tags = listWamRefs(wamDir, 'tags');
    const stashes = listWamStashes(wamDir);
    const commits = headHash ? walkWamHistory(wamDir, headHash, 80) : listWamCommits(wamDir, 80);

    const headLine = headHash ? headHash.slice(0, 12) : (lang === 'en' ? 'none' : '无');
    const digestLine = state.digest ? state.digest.slice(0, 12) : '';
    const dirtyHint = !clean
        ? (lang === 'en'
            ? `WAM is dirty. Fix: call <code>wam_commit()</code>.`
            : `WAM 有改动。修复：调用 <code>wam_commit()</code>。`)
        : '';

    const signing = loadWamSigningKey(true);
    const wantsSignatureVerify =
        isWamSigningEnabled() ||
        commits.some((c) => typeof (c as any).signature === 'string' && String((c as any).signature).trim().length > 0);

    const integrity = headHash
        ? verifyWamIntegrity(wamDir, 'project', headHash, {
            maxCommits: 60,
            verifySnapshots: true,
            verifySignature: wantsSignatureVerify,
            signingKey: signing?.keyBytes || null
        })
        : null;
    const integrityHint = integrity
        ? (integrity.ok
            ? (lang === 'en'
                ? `OK (checked=${integrity.checked})`
                : `通过（检查=${integrity.checked}）`)
            : (lang === 'en'
                ? `FAIL (issues=${integrity.issues.length})`
                : `失败（问题=${integrity.issues.length}）`))
        : '';

    const commitsRows = commits.length
        ? commits.map((c) => {
            const parents = Array.isArray(c.parents) && c.parents.length ? c.parents.map((p) => p.slice(0, 10)).join(', ') : '';
            const conflicts = Array.isArray(c.conflicts) && c.conflicts.length ? String(c.conflicts.length) : '';
            return `<tr>
                <td><code>${escapeHtml(c.hash.slice(0, 10))}</code></td>
                <td>${escapeHtml(String(c.createdAt || ''))}</td>
                <td>${escapeHtml(String(c.author || ''))}</td>
                <td>${escapeHtml(String(c.message || ''))}</td>
                <td>${escapeHtml(parents)}</td>
                <td>${escapeHtml(conflicts)}</td>
            </tr>`;
        }).join('')
        : `<tr><td colspan="6" class="empty">${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</td></tr>`;

    const formatTriplet = (trip: any): string => {
        const a = Number(trip?.added?.count ?? trip?.added ?? 0) || 0;
        const r = Number(trip?.removed?.count ?? trip?.removed ?? 0) || 0;
        const c = Number(trip?.changed?.count ?? trip?.statusChanged?.count ?? trip?.statusChanged ?? 0) || 0;
        return `+${a} -${r} ~${c}`;
    };
    const renderSamples = (label: string, data: any) => {
        const samples = Array.isArray(data?.samples) ? data.samples.slice(0, 8) : [];
        if (samples.length === 0) return '';
        return `<div><strong>${escapeHtml(label)}</strong><ul>${samples.map((s: any) => `<li><code>${escapeHtml(String(s))}</code></li>`).join('')}</ul></div>`;
    };
    const diffDetails = commits.slice(0, 16).map((c) => {
        const ch: any = (c as any).changes || null;
        const trackerTrip = ch?.tracker?.planItems ? formatTriplet({ added: ch.tracker.planItems.added, removed: ch.tracker.planItems.removed, statusChanged: ch.tracker.planItems.statusChanged }) : '';
        const memTrip = ch?.memory ? formatTriplet({ added: ch.memory.added, removed: ch.memory.removed, changed: ch.memory.changed }) : '';
        const summaryBits: string[] = [];
        if (trackerTrip) summaryBits.push(`plan ${trackerTrip}`);
        if (memTrip) summaryBits.push(`memory ${memTrip}`);
        if (ch?.tracker?.overviewChanged) summaryBits.push('overview');
        if (ch?.tracker?.prdChanged) summaryBits.push('prd');
        if (ch?.tracker?.walkthroughChanged) summaryBits.push('walkthrough');
        const summary = summaryBits.length ? summaryBits.join(' • ') : (lang === 'en' ? '(no diff data)' : '（无差异数据）');

        const tracker = ch?.tracker || {};
        const memory = ch?.memory || {};
        const planItems = tracker.planItems || {};

        return `
            <details class="item" style="display: block; padding: 0;">
                <summary style="padding: 10px 12px;">
                    <code>${escapeHtml(String(c.hash || '').slice(0, 10))}</code>
                    <span style="color: var(--vscode-descriptionForeground); font-size: 11px;">${escapeHtml(String(c.createdAt || ''))}</span>
                    <span style="font-weight:600;">${escapeHtml(String(c.message || ''))}</span>
                    <span style="margin-left:auto; color: var(--vscode-descriptionForeground); font-size: 11px;">${escapeHtml(summary)}</span>
                </summary>
                <div class="markdown" style="padding: 0 12px 12px; border-top: 1px solid var(--vscode-widget-border); margin-top: 4px; padding-top: 10px;">
                    <p><strong>${escapeHtml(lang === 'en' ? 'Commit' : '提交')}</strong>: <code>${escapeHtml(String(c.hash || ''))}</code></p>
                    <p><strong>${escapeHtml(lang === 'en' ? 'Parents' : '父提交')}</strong>: ${escapeHtml(Array.isArray(c.parents) ? c.parents.join(', ') : '')}</p>
                    ${ch?.base ? `<p><strong>Base</strong>: <code>${escapeHtml(String(ch.base))}</code></p>` : ''}
                    <p><strong>${escapeHtml(lang === 'en' ? 'Changes' : '变更')}</strong>: ${escapeHtml(summary)}</p>
                    ${tracker.planItems ? `
                        ${renderSamples(lang === 'en' ? 'Plan added' : '计划新增', planItems.added)}
                        ${renderSamples(lang === 'en' ? 'Plan removed' : '计划移除', planItems.removed)}
                        ${renderSamples(lang === 'en' ? 'Plan status changed' : '计划状态变更', planItems.statusChanged)}
                    ` : ''}
                    ${memory ? `
                        ${renderSamples(lang === 'en' ? 'Memory added' : '记忆新增', memory.added)}
                        ${renderSamples(lang === 'en' ? 'Memory removed' : '记忆移除', memory.removed)}
                        ${renderSamples(lang === 'en' ? 'Memory changed' : '记忆变更', memory.changed)}
                    ` : ''}
                </div>
            </details>
        `;
    }).join('');

    const renderRefList = (items: Array<{ name: string; hash: string }>) => {
        if (!items.length) return `<div class="empty">${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</div>`;
        return `<ul>${items.slice(0, 40).map((r) => `<li><code>${escapeHtml(r.name)}</code> — <code>${escapeHtml(String(r.hash || '').slice(0, 10) || '')}</code></li>`).join('')}</ul>`;
    };

    const stashHtml = stashes.length
        ? `<ul>${stashes.slice(0, 24).map((s) => `<li><code>${escapeHtml(String(s.id || '').slice(0, 10))}</code> — ${escapeHtml(String(s.createdAt || ''))} — ${escapeHtml(String(s.message || ''))}</li>`).join('')}</ul>`
        : `<div class="empty">${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</div>`;

    const signatureLine = wantsSignatureVerify
        ? (lang === 'en'
            ? `enabled${signing ? '' : ' (missing key)'}`
            : `已启用${signing ? '' : '（缺少密钥）'}`)
        : (lang === 'en'
            ? `disabled${signing ? ' (key present)' : ''}`
            : `未启用${signing ? '（已存在密钥）' : ''}`);

    const body = `
        <section class="card">
            <div class="card-title">${escapeHtml(titleStatus)}</div>
            <div class="card-body markdown">
                <p><strong>HEAD</strong>: <code>${escapeHtml(headLine)}</code></p>
                <p><strong>Digest</strong>: <code>${escapeHtml(digestLine)}</code></p>
                <p><strong>${escapeHtml(lang === 'en' ? 'Signature' : '签名')}</strong>: <code>${escapeHtml(signatureLine)}</code></p>
                ${integrityHint ? `<p><strong>Integrity</strong>: ${escapeHtml(integrityHint)}</p>` : ''}
                ${dirtyHint ? `<p style="color:rgba(249,115,22,0.9)">${dirtyHint}</p>` : ''}
            </div>
        </section>
        <section class="card">
            <div class="card-title">${escapeHtml(titleRecent)}</div>
            <div class="card-body markdown">
                <table>
                    <thead>
                        <tr>
                            <th>${escapeHtml(lang === 'en' ? 'Hash' : '哈希')}</th>
                            <th>${escapeHtml(lang === 'en' ? 'Time' : '时间')}</th>
                            <th>${escapeHtml(lang === 'en' ? 'Author' : '作者')}</th>
                            <th>${escapeHtml(lang === 'en' ? 'Message' : '说明')}</th>
                            <th>${escapeHtml(lang === 'en' ? 'Parents' : '父提交')}</th>
                            <th>${escapeHtml(lang === 'en' ? 'Conflicts' : '冲突')}</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${commitsRows}
                    </tbody>
                </table>
            </div>
        </section>
        <section class="card">
            <div class="card-title">${escapeHtml(lang === 'en' ? 'Diff viewer' : '差异查看')}</div>
            <div class="card-body markdown">
                ${diffDetails || `<div class="empty">${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</div>`}
            </div>
        </section>
        <div class="grid">
            <section class="card">
                <div class="card-title">${escapeHtml(titleRefs)} • ${escapeHtml(lang === 'en' ? 'Branches' : '分支')}</div>
                <div class="card-body markdown">${renderRefList(heads)}</div>
            </section>
            <section class="card">
                <div class="card-title">${escapeHtml(titleRefs)} • ${escapeHtml(lang === 'en' ? 'Tags' : '标签')}</div>
                <div class="card-body markdown">${renderRefList(tags)}</div>
            </section>
        </div>
        <section class="card">
            <div class="card-title">${escapeHtml(titleStash)}</div>
            <div class="card-body markdown">${stashHtml}</div>
        </section>
    `;

    return getPanelShellHtml(webview, tr('panel.wamTitle', {}, lang), project.name, badge, body, lang);
}

function getPrdDialogHtml(
    webview: vscode.Webview,
    requestId: string,
    prdContent: string,
    projectName: string,
    lang: UiLanguage,
    csp: string,
    nonce: string
): string {
    const contentHtml = prdContent
        ? renderMarkdownToHtml(prdContent)
        : `<p>${escapeHtml(tr('panel.readOnlyEmpty', {}, lang))}</p>`;
    const needsMermaid = contentHtml.includes('class="mermaid"');
    const mermaidUri = needsMermaid
        ? webview.asWebviewUri(vscode.Uri.joinPath(extensionContext.extensionUri, 'resources', 'vendor', 'mermaid.min.js')).toString()
        : '';
    const title = tr('panel.prdTitle', {}, lang);
    const subtitle = tr('panel.prdSubtitle', {}, lang);
    const approveLabel = tr('panel.prdApprove', {}, lang);
    const requestLabel = tr('panel.prdRequestChanges', {}, lang);
    const noteLabel = tr('panel.prdNoteLabel', {}, lang);
    const notePlaceholder = tr('panel.prdNotePlaceholder', {}, lang);
    const cancelLabel = tr('panel.cancel', {}, lang);
    const hint = tr('panel.prdApproveHint', {}, lang);
    const projectBadge = projectName ? `<span class="badge">${escapeHtml(projectName)}</span>` : '';

    return `<!DOCTYPE html>
<html lang="${lang === 'en' ? 'en' : 'zh-CN'}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>${title}</title>
    <style>
        :root {
            --radius: 4px;
            --font-family: var(--vscode-font-family, "Segoe UI", sans-serif);
        }
        body {
            margin: 0;
            padding: 24px;
            color: var(--vscode-foreground);
            font-family: var(--font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            line-height: 1.5;
        }
        * { box-sizing: border-box; }

        .container {
            max-width: 800px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        .hero {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: var(--radius);
            padding: 16px;
            margin-bottom: 20px;
        }
        .hero h1 { font-size: 18px; font-weight: 600; margin: 0 0 4px 0; color: var(--vscode-foreground); }
        .hero p { font-size: 12px; color: var(--vscode-descriptionForeground); margin: 0; }
        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 12px;
            font-size: 11px;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            margin-top: 8px;
        }
        .hint { margin-top: 8px; font-size: 12px; color: var(--vscode-descriptionForeground); }

        .card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-widget-border);
            border-radius: var(--radius);
            padding: 16px;
            margin-bottom: 16px;
        }
        .card-title {
            font-size: 11px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 12px;
            font-weight: 600;
        }
        .content {
            color: var(--vscode-foreground);
            font-size: 13px;
            line-height: 1.6;
        }
        .markdown h1, .markdown h2, .markdown h3 { margin-top: 16px; margin-bottom: 8px; color: var(--vscode-foreground); }
        .markdown p { margin-bottom: 12px; }
        .markdown code {
            background: var(--vscode-textCodeBlock-background);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
        }
        .markdown pre {
            background: var(--vscode-textCodeBlock-background);
            padding: 12px;
            border-radius: var(--radius);
            overflow-x: auto;
            margin-bottom: 12px;
            border: 1px solid var(--vscode-widget-border);
        }
        .markdown table { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
        .markdown th, .markdown td {
            border: 1px solid var(--vscode-widget-border);
            padding: 6px 8px;
        }
        .markdown th { background: var(--vscode-list-hoverBackground); font-weight: 600; }

        textarea {
            width: 100%;
            min-height: 100px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: var(--radius);
            padding: 10px;
            font-family: inherit;
            resize: vertical;
        }
        textarea:focus { outline: 1px solid var(--vscode-focusBorder); border-color: var(--vscode-focusBorder); }

        .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 20px; }
        .btn {
            border: none;
            border-radius: var(--radius);
            padding: 10px 16px;
            font-size: 13px;
            font-weight: 600;
            cursor: pointer;
            font-family: inherit;
            display: flex; align-items: center; justify-content: center;
        }
        .btn-approve {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-approve:hover { background: var(--vscode-button-hoverBackground); }
        .btn-request {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-request:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .btn-cancel {
            background: transparent;
            border: 1px solid var(--vscode-button-border, transparent);
            color: var(--vscode-foreground);
        }
        .btn-cancel:hover { background: var(--vscode-list-hoverBackground); }
    </style>
</head>
<body>
    <div class="container">
        <div class="hero">
            <h1>${title}</h1>
            <p>${subtitle}</p>
            ${projectBadge}
            <div class="hint">${hint}</div>
        </div>
        <div class="card">
            <div class="card-title">${tr('panel.prdPanelTitle', {}, lang)}</div>
            <div class="content markdown">${contentHtml}</div>
        </div>
        <div class="card">
            <div class="card-title">${noteLabel}</div>
            <textarea id=\"noteInput\" placeholder=\"${notePlaceholder}\"></textarea>
        </div>
        <div class="actions">
            <button class="btn btn-approve" id="approveBtn">${approveLabel}</button>
            <button class="btn btn-request" id="requestBtn">${requestLabel}</button>
            <button class="btn btn-cancel" id="cancelBtn">${cancelLabel}</button>
        </div>
    </div>
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const requestId = ${safeJson(requestId)};
        const noteEl = document.getElementById('noteInput');

        function submit(approved) {
            const note = (noteEl && noteEl.value || '').trim();
            if (approved === null) {
                vscode.postMessage({ type: 'response', requestId, value: null });
                return;
            }
            const payload = { approved: approved === true };
            if (note) payload.note = note;
            vscode.postMessage({ type: 'response', requestId, value: payload });
        }

        document.getElementById('approveBtn')?.addEventListener('click', () => submit(true));
        document.getElementById('requestBtn')?.addEventListener('click', () => submit(false));
        document.getElementById('cancelBtn')?.addEventListener('click', () => submit(null));
    </script>
    ${needsMermaid ? `<script nonce="${nonce}" src="${mermaidUri}"></script>` : ''}
    ${needsMermaid ? `<script nonce="${nonce}">
        (function () {
            try {
                if (!window.mermaid) return;
                window.mermaid.initialize({ startOnLoad: false, theme: 'dark', securityLevel: 'strict' });
                const nodes = document.querySelectorAll('.mermaid');
                if (nodes && nodes.length > 0) {
                    window.mermaid.run({ nodes });
                }
            } catch (e) {}
        })();
    </script>` : ''}
</body>
</html>`;
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
    dialogOptions?: {
        mode?: DialogMode;
        confirmType?: ConfirmDialogType;
        questions?: ChoiceQuestion[];
        allowText?: boolean;
        prdContent?: string;
        projectName?: string;
    }
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

    dialogPanel.webview.options = {
        enableScripts: true,
        localResourceRoots: [extensionContext.extensionUri]
    };

    dialogPanel.webview.html = getDialogHtml(dialogPanel.webview, requestId, type, title, message, allowImage, dialogOptions);

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
    webview: vscode.Webview,
    requestId: string,
    type: 'continue' | 'input',
    title: string,
    message: string,
    allowImage: boolean,
    dialogOptions?: {
        mode?: DialogMode;
        confirmType?: ConfirmDialogType;
        questions?: ChoiceQuestion[];
        allowText?: boolean;
        prdContent?: string;
        projectName?: string;
    }
): string {
    const isContinue = type === 'continue';
    const dialogMode = dialogOptions?.mode || type;
    const choiceQuestions = dialogOptions?.questions ?? [];
    const allowExtraText = dialogOptions?.allowText !== false;
    const confirmType = dialogOptions?.confirmType === 'info' ? 'info' : 'confirm';
    const lang = getUiLanguage();
    const htmlLang = lang === 'en' ? 'en' : 'zh-CN';
    const nonce = getNonce();
    const csp = [
        `default-src 'none'`,
        `img-src ${webview.cspSource} data: blob:`,
        `style-src 'unsafe-inline' ${webview.cspSource}`,
        `script-src 'nonce-${nonce}' ${webview.cspSource}`,
        `font-src 'none'`,
        `connect-src 'none'`
    ].join('; ');

    if (dialogOptions?.mode === 'prd') {
        const prdContent = typeof dialogOptions.prdContent === 'string' ? dialogOptions.prdContent : '';
        const projectName = typeof dialogOptions.projectName === 'string' ? dialogOptions.projectName : '';
        return getPrdDialogHtml(webview, requestId, prdContent, projectName, lang, csp, nonce);
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
            --radius: 4px;
            --font-family: var(--vscode-font-family, "Segoe UI", sans-serif);
        }
        body {
            margin: 0;
            padding: 24px;
            color: var(--vscode-foreground);
            font-family: var(--font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            line-height: 1.5;
        }
        * { box-sizing: border-box; }

        .container {
            max-width: 600px;
            margin: 0 auto;
            display: flex;
            flex-direction: column;
            gap: 20px;
        }

        /* Header */
        .header {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: var(--radius);
            padding: 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
        }
        .header-left {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .header-icon {
            font-size: 24px;
            width: 40px;
            height: 40px;
            display: flex;
            align-items: center;
            justify-content: center;
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: var(--radius);
        }
        .header-text h1 {
            font-size: 16px;
            font-weight: 600;
            margin: 0;
            color: var(--vscode-foreground);
        }
        .header-text p {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin: 2px 0 0 0;
        }
        .lang-btn {
            background: transparent;
            color: var(--vscode-textLink-foreground);
            border: 1px solid transparent;
            border-radius: var(--radius);
            padding: 4px 8px;
            cursor: pointer;
            font-size: 12px;
        }
        .lang-btn:hover {
            background: var(--vscode-list-hoverBackground);
        }

        /* Card */
        .card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border: 1px solid var(--vscode-widget-border);
            border-radius: var(--radius);
            padding: 16px;
        }
        .card-label {
            font-size: 11px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            font-weight: 600;
        }
        .reason-box {
            background: var(--vscode-editor-background);
            padding: 12px;
            border-radius: var(--radius);
            border: 1px solid var(--vscode-widget-border);
            white-space: pre-wrap;
            word-break: break-word;
            font-family: var(--vscode-editor-font-family, monospace);
            font-size: 13px;
        }

        /* Choice */
        .choice-card { display: none; }
        .choice-card.show { display: block; }
        .choice-hint { font-size: 12px; color: var(--vscode-descriptionForeground); margin-bottom: 12px; }
        .choice-list { display: flex; flex-direction: column; gap: 8px; }
        .choice-option {
            display: flex;
            align-items: center;
            gap: 10px;
            padding: 10px;
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: var(--radius);
            cursor: pointer;
        }
        .choice-option:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .choice-option.selected {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-activeSelectionBackground);
            color: var(--vscode-list-activeSelectionForeground);
        }
        .choice-letter {
            width: 24px; height: 24px;
            display: flex; align-items: center; justify-content: center;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            border-radius: 4px;
            font-weight: 600; font-size: 12px;
        }
        .choice-actions {
            margin-top: 12px;
            display: flex;
            justify-content: flex-end;
        }

        /* Inputs */
        textarea {
            width: 100%;
            min-height: 120px;
            padding: 10px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: var(--radius);
            font-family: var(--vscode-editor-font-family, monospace);
            resize: vertical;
        }
        textarea:focus {
            outline: 1px solid var(--vscode-focusBorder);
            border-color: var(--vscode-focusBorder);
        }

        /* Images */
        .image-section { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--vscode-widget-border); }
        .input-label {
             display: block;
            font-size: 11px;
            text-transform: uppercase;
            color: var(--vscode-descriptionForeground);
            margin-bottom: 8px;
            font-weight: 600;
        }
        .image-drop-zone {
            border: 2px dashed var(--vscode-widget-border);
            border-radius: var(--radius);
            padding: 24px;
            text-align: center;
            cursor: pointer;
            color: var(--vscode-descriptionForeground);
            transition: all 0.2s;
            margin-bottom: 12px;
        }
        .image-drop-zone:hover, .image-drop-zone.dragover {
            border-color: var(--vscode-focusBorder);
            background: var(--vscode-list-hoverBackground);
        }
        .image-preview-grid {
            display: none;
            grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
            gap: 8px;
            margin-bottom: 12px;
        }
        .image-preview-grid.show { display: grid; }
        .image-preview-item {
            position: relative;
            height: 80px;
            border-radius: var(--radius);
            overflow: hidden;
            border: 1px solid var(--vscode-widget-border);
        }
        .image-preview-item img {
            width: 100%; height: 100%; object-fit: cover;
        }
        .image-remove {
            position: absolute; top: 4px; right: 4px;
            width: 20px; height: 20px;
            background: rgba(0,0,0,0.6); color: white;
            border-radius: 50%;
            display: flex; align-items: center; justify-content: center;
            cursor: pointer;
            font-size: 12px;
        }
        .image-remove:hover { background: var(--vscode-errorForeground); }

        /* Buttons */
        .btn-row {
            display: flex;
            gap: 12px;
            margin-top: 10px;
        }
        .btn {
            padding: 10px 16px;
            border-radius: var(--radius);
            border: none;
            font-weight: 600;
            cursor: pointer;
            font-family: inherit;
            font-size: 13px;
            flex: 1;
            display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .btn-success {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-success:hover { background: var(--vscode-button-hoverBackground); }
        .btn-ghost {
            background: transparent;
            color: var(--vscode-button-secondaryForeground);
            border: 1px solid var(--vscode-button-border, transparent);
        }
        .btn-ghost:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .btn-outline {
            background: transparent;
            border: 1px solid var(--vscode-widget-border);
            color: var(--vscode-foreground);
            padding: 6px 12px;
            border-radius: var(--radius);
            cursor: pointer;
            font-size: 12px;
        }
        .btn-outline:hover { background: var(--vscode-list-hoverBackground); }

        /* Shortcuts */
        .shortcuts {
            text-align: center;
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 20px;
        }
        .shortcuts kbd {
            background: var(--vscode-keybindingLabel-background);
            color: var(--vscode-keybindingLabel-foreground);
            border: 1px solid var(--vscode-keybindingLabel-border);
            border-bottom-color: var(--vscode-keybindingLabel-bottomBorder);
            padding: 2px 4px;
            border-radius: 3px;
            font-family: var(--vscode-editor-font-family);
            margin: 0 2px;
        }
        
        .toast {
            position: fixed;
            bottom: 24px;
            left: 50%;
            transform: translateX(-50%);
            background: var(--vscode-editor-background);
            color: var(--vscode-foreground);
            padding: 12px 24px;
            border-radius: var(--radius);
            font-size: 13px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            border: 1px solid var(--vscode-widget-border);
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
            <div class="choice-list" id="choiceContainer"></div>
            <div class="choice-actions">
                <button class="btn-outline" id="choiceClearBtn" type="button"></button>
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
                <button class="btn-outline" id="chooseImageBtn" type="button"></button>
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
        const confirmType = ${safeJson(confirmType)};
        const I18N = ${safeJson(WEBVIEW_I18N)};
        const rawTitle = ${safeJson(title ?? '')};
        const rawMessage = ${safeJson(message ?? '')};
        const initialLang = ${safeJson(lang)};
        const choiceQuestions = ${safeJson(choiceQuestions)};
        const allowExtraText = ${safeJson(allowExtraText)};
        const hasChoice = dialogMode === 'choice';
        const isConfirm = dialogMode === 'confirm';
        const isInfo = isConfirm && confirmType === 'info';
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
            if (subEl) {
                if (isConfirm) {
                    subEl.textContent = t('panel.confirmSub');
                } else {
                    subEl.textContent = isContinue ? t('panel.confirmSub') : t('panel.inputSub');
                }
            }

            const reasonLabelEl = document.getElementById('reasonLabel');
            if (reasonLabelEl) {
                if (hasChoice) {
                    reasonLabelEl.textContent = showContext ? t('panel.contextLabel') : t('panel.choiceQuestion');
                } else if (isConfirm) {
                    reasonLabelEl.textContent = t('panel.reasonLabelInput');
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
                } else if (isConfirm) {
                    replyLabelEl.textContent = '';
                } else {
                    replyLabelEl.textContent = isContinue ? t('panel.replyLabelContinue') : t('panel.replyLabelInput');
                }
            }

            const userInputEl = document.getElementById('userInput');
            if (userInputEl) {
                if (hasChoice) {
                    userInputEl.placeholder = t('panel.extraPlaceholder');
                } else if (isConfirm) {
                    userInputEl.placeholder = '';
                } else {
                    userInputEl.placeholder = isContinue ? t('panel.replyPlaceholderContinue') : t('panel.replyPlaceholderInput');
                }
            }

            const inputCard = document.getElementById('inputCard');
            if (inputCard) {
                if (isConfirm || (hasChoice && !allowExtraText)) {
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
	            if (primaryBtn) {
	                if (isConfirm) {
	                    primaryBtn.textContent = isInfo ? t('panel.confirmOk') : t('panel.confirmYes');
	                } else {
	                    primaryBtn.textContent = isContinue ? t('panel.submitContinue') : t('panel.submit');
	                }
	            }

	            const secondaryBtn = document.getElementById('secondaryBtn');
	            if (secondaryBtn) {
	                if (isConfirm) {
	                    secondaryBtn.textContent = t('panel.confirmNo');
	                    secondaryBtn.style.display = isInfo ? 'none' : '';
	                } else {
	                    secondaryBtn.textContent = isContinue ? t('panel.end') : t('panel.cancel');
	                    secondaryBtn.style.display = '';
	                }
	            }

	            const shortcuts = document.getElementById('shortcuts');
	            if (shortcuts) {
	                if (isConfirm) {
	                    shortcuts.innerHTML = \`<kbd>Enter</kbd> \${t('panel.shortcutsConfirm')} · <kbd>Esc</kbd> \${t('panel.shortcutsCancel')}\`;
	                } else {
	                    shortcuts.innerHTML = \`<kbd>Enter</kbd> \${t('panel.shortcutsConfirm')} · <kbd>Shift+Enter</kbd> \${t('panel.shortcutsNewline')} · <kbd>Esc</kbd> \${t('panel.shortcutsCancel')}\`;
	                }
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
	            } else if (isConfirm) {
	                response = { confirmed: confirm === true, confirmType };
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
    const homeDirs = getWriteHomeDirs();
    const configPaths = getWindsurfMcpConfigPaths(homeDirs);
    const written: string[] = [];
    const repaired: Array<{ path: string; backup: string }> = [];
    const failed: Array<{ path: string; error: string }> = [];

    try {
        outputChannel.appendLine(`Configure Windsurf: candidate home dirs = ${JSON.stringify(homeDirs)}`);
        outputChannel.appendLine(`Configure Windsurf: target mcp_config.json paths = ${JSON.stringify(configPaths)}`);
    } catch {
        // ignore logging failures
    }

    for (const configPath of configPaths) {
        try {
            const dir = path.dirname(configPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            let config: any = { mcpServers: {} };
            if (fs.existsSync(configPath)) {
                let raw = fs.readFileSync(configPath, 'utf-8');
                raw = raw.replace(/^\uFEFF/, ''); // strip BOM if present
	                if (raw.trim()) {
	                    try {
	                        config = parseJsonLenient(raw);
	                    } catch (e: any) {
	                        // Be resilient: back up the invalid file and rewrite a fresh config
	                        // so MCP can still be configured for the user.
	                        const backupPath = `${configPath}.invalid.${Date.now()}.bak`;
	                        try {
	                            fs.writeFileSync(backupPath, raw, 'utf-8');
	                        } catch (be: any) {
	                            outputChannel?.appendLine(`Configure Windsurf: failed to write backup ${backupPath}: ${be?.message ?? String(be)}`);
	                        }
	                        repaired.push({ path: configPath, backup: backupPath });
	                        config = { mcpServers: {} };
                    }
                }
                if (!config || typeof config !== 'object') config = {};
                if (!config.mcpServers || typeof config.mcpServers !== 'object') config.mcpServers = {};
            }

            config.mcpServers.windsurf_auto_mcp = {
                url: `http://localhost:${currentPort}`,
                disabled: false
            };

	            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
	            // Verify write
	            const verify = parseJsonLenient(fs.readFileSync(configPath, 'utf-8'));
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
        if (repaired.length > 0) {
            const lang = getUiLanguage();
            const detail = repaired.map((r) => `${r.path} -> ${r.backup}`).join('\n');
            const msg =
                lang === 'en'
                    ? `Some mcp_config.json files were invalid and were backed up then rewritten:\n${detail}`
                    : `部分 mcp_config.json JSON 无效，已备份后重写：\n${detail}`;
            vscode.window.showWarningMessage(msg);
        }
        if (failed.length > 0) {
            const lang = getUiLanguage();
            const detail = failed.map((f) => `${f.path}: ${f.error}`).join('\n');
            const msg =
                lang === 'en'
                    ? `Some config files failed to write:\n${detail}`
                    : `部分配置写入失败：\n${detail}`;
            vscode.window.showWarningMessage(msg);
        }
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
        stats = { ...stats, ...saved, startTime: Date.now() };
    }
}

function saveStats() {
    if (extensionContext) {
        extensionContext.globalState.update('mcpServiceStats', stats);
    }
}

function showStats() {
    const lang = getUiLanguage();
    sidebarProvider?.refreshContent();
    vscode.window.showInformationMessage(tr('ext.statsInSidebar', {}, lang));
}

function initializeTracker() {
    const rootPath = getWorkspaceRootPath();
    if (!rootPath) return;
    const data = loadTrackerData();
    const project = ensureProjectTracker(data, rootPath, getUiLanguage());
    data.activeProject = rootPath;
    saveTrackerData(data);
    try {
        syncProjectArtifacts(project);
    } catch (e: any) {
        outputChannel?.appendLine(`Artifact sync failed (init): ${e?.message ?? String(e)}`);
    }
}

function getTrackerSnapshotForSidebar() {
    const rootPath = getWorkspaceRootPath();
    if (!rootPath) {
        return {
            projectId: '',
            rootPath: '',
            name: '',
            overview: { content: '', updatedAt: '', generatedBy: '' },
            prd: { status: 'draft', content: '' },
            planSummary: '',
            planText: '',
            walkthroughText: '',
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
                    this.refreshContent();
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
                case 'openPrdPanel':
                    showPrdPanel();
                    break;
                case 'openOverviewPanel':
                    showOverviewPanel();
                    break;
                case 'openPlanPanel':
                    showPlanPanel();
                    break;
                case 'openWalkthroughPanel':
                    showWalkthroughPanel();
                    break;
                case 'openMemoryPanel':
                    showMemoryPanel();
                    break;
                case 'openWamPanel':
                    showWamPanel();
                    break;
                case 'openAuditPanel':
                    showAuditPanel();
                    break;
                case 'clearPrd':
                    await clearProjectPrd();
                    break;
                case 'clearOverview':
                    await clearProjectOverview();
                    break;
                case 'clearPlan':
                    await clearProjectPlan();
                    break;
                case 'clearWalkthrough':
                    await clearProjectWalkthrough();
                    break;
                case 'clearTracking':
                    await clearProjectTracking();
                    break;
                case 'clearAudit':
                    await clearProjectAudit();
                    break;
                case 'installHooks':
                    installWindsurfHooks();
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
        dialogOptions?: {
            mode?: DialogMode;
            confirmType?: ConfirmDialogType;
            questions?: ChoiceQuestion[];
            allowText?: boolean;
            prdContent?: string;
            projectName?: string;
        }
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
        const configPaths = getWindsurfMcpConfigPaths(getReadHomeDirs());

        let isConfigured = false;
	        try {
	            for (const configPath of configPaths) {
	                if (!fs.existsSync(configPath)) continue;
	                const configContent = parseJsonLenient(fs.readFileSync(configPath, 'utf-8'));
	                if (configContent?.mcpServers?.windsurf_auto_mcp) {
	                    isConfigured = true;
	                    break;
	                }
	            }
        } catch (e) {
            isConfigured = false;
        }
        const trackerSnapshot = getTrackerSnapshotForSidebar();

        return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="${csp}">
    <title>WindsurfAutoMcp</title>
    <style>
        :root {
            --radius: 4px;
            --font-family: var(--vscode-font-family, "Segoe UI", sans-serif);
        }
        body {
            margin: 0;
            padding: 20px;
            color: var(--vscode-foreground);
            font-family: var(--font-family);
            font-size: var(--vscode-font-size);
            background-color: var(--vscode-editor-background);
            overflow-x: hidden;
        }
        * { box-sizing: border-box; }
        
        /* Layout */
        .container {
            display: flex;
            flex-direction: column;
            gap: 20px;
            max-width: 100%;
            margin: 0 auto;
        }

        /* Typography */
        h2 {
            font-size: 11px;
            text-transform: uppercase;
            letter-spacing: 1.5px;
            color: var(--vscode-descriptionForeground);
            margin: 0 0 10px 0;
            font-weight: 600;
        }

        /* Hero Section */
        .hero {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: 8px;
            padding: 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            position: relative;
            overflow: hidden;
        }
        .hero::before {
            content: '';
            position: absolute;
            top: 0; left: 0; width: 4px; height: 100%;
            background: var(--vscode-activityBarBadge-background);
        }
        .brand {
            display: flex;
            align-items: center;
            gap: 12px;
        }
        .logo {
            width: 36px;
            height: 36px;
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border-radius: 8px;
            display: grid;
            place-items: center;
            font-weight: bold;
            font-size: 18px;
        }
        .brand-info {
            display: flex;
            flex-direction: column;
        }
        .brand-title {
            font-weight: 600;
            font-size: 15px;
        }
        .brand-status {
            font-size: 12px;
            color: var(--vscode-descriptionForeground);
            margin-top: 2px;
        }
        .status-badge {
            font-size: 11px;
            padding: 4px 10px;
            border-radius: 12px;
            font-weight: 600;
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
        }

        /* Cards & Sections */
        .section {
            display: flex;
            flex-direction: column;
        }
        .card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: var(--radius);
            padding: 1px;
        }
        
        /* Buttons */
        .btn-group {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px;
        }
        .btn-group.full { grid-template-columns: 1fr; }
        
        button {
            border: none;
            padding: 8px 12px;
            border-radius: var(--radius);
            font-family: inherit;
            font-size: 12px;
            font-weight: 500;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            transition: opacity 0.2s;
            outline-offset: 2px;
        }
        button:hover { opacity: 0.9; }
        button:focus { outline: 1px solid var(--vscode-focusBorder); }
        
        .btn-primary {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
        }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-danger {
            background: var(--vscode-errorForeground);
            color: var(--vscode-editor-background);
        }
        .btn-ghost {
            background: transparent;
            color: var(--vscode-textLink-foreground);
            border: 1px solid transparent;
        }
        .btn-ghost:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .btn-outline {
            background: transparent;
            border: 1px solid var(--vscode-button-border, var(--vscode-widget-border));
            color: var(--vscode-foreground);
        }
        .btn-outline:hover {
            background: var(--vscode-list-hoverBackground);
        }

        /* Stats Grid */
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
        }
        .stat-item {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-widget-border);
            border-radius: var(--radius);
            padding: 10px;
            display: flex;
            flex-direction: column;
            min-width: 0; /* Prevent overflow */
        }
        .stat-val {
            font-size: 18px;
            font-weight: 600;
            color: var(--vscode-foreground);
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .stat-lbl {
            font-size: 11px;
            color: var(--vscode-descriptionForeground);
            margin-top: 4px;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        
        /* Form Elements */
        .form-group {
            margin-bottom: 12px;
        }
        label {
            display: block;
            font-size: 12px;
            margin-bottom: 6px;
            color: var(--vscode-foreground);
        }
        input[type="text"], input[type="number"] {
            width: 100%;
            padding: 8px;
            background: var(--vscode-input-background);
            color: var(--vscode-input-foreground);
            border: 1px solid var(--vscode-input-border);
            border-radius: var(--radius);
            font-family: inherit;
        }
        input:focus {
            border-color: var(--vscode-focusBorder);
            outline: none;
        }
        .checkbox-group {
            display: flex;
            align-items: center;
            gap: 8px;
            margin: 12px 0;
            cursor: pointer;
        }
        
        /* Panels List */
        .panel-list {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        .panel-btn {
            background: var(--vscode-sideBar-background);
            border: 1px solid var(--vscode-widget-border);
            color: var(--vscode-foreground);
            padding: 10px 12px;
            border-radius: var(--radius);
            text-align: left;
            justify-content: space-between;
        }
        .panel-btn:hover {
            background: var(--vscode-list-hoverBackground);
            border-color: var(--vscode-focusBorder);
        }
        .panel-btn::after {
            content: '→';
            font-family: monospace;
            opacity: 0.5;
        }

        .divider {
            height: 1px;
            background: var(--vscode-widget-border);
            margin: 16px 0;
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- Hero Status -->
        <div class="hero">
            <div class="brand">
                <div class="logo">W</div>
                <div class="brand-info">
                    <div class="brand-title">Windsurf MCP</div>
                    <div class="brand-status" id="statusText">
                        ${isRunning ? tr('sidebar.running', {}, lang) : tr('sidebar.stopped', {}, lang)} • :${isRunning ? currentPort : configuredPort}
                    </div>
                </div>
            </div>
            <div class="status-badge" id="statusPill" style="background: ${isRunning ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)'}; color: #fff;">
                ${isRunning ? tr('sidebar.running', {}, lang) : tr('sidebar.stopped', {}, lang)}
            </div>
        </div>

        <!-- System Controls -->
        <div class="section">
            <h2>${tr('sidebar.systemTitle', {}, lang)}</h2>
            <div class="btn-group">
                <button class="btn-primary" data-action="startServer" style="display: ${isRunning ? 'none' : 'flex'}">${tr('sidebar.start', {}, lang)}</button>
                <button class="btn-danger" data-action="stopServer" style="display: ${isRunning ? 'flex' : 'none'}">${tr('sidebar.stop', {}, lang)}</button>
                <button class="btn-secondary" data-action="restartServer">${tr('sidebar.restart', {}, lang)}</button>
            </div>
            <div class="btn-group" style="margin-top: 8px;">
                 <button class="btn-outline" data-action="configWindsurf">${tr('sidebar.configureWindsurf', {}, lang)}</button>
                 <button class="btn-outline" data-action="installHooks">${tr('sidebar.installHooks', {}, lang)}</button>
            </div>
             <div style="margin-top: 8px;">
                 <button class="btn-secondary" style="width: 100%; border: 1px solid var(--vscode-editorWarning-foreground); color: var(--vscode-editorWarning-foreground); background: transparent;" data-action="openContinueDialog">${tr('sidebar.openDialogShort', {}, lang)}</button>
            </div>
        </div>

        <!-- Panels -->
        <div class="section">
            <h2>${tr('sidebar.panelsTitle', {}, lang)}</h2>
            <div class="panel-list">
                <button class="panel-btn" data-action="openOverviewPanel">${tr('sidebar.panelOverview', {}, lang)}</button>
                <button class="panel-btn" data-action="openPrdPanel">${tr('sidebar.panelPrd', {}, lang)}</button>
                <button class="panel-btn" data-action="openPlanPanel">${tr('sidebar.panelPlan', {}, lang)}</button>
                <button class="panel-btn" data-action="openMemoryPanel">${tr('sidebar.panelMemory', {}, lang)}</button>
                <button class="panel-btn" data-action="openWamPanel">${tr('sidebar.panelWam', {}, lang)}</button>
                <button class="panel-btn" data-action="openAuditPanel">${tr('sidebar.panelAudit', {}, lang)}</button>
                <button class="panel-btn" data-action="openWalkthroughPanel">${tr('sidebar.panelWalkthrough', {}, lang)}</button>
            </div>
        </div>

        <!-- Stats -->
        <div class="section">
            <h2>${tr('sidebar.statsTitle', {}, lang)}</h2>
            <div class="stats-grid">
                <div class="stat-item">
                    <div class="stat-val" id="statTotalCalls">${stats.totalCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.totalCalls', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statAskContinue">${stats.askContinueCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statAskContinue', {}, lang)}</div>
                </div>
                 <div class="stat-item">
                    <div class="stat-val" id="statAskUser">${stats.askUserCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statAskUser', {}, lang)}</div>
                </div>
                 <div class="stat-item">
                    <div class="stat-val" id="statAskQuestion">${stats.askQuestionCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statAskQuestion', {}, lang)}</div>
                </div>
                 <div class="stat-item">
                    <div class="stat-val" id="statSetPrd">${stats.setPrdCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statSetPrd', {}, lang)}</div>
                </div>
                 <div class="stat-item">
                    <div class="stat-val" id="statUpdateOverview">${stats.updateOverviewCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statUpdateOverview', {}, lang)}</div>
                </div>
                 <div class="stat-item">
                    <div class="stat-val" id="statGenerateOverview">${stats.generateOverviewCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statGenerateOverview', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statUpdatePlan">${stats.updatePlanCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statUpdatePlan', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statPlanChangeRequest">${stats.planChangeRequestCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statPlanChangeRequest', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statUpdateWalkthrough">${stats.updateWalkthroughCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statUpdateWalkthrough', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statRagSearch">${stats.ragSearchCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statRagSearch', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statMemorySearch">${stats.memorySearchCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statMemorySearch', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statMemoryHygiene">${stats.memoryHygieneCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statMemoryHygiene', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statRecordLesson">${stats.recordLessonCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statRecordLesson', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statGetProjectStatus">${stats.getProjectStatusCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statGetProjectStatus', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statPreflight">${stats.preflightCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statPreflight', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statSaveMemory">${stats.saveMemoryCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statSaveMemory', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statGetMemory">${stats.getMemoryCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statGetMemory', {}, lang)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-val" id="statListMemory">${stats.listMemoryCalls}</div>
                    <div class="stat-lbl">${tr('sidebar.statListMemory', {}, lang)}</div>
                </div>
            </div>
            
            <div class="divider"></div>
            
            <div class="stats-grid">
                <div class="stat-item">
                     <div class="stat-val" id="statPrdUpdates">${trackerSnapshot.stats.prdUpdates}</div>
                     <div class="stat-lbl">${tr('sidebar.trackerStatsPrd', {}, lang)}</div>
                </div>
                 <div class="stat-item">
                     <div class="stat-val" id="statPrdApprovals">${trackerSnapshot.stats.prdApprovals}</div>
                     <div class="stat-lbl">${tr('sidebar.trackerStatsApprovals', {}, lang)}</div>
                </div>
                 <div class="stat-item">
                     <div class="stat-val" id="statOverviewUpdates">${trackerSnapshot.stats.overviewUpdates}</div>
                     <div class="stat-lbl">${tr('sidebar.trackerStatsOverview', {}, lang)}</div>
                </div>
                 <div class="stat-item">
                     <div class="stat-val" id="statPlanUpdates">${trackerSnapshot.stats.planUpdates}</div>
                     <div class="stat-lbl">${tr('sidebar.trackerStatsPlan', {}, lang)}</div>
                </div>
                 <div class="stat-item">
                     <div class="stat-val" id="statWalkthroughUpdates">${trackerSnapshot.stats.walkthroughUpdates}</div>
                     <div class="stat-lbl">${tr('sidebar.trackerStatsWalkthrough', {}, lang)}</div>
                </div>
            </div>
        </div>
        
        <!-- Cleanup -->
        <div class="section">
             <h2>${tr('sidebar.clearTitle', {}, lang)}</h2>
             <div class="btn-group">
                <button class="btn-ghost" data-action="clearOverview">${tr('sidebar.clearOverview', {}, lang)}</button>
                <button class="btn-ghost" data-action="clearPrd">${tr('sidebar.clearPrd', {}, lang)}</button>
                <button class="btn-ghost" data-action="clearPlan">${tr('sidebar.clearPlan', {}, lang)}</button>
                <button class="btn-ghost" data-action="clearWalkthrough">${tr('sidebar.clearWalkthrough', {}, lang)}</button>
                <button class="btn-ghost" data-action="clearAudit">${tr('sidebar.clearAudit', {}, lang)}</button>
                <button class="btn-ghost" style="color: var(--vscode-errorForeground)" data-action="clearTracking">${tr('sidebar.clearTracking', {}, lang)}</button>
             </div>
        </div>

        <!-- Config -->
        <div class="section">
            <h2>${tr('sidebar.settingsTitle', {}, lang)}</h2>
            <div class="form-group">
                <label>${tr('sidebar.port', {}, lang)}</label>
                <input type="number" id="portInput" value="${configuredPort}" min="1024" max="65535" />
            </div>
            <div class="form-group">
                <label>${tr('sidebar.defaultReason', {}, lang)}</label>
                <input type="text" id="defaultReasonInput" value="${defaultReason}" placeholder="${tr('sidebar.defaultReasonPlaceholder', {}, lang)}" />
            </div>
            <div class="checkbox-group">
                <input type="checkbox" id="autoStart" ${autoStart ? 'checked' : ''}>
                <label for="autoStart">${tr('sidebar.autoStart', {}, lang)}</label>
            </div>
            <div class="btn-group">
                <button class="btn-primary" id="saveSettings">${tr('sidebar.saveSettings', {}, lang)}</button>
                <button class="btn-ghost" data-action="resetDefaults">${tr('sidebar.resetDefaultPort', {}, lang)}</button>
            </div>
             <div class="btn-group" style="margin-top: 10px;">
                <button class="btn-ghost" id="toggleLanguage">${lang === 'en' ? tr('ui.lang.zh', {}, lang) : tr('ui.lang.en', {}, lang)}</button>
            </div>
        </div>
    </div>

    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        let currentLang = ${safeJson(lang)};
        const statusText = document.getElementById('statusText');
        const statusPill = document.getElementById('statusPill');
        const setText = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.textContent = String(value ?? 0);
        };

        const updateToolStats = (s) => {
            if (!s) return;
            setText('statTotalCalls', s.totalCalls);
            setText('statAskContinue', s.askContinueCalls);
            setText('statAskUser', s.askUserCalls);
            setText('statAskQuestion', s.askQuestionCalls);
            setText('statSetPrd', s.setPrdCalls);
            setText('statUpdateOverview', s.updateOverviewCalls);
            setText('statGenerateOverview', s.generateOverviewCalls);
            setText('statUpdatePlan', s.updatePlanCalls);
            setText('statRagSearch', s.ragSearchCalls);
            setText('statMemorySearch', s.memorySearchCalls); // Kept ID but not in HTML? I should add it back or it will just be ignored
            setText('statMemoryHygiene', s.memoryHygieneCalls);
            setText('statRecordLesson', s.recordLessonCalls);
            setText('statGetProjectStatus', s.getProjectStatusCalls);
            setText('statSaveMemory', s.saveMemoryCalls);
            setText('statGetMemory', s.getMemoryCalls);
            setText('statListMemory', s.listMemoryCalls);
            setText('statPreflight', s.preflightCalls);
        };
        const updateProjectStats = (s) => {
            if (!s) return;
            setText('statPrdUpdates', s.prdUpdates);
            setText('statPrdApprovals', s.prdApprovals);
            setText('statOverviewUpdates', s.overviewUpdates);
            setText('statPlanUpdates', s.planUpdates);
            setText('statWalkthroughUpdates', s.walkthroughUpdates);
        };

        function post(type, payload = {}) {
            vscode.postMessage({ type, ...payload });
        }

        document.querySelectorAll('[data-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.getAttribute('data-action');
                if (action) post(action);
            });
        });

        document.getElementById('saveSettings')?.addEventListener('click', () => {
            const portValue = Number(document.getElementById('portInput')?.value || ${configuredPort});
            if (!Number.isNaN(portValue)) {
                post('updatePort', { port: portValue });
            }
            post('saveSettings', {
                autoStart: document.getElementById('autoStart')?.checked || false,
                defaultReason: document.getElementById('defaultReasonInput')?.value || '',
                language: currentLang
            });
        });

        document.getElementById('toggleLanguage')?.addEventListener('click', () => {
            currentLang = currentLang === 'en' ? 'zh' : 'en';
            post('setLanguage', { language: currentLang });
        });

        window.addEventListener('message', (event) => {
            const msg = event.data;
            if (msg && msg.type === 'status') {
                const running = !!msg.running;
                const port = msg.port;
                if (statusText) {
                    statusText.textContent = (running ? ${safeJson(tr('sidebar.running', {}, lang))} : ${safeJson(tr('sidebar.stopped', {}, lang))}) + ' • :' + port;
                }
                if (statusPill) {
                    statusPill.textContent = running ? ${safeJson(tr('sidebar.running', {}, lang))} : ${safeJson(tr('sidebar.stopped', {}, lang))};
                    statusPill.style.background = running ? 'var(--vscode-testing-iconPassed)' : 'var(--vscode-testing-iconFailed)';
                }
                if (msg.stats) {
                    updateToolStats(msg.stats);
                }
            }
            if (msg && msg.type === 'tracker') {
                if (msg.data && msg.data.stats) {
                    updateProjectStats(msg.data.stats);
                }
            }
        });
    </script>
</body>
</html>`;
    }
}
