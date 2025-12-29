#!/usr/bin/env node
/* eslint-disable no-console */

const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const [k, v] = a.slice(2).split('=');
    args[k] = v ?? argv[i + 1];
  }
  return args;
}

function readStdin(maxBytes = 5 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    process.stdin.on('data', (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`stdin too large (>${maxBytes} bytes)`));
        process.stdin.pause();
        return;
      }
      chunks.push(chunk);
    });
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.on('error', reject);
  });
}

function normalizePathLike(p) {
  return String(p ?? '')
    .trim()
    .replace(/\\/g, '/')
    .toLowerCase();
}

function looksDangerousCommand(commandLine) {
  const cmd = String(commandLine ?? '').toLowerCase();
  const patterns = [
    /\brm\s+-rf\b/,
    /\brm\s+-r\b/,
    /\brm\s+--recursive\b/,
    /\bdd\s+if=/,
    /\bmkfs(\.\w+)?\b/,
    /\bformat\b/,
    /\bdiskpart\b/,
    /\bshutdown\b/,
    /\breboot\b/,
    /\bpoweroff\b/,
    /\bdel\s+\/s\b/,
    /\brmdir\s+\/s\b/,
    /\breg\s+delete\b/,
    /\bcurl\b.*\|\s*(sh|bash)\b/,
    /\bwget\b.*\|\s*(sh|bash)\b/,
    /\binvoke-webrequest\b.*\|\s*iex\b/,
  ];
  return patterns.some((re) => re.test(cmd));
}

function looksSensitiveWritePath(filePath) {
  const p = normalizePathLike(filePath);
  if (!p) return false;

  const blockedSubstrings = [
    '/.git/',
    '/.ssh/',
    '/id_rsa',
    '/id_ed25519',
    '/.env',
    '/.npmrc',
    '/credentials',
    '/secrets',
  ];
  if (blockedSubstrings.some((s) => p.includes(s))) return true;

  // Basic Windows system dirs
  if (p.startsWith('c:/windows/')) return true;
  if (p.startsWith('c:/program files/')) return true;
  if (p.startsWith('c:/program files (x86)/')) return true;

  return false;
}

function appendLog(logFile, payload) {
  if (!logFile) return;
  const text =
    `\n${'='.repeat(80)}\n` +
    `${new Date().toISOString()}\n` +
    `${JSON.stringify(payload, null, 2)}\n`;
  fs.mkdirSync(require('path').dirname(logFile), { recursive: true });
  fs.appendFileSync(logFile, text, 'utf8');
}

function getMcpConfigPaths(homeDir) {
  const baseDirs = ['.windsurf', '.codeium'];
  const variants = ['windsurf', 'windsurf-next'];
  const paths = [];

  for (const base of baseDirs) {
    for (const variant of variants) {
      paths.push(path.join(homeDir, base, variant, 'mcp_config.json'));
    }
  }

  return paths;
}

function tryReadJson(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function getAutoMcpServerEntry(config) {
  const entry = config?.mcpServers?.windsurf_auto_mcp;
  if (!entry || typeof entry !== 'object') return null;
  return entry;
}

async function checkHealth(serverUrl, timeoutMs = 350) {
  let url;
  try {
    url = new URL(String(serverUrl));
  } catch {
    return false;
  }

  url.pathname = '/health';
  url.search = '';
  const lib = url.protocol === 'https:' ? https : http;

  return await new Promise((resolve) => {
    const req = lib.request(
      {
        method: 'GET',
        hostname: url.hostname,
        port: url.port || (url.protocol === 'https:' ? 443 : 80),
        path: url.pathname,
        headers: { Accept: 'application/json' },
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode !== 200) return resolve(false);
          try {
            const json = JSON.parse(body);
            return resolve(json?.service === 'windsurf_auto_mcp' && json?.status === 'ok');
          } catch {
            return resolve(false);
          }
        });
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function shouldEnforceGuards() {
  if (process.env.WINDSURF_AUTO_MCP_GUARD_ALWAYS === '1') return true;

  const homeDir = os.homedir();
  const configPaths = getMcpConfigPaths(homeDir);

  for (const configPath of configPaths) {
    const config = tryReadJson(configPath);
    if (!config) continue;
    const entry = getAutoMcpServerEntry(config);
    if (!entry) continue;
    if (entry.disabled === true) continue;
    if (!entry.url) continue;

    const ok = await checkHealth(entry.url);
    if (ok) return true;
  }

  return false;
}

async function main() {
  const args = parseArgs(process.argv);
  const logFile = args.log || process.env.WINDSURF_HOOK_LOG || '';

  const raw = await readStdin();
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    console.error(`Windsurf hook: failed to parse JSON from stdin: ${e?.message ?? String(e)}`);
    process.exit(1);
  }

  appendLog(logFile, payload);

  const enforce = await shouldEnforceGuards();
  if (!enforce) {
    process.exit(0);
  }

  const action = payload?.agent_action_name;
  const toolInfo = payload?.tool_info ?? {};

  if (action === 'pre_run_command') {
    const commandLine = toolInfo.command_line;
    if (looksDangerousCommand(commandLine)) {
      console.error(`Blocked dangerous command: ${commandLine}`);
      process.exit(2);
    }
  }

  if (action === 'pre_write_code') {
    const filePath = toolInfo.file_path;
    if (looksSensitiveWritePath(filePath)) {
      console.error(`Blocked write to sensitive path: ${filePath}`);
      process.exit(2);
    }
  }

  if (action === 'post_cascade_response') {
    const response = String(toolInfo.response ?? '');
    if (!/\\bask_continue\\b/.test(response)) {
      console.error(
        'Warning: Cascade response does not include `ask_continue`. ' +
          'If you use WindsurfAutoMcp, enforce the hard rule: end via ask_continue(reason).'
      );
      process.exit(1);
    }
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e?.stack ?? String(e));
  process.exit(1);
});
