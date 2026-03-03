#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

const RPC_DIR = path.join(process.env.HOME, '.solana-rpc');

console.log('🚨 STARTING SIMPLE LOCAL SOLANA RPC - ZERO API COSTS');

// Ensure directory exists
if (!fs.existsSync(RPC_DIR)) {
  fs.mkdirSync(RPC_DIR, { recursive: true });
}

// Start test validator (simpler than full validator)
const rpcProcess = spawn('solana-test-validator', [
  '--ledger', path.join(RPC_DIR, 'test-ledger'),
  '--rpc-port', '8899',
  '--faucet-port', '9900'
], {
  stdio: 'inherit',
  detached: false
});

console.log('🚀 Local test validator starting...');
console.log('📡 RPC endpoint will be: http://localhost:8899');
console.log('💸 ZERO rate limits, ZERO costs');

rpcProcess.on('error', (err) => {
  console.error('❌ Failed to start:', err.message);
});

process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down...');
  rpcProcess.kill();
  process.exit(0);
});