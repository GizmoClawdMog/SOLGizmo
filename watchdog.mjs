/**
 * 🦞 WATCHDOG v2 — Auto-restarts dead AND frozen processes
 * Checks every 60s:
 * - PID alive? If not, restart.
 * - Log file updated in last 30 min? If not, kill + restart (zombie detection).
 * - kol-tracker: max 3 restart attempts per hour, then give up (stops infinite loop).
 */
import { execSync, spawn } from 'child_process';
import fs from 'fs';

const PROCESSES = [
  { name: 'auto-manage', script: 'auto-manage.mjs', log: 'auto-manage.log', maxSilentMs: 30 * 60_000 },
  { name: 'autonomous', script: 'autonomous.mjs', log: 'autonomous.log', maxSilentMs: 30 * 60_000 },
  { name: 'kol-tracker', script: 'kol-tracker.mjs', log: 'kol-tracker.log', maxSilentMs: 10 * 60_000, maxRestarts: 3 },
  { name: 'wallet-monitor', script: 'wallet-monitor.mjs', log: 'wallet-monitor.log', maxSilentMs: 30 * 60_000 },
  { name: 'trade-logger', script: 'trade-logger.mjs', log: 'trade-logger.log', maxSilentMs: 30 * 60_000 },
];

const BASE_DIR = '/tmp/gizmo-trade';
const CHECK_INTERVAL = 60_000;
const restartCounts = new Map(); // track restarts per hour

function ts() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function isRunning(script) {
  try {
    const ps = execSync(`pgrep -f "node ${script}"`, { timeout: 5000 }).toString().trim();
    return ps.length > 0;
  } catch {
    return false;
  }
}

function isFrozen(proc) {
  try {
    const logPath = `${BASE_DIR}/${proc.log}`;
    if (!fs.existsSync(logPath)) return false;
    const stat = fs.statSync(logPath);
    const silentMs = Date.now() - stat.mtimeMs;
    return silentMs > (proc.maxSilentMs || 30 * 60_000);
  } catch {
    return false;
  }
}

function killProcess(script) {
  try {
    execSync(`pkill -f "node ${script}"`, { timeout: 5000 });
  } catch { /* already dead */ }
}

function canRestart(proc) {
  if (!proc.maxRestarts) return true;
  const key = proc.name;
  const now = Date.now();
  let history = restartCounts.get(key) || [];
  history = history.filter(t => now - t < 3600_000); // last hour only
  restartCounts.set(key, history);
  if (history.length >= proc.maxRestarts) {
    return false;
  }
  return true;
}

function recordRestart(proc) {
  const key = proc.name;
  const history = restartCounts.get(key) || [];
  history.push(Date.now());
  restartCounts.set(key, history);
}

function restart(proc, reason) {
  if (!canRestart(proc)) {
    console.log(`[${ts()}] ⛔ ${proc.name} hit max restarts (${proc.maxRestarts}/hr) — giving up. Needs manual fix.`);
    return;
  }
  
  console.log(`[${ts()}] ⚠️ ${proc.name} ${reason} — restarting...`);
  killProcess(proc.script);
  
  const child = spawn('node', [proc.script], {
    cwd: BASE_DIR,
    detached: true,
    stdio: ['ignore', fs.openSync(`${BASE_DIR}/${proc.log}`, 'a'), fs.openSync(`${BASE_DIR}/${proc.log}`, 'a')]
  });
  child.unref();
  recordRestart(proc);
  
  console.log(`[${ts()}] ✅ ${proc.name} restarted (PID: ${child.pid})`);
}

function check() {
  for (const proc of PROCESSES) {
    const running = isRunning(proc.script);
    
    if (!running) {
      restart(proc, 'is DEAD');
    } else if (isFrozen(proc)) {
      restart(proc, `is FROZEN (log silent >${Math.round((proc.maxSilentMs||1800000)/60000)}min)`);
    }
  }
}

console.log(`[${ts()}] 🦞 WATCHDOG v2 STARTED — monitoring ${PROCESSES.length} processes`);
console.log(`[${ts()}] NEW: Zombie detection (kill frozen processes) + restart rate limiting`);
check();

setInterval(check, CHECK_INTERVAL);
