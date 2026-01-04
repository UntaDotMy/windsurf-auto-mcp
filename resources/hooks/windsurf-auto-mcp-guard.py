#!/usr/bin/env python3

import json
import os
import sys
import time
import hashlib
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

TRACKER_FILE_NAME = "windsurf-auto-mcp-tracker.json"
MEMORY_FILE_NAME = "windsurf-auto-mcp-memories.json"
GLOBAL_MEMORY_FILE_NAME = "windsurf-auto-mcp-global-memories.json"
STATE_FILE_NAME = "windsurf-auto-mcp-guard-state.json"
ARTIFACT_ROOT_DIR = "windsurf-auto-mcp"
ARTIFACT_BRAIN_DIR = "brain"
AUDIT_FILE_NAME = "audit.jsonl"

AUDIT_MAX_BYTES = 260_000
AUDIT_MAX_LINES = 260

MAX_WRITES_WITHOUT_PLAN_UPDATE = 3

# Workflow State Machine
# States: IDLE -> PREFLIGHT_DONE -> PLAN_EXISTS -> ACTING -> VERIFYING -> READY_TO_ASK
WORKFLOW_STATES = {
    "IDLE": 0,           # Initial state, no work started
    "PREFLIGHT_DONE": 1, # preflight() completed
    "PLAN_EXISTS": 2,    # Plan with checklist exists
    "ACTING": 3,         # Implementing (write_code/run_command allowed)
    "VERIFYING": 4,      # Running verification (tests/build/lint)
    "READY_TO_ASK": 5,   # Ready to call ask_continue
}

# Tools that advance workflow state
WORKFLOW_ADVANCE_TOOLS = {
    "preflight": "PREFLIGHT_DONE",
    "get_project_status": "PREFLIGHT_DONE",  # Alternative to preflight
    "update_plan": "PLAN_EXISTS",
    "check_plan": "READY_TO_ASK",
}

# Tools that require minimum workflow state
WORKFLOW_REQUIREMENTS = {
    "set_prd": "PREFLIGHT_DONE",
    "update_plan": "PREFLIGHT_DONE",
    "update_overview": "PREFLIGHT_DONE",
    "generate_overview": "PREFLIGHT_DONE",
    "update_walkthrough": "PLAN_EXISTS",
    "save_memory": "PREFLIGHT_DONE",
    "record_lesson": "PREFLIGHT_DONE",
    "wam_commit": "PREFLIGHT_DONE",
}

REQUIRE_RATIONALE_TOOLS = {
    # Tracking/PRD/Plan/Walkthrough
    "set_prd",
    "approve_prd",
    "update_overview",
    "generate_overview",
    "update_plan",
    "plan_change_request",
    "update_walkthrough",
    "generate_walkthrough",
    "ensure_release_gate",
    # Memory
    "save_memory",
    "memory_hygiene",
    "record_lesson",
    # WAM (history)
    "wam_commit",
    "wam_checkout",
    "wam_reset",
    "wam_merge",
    "wam_branch",
    "wam_tag",
    "wam_stash",
}

CODE_REVIEW_KEYWORDS = [
    "code review",
    "final code review",
    "review session",
    "security review",
    "performance review",
    "代码审查",
    "代码 review",
    "最终代码审查",
    "审查",
]

VERIFY_KEYWORDS = [
    "run tests",
    "tests",
    "test",
    "pytest",
    "unit test",
    "integration test",
    "lint",
    "format",
    "build",
    "compile",
    "verify",
    "verification",
    "acceptance",
    "验收",
    "验证",
    "测试",
    "构建",
    "编译",
]

# Dependency + security scan gates that should be visible in the Plan.
# These are surfaced by ensure_release_gate (extension tool) and backed by CI for this repo.
DEPENDENCY_SECURITY_KEYWORDS = [
    "dependency check",
    "dependency audit",
    "dependency scan",
    "npm audit",
    "osv",
    "osv-scanner",
    "dependabot",
    "vulnerable",
    "vulnerability",
    "security scan",
    "supply chain",
    "依赖检查",
    "依赖审计",
    "依赖扫描",
    "npm audit",
    "漏洞",
    "安全扫描",
    "供应链",
]


def _plan_has_keyword(items, keywords, require_done=False):
    if not isinstance(items, list):
        return False
    for it in items:
        if not isinstance(it, dict):
            continue
        if require_done and it.get("status") != "done":
            continue
        text = str(it.get("text") or "").strip().lower()
        if not text:
            continue
        for kw in keywords:
            if str(kw).lower() in text:
                return True
    return False


def read_stdin(max_bytes=5 * 1024 * 1024):
    data = sys.stdin.buffer.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ValueError(f"stdin too large (>{max_bytes} bytes)")
    return data.decode("utf-8", errors="replace")


def normalize_path(p):
    return str(p or "").strip().replace("\\", "/").lower()


def looks_dangerous_command(command_line):
    cmd = str(command_line or "").lower()
    patterns = [
        "rm -rf",
        "rm -r",
        "rm --recursive",
        "dd if=",
        "mkfs",
        "format",
        "diskpart",
        "shutdown",
        "reboot",
        "poweroff",
        "del /s",
        "rmdir /s",
        "reg delete",
        "curl | sh",
        "curl | bash",
        "wget | sh",
        "wget | bash",
        "invoke-webrequest | iex",
    ]
    return any(p in cmd for p in patterns)


def looks_sensitive_write_path(file_path, workspace_root=None):
    """Check if path is sensitive and should be blocked.
    
    Args:
        file_path: The path being written to
        workspace_root: Optional workspace root to enforce containment
    
    Returns:
        True if path should be blocked, False otherwise
    """
    p = normalize_path(file_path)
    if not p:
        return False
    
    # === Blocked patterns (credentials, secrets, version control) ===
    blocked_patterns = [
        # Version control
        "/.git/",
        "/.svn/",
        "/.hg/",
        # SSH and keys
        "/.ssh/",
        "/id_rsa",
        "/id_ed25519",
        "/id_ecdsa",
        "/id_dsa",
        "/.pem",
        "/private.key",
        "/server.key",
        # Environment and secrets
        "/.env",
        "/.env.local",
        "/.env.production",
        "/.env.development",
        "/.npmrc",
        "/.pypirc",
        "/.netrc",
        "/.docker/config.json",
        "/credentials",
        "/secrets",
        "/secret.",
        "/.aws/",
        "/.azure/",
        "/.gcloud/",
        "/.kube/",
        # Database files
        "/database.yml",
        "/db.sqlite",
        "/production.sqlite",
        # Config files with potential secrets
        "/wp-config.php",
        "/config/secrets",
        "/config/credentials",
        "/.htpasswd",
        "/passwd",
        "/shadow",
    ]
    if any(b in p for b in blocked_patterns):
        return True
    
    # === Blocked file extensions ===
    blocked_extensions = [
        ".pem", ".key", ".p12", ".pfx", ".keystore",
        ".jks", ".crt", ".cer", ".der",
    ]
    for ext in blocked_extensions:
        if p.endswith(ext):
            return True
    
    # === System paths (Windows) ===
    windows_system_paths = [
        "c:/windows/",
        "c:/program files/",
        "c:/program files (x86)/",
        "c:/users/default/",
        "c:/recovery/",
        "c:/system volume information/",
        "c:/\\$recycle.bin/",
    ]
    for sys_path in windows_system_paths:
        if p.startswith(sys_path):
            return True
    
    # === System paths (Unix/Linux) ===
    unix_system_paths = [
        "/etc/",
        "/usr/",
        "/bin/",
        "/sbin/",
        "/lib/",
        "/lib64/",
        "/var/",
        "/boot/",
        "/root/",
        "/sys/",
        "/proc/",
        "/dev/",
    ]
    # Only block if it's a pure Unix path (not Windows with drive letter)
    if not p.startswith("c:") and not p.startswith("d:"):
        for sys_path in unix_system_paths:
            if p.startswith(sys_path):
                return True
    
    # === Workspace containment check ===
    if workspace_root:
        ws_norm = normalize_path(workspace_root)
        if ws_norm and not p.startswith(ws_norm):
            # Allow writes to .wam folders and ~/.codeium
            if "/.wam/" not in p and "/.codeium/" not in p:
                return True
    
    return False


def is_path_outside_workspace(file_path, workspace_root):
    """Check if a path is outside the workspace (not .wam or .codeium)."""
    if not workspace_root:
        return False
    p = normalize_path(file_path)
    ws = normalize_path(workspace_root)
    if not p or not ws:
        return False
    # Inside workspace is OK
    if p.startswith(ws):
        return False
    # .wam and .codeium folders are always OK
    if "/.wam/" in p or "/.codeium/" in p:
        return False
    return True


def looks_internal_wam_write_path(file_path):
    p = normalize_path(file_path)
    if not p:
        return False
    # Only guard our own persisted state under ~/.codeium/... (never the user workspace).
    if "/.codeium/" not in p:
        return False
    if p.endswith("/" + TRACKER_FILE_NAME):
        return True
    if p.endswith("/" + MEMORY_FILE_NAME):
        return True
    if p.endswith("/" + GLOBAL_MEMORY_FILE_NAME):
        return True
    if "/windsurf-auto-mcp/.wam/" in p:
        return True
    return False


def append_log(log_file, payload):
    if not log_file:
        return
    os.makedirs(os.path.dirname(log_file), exist_ok=True)
    with open(log_file, "a", encoding="utf-8") as f:
        f.write("\n" + "=" * 80 + "\n")
        f.write(time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()) + "\n")
        f.write(json.dumps(payload, indent=2, ensure_ascii=False) + "\n")


def get_mcp_config_paths(home_dir):
    """Return candidate mcp_config.json paths.

    Important: hooks may run under a different OS/user home than where Windsurf stores
    its user-level config (e.g. WSL running hooks while configs live under /mnt/c/...).

    We therefore include:
      1) A path derived from this guard script's install location (preferred).
      2) Conventional locations under the current user's home.
    """

    paths = []

    # 1) Prefer resolving from the installed guard location:
    #    ~/.codeium/<variant>/hooks/windsurf-auto-mcp/windsurf-auto-mcp-guard.py
    # -> ~/.codeium/<variant>/mcp_config.json
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        variant_root = os.path.dirname(os.path.dirname(script_dir))
        if os.path.isdir(variant_root):
            paths.append(os.path.join(variant_root, "mcp_config.json"))
    except Exception:
        pass

    # 2) Conventional home-based locations.
    base_dirs = [".codeium", ".windsurf"]
    variants = ["windsurf", "windsurf-next"]
    for base in base_dirs:
        for variant in variants:
            paths.append(os.path.join(home_dir, base, variant, "mcp_config.json"))

    # De-dupe while preserving order.
    unique = []
    seen = set()
    for p in paths:
        key = normalize_path(p)
        if not key or key in seen:
            continue
        seen.add(key)
        unique.append(p)
    return unique


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
    try:
        parsed = urlparse(str(server_url))
        if not parsed.scheme or not parsed.netloc:
            return False
        port = parsed.port
        if port is None:
            port = 443 if parsed.scheme == "https" else 80
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


def get_healthy_server_url():
    home = os.path.expanduser("~")
    for cfg_path in get_mcp_config_paths(home):
        cfg = try_read_json(cfg_path)
        if not cfg:
            continue
        entry = (cfg.get("mcpServers") or {}).get("windsurf_auto_mcp")
        if not entry or not isinstance(entry, dict):
            continue
        if entry.get("disabled") is True:
            continue
        url = entry.get("url")
        if not url:
            continue
        if check_health(url):
            return str(url)
    return None


def _state_path():
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        return os.path.join(script_dir, STATE_FILE_NAME)
    except Exception:
        return None


def load_guard_state():
    p = _state_path()
    if not p:
        return {}
    try:
        if not os.path.exists(p):
            return {}
        with open(p, "r", encoding="utf-8") as f:
            raw = f.read()
        if not raw.strip():
            return {}
        data = json.loads(raw)
        return data if isinstance(data, dict) else {}
    except Exception:
        return {}


def save_guard_state(state):
    p = _state_path()
    if not p:
        return
    try:
        os.makedirs(os.path.dirname(p), exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(json.dumps(state or {}, indent=2, ensure_ascii=False))
    except Exception:
        return


def _get_project_state(state, project_id):
    if not project_id:
        return state, None
    if not isinstance(state, dict):
        state = {}
    projects = state.get("projects")
    if not isinstance(projects, dict):
        projects = {}
        state["projects"] = projects
    ps = projects.get(project_id)
    if not isinstance(ps, dict):
        ps = {}
        projects[project_id] = ps
    return state, ps


def get_workflow_state(state, project_id):
    """Get the current workflow state for a project."""
    if not project_id:
        return "IDLE"
    state, ps = _get_project_state(state, project_id)
    if not ps:
        return "IDLE"
    return str(ps.get("workflowState") or "IDLE")


def set_workflow_state(state, project_id, new_state):
    """Set the workflow state for a project."""
    if not project_id or new_state not in WORKFLOW_STATES:
        return state
    state, ps = _get_project_state(state, project_id)
    if ps is None:
        return state
    ps["workflowState"] = new_state
    ps["workflowStateAt"] = _iso_now()
    return state


def advance_workflow_state(state, project_id, tool_name):
    """Advance workflow state based on tool called."""
    if not project_id or tool_name not in WORKFLOW_ADVANCE_TOOLS:
        return state, None
    target_state = WORKFLOW_ADVANCE_TOOLS[tool_name]
    current = get_workflow_state(state, project_id)
    current_level = WORKFLOW_STATES.get(current, 0)
    target_level = WORKFLOW_STATES.get(target_state, 0)
    # Only advance, never go backwards
    if target_level > current_level:
        state = set_workflow_state(state, project_id, target_state)
        return state, target_state
    return state, None


def check_workflow_requirement(state, project_id, tool_name):
    """Check if workflow state meets tool requirement."""
    if tool_name not in WORKFLOW_REQUIREMENTS:
        return None  # No requirement
    required_state = WORKFLOW_REQUIREMENTS[tool_name]
    current = get_workflow_state(state, project_id)
    current_level = WORKFLOW_STATES.get(current, 0)
    required_level = WORKFLOW_STATES.get(required_state, 0)
    if current_level < required_level:
        return (
            f"Blocked: Tool '{tool_name}' requires workflow state '{required_state}' but current state is '{current}'.\n"
            f"Required: Run preflight(userPrompt=...) first to initialize workflow state."
        )
    return None


def reset_workflow_state(state, project_id):
    """Reset workflow state to IDLE (on new user prompt)."""
    if not project_id:
        return state
    state, ps = _get_project_state(state, project_id)
    if ps is None:
        return state
    ps["workflowState"] = "IDLE"
    ps["workflowStateAt"] = _iso_now()
    return state


def _iso_now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


def call_mcp_tool(server_url, tool_name, arguments, timeout_sec=0.8):
    if not server_url:
        return None
    try:
        payload = {
            "jsonrpc": "2.0",
            "id": int(time.time() * 1000),
            "method": "tools/call",
            "params": {"name": tool_name, "arguments": arguments or {}},
        }
        body = json.dumps(payload).encode("utf-8")
        req = Request(
            str(server_url).rstrip("/"),
            data=body,
            headers={"Content-Type": "application/json", "Accept": "application/json"},
        )
        with urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw)
    except Exception:
        return None


def _mcp_call_succeeded(resp):
    if not isinstance(resp, dict):
        return False
    if resp.get("error"):
        return False
    return "result" in resp


def persist_hook_feedback(server_url, project, action, severity, message):
    """
    Persist hook failures/warnings into MCP-managed memory so they survive the transient
    hook UI (which the model may not see) and are reviewable in extension panels.
    """
    try:
        if not server_url:
            return
        msg = str(message or "").strip()
        if not msg:
            return
        scope = "project"
        root_path = ""
        if isinstance(project, dict):
            root_path = str(project.get("rootPath") or "").strip()
        if not root_path:
            scope = "global"
        key = (
            "hook:last_block"
            if severity == "block"
            else ("hook:last_error" if severity == "error" else "hook:last_warning")
        )
        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        value = f"[{ts}] {action}\n{msg}\n"
        _append_audit_log(
            project,
            {
                "at": ts,
                "action": str(action or ""),
                "severity": str(severity or ""),
                "message": _truncate_lines(_redact_secrets(msg), 80, 4200),
            },
        )
        call_mcp_tool(
            server_url,
            "save_memory",
            {
                "key": key,
                "value": value,
                "scope": scope,
                "kind": "short",
                "tags": ["hook", "guard", str(action).strip()],
            },
            timeout_sec=1.0,
        )
    except Exception:
        return


def _audit_log_path(project):
    project_id = "global"
    root_path = ""
    if isinstance(project, dict):
        project_id = str(project.get("projectId") or "").strip() or "global"
        root_path = str(project.get("rootPath") or "").strip()
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        variant_root = os.path.dirname(os.path.dirname(script_dir))
        if os.path.isdir(variant_root):
            return os.path.join(
                variant_root,
                ARTIFACT_ROOT_DIR,
                ARTIFACT_BRAIN_DIR,
                project_id,
                AUDIT_FILE_NAME,
            )
    except Exception:
        pass
    home = os.path.expanduser("~")
    variant = "windsurf-next" if "windsurf-next" in (root_path or "").lower() else "windsurf"
    return os.path.join(home, ".codeium", variant, ARTIFACT_ROOT_DIR, ARTIFACT_BRAIN_DIR, project_id, AUDIT_FILE_NAME)


def _append_audit_log(project, entry):
    try:
        p = _audit_log_path(project)
        if not p:
            return
        d = os.path.dirname(p)
        if d and not os.path.isdir(d):
            os.makedirs(d, exist_ok=True)
        line = json.dumps(entry or {}, ensure_ascii=False)
        with open(p, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        try:
            if os.path.exists(p) and os.path.getsize(p) > AUDIT_MAX_BYTES:
                with open(p, "r", encoding="utf-8", errors="replace") as f:
                    lines = f.read().splitlines()
                lines = lines[-AUDIT_MAX_LINES:]
                with open(p, "w", encoding="utf-8") as f:
                    if lines:
                        f.write("\n".join(lines) + "\n")
        except Exception:
            pass
    except Exception:
        return


def _truncate_text(text, max_chars=1600):
    s = str(text or "")
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    if len(s) <= max_chars:
        return s
    return s[: max_chars - 3] + "..."


def _truncate_lines(text, max_lines=40, max_chars=2400):
    s = str(text or "")
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    lines = s.split("\n")
    if len(lines) > max_lines:
        lines = lines[:max_lines] + ["... (truncated)"]
    return _truncate_text("\n".join(lines), max_chars=max_chars)


def _redact_secrets(text):
    # Best-effort redaction to avoid persisting accidental secrets from stderr/stdout.
    s = str(text or "")
    s = s.replace("\r\n", "\n").replace("\r", "\n")
    lower = s.lower()
    # Common "key=value" patterns.
    needles = ["password", "passwd", "token", "secret", "api_key", "apikey", "authorization", "bearer "]
    if any(n in lower for n in needles):
        # Replace "X=..." and "X: ..." forms.
        for n in needles:
            s = _redact_key_value(s, n)
    # Redact very long base64-ish blobs.
    s = _redact_long_blobs(s)
    return s


def _redact_key_value(text, key_name):
    try:
        import re

        # key=VALUE or key: VALUE (case-insensitive)
        pattern = re.compile(rf"(?i)({re.escape(key_name)}\s*[:=]\s*)([^\s\"']+)")
        return pattern.sub(r"\1<redacted>", text)
    except Exception:
        return text


def _redact_long_blobs(text):
    try:
        import re

        # Heuristic: long URL-safe/base64-ish strings.
        pattern = re.compile(r"([A-Za-z0-9_\-\/+=]{80,})")
        return pattern.sub("<redacted_blob>", text)
    except Exception:
        return text


def maybe_record_lesson(
    server_url,
    project,
    lesson_key,
    mistake,
    fix,
    prevention,
    title=None,
    tags=None,
    scope=None,
):
    try:
        project = project if isinstance(project, dict) else {}
        project_id = str(project.get("projectId") or "").strip() or "global"
        if not project_id:
            return
        state = load_guard_state()
        recorded = (state.get("recordedLessons") or {})
        if not isinstance(recorded, dict):
            recorded = {}
        per_project = recorded.get(project_id) or {}
        if not isinstance(per_project, dict):
            per_project = {}
        if per_project.get(lesson_key) is True:
            return

        root_path = str(project.get("rootPath") or "").strip()
        final_scope = scope
        if final_scope not in ("project", "global", "both"):
            final_scope = "both" if root_path else "global"
        final_tags = tags if isinstance(tags, list) else []
        final_title = str(title or "").strip() or f"Lesson: {lesson_key}"
        args = {
            "title": final_title,
            "mistake": _truncate_text(_redact_secrets(mistake), 2400),
            "fix": _truncate_text(fix, 1800),
            "prevention": _truncate_text(prevention, 1800),
            "scope": final_scope,
            "tags": (["hook", "guard"] + final_tags)[:24],
        }
        # record_lesson uses current workspace by default; pass rootPath to keep it project-local if possible.
        call_mcp_tool(server_url, "record_lesson", args, timeout_sec=1.0)

        per_project[lesson_key] = True
        recorded[project_id] = per_project
        state["recordedLessons"] = recorded
        save_guard_state(state)
    except Exception:
        return


def _first_value(obj, keys):
    if not isinstance(obj, dict):
        return None
    for k in keys:
        v = obj.get(k)
        if v is None:
            continue
        if isinstance(v, str) and v.strip():
            return v.strip()
        if v:
            return v
    return None


def _extract_mcp_call(tool_info):
    server_name = _first_value(
        tool_info,
        [
            "mcp_server_name",
            "mcpServerName",
            "server_name",
            "serverName",
            "server",
            "mcp_server",
        ],
    )
    tool_name = _first_value(
        tool_info,
        [
            "mcp_tool_name",
            "mcpToolName",
            "tool_name",
            "toolName",
            "name",
        ],
    )
    args = (
        tool_info.get("mcp_tool_arguments")
        if isinstance(tool_info, dict)
        else None
    )
    if args is None and isinstance(tool_info, dict):
        args = tool_info.get("tool_arguments")
    if args is None and isinstance(tool_info, dict):
        args = tool_info.get("arguments")
    if isinstance(args, str):
        try:
            parsed = json.loads(args)
            if isinstance(parsed, dict):
                args = parsed
        except Exception:
            args = {}
    if not isinstance(args, dict):
        args = {}
    return server_name, tool_name, args


def _normalize_exit_code(raw):
    if raw is None:
        return None
    try:
        # Handles "0", 0, "1", 1, etc.
        return int(raw)
    except Exception:
        return None


def _extract_run_command_fields(tool_info):
    cmd = _first_value(tool_info, ["command_line", "commandLine", "command", "cmd"])
    cwd = _first_value(tool_info, ["cwd", "working_directory", "workingDirectory"])
    exit_code = _normalize_exit_code(
        _first_value(tool_info, ["exit_code", "exitCode", "return_code", "returnCode", "code"])
    )
    success = tool_info.get("success")
    if isinstance(success, str):
        success = success.strip().lower() in ("1", "true", "yes", "ok")
    if success is None and exit_code is not None:
        success = exit_code == 0
    stdout = _first_value(tool_info, ["stdout", "out"])
    stderr = _first_value(tool_info, ["stderr", "err", "error_output", "errorOutput"])
    return cmd, cwd, success, exit_code, stdout, stderr


def _extract_tool_error_text(tool_info):
    err = tool_info.get("error")
    if isinstance(err, str) and err.strip():
        return err.strip()
    if isinstance(err, dict):
        msg = err.get("message") or err.get("error") or err.get("details")
        if isinstance(msg, str) and msg.strip():
            return msg.strip()
        try:
            return json.dumps(err, ensure_ascii=False)[:1200]
        except Exception:
            return str(err)[:1200]
    for k in ["error_message", "errorMessage", "exception", "message", "stderr"]:
        v = tool_info.get(k)
        if isinstance(v, str) and v.strip():
            return v.strip()
    return ""


def record_command_failure_lesson(server_url, project, cmd, cwd, exit_code, stdout, stderr):
    cmd = str(cmd or "").strip()
    if not cmd:
        return
    sig = _sha256_hex_parts(["run_command", cmd, str(exit_code or ""), str(stderr or "")])[:12]
    lesson_key = f"run_command_fail:{sig}"
    title = f"Command failed: {cmd[:60]}".strip()
    mistake = (
        "A run_command failed.\n\n"
        f"Command:\n{cmd}\n\n"
        f"CWD:\n{cwd or '(unknown)'}\n\n"
        f"Exit code: {exit_code}\n\n"
        f"stderr (truncated):\n{_truncate_lines(_redact_secrets(stderr), 50, 3000) if stderr else '(empty)'}\n\n"
        f"stdout (truncated):\n{_truncate_lines(_redact_secrets(stdout), 20, 1400) if stdout else '(empty)'}\n"
    )
    fix = (
        "Read the stderr and fix the root cause, then rerun the command.\n"
        "If this is a dependency/build error, ensure dependencies are installed and versions match the official docs.\n"
        "If this is a lint/test failure, fix the reported files and rerun lint/tests."
    )
    prevention = (
        "Before running build/lint/test, verify prerequisites (deps installed, correct working directory, correct commands for the repo).\n"
        "When an error happens: record the exact failing command + error snippet into lessons, then follow a fix→rerun loop."
    )
    maybe_record_lesson(
        server_url,
        project,
        lesson_key,
        mistake,
        fix,
        prevention,
        title=title,
        tags=["run_command", "error"],
        scope="both",
    )


def record_mcp_tool_error_lesson(server_url, project, server_name, tool_name, tool_args, error_text):
    tool_name = str(tool_name or "").strip() or "unknown_tool"
    server_name = str(server_name or "").strip() or "unknown_server"
    err = str(error_text or "").strip()
    if not err:
        return
    sig = _sha256_hex_parts(["mcp_tool_error", server_name, tool_name, err])[:12]
    lesson_key = f"mcp_tool_error:{sig}"
    title = f"MCP tool error: {server_name}.{tool_name}"
    safe_args = ""
    try:
        safe_args = json.dumps(tool_args or {}, ensure_ascii=False)[:1200]
    except Exception:
        safe_args = str(tool_args or "")[:1200]
    mistake = (
        "An MCP tool call failed.\n\n"
        f"Server: {server_name}\n"
        f"Tool: {tool_name}\n\n"
        f"Args (truncated):\n{_redact_secrets(safe_args)}\n\n"
        f"Error (truncated):\n{_truncate_lines(_redact_secrets(err), 60, 3000)}\n"
    )
    fix = (
        "Read the error message and correct the MCP tool arguments (types/required fields/rootPath), then retry.\n"
        "If the tool is blocked by hooks, follow the hook instructions (e.g., update_plan/save_memory → wam_commit → retry)."
    )
    prevention = (
        "Before calling MCP tools that change state, include a rationale and validate arguments.\n"
        "After state changes, keep WAM clean (wam_status → wam_commit) before write_code/run_command."
    )
    maybe_record_lesson(
        server_url,
        project,
        lesson_key,
        mistake,
        fix,
        prevention,
        title=title,
        tags=["mcp", "tool", "error"],
        scope="both",
    )


def _check_prompt_preflight(server_url, project):
    """
    Enforce "think-first" on every new user prompt:
    Before any write_code/run_command, the agent must explicitly refresh:
    get_project_status, check_plan, memory_search, rag_search, wam_status.
    """
    try:
        if not isinstance(project, dict):
            return None
        project_id = str(project.get("projectId") or "").strip()
        if not project_id:
            return None

        state = load_guard_state()
        state, ps = _get_project_state(state, project_id)
        required_since = str(ps.get("lastUserPromptAt") or "").strip()
        if not required_since:
            return None

        stats = project.get("stats") or {}
        if not isinstance(stats, dict):
            stats = {}

        def _needs(stat_key):
            v = str(stats.get(stat_key) or "").strip()
            return (not v) or (v < required_since)

        missing = []
        if _needs("lastProjectStatusAt"):
            missing.append("get_project_status")
        if _needs("lastCheckPlanAt"):
            missing.append("check_plan")
        if _needs("lastMemorySearchAt"):
            missing.append("memory_search")
        if _needs("lastRagSearchAt"):
            missing.append("rag_search")
        if _needs("lastWamStatusAt"):
            missing.append("wam_status")

        if not missing:
            return None

        msg = (
            "Blocked: Preflight not completed for the latest user prompt.\n"
            "Required: run preflight(userPrompt=...) (recommended) OR run these tools, then continue:\n"
            "- get_project_status (read Overview/PRD/Plan/WAM/Walkthrough)\n"
            "- check_plan (review progress + next items)\n"
            "- memory_search (reuse lessons/decisions; include hook:last_* if blocked)\n"
            "- rag_search (locate exact file/snippet to edit; no guessing)\n"
            "- wam_status (confirm clean/dirty; if dirty run wam_commit)\n"
            f"Missing: {', '.join(missing)}\n"
            "Then: if requirements changed, update_plan(mode=merge) before implementation."
        )
        maybe_record_lesson(
            server_url,
            project,
            "preflight_missing_after_user_prompt",
            "Attempted to write/run immediately after a new user prompt without refreshing project state and plan context.",
            "Run the required preflight tools (get_project_status, check_plan, memory_search, rag_search, wam_status), then proceed. Commit WAM (wam_commit) if WAM is dirty.",
            "For every new user prompt: read current tracker + memory + plan, then plan/update_plan before implementation. Treat Plan as the source of truth and keep it updated.",
            title="Missing preflight after user prompt",
            tags=["preflight", "plan", "memory", "rag", "wam", "block"],
            scope="both",
        )
        return msg
    except Exception:
        return None


def _plan_is_complete(project):
    plan = project.get("plan") or {}
    items = plan.get("items") or []
    if not isinstance(items, list) or not items:
        return False, 0, 0
    total = 0
    done = 0
    for it in items:
        if not isinstance(it, dict):
            continue
        total += 1
        if it.get("status") == "done":
            done += 1
    return total > 0 and done == total, done, total


def _plan_has_done_code_review(project):
    plan = project.get("plan") or {}
    items = plan.get("items") or []
    if not isinstance(items, list):
        return False
    for it in items:
        if not isinstance(it, dict):
            continue
        if it.get("status") != "done":
            continue
        text = str(it.get("text") or "").strip().lower()
        if not text:
            continue
        for kw in CODE_REVIEW_KEYWORDS:
            if str(kw).lower() in text:
                return True
    return False


def _walkthrough_has_content(project):
    wt = project.get("walkthrough") or {}
    return bool(str(wt.get("content") or "").strip())


def _walkthrough_has_review_artifact(project):
    """
    Require a structured review section in Walkthrough.
    Minimal contract:
      - a review heading exists
      - within that section: security + performance + tests keywords are present
    """
    wt = project.get("walkthrough") or {}
    content = str(wt.get("content") or "")
    if not content.strip():
        return False
    lower = content.lower()
    markers = [
        "## review",
        "## final review",
        "## review artifact",
        "## code review",
        "## 审查",
        "## 复审",
        "## 代码审查",
        "## 安全复审",
    ]
    start = -1
    for m in markers:
        idx = lower.find(m.lower())
        if idx >= 0:
            start = idx
            break
    if start < 0:
        return False
    section = lower[start : start + 8000]
    sec_ok = any(
        k in section
        for k in [
            "security",
            "secret",
            "secrets",
            "permission",
            "permissions",
            "injection",
            "auth",
            "安全",
            "密钥",
            "权限",
            "注入",
        ]
    )
    perf_ok = any(
        k in section
        for k in [
            "performance",
            "perf",
            "leak",
            "memory leak",
            "slow",
            "性能",
            "泄漏",
            "内存",
        ]
    )
    test_ok = any(
        k in section
        for k in [
            "test",
            "tests",
            "unit",
            "integration",
            "lint",
            "build",
            "测试",
            "单元",
            "集成",
            "构建",
            "lint",
        ]
    )
    return bool(sec_ok and perf_ok and test_ok)

def find_tracker_path():
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        variant_root = os.path.dirname(os.path.dirname(script_dir))
        candidate = os.path.join(variant_root, TRACKER_FILE_NAME)
        # Prefer the variant root derived from the running hook location
        # (e.g. .../.codeium/windsurf-next/...), even if the tracker file
        # doesn't exist yet (first-run scenarios).
        if os.path.isdir(variant_root):
            return candidate
    except Exception:
        pass
    home = os.path.expanduser("~")
    # Fallback: try both variants; default to windsurf for backwards compatibility.
    windsurf_next = os.path.join(home, ".codeium", "windsurf-next", TRACKER_FILE_NAME)
    if os.path.exists(windsurf_next):
        return windsurf_next
    return os.path.join(home, ".codeium", "windsurf", TRACKER_FILE_NAME)


def find_memory_path():
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        variant_root = os.path.dirname(os.path.dirname(script_dir))
        candidate = os.path.join(variant_root, MEMORY_FILE_NAME)
        if os.path.isdir(variant_root):
            return candidate
    except Exception:
        pass
    home = os.path.expanduser("~")
    windsurf_next = os.path.join(home, ".codeium", "windsurf-next", MEMORY_FILE_NAME)
    if os.path.exists(windsurf_next):
        return windsurf_next
    return os.path.join(home, ".codeium", "windsurf", MEMORY_FILE_NAME)


def load_tracker():
    path = find_tracker_path()
    try:
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
        if not raw.strip():
            return None
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        return data
    except Exception:
        return None


def load_memory():
    path = find_memory_path()
    try:
        if not os.path.exists(path):
            return None
        with open(path, "r", encoding="utf-8") as f:
            raw = f.read()
        if not raw.strip():
            return None
        data = json.loads(raw)
        if not isinstance(data, dict):
            return None
        return data
    except Exception:
        return None


def select_project(tracker, file_path=None, cwd=None):
    if not tracker:
        return None
    projects = tracker.get("projects") or {}
    if not isinstance(projects, dict) or not projects:
        return None
    target = normalize_path(file_path or cwd)
    if target:
        best = None
        best_len = -1
        for root, project in projects.items():
            root_norm = normalize_path(root)
            if root_norm and target.startswith(root_norm) and len(root_norm) > best_len:
                best = project
                best_len = len(root_norm)
        if best:
            return best
        # If we had an explicit path hint but it didn't match any known project,
        # do NOT fall back to tracker.activeProject (it may be stale across workspaces).
        return None
    active = tracker.get("activeProject")
    if active and active in projects:
        return projects.get(active)
    return None


def _extract_workspace_root_hint(payload, tool_info):
    """
    Best-effort workspace root detection for robust per-project selection.

    Official docs: if hook config doesn't set `working_directory`, Windsurf runs hooks
    from the workspace root. For events like `pre_user_prompt`, the payload may not
    include `cwd`, so we fall back to the hook process working directory.
    """
    candidates = []
    if isinstance(tool_info, dict):
        for k in [
            "workspace_root",
            "workspaceRoot",
            "workspace_path",
            "workspacePath",
            "root_path",
            "rootPath",
            "cwd",
            "working_directory",
            "workingDirectory",
        ]:
            candidates.append(tool_info.get(k))
    if isinstance(payload, dict):
        for k in [
            "workspace_root",
            "workspaceRoot",
            "workspace_path",
            "workspacePath",
            "root_path",
            "rootPath",
            "cwd",
            "working_directory",
            "workingDirectory",
        ]:
            candidates.append(payload.get(k))
    try:
        candidates.append(os.getcwd())
    except Exception:
        pass
    for c in candidates:
        p = normalize_path(c)
        if p:
            return p
    return None


def _get_project_root_path(project):
    try:
        root = project.get("rootPath")
        root = str(root or "").strip()
        return root or None
    except Exception:
        return None


def _get_overview_content(project):
    try:
        ov = project.get("overview") or {}
        return str(ov.get("content") or "").strip()
    except Exception:
        return ""


def _project_has_memories(memory_data, project_root_path):
    if not memory_data or not project_root_path:
        return False
    projects = memory_data.get("projects") or {}
    if not isinstance(projects, dict):
        return False
    # Memory is keyed by workspace root path in the extension, so try exact match first,
    # then fall back to normalized matching for path separator/case differences.
    store = projects.get(project_root_path)
    if not store:
        root_norm = normalize_path(project_root_path)
        for key, value in projects.items():
            if normalize_path(key) == root_norm:
                store = value
                break
    store = store or {}
    memories = store.get("memories") or {}
    return isinstance(memories, dict) and len(memories) > 0


def _stable_json(obj):
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


def _sha256_hex(text):
    return hashlib.sha256(text.encode("utf-8", errors="replace")).hexdigest()


def _sha256_hex_parts(parts):
    h = hashlib.sha256()
    for part in parts:
        h.update(str("" if part is None else part).encode("utf-8", errors="replace"))
        h.update(b"\n")
    return h.hexdigest()


def _normalize_item_status(status):
    return status if status in ("doing", "done") else "todo"

def _latest_plan_updated_at(project):
    try:
        plan = project.get("plan") or {}
        items = plan.get("items") or []
        if not isinstance(items, list):
            return ""
        latest = ""
        for it in items:
            if not isinstance(it, dict):
                continue
            ts = str(it.get("updatedAt") or "").strip()
            if ts and ts > latest:
                latest = ts
        return latest
    except Exception:
        return ""


def _compute_project_wam_digest(project, memory_store):
    project = project or {}
    memory_store = memory_store or {}

    plan = project.get("plan") or {}
    plan_items = plan.get("items") or []
    if not isinstance(plan_items, list):
        plan_items = []
    plan_items_sorted = []
    for it in plan_items:
        if not isinstance(it, dict):
            continue
        text = str(it.get("text") or "").strip()
        if not text:
            continue
        plan_items_sorted.append(it)
    plan_items_sorted.sort(key=lambda it: str(it.get("text") or "").strip().lower())

    memories = memory_store.get("memories") or {}
    if not isinstance(memories, dict):
        memories = {}
    memory_keys = sorted(memories.keys(), key=lambda k: str(k))

    overview = project.get("overview") or {}
    prd = project.get("prd") or {}
    walkthrough = project.get("walkthrough") or {}
    stats = project.get("stats") or {}

    parts = []
    parts.append("wam-digest-v1")
    parts.append(project.get("projectId") or "")
    parts.append(project.get("rootPath") or "")
    parts.append(project.get("name") or "")

    parts.append("overview")
    parts.append(overview.get("updatedAt") or "")
    parts.append(overview.get("content") or "")

    parts.append("prd")
    parts.append(prd.get("status") or "")
    parts.append(prd.get("updatedAt") or "")
    parts.append(prd.get("approvedBy") or "")
    parts.append(prd.get("approvedAt") or "")
    parts.append(prd.get("reviewNote") or "")
    parts.append(prd.get("reviewedAt") or "")
    parts.append(prd.get("content") or "")

    parts.append("plan")
    parts.append(plan.get("summary") or "")
    for it in plan_items_sorted:
        parts.append("plan_item")
        parts.append(str(it.get("text") or "").strip())
        parts.append(_normalize_item_status(it.get("status")))
        parts.append(str(it.get("updatedAt") or ""))

    parts.append("walkthrough")
    parts.append(walkthrough.get("updatedAt") or "")
    parts.append(walkthrough.get("content") or "")

    parts.append("stats")
    parts.append(int(stats.get("prdUpdates") or 0))
    parts.append(int(stats.get("prdApprovals") or 0))
    parts.append(int(stats.get("overviewUpdates") or 0))
    parts.append(int(stats.get("planUpdates") or 0))
    parts.append(int(stats.get("walkthroughUpdates") or 0))
    parts.append(stats.get("updatedAt") or "")

    parts.append("memories")
    for key in memory_keys:
        entry = memories.get(key) or {}
        if not isinstance(entry, dict):
            continue
        parts.append("memory")
        parts.append(key)
        parts.append(entry.get("kind") or "")
        parts.append(entry.get("createdAt") or "")
        parts.append(entry.get("updatedAt") or "")
        parts.append(entry.get("content") or "")
        tags = entry.get("tags") or []
        links = entry.get("links") or []
        parts.append(",".join([str(t) for t in tags]) if isinstance(tags, list) else "")
        parts.append(",".join([str(l) for l in links]) if isinstance(links, list) else "")

    return _sha256_hex_parts(parts)


def _find_wam_head_path(project):
    project_id = str(project.get("projectId") or "").strip()
    if not project_id:
        return None
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        variant_root = os.path.dirname(os.path.dirname(script_dir))
        # ~/.codeium/<variant>/windsurf-auto-mcp/.wam/<projectId>/HEAD.json
        return os.path.join(variant_root, "windsurf-auto-mcp", ".wam", project_id, "HEAD.json")
    except Exception:
        return None


def _check_wam_clean(project, memory_data, server_url):
    head_path = _find_wam_head_path(project)
    if not head_path or not os.path.exists(head_path):
        msg = (
            "Blocked: WAM history is missing (no .wam/HEAD.json).\n"
            "Required: keep a git-like history for tracker+memory.\n"
            "Fix: call wam_status → wam_diff (optional) → wam_commit(), then retry."
        )
        maybe_record_lesson(
            server_url,
            project,
            "wam_missing_head",
            "WAM history is missing: .wam/HEAD.json not found.",
            "Initialize WAM history via wam_status → wam_commit(), then retry the action.",
            "Ensure every tracker/memory change is followed by an explicit wam_commit so WAM stays clean.",
            title="WAM missing HEAD.json",
            tags=["wam", "history", "block"],
            scope="both",
        )
        persist_hook_feedback(server_url, project, "pre_write_code", "block", msg)
        return msg
    try:
        with open(head_path, "r", encoding="utf-8") as f:
            head = json.load(f)
    except Exception:
        head = None
    if not isinstance(head, dict) or not head.get("head") or not head.get("digest"):
        msg = (
            "Blocked: WAM history is invalid (HEAD.json missing head/digest).\n"
            "Fix: call wam_commit() to initialize/repair history, then retry."
        )
        maybe_record_lesson(
            server_url,
            project,
            "wam_invalid_head",
            "WAM history is invalid: HEAD.json missing required fields (head/digest).",
            "Run wam_commit() once to initialize/repair WAM, then retry.",
            "When migrating/upgrading hooks/WAM, verify HEAD.json structure is intact; repair via wam_commit().",
            title="WAM invalid HEAD.json",
            tags=["wam", "history", "block"],
            scope="both",
        )
        persist_hook_feedback(server_url, project, "pre_write_code", "block", msg)
        return msg

    root_path = str(project.get("rootPath") or "").strip()
    project_id = str(project.get("projectId") or "").strip()
    memory_store = {}
    if memory_data and root_path:
        projects = memory_data.get("projects") or {}
        if isinstance(projects, dict):
            memory_store = projects.get(root_path) or {}
            if not memory_store:
                root_norm = normalize_path(root_path)
                for k, v in projects.items():
                    if normalize_path(k) == root_norm:
                        memory_store = v or {}
                        break

    digest = _compute_project_wam_digest(project, memory_store)
    if str(head.get("digest")) != digest:
        msg = (
            "Blocked: WAM history is out-of-date (dirty state).\n"
            "Required: before writing code, tracker+memory must be committed so history stays consistent.\n"
            "Fix: call wam_status → wam_diff (optional) → wam_commit(), then retry."
        )
        maybe_record_lesson(
            server_url,
            project,
            "wam_dirty_state",
            "WAM is dirty (HEAD digest != current tracker+memory digest).",
            "Run wam_status → (optional) wam_diff → wam_commit(), then retry write/run. This is required to keep history consistent.",
            "After any tracker/memory change (plan/prd/overview/walkthrough/memory/lesson), explicitly run wam_commit before write_code/run_command.",
            title="WAM dirty state blocks actions",
            tags=["wam", "history", "block"],
            scope="both",
        )
        persist_hook_feedback(server_url, project, "pre_write_code", "block", msg)
        return msg
    return None


def check_project_gates(project, memory_data=None, server_url=None):
    overview = _get_overview_content(project)
    if not overview:
        maybe_record_lesson(
            server_url,
            project,
            "missing_overview",
            "Architecture record (Overview) is missing, but code/run actions were attempted.",
            "Call get_project_status → generate_overview/update_overview to establish the architecture baseline before implementing.",
            "Always read target state first; keep an up-to-date Overview with folder map, key flows, commands, and conventions.",
            title="Missing Overview blocks implementation",
            tags=["overview", "architecture", "block"],
            scope="both",
        )
        return (
            "Blocked: Architecture record (Overview) is missing.\n"
            "Required flow: get_project_status → generate_overview/update_overview → initialize layered memory (save_memory: long/short/lesson) → update_plan → then implement.\n"
            "Think-first: do not guess; use rag_search to locate exact files before edits, and memory_search to reuse lessons."
        )

    project_root = _get_project_root_path(project)
    if project_root and not _project_has_memories(memory_data, project_root):
        maybe_record_lesson(
            server_url,
            project,
            "missing_project_memory",
            "Project memory is missing/uninitialized, but implementation was attempted.",
            "Initialize layered memories (long/short/lesson) from the Overview via save_memory, then proceed.",
            "Before planning/implementation, always run memory_search and ensure at least one project memory exists.",
            title="Project memory not initialized",
            tags=["memory", "block"],
            scope="both",
        )
        return (
            "Blocked: Project memory is not initialized.\n"
            "Create initial layered memories from the architecture record: long (stable facts), short (temporary notes), lesson (mistakes/retro). "
            "Use global memory for reusable lessons; use project memory for project-specific details.\n"
            "Think-first: do not trust prior knowledge; research when needed and record_lesson for mistakes."
        )

    prd = project.get("prd") or {}
    prd_content = str(prd.get("content") or "").strip()
    if prd_content and prd.get("status") != "approved":
        maybe_record_lesson(
            server_url,
            project,
            "prd_not_approved",
            "PRD exists (non-empty) but was not approved before implementation.",
            "Run the PRD approval flow (set_prd → user approval) before implementing Plan items.",
            "For complex work, enforce PRD approval before planning/implementation to avoid scope drift.",
            title="PRD must be approved",
            tags=["prd", "approval", "block"],
            scope="both",
        )
        return (
            "Blocked: PRD is not approved.\n"
            "Required flow: draft PRD → user approve → then Plan → then implement."
        )
    plan = project.get("plan") or {}
    plan_items = plan.get("items") or []
    if not isinstance(plan_items, list) or len(plan_items) == 0:
        maybe_record_lesson(
            server_url,
            project,
            "plan_checklist_missing",
            "Plan checklist (items) is missing but implementation was attempted.",
            "Create an executable Plan checklist via update_plan(items=...) before implementing. Prefer update_plan(mode=merge) so you do not overwrite existing tasks.",
            "Always use a Plan checklist (items) as the single source of truth. Do not implement with only a vague summary.",
            title="Missing Plan checklist blocks implementation",
            tags=["plan", "block"],
            scope="both",
        )
        return (
            "Blocked: Plan checklist is missing.\n"
            "Required: create Plan items (tasks + checklist) via update_plan before implementation."
        )

    # Ensure the Plan includes a release gate (verification + code review) before any implementation.
    if not _plan_has_keyword(plan_items, CODE_REVIEW_KEYWORDS, require_done=False):
        maybe_record_lesson(
            server_url,
            project,
            "plan_missing_code_review_item",
            "Plan is missing a code review item, but implementation was attempted.",
            "Add a Plan item like 'Final code review (security/performance/gaps)' or run ensure_release_gate to auto-add a release checklist, then proceed.",
            "Always plan a code review gate before implementation so shipping cannot skip security/performance/gap checks.",
            title="Plan must include a code review gate",
            tags=["plan", "code_review", "block"],
            scope="both",
        )
        return (
            "Blocked: Plan is missing a code review gate.\n"
            "Fix: run ensure_release_gate (recommended) or add a Plan item like 'Final code review (security/performance/gaps)'."
        )

    if not _plan_has_keyword(plan_items, VERIFY_KEYWORDS, require_done=False):
        maybe_record_lesson(
            server_url,
            project,
            "plan_missing_verification_item",
            "Plan is missing verification/testing items, but implementation was attempted.",
            "Add Plan items for build/test/lint/verification (or run ensure_release_gate to auto-add them) before implementing.",
            "Always include verification steps in the Plan so changes are validated and regressions are caught early.",
            title="Plan must include verification steps",
            tags=["plan", "verification", "block"],
            scope="both",
        )
        return (
            "Blocked: Plan is missing verification items (tests/build/lint).\n"
            "Fix: run ensure_release_gate (recommended) or add Plan items for build/test/lint and acceptance verification."
        )

    if not _plan_has_keyword(plan_items, DEPENDENCY_SECURITY_KEYWORDS, require_done=False):
        maybe_record_lesson(
            server_url,
            project,
            "plan_missing_dependency_security_scan_item",
            "Plan is missing dependency/security scanning items, but implementation was attempted.",
            "Add Plan items for dependency/security scan (npm audit / OSV / Dependabot or stack equivalent), or run ensure_release_gate to auto-add them, then proceed.",
            "Always include dependency/supply-chain security checks in the Plan so outdated/vulnerable packages are caught before shipping.",
            title="Plan must include dependency/security scan",
            tags=["plan", "dependencies", "security", "block"],
            scope="both",
        )
        return (
            "Blocked: Plan is missing dependency/security scan items.\n"
            "Fix: run ensure_release_gate (recommended) or add a Plan item like 'Dependency/security scan (npm audit + OSV/Dependabot)'."
        )

    # Enforce "Memory + RAG before edits": require memory_search + rag_search after the latest plan change.
    try:
        stats = project.get("stats") or {}
        last_plan = str(stats.get("lastPlanUpdateAt") or "").strip() or _latest_plan_updated_at(project)
        last_mem = str(stats.get("lastMemorySearchAt") or "").strip()
        last_rag = str(stats.get("lastRagSearchAt") or "").strip()
        if not last_mem:
            maybe_record_lesson(
                server_url,
                project,
                "memory_search_missing",
                "No memory_search was recorded before attempting to write/run.",
                "Run memory_search (project + global) with concrete queries (e.g., relevant file/feature/previous error) before implementing.",
                "Always reuse prior lessons/decisions via memory_search; avoid guessing.",
                title="Must run memory_search before implementing",
                tags=["memory_search", "block"],
                scope="both",
            )
            return (
                "Blocked: No memory_search recorded for this project yet.\n"
                "Required: before writing code, use memory_search to reuse prior lessons/decisions (no guessing), then proceed."
            )
        if last_plan and last_mem < last_plan:
            maybe_record_lesson(
                server_url,
                project,
                "memory_search_stale_after_plan",
                "Plan changed after the last memory_search, but implementation was attempted.",
                "Run memory_search again after Plan updates to refresh context for the new tasks, then proceed.",
                "After updating Plan, always refresh memory_search so you don't miss relevant lessons/decisions.",
                title="Refresh memory_search after Plan updates",
                tags=["memory_search", "plan", "block"],
                scope="both",
            )
            return (
                "Blocked: Plan changed after the last memory_search.\n"
                "Required: run memory_search again (with a concrete query) to refresh context for the latest Plan items, then proceed."
            )
        if not last_rag:
            maybe_record_lesson(
                server_url,
                project,
                "rag_search_missing",
                "No rag_search was recorded before attempting to write/run.",
                "Run rag_search with concrete queries to locate the exact file/snippet to edit, then implement.",
                "Always locate code via rag_search before edits to avoid blind changes.",
                title="Must run rag_search before implementing",
                tags=["rag_search", "block"],
                scope="both",
            )
            return (
                "Blocked: No rag_search recorded for this project yet.\n"
                "Required: before writing code, use rag_search to locate the exact file/snippet to edit (no guessing), then proceed."
            )
        if last_plan and last_rag < last_plan:
            maybe_record_lesson(
                server_url,
                project,
                "rag_search_stale_after_plan",
                "Plan changed after the last rag_search, but implementation was attempted.",
                "Run rag_search again after Plan updates so edits match the latest tasks, then proceed.",
                "After updating Plan, refresh rag_search so your context matches the current tasks.",
                title="Refresh rag_search after Plan updates",
                tags=["rag_search", "plan", "block"],
                scope="both",
            )
            return (
                "Blocked: Plan changed after the last rag_search.\n"
                "Required: run rag_search again (with a concrete query) to refresh context for the latest Plan items, then proceed."
            )
    except Exception:
        pass

    wam_gate = _check_wam_clean(project, memory_data, server_url)
    if wam_gate:
        return wam_gate
    return None


def should_enforce_guards(server_url):
    if os.environ.get("WINDSURF_AUTO_MCP_GUARD_ALWAYS") == "1":
        return True
    return bool(server_url)


def main():
    raw = read_stdin()
    try:
        payload = json.loads(raw)
    except json.JSONDecodeError as e:
        print(f"Windsurf hook: failed to parse JSON from stdin: {e}", file=sys.stderr)
        return 1

    append_log(os.environ.get("WINDSURF_HOOK_LOG", ""), payload)

    action = payload.get("agent_action_name")
    tool_info = payload.get("tool_info") or {}

    if action not in (
        "pre_user_prompt",
        "pre_run_command",
        "post_run_command",
        "pre_write_code",
        "post_write_code",
        "pre_mcp_tool_use",
        "post_mcp_tool_use",
        "post_cascade_response",
    ):
        return 0

    server_url = get_healthy_server_url()
    if not should_enforce_guards(server_url):
        return 0

    if action == "pre_user_prompt":
        tracker = load_tracker()
        cwd_hint = _extract_workspace_root_hint(payload, tool_info)
        project = select_project(tracker, cwd=cwd_hint)
        if project:
            try:
                project_id = str(project.get("projectId") or "").strip()
                if project_id:
                    state = load_guard_state()
                    state, ps = _get_project_state(state, project_id)
                    ps["lastUserPromptAt"] = _iso_now()
                    # Reset workflow state on new user prompt to enforce fresh preflight
                    state = reset_workflow_state(state, project_id)
                    save_guard_state(state)
            except Exception:
                pass
        return 0

    if action == "pre_run_command":
        command_line = tool_info.get("command_line")
        tracker = load_tracker()
        memory_data = load_memory()
        cwd_hint = _extract_workspace_root_hint(payload, tool_info)
        project = select_project(tracker, cwd=cwd_hint)
        if project:
            preflight = _check_prompt_preflight(server_url, project)
            if preflight:
                persist_hook_feedback(server_url, project, "pre_run_command", "block", preflight)
                print(preflight, file=sys.stderr)
                return 2
            # Enforce periodic Plan progress updates during implementation (to prevent drifting trackers).
            try:
                project_id = str(project.get("projectId") or "").strip()
                if project_id:
                    state = load_guard_state()
                    state, ps = _get_project_state(state, project_id)
                    stats = project.get("stats") or {}
                    plan_at = str(stats.get("lastPlanUpdateAt") or "").strip() or _latest_plan_updated_at(project)
                    seen_plan_at = str(ps.get("lastPlanUpdateAtSeen") or "").strip()
                    if plan_at and plan_at != seen_plan_at:
                        ps["lastPlanUpdateAtSeen"] = plan_at
                        ps["writesSincePlanUpdate"] = 0
                        save_guard_state(state)
                    writes_since = int(ps.get("writesSincePlanUpdate") or 0)
                    if writes_since >= MAX_WRITES_WITHOUT_PLAN_UPDATE:
                        msg = (
                            f"Blocked: Too many code writes without a Plan progress update ({writes_since}).\n"
                            "Required: update_plan (mark progress), then wam_commit(), then continue."
                        )
                        persist_hook_feedback(server_url, project, "pre_run_command", "block", msg)
                        print(msg, file=sys.stderr)
                        return 2
            except Exception:
                pass

            gate = check_project_gates(project, memory_data=memory_data, server_url=server_url)
            if gate:
                persist_hook_feedback(server_url, project, "pre_run_command", "block", gate)
                print(gate, file=sys.stderr)
                return 2
        if looks_dangerous_command(command_line):
            maybe_record_lesson(
                server_url,
                {"projectId": "global", "rootPath": "", "name": "global"},
                "dangerous-command-blocked",
                f"Attempted to run a dangerous command: {command_line}",
                "Do not run destructive commands. Use safe alternatives and ask for confirmation when necessary.",
                "Always review commands for destructive patterns (rm -rf, disk/registry ops) before running.",
            )
            msg = f"Blocked dangerous command: {command_line}"
            persist_hook_feedback(
                server_url,
                {"projectId": "global", "rootPath": "", "name": "global"},
                "pre_run_command",
                "block",
                msg,
            )
            print(msg, file=sys.stderr)
            return 2

    if action == "pre_write_code":
        file_path = tool_info.get("file_path")
        tracker = load_tracker()
        memory_data = load_memory()
        project = select_project(tracker, file_path=file_path)
        if looks_internal_wam_write_path(file_path):
            msg = (
                f"Blocked: Direct writes to WAM/tracker/memory files are not allowed: {file_path}\n"
                "Required: use MCP tools (update_plan/save_memory/etc) and then wam_commit() to change tracked state."
            )
            persist_hook_feedback(server_url, project, "pre_write_code", "block", msg)
            print(msg, file=sys.stderr)
            return 2
        if project:
            preflight = _check_prompt_preflight(server_url, project)
            if preflight:
                persist_hook_feedback(server_url, project, "pre_write_code", "block", preflight)
                print(preflight, file=sys.stderr)
                return 2
            # Enforce periodic Plan progress updates during implementation (to prevent drifting trackers).
            try:
                project_id = str(project.get("projectId") or "").strip()
                if project_id:
                    state = load_guard_state()
                    state, ps = _get_project_state(state, project_id)
                    stats = project.get("stats") or {}
                    plan_at = str(stats.get("lastPlanUpdateAt") or "").strip() or _latest_plan_updated_at(project)
                    seen_plan_at = str(ps.get("lastPlanUpdateAtSeen") or "").strip()
                    if plan_at and plan_at != seen_plan_at:
                        ps["lastPlanUpdateAtSeen"] = plan_at
                        ps["writesSincePlanUpdate"] = 0
                        save_guard_state(state)
                    writes_since = int(ps.get("writesSincePlanUpdate") or 0)
                    if writes_since >= MAX_WRITES_WITHOUT_PLAN_UPDATE:
                        msg = (
                            f"Blocked: Too many code writes without a Plan progress update ({writes_since}).\n"
                            "Required: update_plan (mark progress), then wam_commit(), then continue."
                        )
                        persist_hook_feedback(server_url, project, "pre_write_code", "block", msg)
                        print(msg, file=sys.stderr)
                        return 2
            except Exception:
                pass
            gate = check_project_gates(project, memory_data=memory_data, server_url=server_url)
            if gate:
                persist_hook_feedback(server_url, project, "pre_write_code", "block", gate)
                print(gate, file=sys.stderr)
                return 2
        if looks_sensitive_write_path(file_path):
            if project:
                maybe_record_lesson(
                    server_url,
                    project,
                    "sensitive-write-blocked",
                    f"Attempted to write to a sensitive path: {file_path}",
                    "Avoid writing to sensitive areas (.git/.ssh/.env/system paths). Use project-local paths or explicit user-approved config directories.",
                    "Before write_code, verify target paths and never touch credentials/secrets/system folders.",
                )
            msg = f"Blocked write to sensitive path: {file_path}"
            persist_hook_feedback(server_url, project, "pre_write_code", "block", msg)
            print(msg, file=sys.stderr)
            return 2

    if action == "post_write_code":
        file_path = tool_info.get("file_path")
        tracker = load_tracker()
        project = select_project(tracker, file_path=file_path)
        if project:
            try:
                project_id = str(project.get("projectId") or "").strip()
                if project_id:
                    state = load_guard_state()
                    state, ps = _get_project_state(state, project_id)
                    ps["lastCodeWriteAt"] = _iso_now()
                    ps["lastCodeWritePath"] = str(file_path or "")
                    ps["writesSincePlanUpdate"] = int(ps.get("writesSincePlanUpdate") or 0) + 1
                    save_guard_state(state)
            except Exception:
                pass
        return 0

    if action == "pre_mcp_tool_use":
        server_name, tool_name, tool_args = _extract_mcp_call(tool_info)
        # Only enforce for our own MCP server to avoid breaking other MCPs.
        if str(server_name or "").strip() not in ("windsurf_auto_mcp",):
            return 0

        tracker = load_tracker()
        memory_data = load_memory()
        root_hint = str(
            tool_args.get("rootPath")
            or tool_args.get("root_path")
            or tool_args.get("workspaceRoot")
            or tool_args.get("workspace_root")
            or ""
        ).strip()
        cwd_hint = root_hint or _extract_workspace_root_hint(payload, tool_info)
        project = select_project(tracker, cwd=cwd_hint)

        # Workflow state machine enforcement
        if project:
            try:
                project_id = str(project.get("projectId") or "").strip()
                if project_id:
                    state = load_guard_state()
                    # Check workflow requirement for this tool
                    requirement_error = check_workflow_requirement(state, project_id, tool_name)
                    if requirement_error:
                        persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", requirement_error)
                        print(requirement_error, file=sys.stderr)
                        return 2
                    # Advance workflow state based on tool called
                    state, new_state = advance_workflow_state(state, project_id, tool_name)
                    if new_state:
                        save_guard_state(state)
            except Exception:
                pass

        if tool_name in REQUIRE_RATIONALE_TOOLS:
            rationale = str(tool_args.get("rationale") or "").strip()
            if not rationale:
                msg = (
                    f"Blocked: Missing rationale for MCP tool: {tool_name}.\n"
                    "Required: include a short 'rationale' string in the MCP tool arguments so the agent thinks before acting."
                )
                maybe_record_lesson(
                    server_url,
                    project,
                    f"missing_rationale:{tool_name}",
                    f"Called MCP tool without rationale: {tool_name}",
                    "Add a short rationale in the MCP tool arguments (why this tool call is needed), then retry.",
                    "Require rationale for state-changing tools to force think-before-act and avoid blind tool use.",
                    title=f"Missing rationale blocks MCP tool: {tool_name}",
                    tags=["rationale", "mcp", "block"],
                    scope="both",
                )
                persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", msg)
                print(msg, file=sys.stderr)
                return 2

        if tool_name == "update_plan":
            mode = str(tool_args.get("mode") or "").strip().lower()
            if mode == "replace":
                msg = (
                    "Blocked: update_plan(mode=replace) is not allowed (high risk of losing tasks).\n"
                    "Required: use plan_change_request to explicitly choose merge vs replace with user approval."
                )
                maybe_record_lesson(
                    server_url,
                    project,
                    "update_plan_replace_blocked",
                    "Attempted to replace the entire Plan via update_plan(mode=replace), which can accidentally delete tasks/checklists.",
                    "Use plan_change_request to preview and explicitly approve merge vs replace, then proceed.",
                    "Default to update_plan(mode=merge). Only replace with explicit user approval via plan_change_request.",
                    title="Blocked: update_plan replace is unsafe",
                    tags=["plan", "update_plan", "replace", "block"],
                    scope="both",
                )
                persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", msg)
                print(msg, file=sys.stderr)
                return 2

        if tool_name == "ask_continue" and project:
            # Ensure all core gates are satisfied before allowing task completion.
            gate = check_project_gates(project, memory_data=memory_data, server_url=server_url)
            if gate:
                persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", gate)
                print(gate, file=sys.stderr)
                return 2

            complete, done, total = _plan_is_complete(project)
            if total > 0 and not complete:
                msg = (
                    f"Blocked: Plan is not complete ({done}/{total}).\n"
                    "Required: update_plan to mark items done, then run check_plan, then retry ask_continue."
                )
                maybe_record_lesson(
                    server_url,
                    project,
                    "ask_continue_plan_incomplete",
                    f"Attempted ask_continue while Plan is incomplete ({done}/{total}).",
                    "Update plan progress (update_plan), verify with check_plan, then call ask_continue again.",
                    "Always treat Plan as the source of truth; do not finalize until all required items are done.",
                    title="ask_continue blocked: Plan incomplete",
                    tags=["ask_continue", "plan", "block"],
                    scope="both",
                )
                persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", msg)
                print(msg, file=sys.stderr)
                return 2

            if not _plan_has_done_code_review(project):
                msg = (
                    "Blocked: Code review gate is missing/not done.\n"
                    "Required: add a Plan item like 'Final code review (security/performance/gaps)' and mark it done, then retry ask_continue."
                )
                maybe_record_lesson(
                    server_url,
                    project,
                    "ask_continue_code_review_missing",
                    "Attempted ask_continue without completing a final code review gate.",
                    "Add a code review Plan item (security/performance/gaps) and mark it done before final delivery.",
                    "Make code review the last mandatory step before shipping to avoid gaps, security issues, and regressions.",
                    title="ask_continue blocked: Code review gate missing",
                    tags=["ask_continue", "code_review", "block"],
                    scope="both",
                )
                persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", msg)
                print(msg, file=sys.stderr)
                return 2

            if not _walkthrough_has_content(project):
                msg = (
                    "Blocked: Walkthrough is empty.\n"
                    "Required: update_walkthrough with a short project log (what changed, verification, risks), then retry ask_continue."
                )
                maybe_record_lesson(
                    server_url,
                    project,
                    "ask_continue_walkthrough_empty",
                    "Attempted ask_continue with an empty Walkthrough.",
                    "Update walkthrough with what changed, verification steps, and risks, then retry ask_continue.",
                    "Keep Walkthrough updated during work; ensure it is non-empty before final delivery for auditability.",
                    title="ask_continue blocked: Walkthrough empty",
                    tags=["ask_continue", "walkthrough", "block"],
                    scope="both",
                )
                persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", msg)
                print(msg, file=sys.stderr)
                return 2

            # Formal review artifact: Walkthrough must contain a structured review section
            # and must be updated after the last code write.
            try:
                project_id = str(project.get("projectId") or "").strip()
                if project_id:
                    state = load_guard_state()
                    state, ps = _get_project_state(state, project_id)
                    last_write = str(ps.get("lastCodeWriteAt") or "").strip()
                    wt = project.get("walkthrough") or {}
                    wt_at = str(wt.get("updatedAt") or "").strip()
                    stats = project.get("stats") or {}
                    wt_stat = str(stats.get("lastWalkthroughUpdateAt") or "").strip()
                    wt_updated = wt_at if (wt_at and wt_at >= wt_stat) else wt_stat

                    if last_write and (not wt_updated or wt_updated < last_write):
                        msg = (
                            "Blocked: Walkthrough review artifact is out-of-date.\n"
                            f"Required: update_walkthrough AFTER the last code write ({last_write}) and include a Review section (security/perf/tests), then retry ask_continue."
                        )
                        maybe_record_lesson(
                            server_url,
                            project,
                            "ask_continue_review_out_of_date",
                            "Attempted ask_continue without updating Walkthrough after the most recent code write.",
                            "Update Walkthrough after the last code write and include a structured Review section covering security, performance, and tests.",
                            "Treat Walkthrough as an auditable artifact: update it after changes and after review. Block final delivery if it's stale.",
                            title="ask_continue blocked: Review artifact out-of-date",
                            tags=["ask_continue", "walkthrough", "review", "block"],
                            scope="both",
                        )
                        persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", msg)
                        print(msg, file=sys.stderr)
                        return 2

                    if last_write and not _walkthrough_has_review_artifact(project):
                        msg = (
                            "Blocked: Walkthrough missing structured Review section.\n"
                            "Required: add a '## Review' section covering Security + Performance + Tests (with concrete bullets), then update_walkthrough and retry ask_continue."
                        )
                        maybe_record_lesson(
                            server_url,
                            project,
                            "ask_continue_review_missing",
                            "Attempted ask_continue without a structured review artifact in Walkthrough.",
                            "Add a Review section in Walkthrough that explicitly covers security, performance, and tests/verification, then retry.",
                            "Make review artifacts mandatory: they prevent shipping gaps and force a final verification loop.",
                            title="ask_continue blocked: Review artifact missing",
                            tags=["ask_continue", "walkthrough", "review", "block"],
                            scope="both",
                        )
                        persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", msg)
                        print(msg, file=sys.stderr)
                        return 2
            except Exception:
                pass

    if action == "post_mcp_tool_use":
        server_name, tool_name, tool_args = _extract_mcp_call(tool_info)
        # Only record lessons for our own MCP server to avoid noise.
        if str(server_name or "").strip() not in ("windsurf_auto_mcp",):
            return 0
        tracker = load_tracker()
        cwd_hint = _extract_workspace_root_hint(payload, tool_info)
        project = select_project(tracker, cwd=cwd_hint)
        error_text = _extract_tool_error_text(tool_info)
        if error_text:
            persist_hook_feedback(
                server_url,
                project,
                "post_mcp_tool_use",
                "error",
                f"MCP tool failed: {server_name}.{tool_name}\n{_truncate_lines(error_text, 60, 2400)}",
            )
            record_mcp_tool_error_lesson(
                server_url,
                project,
                server_name,
                tool_name,
                tool_args,
                error_text,
            )
        return 0

    if action == "post_cascade_response":
        response = str(tool_info.get("response") or "")
        if "ask_continue" not in response:
            msg = (
                "Warning: Cascade response does not include ask_continue. "
                "If you use WindsurfAutoMcp, enforce the hard rule: end via ask_continue(reason)."
            )
            persist_hook_feedback(server_url, None, "post_cascade_response", "warn", msg)
            print(msg, file=sys.stderr)
            return 1
        # Soft audit: if the model is trying to end the task but the plan is not complete,
        # remind it to update progress and/or record lessons before final delivery.
        try:
            tracker = load_tracker()
            cwd_hint = _extract_workspace_root_hint(payload, tool_info)
            project = select_project(tracker, cwd=cwd_hint)
            if project:
                plan = project.get("plan") or {}
                items = plan.get("items") or []
                if isinstance(items, list) and items:
                    total = 0
                    done = 0
                    for it in items:
                        if not isinstance(it, dict):
                            continue
                        total += 1
                        if it.get("status") == "done":
                            done += 1
                    if total > 0 and done < total:
                        msg = (
                            f"Warning: Plan is not complete ({done}/{total}). "
                            "Update progress via update_plan, run verification, and record lessons if needed before final delivery."
                        )
                        persist_hook_feedback(server_url, project, "post_cascade_response", "warn", msg)
                        print(msg, file=sys.stderr)
                        return 1
                    if total > 0 and done == total:
                        walkthrough = project.get("walkthrough") or {}
                        wt_content = str(walkthrough.get("content") or "").strip()
                        if not wt_content:
                            msg = (
                                "Warning: Plan is complete but Walkthrough is empty. "
                                "Update walkthrough via update_walkthrough so the delivery is auditable."
                            )
                            persist_hook_feedback(server_url, project, "post_cascade_response", "warn", msg)
                            print(msg, file=sys.stderr)
                            return 1
        except Exception:
            pass

    if action == "post_run_command":
        cmd, cwd, success, exit_code, stdout, stderr = _extract_run_command_fields(tool_info)
        if success is False or (exit_code is not None and exit_code != 0):
            tracker = load_tracker()
            cwd_hint = cwd or _extract_workspace_root_hint(payload, tool_info)
            project = select_project(tracker, cwd=cwd_hint)
            persist_hook_feedback(
                server_url,
                project,
                "post_run_command",
                "error",
                f"Command failed (exit={exit_code}): {cmd}",
            )
            record_command_failure_lesson(server_url, project, cmd, cwd, exit_code, stdout, stderr)
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
