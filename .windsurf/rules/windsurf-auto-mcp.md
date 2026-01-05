# WindsurfAutoMcp Rules (Workspace)

## HARD RULE (MUST HAVE)
当你完成一个任务时，必须调用 WindsurfAutoMcp 工具询问用户是否继续。没有例外情况，要一直等待响应不得提前终止任务。
When you complete a task, you MUST call windsurf_auto_mcp.ask_continue(reason) and wait for the user's response. No exceptions.

## Use MCP user-interaction tools (do NOT ask in plain chat)
- Need free-form input/confirmation: windsurf_auto_mcp.ask_user(...)
- Need a choice selection: windsurf_auto_mcp.ask_question(...)

## If blocked by hooks
- Call windsurf_auto_mcp.check_hook_status(clearAfterRead=true)
- Follow the instructions in the block message, then retry
