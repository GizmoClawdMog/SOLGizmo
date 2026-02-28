/**
 * 🦞 Gizmo Scalper
 * Quick buy → ride pump → sell on green candle
 * 
 * Usage: 
 *   node scalper.mjs buy <CA> [sol_amount]     — scalp entry (default 0.3 SOL)
 *   node scalper.mjs monitor                    — watch open scalps, auto-exit
 *   node scalper.mjs status                     — show all open scalps
 */

import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
const BASE_DIR = process.env.RAILWAY_SERVICE_NAME ? '/app' : '/tmp/gizmo-trade';
import bs58 from 'bs58';
import fs from 'fs';
import { execSync } from 'child_process';

const HELIUS_KEY = process.env.HELIUS_API_KEY;
const RPC = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const SCALPS_FILE = BASE_DIR + '/scalps.json';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));
const connection = new Connection(RPC);

// Scalp config
const DEFAULT_SIZE = 0.3;        // SOL per scalp
const TAKE_PROFIT_PCT = 30;      // Sell at +30%
const STOP_LOSS_PCT = 15;        // Cut at -15%
const MAX_HOLD_MIN = 10;         // Force exit after 10 min
const TRAIL_TRIGGER_PCT = 20;    // Activate trailing stop at +20%
const TRAIL_PCT = 10;            // Trail by 10% from peak

function loadScalps() {
  try { return JSON.parse(fs.readFileSync(SCALPS_FILE, 'utf-8')); }
  catch { return []; }
}
function saveScalps(s) { fs.writeFileSync(SCALPS_FILE, JSON.stringify(s, null, 2)); }

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
  fs.appendFileSync(BASE_DIR + '/scalp-log.jsonl', JSON.stringify({ ts, msg }) + '\n');
}

async function getPrice(mint) {
  try {
    const resp = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`, { signal: AbortSignal.timeout(5000) });
    const data = await resp.json();
    if (data.pairs?.[0]) {
      const p = data.pairs[0];
      return {
        price: parseFloat(p.priceUsd) || 0,
        priceNative: parseFloat(p.priceNative) || 0,
        mcap: p.marketCap || p.fdv || 0,
        symbol: p.baseToken?.symbol || '???',
        name: p.baseToken?.name || '',
        volume5m: p.volume?.m5 || 0,
        priceChange5m: p.priceChange?.m5 || 0,
        liquidity: p.liquidity?.usd || 0,
      };
    }
  } catch {}
  return null;
}

async function getTokenBalance(mint) {
  try {
    const accounts = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { mint: new PublicKey(mint) });
    if (!accounts.value.length) return { amount: 0n, decimals: 0, uiAmount: 0 };
    const info = accounts.value[0].account.data.parsed.info;
    return {
      amount: BigInt(info.tokenAmount.amount),
      decimals: info.tokenAmount.decimals,
      uiAmount: info.tokenAmount.uiAmount
    };
  } catch { return { amount: 0n, decimals: 0, uiAmount: 0 }; }
}

async function jupSwap(inputMint, outputMint, amount) {
  const quoteResp = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=500`);
  const quote = await quoteResp.json();
  if (quote.error) throw new Error('Quote: ' + quote.error);

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
  if (!swapResp.ok) throw new Error('Swap failed: ' + await swapResp.text());
  const { swapTransaction } = await swapResp.json();

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([keypair]);

  const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  const conf = await connection.confirmTransaction(txid, 'confirmed');
  if (conf.value.err) throw new Error('TX failed on-chain');
  return { txid, quote };
}

async function buy(mint, solAmount) {
  const info = await getPrice(mint);
  if (!info) { log('❌ Cannot get price for ' + mint); return; }
  
  log(`🔫 SCALP BUY: ${info.symbol} | MC: $${info.mcap.toLocaleString()} | ${solAmount} SOL`);
  
  const lamports = Math.floor(solAmount * LAMPORTS_PER_SOL);
  const { txid, quote } = await jupSwap(SOL_MINT, mint, lamports);
  
  log(`✅ BOUGHT ${info.symbol} | TX: https://solscan.io/tx/${txid}`);
  
  const scalps = loadScalps();
  scalps.push({
    mint,
    symbol: info.symbol,
    entryPrice: info.price,
    entryMcap: info.mcap,
    entrySol: solAmount,
    entryTime: Date.now(),
    peakPrice: info.price,
    txid,
    status: 'open',
    tp: TAKE_PROFIT_PCT,
    sl: STOP_LOSS_PCT,
    maxHold: MAX_HOLD_MIN,
    trailActive: false,
    trailHigh: info.price,
  });
  saveScalps(scalps);
  return txid;
}

async function sellAll(mint) {
  const balance = await getTokenBalance(mint);
  if (balance.amount === 0n) { log('No balance for ' + mint); return null; }
  
  const { txid } = await jupSwap(mint, SOL_MINT, balance.amount.toString());
  log(`✅ SOLD | TX: https://solscan.io/tx/${txid}`);
  return txid;
}

async function monitor() {
  const scalps = loadScalps();
  const open = scalps.filter(s => s.status === 'open');
  
  if (open.length === 0) { log('No open scalps'); return; }
  
  for (const s of open) {
    const info = await getPrice(s.mint);
    if (!info) continue;
    
    const pnlPct = ((info.price - s.entryPrice) / s.entryPrice) * 100;
    const holdMin = (Date.now() - s.entryTime) / 60000;
    
    // Update peak
    if (info.price > (s.peakPrice || s.entryPrice)) {
      s.peakPrice = info.price;
      s.trailHigh = info.price;
    }
    
    // Trailing stop activation
    if (pnlPct >= TRAIL_TRIGGER_PCT && !s.trailActive) {
      s.trailActive = true;
      log(`📈 ${s.symbol} trailing stop ACTIVE at +${pnlPct.toFixed(1)}%`);
    }
    
    let shouldSell = false;
    let reason = '';
    
    // Check TP
    if (pnlPct >= s.tp) { shouldSell = true; reason = `TP HIT +${pnlPct.toFixed(1)}%`; }
    // Check SL
    else if (pnlPct <= -s.sl) { shouldSell = true; reason = `SL HIT ${pnlPct.toFixed(1)}%`; }
    // Check max hold time
    else if (holdMin >= s.maxHold) { shouldSell = true; reason = `MAX HOLD ${holdMin.toFixed(0)}min`; }
    // Trailing stop
    else if (s.trailActive) {
      const dropFromPeak = ((s.peakPrice - info.price) / s.peakPrice) * 100;
      if (dropFromPeak >= TRAIL_PCT) {
        shouldSell = true;
        reason = `TRAIL STOP (peak +${((s.peakPrice - s.entryPrice) / s.entryPrice * 100).toFixed(1)}%, dropped ${dropFromPeak.toFixed(1)}%)`;
      }
    }
    
    log(`${s.symbol}: ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}% | MC: $${info.mcap.toLocaleString()} | hold: ${holdMin.toFixed(0)}min${s.trailActive ? ' [TRAILING]' : ''}`);
    
    if (shouldSell) {
      log(`🔥 EXIT ${s.symbol}: ${reason}`);
      try {
        const txid = await sellAll(s.mint);
        s.status = 'closed';
        s.exitPrice = info.price;
        s.exitTime = Date.now();
        s.exitReason = reason;
        s.exitTx = txid;
        s.pnlPct = pnlPct;
        
        // Alert Gizmo on significant trades
        if (Math.abs(pnlPct) > 10) {
          const emoji = pnlPct > 0 ? '💰' : '🔴';
          try {
            execSync(`openclaw system event --text "${emoji} SCALP ${pnlPct > 0 ? 'WIN' : 'LOSS'}: ${s.symbol} ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}% | ${reason} | ${s.entrySol} SOL entry" --mode now`, { timeout: 10000 });
          } catch {}
        }
      } catch (e) {
        log(`❌ SELL FAILED ${s.symbol}: ${e.message}`);
      }
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
  
  saveScalps(scalps);
}

async function status() {
  const scalps = loadScalps();
  const open = scalps.filter(s => s.status === 'open');
  const closed = scalps.filter(s => s.status === 'closed');
  
  console.log(`\n=== SCALP STATUS ===`);
  console.log(`Open: ${open.length} | Closed: ${closed.length}`);
  
  if (open.length > 0) {
    console.log('\n--- OPEN ---');
    for (const s of open) {
      const info = await getPrice(s.mint);
      const pnlPct = info ? ((info.price - s.entryPrice) / s.entryPrice * 100) : 0;
      const holdMin = (Date.now() - s.entryTime) / 60000;
      console.log(`${s.symbol}: ${pnlPct > 0 ? '+' : ''}${pnlPct.toFixed(1)}% | ${s.entrySol} SOL | ${holdMin.toFixed(0)}min | MC: $${(info?.mcap||0).toLocaleString()}`);
    }
  }
  
  if (closed.length > 0) {
    console.log('\n--- CLOSED (recent) ---');
    const wins = closed.filter(s => (s.pnlPct || 0) > 0);
    const losses = closed.filter(s => (s.pnlPct || 0) <= 0);
    console.log(`W/L: ${wins.length}/${losses.length} (${closed.length > 0 ? (wins.length/closed.length*100).toFixed(0) : 0}% win rate)`);
    closed.slice(-5).forEach(s => {
      const pnl = s.pnlPct || 0;
      console.log(`  ${pnl > 0 ? '✅' : '❌'} ${s.symbol}: ${pnl > 0 ? '+' : ''}${pnl.toFixed(1)}% | ${s.exitReason || ''}`);
    });
  }
}

// CLI
const cmd = process.argv[2];
if (cmd === 'buy') {
  const mint = process.argv[3];
  const sol = parseFloat(process.argv[4]) || DEFAULT_SIZE;
  if (!mint) { console.log('Usage: node scalper.mjs buy <CA> [sol]'); process.exit(1); }
  await buy(mint, sol);
} else if (cmd === 'monitor') {
  await monitor();
} else if (cmd === 'status') {
  await status();
} else {
  console.log('Usage: node scalper.mjs <buy|monitor|status> [args]');
}
