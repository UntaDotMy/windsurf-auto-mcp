param(
    [string]$LogFile = $env:WINDSURF_HOOK_LOG
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Log([object]$payload) {
    if ([string]::IsNullOrWhiteSpace($LogFile)) { return }
    $dir = Split-Path -Parent $LogFile
    if ($dir -and !(Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
    "`n$('=' * 80)`n$([DateTime]::UtcNow.ToString('o'))`n$($payload | ConvertTo-Json -Depth 20)`n" | Out-File -FilePath $LogFile -Append -Encoding utf8
}

function Try-ReadJson([string]$filePath) {
    try {
        if (!(Test-Path $filePath)) { return $null }
        $raw = Get-Content -Raw -Path $filePath -Encoding utf8
        if ([string]::IsNullOrWhiteSpace($raw)) { return $null }
        return ($raw | ConvertFrom-Json -ErrorAction Stop)
    } catch {
        return $null
    }
}

function Get-McpConfigPaths([string]$homeDir) {
    $paths = @()
    foreach ($base in @(".windsurf", ".codeium")) {
        foreach ($variant in @("windsurf", "windsurf-next")) {
            $paths += (Join-Path $homeDir (Join-Path $base (Join-Path $variant "mcp_config.json")))
        }
    }
    return $paths
}

function Test-Health([string]$url) {
    try {
        if ([string]::IsNullOrWhiteSpace($url)) { return $false }
        $u = [Uri]$url
        $health = "$($u.Scheme)://$($u.Host):$($u.Port)/health"
        $resp = Invoke-WebRequest -Uri $health -Method GET -UseBasicParsing -TimeoutSec 1
        if ($resp.StatusCode -ne 200) { return $false }
        $json = $resp.Content | ConvertFrom-Json -ErrorAction Stop
        return ($json.service -eq "windsurf_auto_mcp" -and $json.status -eq "ok")
    } catch {
        return $false
    }
}

function Should-EnforceGuards() {
    if ($env:WINDSURF_AUTO_MCP_GUARD_ALWAYS -eq "1") { return $true }

    $home = [Environment]::GetFolderPath("UserProfile")
    foreach ($p in (Get-McpConfigPaths $home)) {
        $cfg = Try-ReadJson $p
        if ($null -eq $cfg) { continue }
        $entry = $cfg.mcpServers.windsurf_auto_mcp
        if ($null -eq $entry) { continue }
        if ($entry.disabled -eq $true) { continue }
        $url = [string]$entry.url
        if ([string]::IsNullOrWhiteSpace($url)) { continue }
        if (Test-Health $url) { return $true }
    }
    return $false
}

function Looks-DangerousCommand([string]$commandLine) {
    $cmd = ($commandLine ?? "").ToLowerInvariant()
    $patterns = @(
        "\brm\s+-rf\b",
        "\brm\s+-r\b",
        "\brm\s+--recursive\b",
        "\bdd\s+if=",
        "\bmkfs(\.\w+)?\b",
        "\bformat\b",
        "\bdiskpart\b",
        "\bshutdown\b",
        "\breboot\b",
        "\bpoweroff\b",
        "\bdel\s+/s\b",
        "\brmdir\s+/s\b",
        "\breg\s+delete\b",
        "\bcurl\b.*\|\s*(sh|bash)\b",
        "\bwget\b.*\|\s*(sh|bash)\b",
        "\binvoke-webrequest\b.*\|\s*iex\b"
    )
    foreach ($p in $patterns) {
        if ($cmd -match $p) { return $true }
    }
    return $false
}

function Looks-SensitiveWritePath([string]$filePath) {
    $p = (($filePath ?? "").Trim() -replace "\\\\", "/").ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($p)) { return $false }

    $blocked = @(
        "/.git/",
        "/.ssh/",
        "/id_rsa",
        "/id_ed25519",
        "/.env",
        "/.npmrc",
        "/credentials",
        "/secrets"
    )
    foreach ($b in $blocked) {
        if ($p.Contains($b)) { return $true }
    }

    if ($p.StartsWith("c:/windows/")) { return $true }
    if ($p.StartsWith("c:/program files/")) { return $true }
    if ($p.StartsWith("c:/program files (x86)/")) { return $true }
    return $false
}

try {
    $raw = [Console]::In.ReadToEnd()
    $payload = $null
    try {
        $payload = $raw | ConvertFrom-Json -ErrorAction Stop
    } catch {
        Write-Error "Windsurf hook: failed to parse JSON from stdin: $($_.Exception.Message)"
        exit 1
    }

    Write-Log $payload

    if (!(Should-EnforceGuards)) {
        exit 0
    }

    $action = [string]$payload.agent_action_name
    $toolInfo = $payload.tool_info

    if ($action -eq "pre_run_command") {
        $cmd = [string]$toolInfo.command_line
        if (Looks-DangerousCommand $cmd) {
            Write-Error "Blocked dangerous command: $cmd"
            exit 2
        }
    }

    if ($action -eq "pre_write_code") {
        $fp = [string]$toolInfo.file_path
        if (Looks-SensitiveWritePath $fp) {
            Write-Error "Blocked write to sensitive path: $fp"
            exit 2
        }
    }

    if ($action -eq "post_cascade_response") {
        $resp = [string]$toolInfo.response
        if ($resp -notmatch "\bask_continue\b") {
            Write-Error "Warning: Cascade response does not include ask_continue. If you use WindsurfAutoMcp, enforce the hard rule: end via ask_continue(reason)."
            exit 1
        }
    }

    exit 0
} catch {
    Write-Error ($_.Exception.Message)
    exit 1
}

