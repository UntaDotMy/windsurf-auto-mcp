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

MAX_WRITES_WITHOUT_PLAN_UPDATE = 5

REQUIRE_RATIONALE_TOOLS = {
    # Tracking/PRD/Plan/Walkthrough
    "set_prd",
    "approve_prd",
    "update_overview",
    "generate_overview",
    "update_plan",
    "update_walkthrough",
    "generate_walkthrough",
    "ensure_release_gate",
    # Memory
    "save_memory",
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


def looks_sensitive_write_path(file_path):
    p = normalize_path(file_path)
    if not p:
        return False
    blocked = [
        "/.git/",
        "/.ssh/",
        "/id_rsa",
        "/id_ed25519",
        "/.env",
        "/.npmrc",
        "/credentials",
        "/secrets",
    ]
    if any(b in p for b in blocked):
        return True
    if p.startswith("c:/windows/"):
        return True
    if p.startswith("c:/program files/"):
        return True
    if p.startswith("c:/program files (x86)/"):
        return True
    return False


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
        key = "hook:last_block" if severity == "block" else "hook:last_warning"
        ts = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        value = f"[{ts}] {action}\n{msg}\n"
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


def maybe_record_lesson(server_url, project, lesson_key, mistake, fix, prevention):
    try:
        project_id = str(project.get("projectId") or "").strip()
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
        args = {
            "title": f"Hook guard: {lesson_key}",
            "mistake": mistake,
            "fix": fix,
            "prevention": prevention,
            "scope": "project",
            "tags": ["hook", "guard", "wam"],
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
    active = tracker.get("activeProject")
    if active and active in projects:
        return projects.get(active)
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
        persist_hook_feedback(server_url, project, "pre_write_code", "block", msg)
        return msg
    return None


def check_project_gates(project, memory_data=None, server_url=None):
    overview = _get_overview_content(project)
    if not overview:
        return (
            "Blocked: Architecture record (Overview) is missing.\n"
            "Required flow: get_project_status → generate_overview/update_overview → initialize layered memory (save_memory: long/short/lesson) → update_plan → then implement.\n"
            "Think-first: do not guess; use rag_search to locate exact files before edits, and memory_search to reuse lessons."
        )

    project_root = _get_project_root_path(project)
    if project_root and not _project_has_memories(memory_data, project_root):
        return (
            "Blocked: Project memory is not initialized.\n"
            "Create initial layered memories from the architecture record: long (stable facts), short (temporary notes), lesson (mistakes/retro). "
            "Use global memory for reusable lessons; use project memory for project-specific details.\n"
            "Think-first: do not trust prior knowledge; research when needed and record_lesson for mistakes."
        )

    prd = project.get("prd") or {}
    prd_content = str(prd.get("content") or "").strip()
    if prd_content and prd.get("status") != "approved":
        return (
            "Blocked: PRD is not approved.\n"
            "Required flow: draft PRD → user approve → then Plan → then implement."
        )
    plan = project.get("plan") or {}
    plan_items = plan.get("items") or []
    plan_summary = plan.get("summary") or ""
    if not plan_items and not str(plan_summary).strip():
        return "Blocked: Plan is missing. Create a Plan checklist (with breakdown) before implementation."

    # Enforce "Memory + RAG before edits": require memory_search + rag_search after the latest plan change.
    try:
        stats = project.get("stats") or {}
        last_plan = str(stats.get("lastPlanUpdateAt") or "").strip() or _latest_plan_updated_at(project)
        last_mem = str(stats.get("lastMemorySearchAt") or "").strip()
        last_rag = str(stats.get("lastRagSearchAt") or "").strip()
        if not last_mem:
            return (
                "Blocked: No memory_search recorded for this project yet.\n"
                "Required: before writing code, use memory_search to reuse prior lessons/decisions (no guessing), then proceed."
            )
        if last_plan and last_mem < last_plan:
            return (
                "Blocked: Plan changed after the last memory_search.\n"
                "Required: run memory_search again (with a concrete query) to refresh context for the latest Plan items, then proceed."
            )
        if not last_rag:
            return (
                "Blocked: No rag_search recorded for this project yet.\n"
                "Required: before writing code, use rag_search to locate the exact file/snippet to edit (no guessing), then proceed."
            )
        if last_plan and last_rag < last_plan:
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

    if action not in ("pre_run_command", "pre_write_code", "post_write_code", "pre_mcp_tool_use", "post_cascade_response"):
        return 0

    server_url = get_healthy_server_url()
    if not should_enforce_guards(server_url):
        return 0

    if action == "pre_run_command":
        command_line = tool_info.get("command_line")
        tracker = load_tracker()
        memory_data = load_memory()
        project = select_project(tracker, cwd=tool_info.get("cwd"))
        if project:
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

            # Always read the current plan before executing commands so the model stays in sync.
            try:
                root_path = str(project.get("rootPath") or "").strip()
                if root_path:
                    call_mcp_tool(server_url, "check_plan", {"rootPath": root_path}, timeout_sec=0.7)
                    call_mcp_tool(server_url, "wam_status", {"scope": "project", "rootPath": root_path}, timeout_sec=0.7)
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
            # Always read the current plan before writing code so the model stays in sync.
            try:
                root_path = str(project.get("rootPath") or "").strip()
                if root_path:
                    call_mcp_tool(server_url, "check_plan", {"rootPath": root_path}, timeout_sec=0.7)
                    call_mcp_tool(server_url, "wam_status", {"scope": "project", "rootPath": root_path}, timeout_sec=0.7)
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
        root_hint = str(tool_args.get("rootPath") or tool_args.get("root_path") or "").strip()
        project = select_project(tracker, cwd=(root_hint or tool_info.get("cwd")))

        if tool_name in REQUIRE_RATIONALE_TOOLS:
            rationale = str(tool_args.get("rationale") or "").strip()
            if not rationale:
                msg = (
                    f"Blocked: Missing rationale for MCP tool: {tool_name}.\n"
                    "Required: include a short 'rationale' string in the MCP tool arguments so the agent thinks before acting."
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
                persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", msg)
                print(msg, file=sys.stderr)
                return 2

            if not _plan_has_done_code_review(project):
                msg = (
                    "Blocked: Code review gate is missing/not done.\n"
                    "Required: add a Plan item like 'Final code review (security/performance/gaps)' and mark it done, then retry ask_continue."
                )
                persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", msg)
                print(msg, file=sys.stderr)
                return 2

            if not _walkthrough_has_content(project):
                msg = (
                    "Blocked: Walkthrough is empty.\n"
                    "Required: update_walkthrough with a short project log (what changed, verification, risks), then retry ask_continue."
                )
                persist_hook_feedback(server_url, project, "pre_mcp_tool_use", "block", msg)
                print(msg, file=sys.stderr)
                return 2

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
            project = select_project(tracker)
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

    return 0


if __name__ == "__main__":
    sys.exit(main())
