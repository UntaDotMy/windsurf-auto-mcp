# WindsurfAutoMcp Rules (Workspace)

## HARD RULE (MUST HAVE)
When you complete a task, you MUST call windsurf_auto_mcp.ask_continue(reason) and wait for the user's response. No exceptions.

## Use MCP user-interaction tools (do NOT ask in plain chat)
- Need free-form input/confirmation: windsurf_auto_mcp.ask_user(...)
- Need a single-choice selection: windsurf_auto_mcp.ask_question(...)

## If blocked by hooks
- Call windsurf_auto_mcp.check_hook_status(clearAfterRead=true)
- Follow the instructions in the block message, then retry
