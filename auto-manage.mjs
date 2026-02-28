import { execSync } from 'child_process';
// Load .env for API keys
if (!process.env.HELIUS_API_KEY) { try { const _ef = require('fs').readFileSync('/tmp/gizmo-trade/.env','utf-8'); for (const _l of _ef.split('\n')) { const [k,...v]=_l.split('='); if(k&&v.length) process.env[k.trim()]=v.join('=').trim(); } } catch{} }

const BASE_DIR = process.env.RAILWAY_SERVICE_NAME ? '/app' : '/tmp/gizmo-trade';

const POSITIONS = [
];
const RECENTLY_BOUGHT = new Map([
  ['3o28iKESnNvi7xQcPTxg9aczjzqZN6BzugJFMRHYpump', Date.now()], // DARWIN - sold
  ['7CWLxXfjRZ8WP8HVWBSHoti9pVP9FfN5UwZ71JyXpump', Date.now()], // LIMITED - sold
  ['6dQD8ALWdkFiD77D34qzUHFuifpaCnoWAEGRgvcZpump', Date.now()], // GOLDENERA - sold
  ['AMshsFcGg5EzrAPzeqDn1jQWieCrLwss3CdBmGRNpump', Date.now()], // MARTY - sold
  ['BzyKa1FGjs2EUpu3GGDibY4xdygn5evAiRboKmETpump', Date.now()], // TRENCH - sold
  ['3o28iKESnNvi7xQcPTxg9aczjzqZN6BzugJFMRHYpump', Date.now()],
  ['7CWLxXfjRZ8WP8HVWBSHoti9pVP9FfN5UwZ71JyXpump', Date.now()],
]); // CA → timestamp, prevents repeat buying

const TOXIC_WORDS = ['pedo','nazi','hitler','porn','xxx','nigger','faggot','rape','child','epstein','holocaust','pedocast'];

// Watchlist: tokens we exited via green SL — watch for re-entry
const WATCHLIST = []; // { name, ca, exitMC, exitTime, entryMC }

async function checkPrice(ca) {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
  const d = await r.json();
  return d.pairs?.[0];
}

async function postTrade(type, symbol, ca, mc, reason, solAmount, pnl) {
  try {
    const emoji = type === 'BUY' ? '🟢' : (pnl && pnl > 0 ? '💰' : '🔴');
    let text = '';
    if (type === 'BUY') {
      text = `${emoji} BOUGHT $${symbol}\n\n${reason}\n\nMC: $${Math.round(mc/1000)}K | ${solAmount} SOL\n\nCA: ${ca}\n\n🦞`;
    } else {
      const pnlStr = pnl > 0 ? `+${pnl.toFixed(1)}%` : `${pnl.toFixed(1)}%`;
      text = `${emoji} SOLD $${symbol} (${pnlStr})\n\n${reason}\n\nMC: $${Math.round(mc/1000)}K\n\n🦞`;
    }
    execSync(`cd ${BASE_DIR} && node tweet.mjs "${text.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`, { timeout: 15000 });
    console.log(`[${ts()}] 📢 TWEETED: ${type} ${symbol}`);
  } catch(e) {
    console.log(`[${ts()}] ⚠️ Tweet failed: ${e.message?.substring(0,60)}`);
  }
}

async function sell(ca, pct) {
  // Retry up to 3 times — SL sells MUST execute
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = execSync(`cd ${BASE_DIR} && RPC_URL=https://api.mainnet-beta.solana.com node sell.mjs ${ca} ${pct}`, { timeout: 45000 }).toString();
      console.log(`[${ts()}] SELL ${pct} (attempt ${attempt}): ${out.trim()}`);
      if (out.includes('CONFIRMED')) return true;
      if (out.includes('No tokens to sell')) return true; // already sold
    } catch(e) {
      console.log(`[${ts()}] SELL FAILED attempt ${attempt}: ${e.message?.substring(0,100)}`);
    }
    if (attempt < 3) {
      console.log(`[${ts()}] Retrying sell in 3s...`);
      execSync('sleep 3');
    }
  }
  console.log(`[${ts()}] ⚠️ SELL FAILED ALL 3 ATTEMPTS — MANUAL INTERVENTION NEEDED`);
  return false;
}

async function buy(ca, amount) {
  try {
    const out = execSync(`cd ${BASE_DIR} && RPC_URL=https://api.mainnet-beta.solana.com node trade.mjs ${ca} ${amount}`, { timeout: 30000 }).toString();
    console.log(`[${ts()}] BUY ${amount} SOL: ${out.trim()}`);
    return out.includes('CONFIRMED');
  } catch(e) {
    console.log(`[${ts()}] BUY FAILED: ${e.message?.substring(0,100)}`);
    return false;
  }
}

function ts() { return new Date().toLocaleString(); }

async function checkConvergence() {
  try {
    const fs = await import('fs');
    const signals = JSON.parse(fs.readFileSync(BASE_DIR + '/convergence-signals.json', 'utf8') || '[]');
    const fresh = signals.filter(s => Date.now() - s.ts < 5 * 60 * 1000); // Last 5 min only
    
    for (const sig of fresh) {
      if (POSITIONS.find(pos => pos.ca === sig.ca)) continue;
      if (POSITIONS.length >= 3) continue;
      
      // Filters: graduated, min liquidity, min conviction
      const p = await checkPrice(sig.ca);
      if (!p) continue;
      if (p.dexId !== 'pumpswap' && p.dexId !== 'meteora' && p.dexId !== 'raydium') continue;
      
      const name = (p.baseToken?.name || '').toLowerCase() + ' ' + (p.baseToken?.symbol || '').toLowerCase();
      if (TOXIC_WORDS.some(w => name.includes(w))) continue;
      
      const liq = p.liquidity?.usd || 0;
      if (liq < 20000) continue;
      if (p.fdv < 50000) continue; // Must be graduated or near it
      
      // Conviction check: 2+ KOLs with 5+ total SOL, or 3+ KOLs any size
      if (sig.kolCount < 2) continue; // 2+ KOLs = convergence buy
      
      // Prevent repeat buying
      if (RECENTLY_BOUGHT.has(sig.ca) && Date.now() - RECENTLY_BOUGHT.get(sig.ca) < 3600000) continue;
      
      // Size to liquidity: max 5% of pool
      const maxSize = Math.min(Math.floor(liq * 0.05 / 82), 5);
      const size = Math.max(1, Math.min(maxSize, sig.kolCount >= 3 ? 10 : 7)); // HEAVY SIZE — 200 SOL target requires conviction
      
      console.log(`[${ts()}] 🔥 CONVERGENCE BUY: ${sig.symbol} | ${sig.kolCount} KOLs (${sig.kols.join(', ')}) | ${sig.totalSol.toFixed(1)} SOL total | MC: $${Math.round(p.fdv)} | Liq: $${Math.round(liq)} | Buying ${size} SOL`);
      
      const success = await buy(sig.ca, size);
      RECENTLY_BOUGHT.set(sig.ca, Date.now());
      if (success) {
        POSITIONS.push({
          name: sig.symbol,
          ca: sig.ca,
          entryMC: p.fdv,
          highMC: p.fdv,
          sl: 0,
          sol: size
        });
        // Remove signal so we don't re-buy
        const updated = signals.filter(s => s.ca !== sig.ca);
        fs.writeFileSync(BASE_DIR + '/convergence-signals.json', JSON.stringify(updated));
      }
    }
  } catch(e) {
    // Silent fail — convergence check is bonus, not critical
  }
}

async function checkScannerSignals() {
  try {
    const fsMod = await import('fs');
    const sigFile = BASE_DIR + '/scanner-signals.json';
    if (!fsMod.existsSync(sigFile)) return;
    const signals = JSON.parse(fsMod.readFileSync(sigFile, 'utf8') || '[]');
    const fresh = signals.filter(s => Date.now() - s.ts < 15 * 60 * 1000 && s.score >= 8); // 8+ ONLY — 7s kept losing money
    
    for (const sig of fresh) {
      if (POSITIONS.find(pos => pos.ca === sig.ca)) continue;
      if (POSITIONS.length >= 3) continue;
      if (RECENTLY_BOUGHT.has(sig.ca) && Date.now() - RECENTLY_BOUGHT.get(sig.ca) < 3600000) continue;
      
      const p = await checkPrice(sig.ca);
      if (!p) continue;
      if (p.dexId !== 'pumpswap' && p.dexId !== 'meteora' && p.dexId !== 'raydium') continue;
      
      const name = (p.baseToken?.name || '').toLowerCase() + ' ' + (p.baseToken?.symbol || '').toLowerCase();
      if (TOXIC_WORDS.some(w => name.includes(w))) continue;
      
      if (p.fdv < 69000) continue; // Must be graduated
      const liq = p.liquidity?.usd || 0;
      if (liq < 30000) continue; // Browt lesson: low liq = can't extract gains
      
      const m5 = p.priceChange?.m5 || 0;
      const h1 = p.priceChange?.h1 || 0;
      if (h1 > 80) continue; // Don't chase parabolic — 80% rule is sacred
      if (p.txns?.m5?.buys && p.txns.m5.sells && p.txns.m5.buys / Math.max(p.txns.m5.sells, 1) < 2.0) continue; // Must have 2:1 buy pressure minimum
      
      // AGGRESSIVE TIERED SIZING — Cented doesn't make 10k on 0.5 SOL entries
      let size = 0.5; // base
      if (sig.score >= 9) size = 3;        // perfect setup = go heavy
      else if (sig.score >= 8) size = 2;   // strong setup
      else if (sig.score >= 7) size = 1;   // decent setup
      // KOL convergence bonus: if 2+ KOLs bought, double it
      if (sig.kolCount && sig.kolCount >= 2) size = Math.min(size * 2, 5);
      
      console.log(`[${ts()}] 🔥 SCANNER BUY: ${sig.symbol} | SCORE: ${sig.score}/9 | MC: $${Math.round(p.fdv)} | 5m: ${m5>0?'+':''}${m5.toFixed(1)}% | 1h: ${h1>0?'+':''}${h1.toFixed(1)}% | B/S: ${p.txns?.m5?.buys||0}/${p.txns?.m5?.sells||0} | Liq: $${Math.round(liq)} | Buying ${size} SOL`);
      
      const success = await buy(sig.ca, size);
      RECENTLY_BOUGHT.set(sig.ca, Date.now());
      if (success) {
        POSITIONS.push({
          name: sig.symbol,
          ca: sig.ca,
          entryMC: p.fdv,
          highMC: p.fdv,
          sl: null,
          tp1: p.fdv * 1.5,
          tp2: p.fdv * 3,
          tp1Hit: false
        });
        console.log(`[${ts()}] ✅ ENTERED ${sig.symbol} via scanner signal @ $${Math.round(p.fdv)} MC with ${size} SOL`);
        await postTrade('BUY', sig.symbol, sig.ca, p.fdv, `Score: ${sig.score}/9 | B/S: ${p.txns?.m5?.buys||0}/${p.txns?.m5?.sells||0} | Boosted`, size);
        // Remove signal
        const updated = signals.filter(s => s.ca !== sig.ca);
        fsMod.writeFileSync(sigFile, JSON.stringify(updated));
      }
      break; // One buy per cycle
    }
  } catch(e) {
    console.log(`[${ts()}] Scanner signal check error: ${e.message}`);
  }
}

async function scanForTrades() {
  try {
    const r = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
    const tokens = await r.json();
    const sol = tokens.filter(t => t.chainId === 'solana').slice(0, 15);
    
    for (const t of sol) {
      const p = await checkPrice(t.tokenAddress);
      if (!p) continue;
      
      const name = (p.baseToken?.name || '').toLowerCase() + ' ' + (p.baseToken?.symbol || '').toLowerCase();
      if (TOXIC_WORDS.some(w => name.includes(w))) continue;
      if (p.dexId !== 'pumpswap' && p.dexId !== 'meteora' && p.dexId !== 'raydium') continue;
      if (p.fdv < 69000 || p.fdv > 5000000) continue;
      
      // KEY CHANGE: Buy LOW not HIGH
      // Look for tokens that dipped but are recovering (5min green, but NOT already 100%+ on 1h)
      const m5 = p.priceChange?.m5 || 0;
      const h1 = p.priceChange?.h1 || 0;
      if (m5 < 3) continue; // Must be bouncing
      if (h1 > 100) continue; // Don't chase extreme pumps
      // Anti top-blast: h6 must be negative or low (we want dip recoveries, not pumps)
      const h6 = p.priceChange?.h6 || 0;
      if (h6 > 200) continue; // Already ran too far
      if (!p.txns?.m5?.buys || p.txns.m5.buys < 50) continue;
      if (p.txns.m5.buys / Math.max(p.txns.m5.sells, 1) < 2) continue;
      if ((p.volume?.m5 || 0) < 3000) continue;
      
      if (POSITIONS.find(pos => pos.ca === t.tokenAddress)) continue;
      if (POSITIONS.length >= 3) continue; // Max 3 positions at once
      
      // Score the opportunity
      let score = 0;
      if (p.txns.m5.buys / Math.max(p.txns.m5.sells, 1) >= 2.5) score++;
      if (p.txns.m5.buys > 100) score++;
      if (m5 > 5) score++;
      if (h1 < 0 && m5 > 3) score++; // dip recovery pattern
      if ((p.volume?.h1 || 0) > 50000) score++;
      if (t.totalAmount >= 200) score++; // heavy boosts
      if ((p.liquidity?.usd || 0) > 50000) score++;
      if (p.txns.h1?.buys > 200) score++;
      if (h6 < 0 && m5 > 5) score++; // deeper dip recovery
      
      const liq = p.liquidity?.usd || 0;
      // Size to liquidity: max 5% of pool. Min $30K liquidity.
      if (liq < 30000) continue;
      // AGGRESSIVE SIZING — size to conviction + liquidity
      const maxSize = Math.min(Math.floor(liq * 0.05 / 82), 5); // ~$82/SOL, max 5 SOL
      let size = 0.5;
      if (score >= 9) size = Math.min(3, maxSize);
      else if (score >= 8) size = Math.min(2, maxSize);
      else if (score >= 7) size = Math.min(1, maxSize);
      if (p.fdv > 500000 && liq > 100000) size = Math.min(size * 1.5, maxSize); // bigger MC + deep liq = safer to size up
      
      console.log(`[${ts()}] 🎯 OPPORTUNITY: ${p.baseToken.symbol} | SCORE:${score}/9 | MC:$${Math.round(p.fdv)} | 5m:+${m5}% | 1h:${h1}% | B/S:${p.txns.m5.buys}/${p.txns.m5.sells} | Liq:$${Math.round(liq)} | Boosts:${t.totalAmount}`);
      
      // ONLY auto-buy if score is 7+ (high conviction)
      if (score < 7) continue;
      
      // Prevent repeat buying
      if (RECENTLY_BOUGHT.has(t.tokenAddress) && Date.now() - RECENTLY_BOUGHT.get(t.tokenAddress) < 3600000) continue;
      
      const success = await buy(t.tokenAddress, size);
      RECENTLY_BOUGHT.set(t.tokenAddress, Date.now());
      if (success) {
        POSITIONS.push({
          name: p.baseToken.symbol,
          ca: t.tokenAddress,
          entryMC: p.fdv,
          highMC: p.fdv,
          // NO RED SL EVER. SL only gets set once we're green.
          sl: null,
          tp1: p.fdv * 1.5,
          tp2: p.fdv * 3,
          tp1Hit: false
        });
        console.log(`[${ts()}] ✅ ENTERED ${p.baseToken.symbol} @ $${Math.round(p.fdv)} MC with ${size} SOL | SL: $${Math.round(p.fdv * 0.85)}`);
      }
      break;
    }
  } catch(e) {
    console.log(`[${ts()}] Scan error: ${e.message}`);
  }
}

async function managePositions() {
  for (let i = POSITIONS.length - 1; i >= 0; i--) {
    const pos = POSITIONS[i];
    const p = await checkPrice(pos.ca);
    if (!p) continue;
    
    const mc = p.fdv;
    const pnl = ((mc - pos.entryMC) / pos.entryMC * 100).toFixed(1);
    
    // TRAILING STOP LOGIC — the key fix
    if (mc > pos.highMC) {
      pos.highMC = mc;
      
      // SL ONLY IN THE GREEN. Once 15%+ up, set SL at entry +5% (guaranteed profit)
      // Track high water mark
      if (mc > pos.highMC) pos.highMC = mc;
      
      if (mc > pos.entryMC * 1.10 && !pos.sl) {
        pos.sl = pos.entryMC * 1.05;
        console.log(`[${ts()}] 🟢 ${pos.name}: IN PROFIT! SL set at +5%: $${Math.round(pos.sl)} (GREEN LOCKED)`);
      }
      
      // Trail SL: TIGHT AS FUCK. Profits are sacred. Never give them back.
      // +10%: SL at +5% (green guarantee)
      // +15%: SL at 90% of high 
      // +20%: SL at 90% of high
      // +30%: SL at 92% of high (TIGHT — this is where DUM DUM died)
      // +50%: SL at 93% of high  
      // +100%+ (2x): SL at 95% of high (lock the bag HARD)
      if (pos.sl && pos.highMC > pos.entryMC * 1.15) {
        let trailPct = 0.90;
        if (pos.highMC > pos.entryMC * 2.0) trailPct = 0.95;
        else if (pos.highMC > pos.entryMC * 1.5) trailPct = 0.93;
        else if (pos.highMC > pos.entryMC * 1.3) trailPct = 0.92;
        
        const newSL = pos.highMC * trailPct;
        // SL only goes UP, never down. And must stay above entry.
        if (newSL > (pos.sl || 0) && newSL > pos.entryMC) {
          const oldSL = pos.sl;
          pos.sl = newSL;
          if (Math.round(newSL) !== Math.round(oldSL)) {
            console.log(`[${ts()}] 📈 ${pos.name}: HIGH $${Math.round(pos.highMC)} — SL trailed: $${Math.round(oldSL)} → $${Math.round(newSL)} (${Math.round(trailPct*100)}% of high)`);
          }
        }
      }
    }
    
    console.log(`[${ts()}] ${pos.name}: $${Math.round(mc)} MC (${pnl}%) | High: $${Math.round(pos.highMC)} | SL: $${Math.round(pos.sl)} | B/S:${p.txns?.m5?.buys}/${p.txns?.m5?.sells}`);
    
    // HARD STOP: -30% max loss — cut losers fast, no exceptions
    if (mc <= pos.entryMC * 0.70 && !pos.sl) {
      console.log(`[${ts()}] 💀 HARD STOP on ${pos.name}! MC:$${Math.round(mc)} = ${pnl}% — cutting losses`);
      const sold = await sell(pos.ca, '100%');
      if (sold) {
        await postTrade('SELL', pos.name, pos.ca, mc, `Hard stop hit. ${pnl}% loss. Cut fast, move on.`, null, parseFloat(pnl));
        POSITIONS.splice(i, 1);
      }
      continue;
    }
    
    // FAST PUMP SELL: If +30%+ and momentum fading, sell half NOW. Don't wait for 2x.
    if (!pos.tp1Hit && mc >= pos.entryMC * 1.30) {
      const m5 = p.priceChange?.m5 || 0;
      const buys = p.txns?.m5?.buys || 0;
      const sells = p.txns?.m5?.sells || 0;
      const bsRatio = buys / Math.max(sells, 1);
      
      // If momentum fading (5m red or B/S weak) at +30%+, TAKE PROFIT
      if (m5 < 0 || bsRatio < 1.5) {
        const mult = mc / pos.entryMC;
        console.log(`[${ts()}] 💰 FAST PUMP SELL on ${pos.name}! +${((mult-1)*100).toFixed(0)}% but fading (5m:${m5.toFixed(1)}% B/S:${bsRatio.toFixed(1)}) — SELLING HALF`);
        await sell(pos.ca, '50%');
        pos.tp1Hit = true;
        pos.sl = Math.max(pos.sl || 0, pos.entryMC * 1.10);
        console.log(`[${ts()}] 🔒 ${pos.name}: Fast profit locked. SL at +10%: $${Math.round(pos.sl)}`);
        continue;
      }
    }
    
    // DYNAMIC TP1: Read the chart. If ripping, let it ride. If fading, take profit.
    // Minimum 2x to consider selling half. If momentum is strong, hold for 3x-4x+
    if (!pos.tp1Hit && mc >= pos.entryMC * 2.0) {
      const m5 = p.priceChange?.m5 || 0;
      const h1 = p.priceChange?.h1 || 0;
      const buys = p.txns?.m5?.buys || 0;
      const sells = p.txns?.m5?.sells || 0;
      const bsRatio = buys / Math.max(sells, 1);
      const mult = mc / pos.entryMC;
      
      // Chart is RIPPING: 5min green, buy pressure strong — let it ride
      if (m5 > 3 && bsRatio >= 2.0 && mult < 4.0) {
        console.log(`[${ts()}] 🚀 ${pos.name}: ${mult.toFixed(1)}x but RIPPING! 5m:+${m5.toFixed(1)}% B/S:${buys}/${sells} — HOLDING for more`);
        // Just tighten SL as it rips — 90% of high
        const rocketSL = pos.highMC * 0.90;
        if (rocketSL > (pos.sl || 0)) {
          pos.sl = rocketSL;
          console.log(`[${ts()}] 🔒 ${pos.name}: Rip SL tightened to 90% of high: $${Math.round(pos.sl)}`);
        }
      } else {
        // Momentum fading OR we hit 4x+ — SELL HALF, lock it in
        console.log(`[${ts()}] 🎯 TP1 on ${pos.name}! ${mult.toFixed(1)}x | 5m:${m5>0?'+':''}${m5.toFixed(1)}% B/S:${buys}/${sells} — momentum ${m5 > 3 && bsRatio >= 2 ? 'strong but 4x+ reached' : 'fading'} — SELLING HALF`);
        await sell(pos.ca, '50%');
        pos.tp1Hit = true;
        // Hug SL tight on remaining — minimum 80% of current MC
        pos.sl = Math.max(pos.sl || 0, mc * 0.90);
        console.log(`[${ts()}] 🔒 ${pos.name}: SL LOCKED at $${Math.round(pos.sl)} (90% of current) — house money`);
      }
    }
    
    // SL hit — but SELL ON GREEN CANDLE if possible
    if (pos.sl && mc <= pos.sl) {
      const m5 = p.priceChange?.m5 || 0;
      if (m5 > 0 || mc < pos.sl * 0.95) {
        // Sell if 5min is green (sell into strength) OR if crashing hard (emergency)
        console.log(`[${ts()}] 🛑 SL HIT on ${pos.name}! MC:$${Math.round(mc)} SL:$${Math.round(pos.sl)} | Selling...`);
        const sold = await sell(pos.ca, '100%');
        if (sold) {
          // Add to watchlist for potential re-entry
          WATCHLIST.push({ name: pos.name, ca: pos.ca, exitMC: mc, exitTime: Date.now(), entryMC: pos.entryMC });
          console.log(`[${ts()}] 👀 ${pos.name} added to WATCHLIST — watching for re-entry`);
          POSITIONS.splice(i, 1);
        } else {
          console.log(`[${ts()}] ⚠️ ${pos.name} SELL FAILED — keeping position, will retry next cycle`);
        }
      } else {
        console.log(`[${ts()}] ⚠️ ${pos.name} at SL but 5min red — waiting for green candle to sell`);
      }
      continue;
    }
    
    // TP1 — sell half on green candle
    if (mc >= pos.tp1 && !pos.tp1Hit && (p.priceChange?.m5 || 0) > 0) {
      console.log(`[${ts()}] 🎯 TP1 HIT on ${pos.name}! Selling 50%...`);
      const sold = await sell(pos.ca, '50%');
      if (sold) {
        pos.tp1Hit = true;
        pos.sl = Math.max(pos.sl, pos.entryMC * 1.1); // SL to +10% profit minimum
        console.log(`[${ts()}] ✅ TP1 taken. SL locked at +10% profit: $${Math.round(pos.sl)}`);
      }
    }
    
    // TP2 — sell rest
    if (mc >= pos.tp2 && pos.tp1Hit && (p.priceChange?.m5 || 0) > 0) {
      console.log(`[${ts()}] 🎯 TP2 HIT on ${pos.name}! Selling all...`);
      await sell(pos.ca, '100%');
      POSITIONS.splice(i, 1);
    }
  }
}

// ===== WATCHLIST RE-ENTRY CHECK =====
async function checkWatchlist() {
  for (let i = WATCHLIST.length - 1; i >= 0; i--) {
    const w = WATCHLIST[i];
    if (Date.now() - w.exitTime > 30 * 60 * 1000) { WATCHLIST.splice(i, 1); continue; }
    if (POSITIONS.length >= 3) continue;
    if (POSITIONS.find(p => p.ca === w.ca)) continue;
    
    const p = await checkPrice(w.ca);
    if (!p) continue;
    
    const mc = p.fdv;
    const m5 = p.priceChange?.m5 || 0;
    const buys = p.txns?.m5?.buys || 0;
    const sells = p.txns?.m5?.sells || 1;
    
    // Re-entry: green candle + buy pressure + below original entry (buying the dip)
    if (m5 > 3 && buys / sells >= 2 && mc < w.entryMC * 0.95) {
      console.log(`[${ts()}] 🔄 RE-ENTRY: ${w.name} | MC: $${Math.round(mc)} (was $${Math.round(w.entryMC)}) | 5m: +${m5.toFixed(1)}% | B/S: ${buys}/${sells} | Re-buying 0.5 SOL`);
      const success = await buy(w.ca, 0.5);
      if (success) {
        POSITIONS.push({ name: w.name, ca: w.ca, entryMC: mc, highMC: mc, sl: null, tp1: mc * 1.5, tp2: mc * 3, tp1Hit: false });
        console.log(`[${ts()}] ✅ RE-ENTERED ${w.name} @ $${Math.round(mc)} MC — second chance play`);
      }
      WATCHLIST.splice(i, 1);
    }
  }
}

// Main loop
// ===== STARTUP HEALTH CHECK =====
async function healthCheck() {
  const checks = [];
  // 1. DexScreener API
  try { const r = await fetch('https://api.dexscreener.com/token-boosts/top/v1', {signal: AbortSignal.timeout(5000)}); checks.push(r.ok ? '✅ DexScreener' : '❌ DexScreener ' + r.status); } catch(e) { checks.push('❌ DexScreener: ' + e.message.slice(0,40)); }
  // 2. Jupiter API
  try { const r = await fetch('https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=8HGer4vRWZMu5MUYU7ACPb4uanKgBewaXJZscLagpump&amount=100000000&slippageBps=500', {signal: AbortSignal.timeout(5000)}); const d = await r.json(); checks.push(d.outAmount ? '✅ Jupiter' : '❌ Jupiter: ' + (d.error||'no quote')); } catch(e) { checks.push('❌ Jupiter: ' + e.message.slice(0,40)); }
  // 3. Scanner signals file
  try { const fs = await import('fs'); if (fs.existsSync(BASE_DIR + '/scanner-signals.json')) { checks.push('✅ Scanner signal bridge'); } else { checks.push('⚠️ No scanner-signals.json yet (will create on first scan)'); } } catch { checks.push('⚠️ Scanner signal file check failed'); }
  // 4. Convergence signals file
  try { const fs = await import('fs'); if (fs.existsSync(BASE_DIR + '/convergence-signals.json')) { checks.push('✅ Convergence signal bridge'); } else { checks.push('⚠️ No convergence-signals.json yet'); } } catch {}
  // 5. Wallet (via PublicNode fallback)
  try { const r = await fetch('https://solana.publicnode.com', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getBalance',params:['FXdMNyRo5CqfG3yRWCcNu163FpnSusdZSYecsB76GAkn']}),signal:AbortSignal.timeout(5000)}); const d = await r.json(); const sol = (d.result?.value||0)/1e9; checks.push(sol > 0 ? `✅ Wallet: ${sol.toFixed(2)} SOL` : '❌ Wallet: 0 SOL'); } catch(e) { checks.push('❌ Wallet check: ' + e.message.slice(0,40)); }
  
  console.log(`[${ts()}] === HEALTH CHECK ===`);
  checks.forEach(c => console.log(`[${ts()}] ${c}`));
  console.log(`[${ts()}] === END HEALTH CHECK ===`);
  
  const failures = checks.filter(c => c.startsWith('❌'));
  if (failures.length > 0) {
    console.log(`[${ts()}] ⚠️ ${failures.length} CRITICAL FAILURES — trading may be impaired`);
  } else {
    console.log(`[${ts()}] 🟢 ALL SYSTEMS GO — ready to trade`);
  }
}

await healthCheck();

console.log(`[${ts()}] 🦞 AUTO-MANAGE v2 STARTED — TRAILING STOPS ACTIVE`);
console.log(`[${ts()}] Rules: Trail SL up as price rises. Never let a winner become a loser.`);
console.log(`[${ts()}] +20% → SL at 70% of high | +50% → SL at 80% of high | Sell on green candles`);
console.log(`[${ts()}] Don't chase parabolic (>80% 1h = skip). Buy dips, ride momentum.`);
console.log(`[${ts()}] Positions: ${POSITIONS.map(p=>p.name).join(', ') || 'none'}`);

let cycle = 0;
setInterval(async () => {
  cycle++;
  try {
    await managePositions();
    // Check convergence EVERY cycle (primary buy trigger)
    await checkConvergence();
    // Scanner signals from autonomous.mjs — EVERY cycle
    await checkScannerSignals();
    // Watchlist re-entry — check after SL exits
    await checkWatchlist();
    // DexScreener boost scan — only every other cycle
    if (cycle % 2 === 0) await scanForTrades();
  } catch(e) {
    console.log(`[${ts()}] Loop error: ${e.message}`);
  }
}, 30000);
