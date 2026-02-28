/**
 * 🦞 Gizmo's Smart Wallet Tracker
 * Tracks top trader wallets and sees what they're buying
 * Usage: node track-wallets.mjs [check|add <address>|list]
 */

import fs from 'fs';

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const WALLETS_FILE = process.env.HOME + '/.gizmo/tracked-wallets.json';

// Load tracked wallets
function loadWallets() {
  try { return JSON.parse(fs.readFileSync(WALLETS_FILE, 'utf-8')); }
  catch { return { wallets: [] }; }
}

function saveWallets(data) {
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(data, null, 2));
}

// Get recent swaps for a wallet
async function getRecentSwaps(address) {
  const resp = await fetch(`https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_KEY}&limit=20`);
  const txns = await resp.json();
  
  const swaps = txns.filter(tx => tx.type === 'SWAP').map(tx => {
    const desc = tx.description || '';
    const ts = new Date(tx.timestamp * 1000).toISOString().slice(0, 16);
    return { desc: desc.slice(0, 150), time: ts, sig: tx.signature?.slice(0, 20) };
  });
  
  return swaps;
}

// Get token balances for a wallet
async function getBalances(address) {
  const resp = await fetch(`https://api.helius.xyz/v0/addresses/${address}/balances?api-key=${HELIUS_KEY}`);
  const data = await resp.json();
  const sol = (data.nativeBalance || 0) / 1e9;
  const tokens = (data.tokens || []).filter(t => t.amount > 0).map(t => ({
    mint: t.mint,
    balance: t.amount / Math.pow(10, t.decimals || 6)
  }));
  return { sol, tokens };
}

const cmd = process.argv[2];

if (cmd === 'add') {
  const addr = process.argv[3];
  const label = process.argv[4] || 'unknown';
  if (!addr) { console.log('Usage: node track-wallets.mjs add <address> [label]'); process.exit(1); }
  const data = loadWallets();
  data.wallets.push({ address: addr, label, addedAt: new Date().toISOString() });
  saveWallets(data);
  console.log(`✅ Added ${label}: ${addr}`);
  
} else if (cmd === 'list') {
  const data = loadWallets();
  for (const w of data.wallets) {
    console.log(`${w.label}: ${w.address}`);
  }
  
} else if (cmd === 'check') {
  const data = loadWallets();
  for (const w of data.wallets) {
    console.log(`\n=== ${w.label} (${w.address.slice(0,12)}...) ===`);
    try {
      const swaps = await getRecentSwaps(w.address);
      if (swaps.length === 0) { console.log('  No recent swaps'); continue; }
      for (const s of swaps.slice(0, 5)) {
        console.log(`  ${s.time} | ${s.desc}`);
      }
    } catch (e) { console.log(`  Error: ${e.message}`); }
  }
  
} else {
  console.log('Usage: node track-wallets.mjs [check|add <address> [label]|list]');
}
