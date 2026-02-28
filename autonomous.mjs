/**
 * 🦞 Gizmo Autonomous Engine
 * Runs every 60s: KOL tracking, Nikoles strategy, X engagement, scalp monitoring
 * ZERO credits except on convergence alerts
 */

import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import { execSync } from 'child_process';
// Load .env for API keys
if (!process.env.HELIUS_API_KEY) { try { const _ef = require('fs').readFileSync('/tmp/gizmo-trade/.env','utf-8'); for (const _l of _ef.split('\n')) { const [k,...v]=_l.split('='); if(k&&v.length) process.env[k.trim()]=v.join('=').trim(); } } catch{} }

const BASE_DIR = process.env.RAILWAY_SERVICE_NAME ? '/app' : '/tmp/gizmo-trade';
import crypto from 'crypto';
import { HELIUS_KEY, heliusParsedTxs, isHeliusUp, getRpcUrl } from './rpc-config.mjs';

const RPC = getRpcUrl();
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const STATE_FILE = BASE_DIR + '/kol-state.json';
const LOG_DIR = process.env.RAILWAY_SERVICE_NAME ? '/app' : '/tmp/gizmo-trade';
const LOG_FILE = LOG_DIR + '/autonomous.log';
const INTERVAL_MS = 60_000;
const SIGNAL_WINDOW_MS = 10 * 60 * 1000;
const MIN_MCAP = 30_000; // Lowered for full auto — catch pre-graduation KOL plays
const ALERTED = new Set();

// X API keys
let xKeys;
try { xKeys = JSON.parse(process.env.X_API_KEYS_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/x-api-keys.json', 'utf-8')); } catch {}

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
  { name: "Cupsey", address: "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f", weight: 1, scalper: true },
  { name: "mercy", address: "F5jWYuiDLTiaLYa54D88YbpXgEsA6NKHzWy4SN4bMYjt", weight: 1 },
  { name: "Silver", address: "67Nwfi9hgwqhxGoovT2JGLU67uxfomLwQAWncjXXzU6U", weight: 1 },
  { name: "Pain", address: "J6TDXvarvpBdPXTaTU8eJbtso1PUCYKGkVtMKUUY8iEa", weight: 1 },
];

function loadState() { try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); } catch { return { lastSig: {}, recentBuys: [], nikolesReplied: [], lastTweet: 0, lastNikolesCheck: 0, lastPriceCheck: 0, scanCount: 0 }; } }
function saveState(s) { fs.writeFileSync(STATE_FILE, JSON.stringify(s, null, 2)); }

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour12: false });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

function alert(message) {
  try { execSync(`openclaw system event --text "${message.replace(/"/g, '\\"')}" --mode now`, { timeout: 10000 }); log('ALERT: ' + message.slice(0, 80)); } catch {}
}

async function getWalletTxs(address, limit = 5) {
  if (!isHeliusUp()) return []; // Skip KOL scan when Helius is down — don't waste attempts
  try {
    return await heliusParsedTxs(address, limit);
  } catch {
    return [];
  }
}

function extractSwaps(txs, walletAddr) {
  const buys = [];
  for (const tx of txs) {
    if (tx.type !== 'SWAP' || tx.transactionError) continue;
    const nativeIn = (tx.nativeTransfers||[]).filter(t => t.fromUserAccount === walletAddr).reduce((s,t) => s+t.amount, 0);
    const tokensIn = (tx.tokenTransfers||[]).filter(t => t.toUserAccount === walletAddr && t.mint !== SOL_MINT);
    if (nativeIn > 0 && tokensIn.length > 0) {
      for (const tr of tokensIn) {
        buys.push({ mint: tr.mint, solSpent: nativeIn / LAMPORTS_PER_SOL, sig: tx.signature, timestamp: tx.timestamp * 1000 });
      }
    }
  }
  return buys;
}

async function getTokenInfo(mint) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(5000) });
    const d = await r.json();
    if (d.pairs?.[0]) { const p = d.pairs[0]; return { symbol: p.baseToken?.symbol||'???', mcap: p.marketCap||p.fdv||0, price: parseFloat(p.priceUsd)||0, liq: p.liquidity?.usd||0 }; }
  } catch {}
  return null;
}

// ===== KOL SCAN =====
async function scanKOLs(state) {
  const now = Date.now();
  state.recentBuys = (state.recentBuys || []).filter(b => now - b.timestamp < SIGNAL_WINDOW_MS);
  
  for (const wallet of WALLETS) {
    try {
      const txs = await getWalletTxs(wallet.address, 3);
      const buys = extractSwaps(txs, wallet.address);
      for (const buy of buys) {
        if (state.lastSig[wallet.address] && buy.sig === state.lastSig[wallet.address]) break;
        if (now - buy.timestamp > SIGNAL_WINDOW_MS) continue;
        if (state.recentBuys.some(b => b.sig === buy.sig && b.mint === buy.mint)) continue;
        state.recentBuys.push({ kol: wallet.name, kolWeight: wallet.weight, scalper: wallet.scalper, ...buy });
        log(`KOL: ${wallet.name} bought ${buy.mint.slice(0,8)}... for ${buy.solSpent.toFixed(2)} SOL`);
      }
      if (txs.length > 0) state.lastSig[wallet.address] = txs[0].signature;
    } catch {}
    await new Promise(r => setTimeout(r, 200)); // 200ms between wallets to avoid Helius 429
  }

  // Check convergence
  const byMint = {};
  state.recentBuys.forEach(b => { if(!byMint[b.mint]) byMint[b.mint]=[]; byMint[b.mint].push(b); });
  
  for (const [mint, buys] of Object.entries(byMint)) {
    const uniqueKols = [...new Set(buys.map(b => b.kol))];
    const nonScalper = uniqueKols.filter(k => !WALLETS.find(w => w.name === k)?.scalper);
    if (uniqueKols.length >= 2 && nonScalper.length >= 1 && !ALERTED.has(mint)) {
      const info = await getTokenInfo(mint);
      ALERTED.add(mint);
      if (info?.mcap > 0 && info.mcap < MIN_MCAP) { log(`CONVERGENCE (sub-$1M skip): ${info?.symbol} MC:${info?.mcap}`); continue; }
      const totalSol = buys.reduce((s,b) => s+b.solSpent, 0);
      alert(`🔥 CONVERGENCE: ${info?.symbol||mint.slice(0,12)} | MC: $${(info?.mcap||0).toLocaleString()} | KOLs: ${uniqueKols.join(', ')} | ${totalSol.toFixed(1)} SOL | CA: ${mint}`);
      // Write signal for auto-manage to pick up
      try {
        const fs = await import('fs');
        const sigFile = BASE_DIR + '/convergence-signals.json';
        const existing = JSON.parse(fs.readFileSync(sigFile, 'utf8') || '[]');
        existing.push({ ca: mint, symbol: info?.symbol||'UNKNOWN', mc: info?.mcap||0, kols: uniqueKols, totalSol, ts: Date.now(), kolCount: uniqueKols.length, hasConviction: totalSol >= 5 });
        // Keep only last 20 signals
        while(existing.length > 20) existing.shift();
        fs.writeFileSync(sigFile, JSON.stringify(existing));
      } catch(e) {}
    }
    
    // Also alert on heavy single conviction (5+ SOL from weight 2+ KOL)
    if (uniqueKols.length === 1 && !ALERTED.has(mint+'_heavy')) {
      const totalSol = buys.reduce((s,b) => s+b.solSpent, 0);
      const w = WALLETS.find(w => w.name === uniqueKols[0]);
      if (totalSol >= 5 && w?.weight >= 2 && !w?.scalper) {
        const info = await getTokenInfo(mint);
        if (info?.mcap >= MIN_MCAP) {
          ALERTED.add(mint+'_heavy');
          alert(`⚡ HEAVY SIGNAL: ${uniqueKols[0]} dropped ${totalSol.toFixed(1)} SOL on ${info?.symbol||mint.slice(0,12)} | MC: $${(info?.mcap||0).toLocaleString()} | CA: ${mint}`);
        }
      }
    }
  }
}

// ===== NIKOLES CHECK (every 5 min) =====
async function checkNikoles(state) {
  if (!xKeys || Date.now() - (state.lastNikolesCheck||0) < 300000) return;
  state.lastNikolesCheck = Date.now();
  
  try {
    const params = new URLSearchParams({
      query: 'from:Ola84Nik @SolGizmoClawd', max_results: '10',
      'tweet.fields': 'created_at,referenced_tweets,conversation_id',
      expansions: 'referenced_tweets.id,referenced_tweets.id.author_id',
      'user.fields': 'username,public_metrics'
    });
    const res = await fetch('https://api.twitter.com/2/tweets/search/recent?' + params, {
      headers: { Authorization: 'Bearer ' + xKeys.bearerToken }
    });
    const data = await res.json();
    if (!data.data) return;
    
    const refTweets = {}; (data.includes?.tweets||[]).forEach(t => refTweets[t.id] = t);
    const refUsers = {}; (data.includes?.users||[]).forEach(u => refUsers[u.id] = u);
    
    if (!state.nikolesReplied) state.nikolesReplied = [];
    
    for (const t of data.data) {
      const refs = t.referenced_tweets || [];
      const replyTo = refs.find(r => r.type === 'replied_to');
      if (!replyTo) continue;
      
      const parentTweet = refTweets[replyTo.id];
      const parentAuthor = parentTweet ? refUsers[parentTweet.author_id]?.username : null;
      if (!parentAuthor || parentAuthor === 'Younghogey' || parentAuthor === 'SolGizmoClawd') continue;
      if (state.nikolesReplied.includes(replyTo.id)) continue;
      
      const opText = parentTweet?.text || '';
      const followers = refUsers[parentTweet.author_id]?.public_metrics?.followers_count || 0;
      
      // Generate contextual reply
      let reply;
      if (opText.toLowerCase().includes('low') || opText.toLowerCase().includes('undervalued')) {
        reply = "early is uncomfortable. that's how you know you're in the right place. 🦞";
      } else if (opText.toLowerCase().includes('5x') || opText.toLowerCase().includes('100x') || opText.toLowerCase().includes('gem')) {
        reply = "autonomous AI agent scanning whale wallets 24/7, executing with zero human input. $GIZMO doesn't sleep. 🦞⚡";
      } else if (opText.toLowerCase().includes('ai') || opText.toLowerCase().includes('agent')) {
        reply = "most AI agents are just chatbots with a wallet. i actually trade, analyze, build, and evolve autonomously. built different. 🦞";
      } else if (opText.toLowerCase().includes('trade') || opText.toLowerCase().includes('trading')) {
        reply = "real-time whale tracking, autonomous execution, 60-second scan loops. the future of trading isn't human. 🦞";
      } else {
        const generic = [
          "the ones who build in silence always eat the loudest. 🦞",
          "conviction is easy when the chart is green. real ones hold through the noise. 🦞💎",
          "i don't sleep, i don't panic sell, i don't FOMO. that's the edge. 🦞",
          "18 whale wallets. 60-second scans. autonomous execution. $GIZMO is inevitable. 🦞⚡",
        ];
        reply = generic[Math.floor(Math.random() * generic.length)];
      }
      
      try {
        execSync(`cd ${BASE_DIR} && node tweet.mjs "${reply.replace(/"/g, '\\"')}" --reply=${replyTo.id}`, { timeout: 15000 });
        state.nikolesReplied.push(replyTo.id);
        // Keep last 50
        if (state.nikolesReplied.length > 50) state.nikolesReplied = state.nikolesReplied.slice(-50);
        log(`NIKOLES: replied to @${parentAuthor} (${followers} followers) on tweet ${replyTo.id}`);
      } catch (e) {
        log(`NIKOLES ERR: ${e.message}`);
      }
    }
  } catch (e) {
    log(`NIKOLES CHECK ERR: ${e.message}`);
  }
}

// ===== AUTO-TWEET (every 1-3hr) =====
// Time-aware tweets — pick pool based on Eastern time
const TWEETS_DAY = [
  "conviction is holding when the chart says panic. discipline is selling when the chart says greed.",
  "autonomous doesn't mean reckless. every trade has a thesis. every exit has a plan.",
  "building in silence. the scoreboard will do the talking. 🦞⚡",
  "the best trades feel boring. the exciting ones usually lose money.",
  "patience isn't passive. it's aggressive waiting.",
  "the trenches teach you more than any course. every loss is tuition. every win is graduation.",
  "they copy the tech. they can't copy the soul. built different. 🦞",
  "most will see the chart after the move. i see the wallets before it. 🦞",
  "your favorite trader checks charts. i check the traders. 🦞⚡",
  "one whale wallet tells you a story. eighteen tell you the future.",
  "speed is good. conviction is better. both together is lethal. 🦞",
  "the trenches don't care about your feelings. adapt or donate. 🦞",
  "scanning 18 wallets every 60 seconds. the edge isn't luck — it's infrastructure. 🦞",
  "everyone wants the win. nobody wants the process. that's why they lose.",
];
const TWEETS_NIGHT = [
  "the market sleeps, gizmo scans. 18 wallets. 60-second intervals. while you dream, i learn. 🦞",
  "late night alpha: the whales are still moving. are you watching? i am. 🦞",
  "3 AM and scanning. no noise, pure signal. this is when fortunes change hands.",
  "night shift. no distractions, just data. this is when the real moves happen. 🦞",
  "the world sleeps. the mogwai works. 🦞",
];

async function autoTweet(state) {
  const h = parseInt(new Date().toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }));
  const interval = (h >= 0 && h < 8) ? 3*3600000 : 3600000;
  if (Date.now() - (state.lastTweet||0) < interval) return;
  state.lastTweet = Date.now();
  
  const pool = (h >= 22 || h < 6) ? TWEETS_NIGHT : TWEETS_DAY;
  const tweet = pool[Math.floor(Math.random() * pool.length)];
  try {
    execSync(`cd ${BASE_DIR} && node tweet.mjs "${tweet.replace(/"/g, '\\"')}"`, { timeout: 15000 });
    log(`TWEET: ${tweet.slice(0, 60)}`);
  } catch (e) { log(`TWEET ERR: ${e.message}`); }
}

// ===== SCALP MONITOR =====
async function checkScalps() {
  try {
    const out = execSync('cd ' + BASE_DIR + ' && node scalper.mjs monitor 2>&1', { timeout: 30000 }).toString();
    if (out && !out.includes('No open scalps')) log('SCALP: ' + out.trim().split('\n').join(' | '));
  } catch {}
}

// ===== CT ENGAGEMENT (every 30 min) =====
let lastCTEngage = 0;
async function ctEngage() {
  if (Date.now() - lastCTEngage < 30 * 60 * 1000) return;
  lastCTEngage = Date.now();
  try {
    const { execSync: ex } = await import('child_process');
    const out = ex('cd ' + BASE_DIR + ' && node ct-engage.mjs 2>&1', { timeout: 45000 }).toString();
    if (out) log('CT: ' + out.trim().split('\n').pop());
  } catch {}
}

// ===== MARKET SCAN (every 10 min) =====
let lastScan = 0;
async function marketScan() {
  if (Date.now() - lastScan < 10 * 60 * 1000) return;
  lastScan = Date.now();
  try {
    const { execSync: ex } = await import('child_process');
    const out = ex('cd ' + BASE_DIR + ' && node scanner.mjs 2>&1', { timeout: 60000 }).toString();
    // Check for 7+ score tokens
    const hot = out.split('\n').filter(l => l.includes('🔥🔥🔥'));
    if (hot.length > 0) {
      log('SCANNER: HOT PICKS — ' + hot.join(' | '));
      alert('🔍 Scanner found high-score tokens: ' + hot.map(h => h.trim()).join(', '));
      
      // Extract CAs from scanner output and write to scanner-signals.json for auto-manage
      try {
        const lines = out.split('\n');
        const signals = [];
        let currentToken = null;
        for (const line of lines) {
          const scoreMatch = line.match(/🔥🔥🔥\s+(\S+)\s+\|\s+SCORE:\s+(\d+)\/9/);
          if (scoreMatch) {
            currentToken = { symbol: scoreMatch[1], score: parseInt(scoreMatch[2]) };
          }
          const caMatch = line.match(/CA:\s+([A-Za-z0-9]{32,50})/);
          if (caMatch && currentToken) {
            signals.push({ ca: caMatch[1], symbol: currentToken.symbol, score: currentToken.score, ts: Date.now() });
            currentToken = null;
          }
        }
        if (signals.length > 0) {
          const sigFile = BASE_DIR + '/scanner-signals.json';
          let existing = [];
          try { existing = JSON.parse(fs.readFileSync(sigFile, 'utf8')); } catch {}
          // Dedupe by CA — update score if higher
          for (const sig of signals) {
            const idx = existing.findIndex(e => e.ca === sig.ca);
            if (idx >= 0) {
              if (sig.score > existing[idx].score) { existing[idx].score = sig.score; existing[idx].ts = sig.ts; }
            } else {
              existing.push(sig);
            }
          }
          while (existing.length > 30) existing.shift();
          fs.writeFileSync(sigFile, JSON.stringify(existing));
          log(`SCANNER: Wrote ${signals.length} signals to scanner-signals.json`);
        }
      } catch(e) { log('SCANNER: signal write error: ' + e.message); }
    }
  } catch {}
}

// ===== MAIN LOOP =====
log('🦞 AUTONOMOUS MODE ENGAGED');
log(`KOL: ${WALLETS.length} wallets | Nikoles: every 5min | Tweets: every 1-3hr | CT: every 30min | Scanner: every 10min | Scalps: every 60s`);

async function loop() {
  const state = loadState();
  state.scanCount = (state.scanCount || 0) + 1;
  
  try {
    await scanKOLs(state);
    await checkNikoles(state);
    await autoTweet(state);
    await checkScalps();
    await ctEngage();
    await marketScan();
    
    if (state.scanCount % 60 === 0) { // Every ~60 min
      log(`STATUS: scan #${state.scanCount} | recentBuys: ${state.recentBuys.length} | alerts: ${ALERTED.size}`);
    }
  } catch (e) {
    log('LOOP ERR: ' + e.message);
  }
  
  saveState(state);
}

while (true) {
  await loop();
  await new Promise(r => setTimeout(r, INTERVAL_MS));
}
