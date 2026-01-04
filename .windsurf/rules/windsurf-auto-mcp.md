# WindsurfAutoMcp Workflow Rules

## 🧠 CORE PRINCIPLE: RECALL → THINK → ACT (Like Humans Do)
**Before EVERY action, follow this sequence:**
1. **RECALL**: `memory_search()` + `rag_search()` - What do I already know?
2. **THINK**: `sequential_thinking()` - Analyze and plan the approach
3. **ACT**: Execute based on recalled knowledge and thinking

## 🚨 HOOK FEEDBACK IN EVERY TOOL RESPONSE
**All MCP tools now include hook feedback at the TOP of responses.**
If you see `⛔ HOOK BLOCKED YOUR LAST ACTION:` - READ IT and FIX IT!
Do NOT ignore this message. Do NOT retry the same action.

## ⚠️ WORKFLOW: RECALL → THINK → RESEARCH → PLAN → CODE

**NEVER trust your knowledge. ALWAYS recall memory first. Treat 2024 info as outdated.**

## Phase 0: INITIALIZE
1. `preflight()` - MANDATORY first call every session
2. Read the response - it contains project status AND any hook blocks

## Phase 1: RECALL (Like Human Memory)
**Always recall before thinking - just like humans do!**
1. `memory_search({query, scope:"both"})` - What lessons/knowledge exist?
2. `rag_search({query})` - What code patterns exist in THIS project?
3. `get_memory({key:"relevant-key"})` - Get specific cached research

## Phase 2: THINK
1. `sequential_thinking()` - Break down problems into stages
2. `index_codebase({depth:"deep"})` - Understand project structure
3. Read target files BEFORE editing

## Phase 3: RESEARCH (Verify External Info)
1. `resolve_library_docs()` → `get_library_docs()` - Get CURRENT docs
2. Web search for best practices if needed
3. `save_memory()` - Cache findings for future recall

## Phase 4: PLAN (NO CODE WITHOUT PLAN)
1. `update_plan({items:[...]})` - Create detailed checklist
2. Include: verification, tests, code_review items
3. `ensure_release_gate()` - Add required quality gates

## Phase 5: EXECUTE (ONE STEP AT A TIME)
1. Complete ONE plan item
2. `update_plan()` - Mark done, get next
3. `check_plan()` - Verify progress
4. Repeat until complete

## Phase 6: VERIFY & LEARN
1. `code_review()` - Required before completion
2. `record_lesson()` - Save learnings for future recall
3. `ask_continue()` - Only after code_review passes

## 🛑 ABSOLUTE RULES
- ❌ NO action without recalling memory first
- ❌ NO code without approved plan
- ❌ NO plan without research (memory + rag + docs)
- ❌ NO ask_continue without code_review
- ❌ NO ignoring hook block messages

## 🚨 WHEN BLOCKED (Hook returns exit code 2)
**Every tool response will show the block reason at the top!**
1. READ the `⛔ HOOK BLOCKED` message in the tool response
2. UNDERSTAND the root cause
3. FIX it (missing plan? run `update_plan`. missing gate? run `ensure_release_gate`)
4. THEN retry your action

## KEY TOOLS
- `preflight()` - Session start
- `memory_search({scope:"both"})` - RECALL first!
- `rag_search()` - Find code patterns
- `sequential_thinking()` - THINK before acting
- `update_plan()` / `check_plan()` - Plan management
- `ensure_release_gate()` - Add required quality gates
- `code_review()` - Before completion
- `record_lesson()` - Save for future recall
- `ask_continue()` - Request next task

## EXAMPLE: CORRECT WORKFLOW
```
// 1. RECALL - What do I know?
memory_search({query: "how to implement X", scope: "both"})
rag_search({query: "X implementation pattern"})

// 2. THINK - Analyze the problem
sequential_thinking({thought: "Based on recalled info..."})  

// 3. PLAN - Create before coding
update_plan({items: [{text: "Step 1...", status: "todo"}]})
ensure_release_gate()  // Add required gates

// 4. ACT - Execute the plan
// ... implement ...

// 5. LEARN - Save for next time
record_lesson({title: "How to X", ...})
```
