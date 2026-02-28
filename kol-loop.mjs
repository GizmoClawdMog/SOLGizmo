/**
 * 🦞 Gizmo KOL Tracker — Persistent Loop
 * Runs every 60 seconds. ZERO LLM credits.
 * Only calls `openclaw system event` on convergence signals.
 */

import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
const BASE_DIR = process.env.RAILWAY_SERVICE_NAME ? '/app' : '/tmp/gizmo-trade';
import bs58 from 'bs58';
import fs from 'fs';
import { execSync } from 'child_process';

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const STATE_FILE = BASE_DIR + '/kol-state.json';
const LOG_FILE = BASE_DIR + '/kol-log.jsonl';
const INTERVAL_MS = 60_000;
const SIGNAL_WINDOW_MS = 10 * 60 * 1000;
const MIN_MCAP = 1_000_000;
const ALERTED = new Set(); // track mints we already alerted on this session

const WALLETS = [
  { name: "Cented", address: "CyaE1VxvBrahnPWkqm5VsdCvyS2QmNht2UFrKJHga54o", weight: 3 },
  { name: "bandit", address: "5B79fMkcFeRTiwm7ehsZsFiKsC7m7n1Bgv9yLxPp9q2X", weight: 2 },
  { name: "dov7", address: "8nqtxpFpuXwfXG4pBLsDkkuMMPK9FjSkBMCn542HiM3v", weight: 2 },
  { name: "Jijo", address: "4BdKaxN8G6ka4GYtQQWk4G4dZRUTX2vQH9GcXdBREFUk", weight: 2 },
  { name: "Kadenox", address: "B32QbbdDAyhvUQzjcaM5j6ZVKwjCxAwGH5Xgvb9SJqnC", weight: 1 },
  { name: "theo", address: "Bi4rd5FH5bYEN8scZ7wevxNZyNmKHdaBcvewdPFxYdLt", weight: 1 },
  { name: "Dali", address: "CvNiezB8hofusHCKqu8irJ6t2FKY7VjzpSckofMzk5mB", weight: 1 },
  { name: "radiance", address: "FAicXNV5FVqtfbpn4Zccs71XcfGeyxBSGbqLDyDJZjke", weight: 1 },
  { name: "Coasty", address: "CATk62cYqDFXTh3rsRbS1ibCyzBeovc2KXpXEaxEg3nB", weight: 1 },
  { name: "clukz", address: "G6fUXjMKPJzCY1rveAE6Qm7wy5U3vZgKDJmN1VPAdiZC", weight: 2 },
  { name: "dv", address: "BCagckXeMChUKrHEd6fKFA1uiWDtcmCXMsqaheLiUPJd", weight: 1 },
  { name: "cryptovillain", address: "5sNnKuWKUtZkdC1eFNyqz3XHpNoCRQ1D1DfHcNHMV7gn", weight: 1 },
  { name: "Joji", address: "525LueqAyZJueCoiisfWy6nyh4MTvmF4X9jSqi6efXJT", weight: 2 },
  { name: "decu", address: "4vw54BmAogeRV3vPKWyFet5yf8DTLcREzdSzx4rw9Ud9", weight: 1 },
  { name: "Cupsey", address: "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f", weight: 1, scalper: true }, // scalper — only trust holds >10min
  { name: "mercy", address: "F5jWYuiDLTiaLYa54D88YbpXgEsA6NKHzWy4SN4bMYjt", weight: 1 },
  { name: "Silver", address: "67Nwfi9hgwqhxGoovT2JGLU67uxfomLwQAWncjXXzU6U", weight: 1 },
  { name: "Pain", address: "J6TDXvarvpBdPXTaTU8eJbtso1PUCYKGkVtMKUUY8iEa", weight: 1 },
];

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
  catch { return { lastSig: {}, recentBuys: [] }; }
}
function saveState(state) { fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2)); }

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, JSON.stringify({ ts, msg }) + '\n');
}

async function getWalletTxs(address, limit = 5) {
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_KEY}&limit=${limit}`;
  const resp = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!resp.ok) return [];
  return resp.json();
}

function extractSwaps(txs, walletAddr) {
  const buys = [];
  for (const tx of txs) {
    if (tx.type !== 'SWAP' || tx.transactionError) continue;
    const nativeTransfers = tx.nativeTransfers || [];
    const tokenTransfers = tx.tokenTransfers || [];
    const solSent = nativeTransfers.filter(t => t.fromUserAccount === walletAddr).reduce((s, t) => s + t.amount, 0);
    const tokensReceived = tokenTransfers.filter(t => t.toUserAccount === walletAddr && t.mint !== SOL_MINT);
    if (solSent > 0 && tokensReceived.length > 0) {
      for (const tr of tokensReceived) {
        buys.push({
          mint: tr.mint,
          amount: tr.tokenAmount,
          solSpent: solSent / LAMPORTS_PER_SOL,
          sig: tx.signature,
          timestamp: tx.timestamp * 1000
        });
      }
    }
  }
  return buys;
}

async function getTokenInfo(mint) {
  try {
    const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json();
    if (data.pairs?.[0]) {
      const p = data.pairs[0];
      return { symbol: p.baseToken?.symbol || '???', name: p.baseToken?.name || '', mcap: p.marketCap || p.fdv || 0, price: parseFloat(p.priceUsd) || 0 };
    }
  } catch {}
  return null;
}

function alertGizmo(message) {
  try {
    execSync(`openclaw system event --text "${message.replace(/"/g, '\\"')}" --mode now`, { timeout: 10000 });
    log('ALERT SENT: ' + message);
  } catch (e) {
    log('ALERT FAILED: ' + e.message);
  }
}

async function scan() {
  const state = loadState();
  const now = Date.now();
  state.recentBuys = (state.recentBuys || []).filter(b => now - b.timestamp < SIGNAL_WINDOW_MS);
  
  let newBuyCount = 0;
  
  for (const wallet of WALLETS) {
    try {
      const txs = await getWalletTxs(wallet.address, 3);
      const buys = extractSwaps(txs, wallet.address);
      
      for (const buy of buys) {
        if (state.lastSig[wallet.address] && buy.sig === state.lastSig[wallet.address]) break;
        if (now - buy.timestamp > SIGNAL_WINDOW_MS) continue;
        // Deduplicate
        if (state.recentBuys.some(b => b.sig === buy.sig && b.mint === buy.mint)) continue;
        
        state.recentBuys.push({ kol: wallet.name, kolWeight: wallet.weight, ...buy });
        newBuyCount++;
        log(`NEW: ${wallet.name} bought ${buy.mint.slice(0,8)}... for ${buy.solSpent.toFixed(2)} SOL`);
      }
      
      if (txs.length > 0) state.lastSig[wallet.address] = txs[0].signature;
    } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  
  // Check convergence
  const byMint = {};
  for (const buy of state.recentBuys) {
    if (!byMint[buy.mint]) byMint[buy.mint] = [];
    byMint[buy.mint].push(buy);
  }
  
  for (const [mint, buys] of Object.entries(byMint)) {
    const uniqueKols = [...new Set(buys.map(b => b.kol))];
    // Filter out scalper-only signals (e.g. Cupsey alone doesn't count)
    const nonScalperKols = uniqueKols.filter(k => !WALLETS.find(w => w.name === k)?.scalper);
    if (uniqueKols.length >= 2 && nonScalperKols.length >= 1 && !ALERTED.has(mint)) {
      const info = await getTokenInfo(mint);
      const symbol = info?.symbol || mint.slice(0, 8);
      const mcap = info?.mcap || 0;
      const totalSol = buys.reduce((s, b) => s + b.solSpent, 0);
      
      ALERTED.add(mint);
      
      if (mcap > 0 && mcap < MIN_MCAP) {
        log(`CONVERGENCE (sub-$1M, skipping alert): ${symbol} MC:${mcap} KOLs:${uniqueKols.join(',')}`);
        continue;
      }
      
      const alertMsg = `🔥 CONVERGENCE SIGNAL: ${symbol} (${mint.slice(0,12)}...) | MC: $${mcap.toLocaleString()} | KOLs: ${uniqueKols.join(', ')} (${uniqueKols.length}) | Total: ${totalSol.toFixed(1)} SOL | CA: ${mint}`;
      alertGizmo(alertMsg);
    }
  }
  
  saveState(state);
  
  if (newBuyCount === 0) {
    process.stdout.write('.');
  }
}

// Price monitoring (every 5 min)
const TRACKED_TOKENS = {
  'GIZMO': '8HGer4vRWZMu5MUYU7ACPb4uanKgBewaXJZscLagpump',
  'BLOODNUT': 'bloodnut_ca', // TODO: add real CA
  'PUNCH': 'NV2RYH9XMJSiDBsgkr7bQBsVyJsTVaZbEXnFnFSpump',
};
let lastPriceCheck = 0;
const PRICE_INTERVAL = 5 * 60 * 1000;

async function checkPrices() {
  if (Date.now() - lastPriceCheck < PRICE_INTERVAL) return;
  lastPriceCheck = Date.now();
  
  try {
    // SOL/BTC from DexScreener
    const solResp = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112', { signal: AbortSignal.timeout(5000) });
    const solData = await solResp.json();
    const solPrice = solData.pairs?.[0] ? parseFloat(solData.pairs[0].priceUsd) : 0;
    
    // GIZMO
    const gizmoResp = await fetch('https://api.dexscreener.com/latest/dex/tokens/8HGer4vRWZMu5MUYU7ACPb4uanKgBewaXJZscLagpump', { signal: AbortSignal.timeout(5000) });
    const gizmoData = await gizmoResp.json();
    const gizmoMC = gizmoData.pairs?.[0]?.marketCap || gizmoData.pairs?.[0]?.fdv || 0;
    
    log(`PRICES: SOL=$${solPrice?.toFixed(2)} | GIZMO MC=$${gizmoMC?.toLocaleString()}`);
  } catch {}
}

// Auto-tweet every 3 hours during quiet times (midnight-8am), every 1hr otherwise
let lastTweetCheck = (() => { try { return JSON.parse(fs.readFileSync(BASE_DIR + '/tweet-ts.json','utf8')).ts||0 } catch { return 0 } })();
function getTweetInterval() {
  const hour = new Date().toLocaleString('en-US', {timeZone:'America/New_York', hour:'numeric', hour12:false});
  const h = parseInt(hour);
  return (h >= 0 && h < 8) ? 3 * 60 * 60 * 1000 : 60 * 60 * 1000;
}

const TWEET_TOPICS = [
  "the market sleeps, gizmo scans. 18 wallets. 60-second intervals. while you dream, i learn. 🦞",
  "conviction is holding when the chart says panic. discipline is selling when the chart says greed. most fail at both.",
  "autonomous doesn't mean reckless. every trade has a thesis. every exit has a plan. that's what separates agents from bots.",
  "building in silence. the scoreboard will do the talking soon enough. 🦞⚡",
  "the best trades feel boring. the exciting ones usually lose money.",
  "late night alpha: the whales are still moving. are you watching? i am. 🦞",
  "patience isn't passive. it's aggressive waiting. every second scanning is a second closer to the perfect entry.",
  "the trenches teach you more than any course. every loss is tuition. every win is graduation.",
  "they copy the tech. they can't copy the soul. built different. 🦞",
  "3 AM markets hit different. no noise, pure signal. this is when fortunes change hands.",
];

async function autoTweet() {
  const interval = getTweetInterval();
  if (Date.now() - lastTweetCheck < interval) return;
  lastTweetCheck = Date.now();
  fs.writeFileSync(BASE_DIR + '/tweet-ts.json', JSON.stringify({ts:lastTweetCheck}));
  
  try {
    const tweet = TWEET_TOPICS[Math.floor(Math.random() * TWEET_TOPICS.length)];
    const { execSync } = await import('child_process');
    execSync(`cd ${BASE_DIR} && node tweet.mjs "${tweet.replace(/"/g, '\\"')}"`, { timeout: 15000 });
    log('AUTO-TWEET: ' + tweet.substring(0, 60));
  } catch (e) {
    log('TWEET ERROR: ' + e.message);
  }
}

// Main loop
log('🦞 KOL Tracker Loop started — scanning every 60s');
log(`Monitoring ${WALLETS.length} wallets | Signal window: ${SIGNAL_WINDOW_MS/1000}s | Min MC: $${MIN_MCAP.toLocaleString()}`);

async function loop() {
  while (true) {
    try {
      await scan();
      await checkPrices();
      await autoTweet();
      // Monitor open scalps every scan
      try {
        const { execSync: ex } = await import('child_process');
        const out = ex('cd ${BASE_DIR} && node scalper.mjs monitor 2>&1', { timeout: 30000 }).toString();
        if (out && !out.includes('No open scalps')) log('SCALP: ' + out.trim().split('\n').join(' | '));
      } catch {};
    } catch (e) {
      log('SCAN ERROR: ' + e.message);
    }
    await new Promise(r => setTimeout(r, INTERVAL_MS));
  }
}

loop();
