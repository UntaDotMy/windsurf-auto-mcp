# WindsurfAutoMcp Workflow Rules

## MANDATORY: THINK → RECALL → RESEARCH → PLAN → CODE → VERIFY → LEARN

### Phase 1: THINK FIRST
1. `preflight()` - Session start, understand project
2. `sequential_thinking()` or `think_step()` - Complex problem breakdown
3. `sync_overview()` - If overview missing/outdated
4. `index_codebase()` - New/unfamiliar projects

### Phase 2: RECALL MEMORY
1. `search_memory({query, scope:"both"})` - Check past lessons
2. `get_memory({key:"research:topic"})` - Retrieve cached research

### Phase 3: RESEARCH
1. `rag_search({query})` - Find existing code patterns
2. `resolve_library_docs({libraryName})` → `get_library_docs({docId})` - Library docs
3. Never assume - verify with existing code

### Phase 4: PLAN
1. `update_plan({items:[{text, status:"todo"}]})` - Create checklist
2. Include verification + code_review items
3. Await approval for complex changes

### Phase 5: CODE
1. One plan item at a time
2. `check_plan()` after each completion
3. `verify_action({action, result})` after changes

### Phase 6: LEARN
1. `save_memory({key:"research:topic", scope:"global"})` - Cache discoveries
2. `record_lesson()` on errors

## BLOCKING RULES
- ❌ NO code without plan
- ❌ NO plan without memory search
- ❌ NO implementation without overview
- ❌ NO ask_continue without code_review

## TOOLS
- `preflight()` - Session start
- `workflow_status()` - Current state + guidance
- `sequential_thinking()` - Full structured thinking
- `think_step()` / `get_thinking_history()` - Quick thinking
- `resolve_library_docs()` / `get_library_docs()` - Docs lookup
- `sync_overview()` / `index_codebase()` - Context refresh
- `search_memory()` / `save_memory()` - Memory ops
- `rag_search()` - Code patterns
- `update_plan()` / `check_plan()` - Plan management
- `verify_action()` / `code_review()` - Quality gates
- `ask_continue()` - Request next task

## RESEARCH CACHING
```
save_memory({
  key: "research:lib:topic",
  value: "Findings...",
  scope: "global",
  kind: "long",
  tags: ["research", "lib"]
})
```
