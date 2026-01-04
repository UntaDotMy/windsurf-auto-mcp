# WindsurfAutoMcp Workflow Rules

## MANDATORY WORKFLOW: THINK → RECALL → RESEARCH → PLAN → CODE → VERIFY → LEARN

### Phase 1: THINK FIRST (Before Any Action)
1. Call `preflight()` at session start - understand project state
2. Call `sequential_thinking()` for complex problems - break down into steps
3. Call `sync_overview()` if overview is missing or outdated
4. Call `index_codebase()` on new/unfamiliar projects

### Phase 2: RECALL MEMORY (Before Planning)
1. `search_memory({query:"relevant topic", scope:"both"})` - check past lessons
2. `get_memory({key:"research:topic"})` - retrieve cached research
3. Check global memory for reusable best practices

### Phase 3: RESEARCH (Before Writing Code)
1. `rag_search({query:"pattern or concept"})` - find existing code patterns
2. Use Context7 for library docs: "use context7" in prompts
3. Never assume - verify with existing code first

### Phase 4: PLAN (Before Implementation)
1. `update_plan({items:[{text:"task", status:"todo"}]})` - create detailed checklist
2. Include verification + code_review items in every plan
3. Wait for approval before implementing complex changes

### Phase 5: CODE (With Verification)
1. Implement one plan item at a time
2. `check_plan()` after completing each item
3. `verify_action({action:"...", result:"..."})` after significant changes

### Phase 6: LEARN (Save Discoveries)
1. `save_memory({key:"research:topic", value:"...", scope:"global"})` - cache research
2. `record_lesson({lesson:"..."})` when errors occur
3. Tag with "research" for global cache, project-specific otherwise

## BLOCKING RULES (Guard Enforced)
- ❌ NO code without a plan with checklist
- ❌ NO planning without memory search
- ❌ NO implementation without overview
- ❌ NO ask_continue without code_review

## TOOL QUICK REFERENCE
- `preflight()` - Session start, auto-init new projects
- `workflow_status()` - Check workflow state, get guidance
- `sequential_thinking()` - Structured problem-solving
- `sync_overview()` - Regenerate stale/missing overview
- `index_codebase()` - Deep context indexing
- `search_memory()` / `save_memory()` - Memory operations
- `rag_search()` - Find code patterns
- `update_plan()` / `check_plan()` - Plan management
- `verify_action()` - Post-action verification
- `code_review()` - Quality gate before completion
- `ask_continue()` - Request next task

## RESEARCH CACHING
Save research globally for reuse:
```
save_memory({
  key: "research:typescript:decorators",
  value: "Best practices for TS decorators...",
  scope: "global",
  kind: "long",
  tags: ["research", "typescript", "decorators"]
})
```

## CONTEXT7 INTEGRATION
For up-to-date library documentation:
- Add "use context7" to prompts requiring library docs
- Install: `npx @upstash/context7-mcp` in MCP config
