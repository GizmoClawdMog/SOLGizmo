/**
 * 🦞 Gizmo Cloud Startup — Railway Entry Point
 * Runs auto-manage and autonomous as child processes
 * Auto-restarts if either crashes
 */

import { fork } from 'child_process';
import fs from 'fs';

const LOG = '/tmp/gizmo-startup.log';
function log(msg) {
  const line = `[${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}] ${msg}`;
  console.log(line);
  try { fs.appendFileSync(LOG, line + '\n'); } catch {}
}

// Write wallet and X keys from env vars to files (Railway encrypted env → local files)
const HOME = process.env.HOME || '/root';
const gizmoDir = HOME + '/.gizmo';
try { fs.mkdirSync(gizmoDir, { recursive: true }); } catch {}

if (process.env.SOLANA_WALLET_JSON) {
  fs.writeFileSync(gizmoDir + '/solana-wallet.json', process.env.SOLANA_WALLET_JSON);
  log('✅ Wallet key written from env');
}
if (process.env.X_API_KEYS_JSON) {
  fs.writeFileSync(gizmoDir + '/x-api-keys.json', process.env.X_API_KEYS_JSON);
  log('✅ X API keys written from env');
}

// Verify required env vars
const required = ['HELIUS_API_KEY', 'SOLANA_WALLET_JSON', 'X_API_KEYS_JSON'];
const missing = required.filter(k => !process.env[k]);
if (missing.length > 0) {
  log(`❌ MISSING ENV VARS: ${missing.join(', ')} — cannot start`);
  process.exit(1);
}

log('🦞 GIZMO CLOUD STARTING');
log(`Helius key: ${process.env.HELIUS_API_KEY ? '✅' : '❌'}`);
log(`Wallet: ${process.env.SOLANA_WALLET_JSON ? '✅' : '❌'}`);
log(`X keys: ${process.env.X_API_KEYS_JSON ? '✅' : '❌'}`);

function startProcess(name, script) {
  log(`Starting ${name}...`);
  const proc = fork(script, [], {
    env: { ...process.env },
    stdio: ['pipe', 'pipe', 'pipe', 'ipc']
  });
  
  proc.stdout?.on('data', d => {
    const lines = d.toString().trim().split('\n');
    lines.forEach(l => log(`[${name}] ${l}`));
  });
  proc.stderr?.on('data', d => {
    const lines = d.toString().trim().split('\n');
    lines.forEach(l => log(`[${name}:ERR] ${l}`));
  });
  
  proc.on('exit', (code) => {
    log(`⚠️ ${name} EXITED (code ${code}) — restarting in 5s...`);
    setTimeout(() => startProcess(name, script), 5000);
  });
  
  return proc;
}

startProcess('auto-manage', './auto-manage.mjs');
startProcess('autonomous', './autonomous.mjs');

log('🟢 All processes launched');

// Keep alive
setInterval(() => {
  log('💓 Heartbeat — processes alive');
}, 5 * 60 * 1000);
