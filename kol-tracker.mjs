/**
 * 🦞 Gizmo KOL Wallet Tracker
 * Monitors top KOL wallets for new token buys via Helius enhanced API.
 * Detects convergence signals (2+ KOLs buying same token).
 * 
 * Usage: node kol-tracker.mjs [--auto] [--buy-sol 0.5]
 */

import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
const BASE_DIR = process.env.RAILWAY_SERVICE_NAME ? '/app' : '/tmp/gizmo-trade';
import bs58 from 'bs58';
import fs from 'fs';

// Load .env if HELIUS_API_KEY not in environment
if (!process.env.HELIUS_API_KEY) {
  try {
    const envFile = fs.readFileSync(BASE_DIR + '/.env', 'utf-8');
    for (const line of envFile.split('\n')) {
      const [k, ...v] = line.split('=');
      if (k && v.length) process.env[k.trim()] = v.join('=').trim();
    }
  } catch {}
}

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const STATE_FILE = BASE_DIR + '/kol-state.json';
const POSITIONS_FILE = BASE_DIR + '/kol-positions.json';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));
const connection = new Connection(RPC);

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
  { name: "Cupsey", address: "2fg5QD1eD7rzNNCsvnhmXFm5hqNgwTTG8p7kQ6f3rx6f", weight: 2 },
  { name: "mercy", address: "F5jWYuiDLTiaLYa54D88YbpXgEsA6NKHzWy4SN4bMYjt", weight: 1 },
  { name: "Silver", address: "67Nwfi9hgwqhxGoovT2JGLU67uxfomLwQAWncjXXzU6U", weight: 1 },
  { name: "Pain", address: "J6TDXvarvpBdPXTaTU8eJbtso1PUCYKGkVtMKUUY8iEa", weight: 1 },
];

const SIGNAL_WINDOW_MS = 10 * 60 * 1000; // 10 min window for convergence
const MIN_MCAP = 50_000; // $50K minimum — graduation plays are where the 10x lives

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8')); }
  catch { return { lastSig: {}, recentBuys: [] }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function loadPositions() {
  try { return JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf-8')); }
  catch { return []; }
}

function savePositions(positions) {
  fs.writeFileSync(POSITIONS_FILE, JSON.stringify(positions, null, 2));
}

async function getWalletTxs(address, limit = 5) {
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_KEY}&limit=${limit}`;
  const resp = await fetch(url);
  if (!resp.ok) return [];
  return resp.json();
}

function extractSwaps(txs, walletAddr) {
  const buys = [];
  for (const tx of txs) {
    if (tx.type !== 'SWAP' || tx.transactionError) continue;
    // Look for SOL→token swaps (buys)
    const tokenTransfers = tx.tokenTransfers || [];
    const nativeTransfers = tx.nativeTransfers || [];
    
    // Did this wallet send SOL?
    const solSent = nativeTransfers.filter(t => t.fromUserAccount === walletAddr).reduce((s, t) => s + t.amount, 0);
    // Did this wallet receive tokens?
    const tokensReceived = tokenTransfers.filter(t => t.toUserAccount === walletAddr && t.mint !== SOL_MINT);
    
    if (solSent > 0 && tokensReceived.length > 0) {
      for (const tr of tokensReceived) {
        buys.push({
          mint: tr.mint,
          amount: tr.tokenAmount,
          solSpent: solSent / LAMPORTS_PER_SOL,
          sig: tx.signature,
          timestamp: tx.timestamp * 1000,
          description: tx.description || ''
        });
      }
    }
  }
  return buys;
}

async function getTokenInfo(mint) {
  try {
    const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const data = await resp.json();
    if (data.pairs && data.pairs.length > 0) {
      const pair = data.pairs[0];
      return {
        name: pair.baseToken?.name || 'Unknown',
        symbol: pair.baseToken?.symbol || '???',
        mcap: pair.marketCap || pair.fdv || 0,
        price: parseFloat(pair.priceUsd) || 0,
        liquidity: pair.liquidity?.usd || 0
      };
    }
  } catch {}
  return null;
}

async function executeBuy(mint, solAmount) {
  const amount = Math.floor(solAmount * LAMPORTS_PER_SOL);
  console.log(`🔥 AUTO-BUY: ${solAmount} SOL → ${mint}`);
  
  const quoteResp = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${mint}&amount=${amount}&slippageBps=500`);
  const quote = await quoteResp.json();
  if (quote.error) { console.log('Quote error:', quote.error); return null; }
  
  console.log(`Output: ${quote.outAmount} tokens | Impact: ${quote.priceImpactPct || '0'}%`);

  const swapResp = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: { autoMultiplier: 3 }
    })
  });
  if (!swapResp.ok) { console.log('Swap failed'); return null; }
  const { swapTransaction } = await swapResp.json();

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([keypair]);

  const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  console.log(`TX: https://solscan.io/tx/${txid}`);

  const conf = await connection.confirmTransaction(txid, 'confirmed');
  if (conf.value.err) { console.log('❌ TX FAILED'); return null; }
  console.log('✅ CONFIRMED');
  return txid;
}

async function main() {
  const autoTrade = process.argv.includes('--auto');
  const buySolArg = process.argv.indexOf('--buy-sol');
  const buySol = buySolArg >= 0 ? parseFloat(process.argv[buySolArg + 1]) : 0.5;
  
  const state = loadState();
  const now = Date.now();
  
  // Clean old buys outside signal window
  state.recentBuys = (state.recentBuys || []).filter(b => now - b.timestamp < SIGNAL_WINDOW_MS);
  
  const newBuys = [];
  let scanned = 0;
  
  for (const wallet of WALLETS) {
    try {
      const txs = await getWalletTxs(wallet.address, 5);
      const buys = extractSwaps(txs, wallet.address);
      
      for (const buy of buys) {
        // Skip if we already saw this signature
        if (state.lastSig[wallet.address] && buy.sig === state.lastSig[wallet.address]) break;
        // Skip if older than signal window
        if (now - buy.timestamp > SIGNAL_WINDOW_MS) continue;
        
        newBuys.push({
          kol: wallet.name,
          kolWeight: wallet.weight,
          ...buy
        });
      }
      
      if (txs.length > 0) {
        state.lastSig[wallet.address] = txs[0].signature;
      }
      scanned++;
    } catch (e) {
      // Rate limit or error — skip this wallet
    }
    
    // Small delay to avoid rate limits
    await new Promise(r => setTimeout(r, 100));
  }
  
  // Add new buys to recent buys
  state.recentBuys = [...(state.recentBuys || []), ...newBuys];
  
  // Detect convergence: group recent buys by mint
  const byMint = {};
  for (const buy of state.recentBuys) {
    if (!byMint[buy.mint]) byMint[buy.mint] = [];
    byMint[buy.mint].push(buy);
  }
  
  const signals = [];
  const convergences = [];
  
  for (const [mint, buys] of Object.entries(byMint)) {
    const uniqueKols = [...new Set(buys.map(b => b.kol))];
    const totalWeight = buys.reduce((s, b) => s + (b.kolWeight || 1), 0);
    
    if (uniqueKols.length >= 2) {
      convergences.push({ mint, kols: uniqueKols, count: uniqueKols.length, weight: totalWeight, buys });
    } else if (uniqueKols.length === 1) {
      signals.push({ mint, kol: uniqueKols[0], weight: buys[0].kolWeight || 1, buys });
    }
  }
  
  // Output
  if (newBuys.length === 0 && convergences.length === 0 && signals.length === 0) {
    console.log(`NO_SIGNALS (scanned ${scanned}/${WALLETS.length} wallets)`);
    saveState(state);
    return;
  }
  
  if (newBuys.length > 0) {
    console.log(`\n--- NEW BUYS (${newBuys.length}) ---`);
    for (const b of newBuys) {
      console.log(`${b.kol}: bought ${b.mint.slice(0,8)}... for ${b.solSpent.toFixed(2)} SOL`);
    }
  }
  
  // Handle convergence signals
  for (const c of convergences) {
    const info = await getTokenInfo(c.mint);
    const name = info ? `${info.symbol} (${info.name})` : c.mint.slice(0, 12);
    const mcap = info?.mcap || 0;
    
    console.log(`\n🔥 CONVERGENCE: ${name} | MC: $${mcap.toLocaleString()} | KOLs: ${c.kols.join(', ')} (${c.count}) | weight: ${c.weight}`);
    
    if (mcap < MIN_MCAP && mcap > 0) {
      console.log(`   ⚠️ SKIP — MC below $1M minimum`);
      continue;
    }
    
    if (autoTrade) {
      const positions = loadPositions();
      const existing = positions.find(p => p.mint === c.mint && p.status === 'open');
      if (existing) {
        console.log(`   Already have position in ${name}`);
        continue;
      }
      
      const txid = await executeBuy(c.mint, buySol);
      if (txid) {
        positions.push({
          mint: c.mint,
          symbol: info?.symbol || '???',
          entryPrice: info?.price || 0,
          entryMcap: mcap,
          entrySol: buySol,
          entryTime: Date.now(),
          txid,
          kolSignal: c.kols,
          status: 'open',
          slPercent: 30,
          tpPercent: 100
        });
        savePositions(positions);
        console.log(`   ✅ Position opened`);
      }
    }
  }
  
  // Log single signals
  for (const s of signals) {
    console.log(`\nSIGNAL: ${s.mint.slice(0,12)}... | KOL: ${s.kol} (weight ${s.weight})`);
  }
  
  // Check existing positions for SL/TP
  const positions = loadPositions();
  const openPositions = positions.filter(p => p.status === 'open');
  if (openPositions.length > 0) {
    console.log(`\n--- POSITION CHECK (${openPositions.length} open) ---`);
    for (const pos of openPositions) {
      const info = await getTokenInfo(pos.mint);
      if (!info) continue;
      
      const pnlPct = pos.entryPrice > 0 ? ((info.price - pos.entryPrice) / pos.entryPrice) * 100 : 0;
      console.log(`${pos.symbol}: entry $${pos.entryPrice} → now $${info.price} (${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}%) MC: $${(info.mcap||0).toLocaleString()}`);
      
      if (pnlPct <= -pos.slPercent) {
        console.log(`   🚨 SL HIT — should sell`);
        // Auto-sell would go here
      }
      if (pnlPct >= pos.tpPercent) {
        console.log(`   💰 TP HIT — should take profits`);
      }
    }
  }
  
  saveState(state);
}

main().catch(e => console.error('Error:', e.message));
