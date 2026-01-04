# WindsurfAutoMcp Workflow Rules

## ⚠️ CRITICAL: STOP → THINK → READ → RESEARCH → PLAN → CODE

**NEVER trust your knowledge. ALWAYS research first. Treat 2024 info as outdated.**

## Phase 0: STOP & UNDERSTAND
Before ANY action:
1. `preflight()` - MANDATORY first call every session
2. `check_hook_status()` - If ANY action fails/blocked, call this IMMEDIATELY
3. Read the error/block message. Understand WHY.

## Phase 1: THINK DEEPLY
1. `index_codebase({depth:"deep"})` - Understand project tech stack, structure, patterns
2. `sequential_thinking()` - Break down complex problems into stages
3. Read target files BEFORE editing - understand context
4. Identify: What exists? What patterns? What conventions?

## Phase 2: RESEARCH (MANDATORY)
**NEVER skip research. NEVER assume. ALWAYS verify.**
1. `memory_search({query, scope:"both"})` - Check lessons, cached research
2. `rag_search({query})` - Find existing code patterns in THIS project
3. `resolve_library_docs()` → `get_library_docs()` - Get CURRENT docs (not from memory)
4. Web search for best practices - treat knowledge from 2024 as potentially outdated
5. Save findings: `save_memory({key:"research:topic", scope:"global", kind:"long"})`

## Phase 3: PLAN (NO CODE WITHOUT PLAN)
1. `update_plan({items:[...]})` - Create detailed checklist
2. Include: verification steps, tests, code_review
3. Get user approval for significant changes
4. Plan must reference research findings

## Phase 4: EXECUTE (ONE STEP AT A TIME)
1. Complete ONE plan item
2. `check_plan()` - Mark done, get next
3. `verify_action()` - Confirm success
4. Repeat until complete

## Phase 5: VERIFY & LEARN
1. `code_review()` - Required before completion
2. `record_lesson()` - On errors/learnings
3. `ask_continue()` - Only after code_review passes

## 🛑 ABSOLUTE BLOCKS
- ❌ NO code without approved plan
- ❌ NO plan without research (memory + rag + docs)
- ❌ NO implementation without reading existing code first
- ❌ NO ask_continue without code_review
- ❌ NO assumptions - verify everything with existing code

## 🚨 WHEN BLOCKED
If hooks block your action (exit code 2):
1. STOP retrying the same action
2. Call `check_hook_status()` immediately
3. Read the block reason in the response
4. Fix the issue (e.g., create plan first, run preflight)
5. Then retry

## KEY TOOLS
| Action | Tool |
|--------|------|
| Session start | `preflight()` |
| Blocked/failed | `check_hook_status()` |
| Understand project | `index_codebase({depth:"deep"})` |
| Think through | `sequential_thinking()` |
| Check memory | `memory_search({scope:"both"})` |
| Find patterns | `rag_search()` |
| Get docs | `resolve_library_docs()` → `get_library_docs()` |
| Create plan | `update_plan()` |
| Track progress | `check_plan()` |
| Before finish | `code_review()` |
| Request next | `ask_continue()` |

## RESEARCH FIRST EXAMPLES
```
// Before implementing, ALWAYS:
1. memory_search({query: "how to X in this project"})
2. rag_search({query: "X implementation pattern"})
3. resolve_library_docs({libraryName: "lib-name"})
4. THEN create plan based on findings
```
