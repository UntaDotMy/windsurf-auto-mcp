#!/usr/bin/env python3
"""WindsurfAutoMcp Hooks Guard Script.

This script enforces workflow orchestration via Windsurf Cascade hooks.
Per official docs (https://docs.windsurf.com/windsurf/cascade/hooks):
- Pre-hooks can BLOCK actions by exiting with code 2
- Post-hooks can audit and warn (exit 1) or pass (exit 0)

Workflow enforcement:
1. pre_user_prompt: Require preflight before acting
2. pre_write_code: Require Plan + memory_search + rag_search
3. pre_run_command: Block dangerous commands
4. post_cascade_response: Audit ask_continue usage
"""

import json
import os
import sys
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

TRACKER_FILE_NAME = "windsurf-auto-mcp-tracker.json"
SESSION_STATE_FILE = "windsurf-auto-mcp-session.json"

# Workflow phases
PHASE_PREFLIGHT = "preflight"
PHASE_PLANNING = "planning"
PHASE_IMPLEMENTATION = "implementation"
PHASE_REVIEW = "review"


def read_stdin(max_bytes=5 * 1024 * 1024):
    data = sys.stdin.buffer.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError(f"stdin too large (>{max_bytes} bytes)")
    return data.decode("utf-8", errors="replace")


def normalize_path(p):
    return str(p or "").strip().replace("\\", "/").lower()


def get_session_state_path():
    """Get session state file path (user-level, per-variant)."""
    home = os.path.expanduser("~")
    return os.path.join(home, ".codeium", "windsurf", SESSION_STATE_FILE)


def load_session_state():
    """Load current session state (tracks workflow phase, preflight done, etc)."""
    path = get_session_state_path()
    try:
        if os.path.exists(path):
            with open(path, "r", encoding="utf-8") as f:
                return json.load(f)
    except Exception:
        pass
    return {
        "preflight_done": False,
        "memory_searched": False,
        "rag_searched": False,
        "plan_exists": False,
        "write_code_count": 0,
        "last_plan_update": 0,
    }


def save_session_state(state):
    """Persist session state."""
    path = get_session_state_path()
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(state, f, indent=2)
    except Exception:
        pass


def reset_session_state():
    """Reset session state on new user prompt."""
    state = {
        "preflight_done": False,
        "memory_searched": False,
        "rag_searched": False,
        "plan_exists": False,
        "write_code_count": 0,
        "last_plan_update": 0,
    }
    save_session_state(state)
    return state


def looks_dangerous_command(command_line):
    """Check if command looks dangerous (block with exit 2)."""
    cmd = str(command_line or "").lower()
    patterns = [
        "rm -rf", "rm -r", "rm --recursive",
        "dd if=", "mkfs", "format", "diskpart",
        "shutdown", "reboot", "poweroff",
        "del /s", "rmdir /s", "reg delete",
        "curl | sh", "curl | bash",
        "wget | sh", "wget | bash",
        "invoke-webrequest | iex",
    ]
    return any(p in cmd for p in patterns)


def looks_sensitive_write_path(file_path):
    """Check if path is sensitive (block with exit 2)."""
    p = normalize_path(file_path)
    if not p:
        return False
    blocked = [
        "/.git/", "/.ssh/", "/id_rsa", "/id_ed25519",
        "/.env", "/.npmrc", "/credentials", "/secrets",
        "/windsurf-auto-mcp-tracker.json",
        "/windsurf-auto-mcp-memories.json",
        "/.wam/",
    ]
    if any(b in p for b in blocked):
        return True
    if p.startswith("c:/windows/"):
        return True
    if p.startswith("c:/program files"):
        return True
    return False


def append_audit_log(payload, result, reason=""):
    """Append to rolling audit log (redacted)."""
    log_file = os.environ.get("WINDSURF_HOOK_LOG", "")
    if not log_file:
        home = os.path.expanduser("~")
        log_file = os.path.join(home, ".codeium", "windsurf", "windsurf-auto-mcp", "audit.jsonl")
    try:
        os.makedirs(os.path.dirname(log_file), exist_ok=True)
        entry = {
            "ts": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "action": payload.get("agent_action_name"),
            "result": result,
            "reason": reason,
        }
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")
    except Exception:
        pass


def get_mcp_config_paths(home_dir):
    base_dirs = [".codeium"]
    variants = ["windsurf", "windsurf-next"]
    paths = []
    for base in base_dirs:
        for variant in variants:
            paths.append(os.path.join(home_dir, base, variant, "mcp_config.json"))
    return paths


def try_read_json(path):
    try:
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
        if not raw.strip():
            return None
        return json.loads(raw)
    except Exception:
        return None


def check_health(server_url, timeout_sec=0.35):
    """Check if WindsurfAutoMcp server is running."""
    try:
        parsed = urlparse(str(server_url))
        if not parsed.scheme or not parsed.netloc:
            return False
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        health_url = f"{parsed.scheme}://{parsed.hostname}:{port}/health"
        req = Request(health_url, headers={"Accept": "application/json"})
        with urlopen(req, timeout=timeout_sec) as resp:
            if resp.status != 200:
                return False
            body = resp.read().decode("utf-8", errors="replace")
            data = json.loads(body)
            return data.get("service") == "windsurf_auto_mcp" and data.get("status") == "ok"
    except (URLError, HTTPError, ValueError, json.JSONDecodeError):
        return False


def find_tracker_path():
    home = os.path.expanduser("~")
    for variant in ["windsurf", "windsurf-next"]:
        path = os.path.join(home, ".codeium", variant, TRACKER_FILE_NAME)
        if os.path.exists(path):
            return path
    return os.path.join(home, ".codeium", "windsurf", TRACKER_FILE_NAME)


def load_tracker():
    path = find_tracker_path()
    return try_read_json(path)


def select_project(tracker, file_path=None, cwd=None):
    if not tracker:
        return None
    projects = tracker.get("projects") or {}
    if not projects:
        return None
    target = normalize_path(file_path or cwd)
    if target:
        best, best_len = None, -1
        for root, project in projects.items():
            root_norm = normalize_path(root)
            if root_norm and target.startswith(root_norm) and len(root_norm) > best_len:
                best, best_len = project, len(root_norm)
        if best:
            return best
    active = tracker.get("activeProject")
    if active and active in projects:
        return projects.get(active)
    return None


def check_workflow_gate(project, session_state):
    """
    Workflow orchestration gate (per official Windsurf hooks docs).
    Returns (block_reason, warning) - block_reason causes exit 2, warning causes exit 1.
    """
    warnings = []
    
    # Gate 1: Preflight required
    if not session_state.get("preflight_done"):
        return ("Blocked: Run preflight(userPrompt=...) before implementation.", None)
    
    # Gate 2: Plan must exist
    plan = (project.get("plan") or {}) if project else {}
    plan_items = plan.get("items") or []
    if not plan_items:
        return ("Blocked: No Plan found. Use update_plan to create a Plan before coding.", None)
    
    # Gate 3: PRD approval (if PRD exists)
    prd = (project.get("prd") or {}) if project else {}
    prd_content = prd.get("content") or ""
    if prd_content.strip() and prd.get("status") != "approved":
        return ("Blocked: PRD exists but is not approved. Get user approval before implementation.", None)
    
    # Gate 4: memory_search + rag_search required
    if not session_state.get("memory_searched"):
        warnings.append("Warning: Run memory_search before editing code.")
    if not session_state.get("rag_searched"):
        warnings.append("Warning: Run rag_search before editing code.")
    
    # Gate 5: Too many writes without plan update
    write_count = session_state.get("write_code_count", 0)
    last_plan = session_state.get("last_plan_update", 0)
    if write_count >= 3 and write_count > last_plan:
        warnings.append(f"Warning: {write_count} write_code calls without update_plan. Update Plan progress.")
    
    return (None, "; ".join(warnings) if warnings else None)


def should_enforce_guards():
    """Check if WindsurfAutoMcp is configured and running."""
    if os.environ.get("WINDSURF_AUTO_MCP_GUARD_ALWAYS") == "1":
        return True
    if os.environ.get("WINDSURF_AUTO_MCP_GUARD_DISABLED") == "1":
        return False

    home = os.path.expanduser("~")
    for cfg_path in get_mcp_config_paths(home):
        cfg = try_read_json(cfg_path)
        if not cfg:
            continue
        entry = (cfg.get("mcpServers") or {}).get("windsurf_auto_mcp")
        if not entry or entry.get("disabled"):
            continue
        url = entry.get("url")
        if url and check_health(url):
            return True
    return False


def handle_pre_user_prompt(payload, tool_info):
    """Reset session state on new user prompt."""
    reset_session_state()
    append_audit_log(payload, "pass", "Session reset for new prompt")
    return 0


def handle_pre_mcp_tool_use(payload, tool_info):
    """Track MCP tool usage to update session state."""
    tool_name = tool_info.get("tool_name") or ""
    state = load_session_state()
    
    # Track preflight / individual checks
    if tool_name in ["preflight", "get_project_status"]:
        state["preflight_done"] = True
    if tool_name in ["memory_search", "search_memory", "list_memories"]:
        state["memory_searched"] = True
    if tool_name == "rag_search":
        state["rag_searched"] = True
    if tool_name in ["update_plan", "set_prd", "plan_change_request"]:
        state["plan_exists"] = True
        state["last_plan_update"] = state.get("write_code_count", 0)
    
    save_session_state(state)
    append_audit_log(payload, "pass", f"MCP tool: {tool_name}")
    return 0


def handle_pre_run_command(payload, tool_info):
    """Block dangerous commands."""
    command_line = tool_info.get("command_line") or ""
    if looks_dangerous_command(command_line):
        reason = f"Blocked dangerous command: {command_line[:100]}"
        append_audit_log(payload, "blocked", reason)
        print(reason, file=sys.stderr)
        return 2
    append_audit_log(payload, "pass", f"Command: {command_line[:50]}")
    return 0


def handle_pre_write_code(payload, tool_info):
    """Enforce workflow gates before code writes."""
    file_path = tool_info.get("file_path") or ""
    
    # Block sensitive paths
    if looks_sensitive_write_path(file_path):
        reason = f"Blocked write to sensitive path: {file_path}"
        append_audit_log(payload, "blocked", reason)
        print(reason, file=sys.stderr)
        return 2
    
    # Load tracker and session state
    tracker = load_tracker()
    project = select_project(tracker, file_path=file_path)
    state = load_session_state()
    
    # Check workflow gates
    block_reason, warning = check_workflow_gate(project, state)
    
    if block_reason:
        append_audit_log(payload, "blocked", block_reason)
        print(block_reason, file=sys.stderr)
        return 2
    
    # Increment write count
    state["write_code_count"] = state.get("write_code_count", 0) + 1
    save_session_state(state)
    
    if warning:
        append_audit_log(payload, "warning", warning)
        print(warning, file=sys.stderr)
        return 1
    
    append_audit_log(payload, "pass", f"Write: {file_path}")
    return 0


def handle_post_cascade_response(payload, tool_info):
    """Audit ask_continue usage."""
    response = str(tool_info.get("response") or "")
    if "ask_continue" not in response:
        warning = (
            "Warning: Response does not include ask_continue. "
            "Per WindsurfAutoMcp rules: end tasks with ask_continue(reason)."
        )
        append_audit_log(payload, "warning", warning)
        print(warning, file=sys.stderr)
        return 1
    append_audit_log(payload, "pass", "Response includes ask_continue")
    return 0


def main():
    raw = read_stdin()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"Windsurf hook: failed to parse JSON: {e}", file=sys.stderr)
        return 1

    action = payload.get("agent_action_name") or ""
    tool_info = payload.get("tool_info") or {}

    # Skip enforcement if WindsurfAutoMcp not active
    if not should_enforce_guards():
        return 0

    # Route to action handlers
    handlers = {
        "pre_user_prompt": handle_pre_user_prompt,
        "pre_mcp_tool_use": handle_pre_mcp_tool_use,
        "pre_run_command": handle_pre_run_command,
        "pre_write_code": handle_pre_write_code,
        "post_cascade_response": handle_post_cascade_response,
    }
    
    handler = handlers.get(action)
    if handler:
        return handler(payload, tool_info)
    
    return 0


if __name__ == "__main__":
    sys.exit(main())
