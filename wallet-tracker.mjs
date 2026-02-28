#!/usr/bin/env node
/**
 * Gizmo Wallet Tracker — Track top trader wallets on Solana
 * Uses Solana RPC + DexScreener to follow smart money
 */

import fs from 'fs';

const RPC = 'https://api.mainnet-beta.solana.com';

// Top trader wallets to track (add more as we find them)
// These are publicly known wallets from leaderboards/twitter
const WALLETS = JSON.parse(fs.readFileSync(new URL('./tracked-wallets.json', import.meta.url), 'utf-8'));

async function rpc(method, params) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
  });
  return (await r.json()).result;
}

async function getRecentSignatures(wallet, limit = 10) {
  return rpc('getSignaturesForAddress', [wallet, { limit }]);
}

async function getTransaction(sig) {
  return rpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);
}

async function trackWallet(name, address) {
  console.log(`\n=== ${name} (${address.slice(0,8)}...) ===`);
  const sigs = await getRecentSignatures(address, 5);
  if (!sigs?.length) { console.log('  No recent transactions'); return; }
  
  for (const s of sigs) {
    const age = Math.floor((Date.now()/1000 - s.blockTime) / 60);
    const status = s.err ? '❌' : '✅';
    console.log(`  ${status} ${age}min ago | ${s.signature.slice(0,20)}...`);
  }
}

async function main() {
  console.log('🦞 Gizmo Wallet Tracker');
  console.log('Tracking ' + WALLETS.length + ' wallets\n');
  
  for (const w of WALLETS) {
    await trackWallet(w.name, w.address);
    await new Promise(r => setTimeout(r, 500));
  }
}

main().catch(console.error);
