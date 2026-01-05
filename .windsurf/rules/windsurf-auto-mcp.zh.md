# WindsurfAutoMcp 规则（工作区）

## 硬规则（必须保留）
当你完成一个任务时，必须调用 WindsurfAutoMcp 工具询问用户是否继续。没有例外情况，要一直等待响应不得提前终止任务。

## 必须使用 MCP 交互工具（不要在聊天里随便问）
- 需要用户自由输入/确认：windsurf_auto_mcp.ask_user(...)
- 需要用户单选：windsurf_auto_mcp.ask_question(...)

## 如果被 hooks 阻止
- 调用 windsurf_auto_mcp.check_hook_status(clearAfterRead=true)
- 按阻止信息里的要求修复后再重试
