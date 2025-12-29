#!/usr/bin/env python3

import json
import os
import sys
import time
from urllib.parse import urlparse
from urllib.request import Request, urlopen
from urllib.error import URLError, HTTPError

TRACKER_FILE_NAME = "windsurf-auto-mcp-tracker.json"


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
    base_dirs = [".windsurf", ".codeium"]
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


def check_prd_gate(project):
    prd = project.get("prd") or {}
    if prd.get("status") != "approved":
        return "Blocked: PRD is not approved. Create PRD → user approve → then Plan/TODO."
    plan_items = ((project.get("plan") or {}).get("items")) or []
    if not plan_items:
        return "Blocked: Plan is missing. Create Plan before implementation."
    todo_items = ((project.get("todos") or {}).get("items")) or []
    if not todo_items:
        return "Blocked: TODOs are missing. Create TODOs before implementation."
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
        project = select_project(tracker, file_path=file_path)
        if project:
            gate = check_prd_gate(project)
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

    return 0


if __name__ == "__main__":
    sys.exit(main())
