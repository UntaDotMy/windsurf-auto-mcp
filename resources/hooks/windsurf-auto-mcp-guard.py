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


def find_tracker_path():
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        variant_root = os.path.dirname(os.path.dirname(script_dir))
        candidate = os.path.join(variant_root, TRACKER_FILE_NAME)
        if os.path.exists(candidate):
            return candidate
    except Exception:
        pass
    home = os.path.expanduser("~")
    return os.path.join(home, ".codeium", "windsurf", TRACKER_FILE_NAME)


def find_memory_path():
    try:
        script_dir = os.path.dirname(os.path.abspath(__file__))
        variant_root = os.path.dirname(os.path.dirname(script_dir))
        candidate = os.path.join(variant_root, MEMORY_FILE_NAME)
        if os.path.exists(candidate):
            return candidate
    except Exception:
        pass
    home = os.path.expanduser("~")
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


def _check_wam_clean(project, memory_data):
    head_path = _find_wam_head_path(project)
    if not head_path or not os.path.exists(head_path):
        return (
            "Blocked: WAM history is missing (no .wam/HEAD.json).\n"
            "Required: keep a git-like history for tracker+memory.\n"
            "Fix: call wam_commit(message) (or any tracking/memory update tool that auto-commits), then retry."
        )
    try:
        with open(head_path, "r", encoding="utf-8") as f:
            head = json.load(f)
    except Exception:
        head = None
    if not isinstance(head, dict) or not head.get("head") or not head.get("digest"):
        return (
            "Blocked: WAM history is invalid (HEAD.json missing head/digest).\n"
            "Fix: call wam_commit(message) to initialize history, then retry."
        )

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
        return (
            "Blocked: WAM history is out-of-date (dirty state).\n"
            "Required: before writing code, tracker+memory must be committed so history stays consistent.\n"
            "Fix: call wam_commit(message) (or update_plan/set_prd/save_memory which auto-commit), then retry."
        )
    return None


def check_project_gates(project, memory_data=None):
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

    wam_gate = _check_wam_clean(project, memory_data)
    if wam_gate:
        return wam_gate
    return None


def should_enforce_guards():
    if os.environ.get("WINDSURF_AUTO_MCP_GUARD_ALWAYS") == "1":
        return True

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
            return True
    return False


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

    if action not in ("pre_run_command", "pre_write_code", "post_cascade_response"):
        return 0

    if not should_enforce_guards():
        return 0

    if action == "pre_run_command":
        command_line = tool_info.get("command_line")
        if looks_dangerous_command(command_line):
            print(f"Blocked dangerous command: {command_line}", file=sys.stderr)
            return 2

    if action == "pre_write_code":
        file_path = tool_info.get("file_path")
        tracker = load_tracker()
        memory_data = load_memory()
        project = select_project(tracker, file_path=file_path)
        if project:
            gate = check_project_gates(project, memory_data=memory_data)
            if gate:
                print(gate, file=sys.stderr)
                return 2
        if looks_sensitive_write_path(file_path):
            print(f"Blocked write to sensitive path: {file_path}", file=sys.stderr)
            return 2

    if action == "post_cascade_response":
        response = str(tool_info.get("response") or "")
        if "ask_continue" not in response:
            print(
                "Warning: Cascade response does not include ask_continue. "
                "If you use WindsurfAutoMcp, enforce the hard rule: end via ask_continue(reason).",
                file=sys.stderr,
            )
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
                        print(
                            f"Warning: Plan is not complete ({done}/{total}). "
                            "Update progress via update_plan, run verification, and record lessons if needed before final delivery.",
                            file=sys.stderr,
                        )
                        return 1
        except Exception:
            pass

    return 0


if __name__ == "__main__":
    sys.exit(main())
