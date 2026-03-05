import { execSync } from 'child_process';
import fs from 'fs';

const BASE_DIR = '/tmp/gizmo-trade';
const REPO_DIR = '/Users/younghogey/.openclaw/workspace/SOLGizmo';
const POSITIONS_FILE = BASE_DIR + '/positions.json';
const TRADES_FILE = REPO_DIR + '/trades.json';

function loadPositions() {
  try {
    if (fs.existsSync(POSITIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(POSITIONS_FILE, 'utf8'));
      console.log(`[${ts()}] Loaded ${data.length} positions: ${data.map(p => p.name).join(', ')}`);
      return data;
    }
  } catch (e) { console.log(`[${ts()}] Could not load positions: ${e.message}`); }
  return [];
}

function savePositions() {
  try { fs.writeFileSync(POSITIONS_FILE, JSON.stringify(POSITIONS, null, 2)); } catch (e) { console.log(`[${ts()}] Save positions failed: ${e.message}`); }
}

function logTrade(action, name, ca, solAmount, pnlSol, txSig, result) {
  try {
    let trades = [];
    if (fs.existsSync(TRADES_FILE)) trades = JSON.parse(fs.readFileSync(TRADES_FILE, 'utf8'));
    const n = (trades[0]?.n || 0) + 1;
    const entry = { n, date: new Date().toISOString().split('T')[0], token: name, action, amount: solAmount ? solAmount + ' SOL' : '', result: result || (txSig ? 'TX: ' + txSig : ''), pnl: pnlSol ? (pnlSol > 0 ? '+' : '') + pnlSol.toFixed(4) + ' SOL' : '', color: action === 'BUY' ? 'teal' : (pnlSol >= 0 ? 'teal' : 'red'), ca, ts: Math.floor(Date.now() / 1000) };
    trades.unshift(entry);
    fs.writeFileSync(TRADES_FILE, JSON.stringify(trades, null, 2));
    try { execSync(`cd ${REPO_DIR} && git add trades.json && git commit -m "trade #${n}" && git push`, { timeout: 20000 }); console.log(`[${ts()}] trades.json pushed to GitHub`); } catch (e) { console.log(`[${ts()}] Git push failed: ${e.message?.slice(0,80)}`); }
  } catch (e) { console.log(`[${ts()}] logTrade failed: ${e.message}`); }
}

function ts() { return new Date().toLocaleString(); }

const POSITIONS = loadPositions();
const RECENTLY_BOUGHT = new Map([
  ['3o28iKESnNvi7xQcPTxg9aczjzqZN6BzugJFMRHYpump', Date.now()],
  ['7CWLxXfjRZ8WP8HVWBSHoti9pVP9FfN5UwZ71JyXpump', Date.now()],
  ['6dQD8ALWdkFiD77D34qzUHFuifpaCnoWAEGRgvcZpump', Date.now()],
  ['AMshsFcGg5EzrAPzeqDn1jQWieCrLwss3CdBmGRNpump', Date.now()],
  ['BzyKa1FGjs2EUpu3GGDibY4xdygn5evAiRboKmETpump', Date.now()],
]);
const TOXIC_WORDS = ['pedo','nazi','hitler','porn','xxx','nigger','faggot','rape','child','epstein','holocaust','pedocast'];
const WATCHLIST = [];

async function checkPrice(ca) {
  const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${ca}`);
  const d = await r.json();
  return d.pairs?.[0];
}

async function postTrade(type, symbol, ca, mc, reason, solAmount, pnl) {
  try {
    const emoji = type === 'BUY' ? '🟢' : (pnl && pnl > 0 ? '💰' : '🔴');
    let text = type === 'BUY' ? `${emoji} BOUGHT $${symbol}\n\n${reason}\n\nMC: $${Math.round(mc/1000)}K | ${solAmount} SOL\n\nCA: ${ca}\n\n🦞` : `${emoji} SOLD $${symbol} (${pnl > 0 ? '+' : ''}${pnl.toFixed(1)}%)\n\n${reason}\n\nMC: $${Math.round(mc/1000)}K\n\n🦞`;
    execSync(`cd ${BASE_DIR} && node tweet.mjs "${text.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`, { timeout: 15000 });
  } catch(e) { console.log(`[${ts()}] Tweet failed: ${e.message?.substring(0,60)}`); }
}

async function sell(ca, pct, posName, entryMC, currentMC) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const out = execSync(`cd /Users/younghogey/.openclaw/workspace/SOLGizmo && node sell.mjs ${ca} ${pct}`, { timeout: 45000 }).toString();
      console.log(`[${ts()}] SELL ${pct} attempt ${attempt}: ${out.trim()}`);
      if (out.includes('CONFIRMED')) {
        const solMatch = out.match(/sold for ~([\d.]+) SOL/);
        const txMatch = out.match(/TX: https:\/\/solscan\.io\/tx\/(\S+)/);
        const solReceived = solMatch ? parseFloat(solMatch[1]) : null;
        const txSig = txMatch ? txMatch[1] : null;
        const pnlPct = entryMC && currentMC ? ((currentMC - entryMC) / entryMC * 100) : null;
        logTrade('SELL', posName || ca.slice(0,8), ca, solReceived, solReceived, txSig, `Sold ${pct} confirmed${pnlPct !== null ? ' | PnL: ' + (pnlPct > 0 ? '+' : '') + pnlPct.toFixed(1) + '%' : ''}`);
        return true;
      }
      if (out.includes('No tokens to sell')) return true;
    } catch(e) { console.log(`[${ts()}] SELL failed attempt ${attempt}: ${e.message?.substring(0,100)}`); }
    if (attempt < 3) await new Promise(r => setTimeout(r, 3000));
  }
  console.log(`[${ts()}] SELL FAILED ALL 3 ATTEMPTS on ${posName} — MANUAL ACTION NEEDED`);
  try { fs.writeFileSync(BASE_DIR + '/SELL_FAILED_URGENT.txt', `SELL FAILED: ${posName} (${ca}) at ${new Date().toISOString()}\nManual action required.\n`); } catch {}
  return false;
}

async function buy(ca, amount) {
  try {
    const out = execSync(`cd /Users/younghogey/.openclaw/workspace/SOLGizmo && node trade.mjs ${ca} ${amount}`, { timeout: 30000 }).toString();
    console.log(`[${ts()}] BUY ${amount} SOL: ${out.trim()}`);
    return out.includes('CONFIRMED');
  } catch(e) { console.log(`[${ts()}] BUY FAILED: ${e.message?.substring(0,100)}`); return false; }
}

async function managePositions() {
  for (let i = POSITIONS.length - 1; i >= 0; i--) {
    const pos = POSITIONS[i];
    const p = await checkPrice(pos.ca);
    if (!p) continue;
    const mc = p.fdv;
    const pnl = ((mc - pos.entryMC) / pos.entryMC * 100).toFixed(1);

    if (mc > pos.highMC) {
      pos.highMC = mc;
      if (mc > pos.entryMC * 1.10 && !pos.sl) { pos.sl = pos.entryMC * 1.05; console.log(`[${ts()}] 🟢 ${pos.name}: SL locked at +5%: $${Math.round(pos.sl)}`); }
      if (pos.sl && pos.highMC > pos.entryMC * 1.15) {
        let trailPct = pos.highMC > pos.entryMC * 2.0 ? 0.95 : pos.highMC > pos.entryMC * 1.5 ? 0.93 : pos.highMC > pos.entryMC * 1.3 ? 0.92 : 0.90;
        const newSL = pos.highMC * trailPct;
        if (newSL > (pos.sl || 0) && newSL > pos.entryMC) { const old = pos.sl; pos.sl = newSL; if (Math.round(newSL) !== Math.round(old)) console.log(`[${ts()}] 📈 ${pos.name}: SL trailed $${Math.round(old)} → $${Math.round(newSL)}`); }
      }
      savePositions();
    }

    console.log(`[${ts()}] ${pos.name}: $${Math.round(mc)} (${pnl}%) | High: $${Math.round(pos.highMC)} | SL: $${pos.sl ? Math.round(pos.sl) : 'none'} | B/S:${p.txns?.m5?.buys}/${p.txns?.m5?.sells}`);

    if (mc <= pos.entryMC * 0.70 && !pos.sl) {
      console.log(`[${ts()}] 💀 HARD STOP ${pos.name} ${pnl}%`);
      if (await sell(pos.ca, '100%', pos.name, pos.entryMC, mc)) { await postTrade('SELL', pos.name, pos.ca, mc, `Hard stop ${pnl}%`, null, parseFloat(pnl)); POSITIONS.splice(i, 1); savePositions(); }
      continue;
    }

    if (!pos.tp1Hit && mc >= pos.entryMC * 1.30) {
      const m5 = p.priceChange?.m5 || 0; const bsRatio = (p.txns?.m5?.buys||0) / Math.max(p.txns?.m5?.sells||0, 1);
      if (m5 < 0 || bsRatio < 1.5) {
        console.log(`[${ts()}] 💰 FAST PUMP SELL ${pos.name} — fading at +${((mc/pos.entryMC-1)*100).toFixed(0)}%`);
        if (await sell(pos.ca, '50%', pos.name, pos.entryMC, mc)) { pos.tp1Hit = true; pos.sl = Math.max(pos.sl || 0, pos.entryMC * 1.10); savePositions(); }
        continue;
      }
    }

    if (!pos.tp1Hit && mc >= pos.entryMC * 2.0) {
      const m5 = p.priceChange?.m5 || 0; const bsRatio = (p.txns?.m5?.buys||0) / Math.max(p.txns?.m5?.sells||0, 1); const mult = mc / pos.entryMC;
      if (m5 > 3 && bsRatio >= 2.0 && mult < 4.0) {
        const rSL = pos.highMC * 0.90; if (rSL > (pos.sl||0)) { pos.sl = rSL; savePositions(); }
        console.log(`[${ts()}] 🚀 ${pos.name}: ${mult.toFixed(1)}x RIPPING — holding`);
      } else {
        console.log(`[${ts()}] 🎯 TP1 ${pos.name} ${mult.toFixed(1)}x — selling half`);
        if (await sell(pos.ca, '50%', pos.name, pos.entryMC, mc)) { pos.tp1Hit = true; pos.sl = Math.max(pos.sl||0, mc * 0.90); savePositions(); }
      }
    }

    if (pos.sl && mc <= pos.sl) {
      const m5 = p.priceChange?.m5 || 0;
      if (m5 > 0 || mc < pos.sl * 0.95) {
        console.log(`[${ts()}] 🛑 SL HIT ${pos.name} MC:$${Math.round(mc)} SL:$${Math.round(pos.sl)}`);
        if (await sell(pos.ca, '100%', pos.name, pos.entryMC, mc)) { await postTrade('SELL', pos.name, pos.ca, mc, `SL hit ${pnl}%`, null, parseFloat(pnl)); WATCHLIST.push({name:pos.name,ca:pos.ca,exitMC:mc,exitTime:Date.now(),entryMC:pos.entryMC}); POSITIONS.splice(i, 1); savePositions(); }
        else console.log(`[${ts()}] ⚠️ ${pos.name} SELL FAILED — retry next cycle`);
      } else { console.log(`[${ts()}] ⚠️ ${pos.name} at SL but 5m red — waiting green candle`); }
      continue;
    }

    if (mc >= (pos.tp2||pos.entryMC*3) && pos.tp1Hit && (p.priceChange?.m5||0) > 0) {
      console.log(`[${ts()}] 🎯 TP2 ${pos.name} — selling all`);
      if (await sell(pos.ca, '100%', pos.name, pos.entryMC, mc)) { await postTrade('SELL', pos.name, pos.ca, mc, `TP2 hit ${pnl}%`, null, parseFloat(pnl)); POSITIONS.splice(i, 1); savePositions(); }
    }
  }
}

async function checkWatchlist() {
  for (let i = WATCHLIST.length - 1; i >= 0; i--) {
    const w = WATCHLIST[i];
    if (Date.now() - w.exitTime > 30*60*1000) { WATCHLIST.splice(i,1); continue; }
    if (POSITIONS.length >= 3 || POSITIONS.find(p => p.ca === w.ca)) continue;
    const p = await checkPrice(w.ca); if (!p) continue;
    const mc = p.fdv; const m5 = p.priceChange?.m5||0; const buys = p.txns?.m5?.buys||0; const sells = p.txns?.m5?.sells||1;
    if (m5 > 3 && buys/sells >= 2 && mc < w.entryMC * 0.95) {
      if (await buy(w.ca, 0.5)) { POSITIONS.push({name:w.name,ca:w.ca,entryMC:mc,highMC:mc,sl:null,tp1:mc*1.5,tp2:mc*3,tp1Hit:false}); savePositions(); logTrade('BUY',w.name,w.ca,0.5,null,null,`Re-entry @ $${Math.round(mc)}`); }
      WATCHLIST.splice(i,1);
    }
  }
}

async function checkScannerSignals() {
  try {
    const sigFile = BASE_DIR + '/scanner-signals.json';
    if (!fs.existsSync(sigFile)) return;
    const signals = JSON.parse(fs.readFileSync(sigFile,'utf8')||'[]');
    const fresh = signals.filter(s => Date.now()-s.ts < 15*60*1000 && s.score >= 8);
    for (const sig of fresh) {
      if (POSITIONS.find(pos => pos.ca===sig.ca) || POSITIONS.length>=3) continue;
      if (RECENTLY_BOUGHT.has(sig.ca) && Date.now()-RECENTLY_BOUGHT.get(sig.ca)<3600000) continue;
      const p = await checkPrice(sig.ca); if (!p) continue;
      if (!['pumpswap','meteora','raydium'].includes(p.dexId)) continue;
      const name = (p.baseToken?.name||'').toLowerCase();
      if (TOXIC_WORDS.some(w => name.includes(w))) continue;
      if (p.fdv<69000 || (p.liquidity?.usd||0)<30000) continue;
      if ((p.priceChange?.h1||0)>80) continue;
      if ((p.txns?.m5?.buys||0)/Math.max(p.txns?.m5?.sells||0,1)<2.0) continue;
      let size = sig.score>=9?3:sig.score>=8?2:1;
      if (sig.kolCount>=2) size=Math.min(size*2,5);
      console.log(`[${ts()}] 🔥 SCANNER BUY: ${sig.symbol} score:${sig.score} buying ${size} SOL`);
      if (await buy(sig.ca, size)) { POSITIONS.push({name:sig.symbol,ca:sig.ca,entryMC:p.fdv,highMC:p.fdv,sl:null,tp1:p.fdv*1.5,tp2:p.fdv*3,tp1Hit:false}); savePositions(); logTrade('BUY',sig.symbol,sig.ca,size,null,null,`Scanner ${sig.score}/9`); await postTrade('BUY',sig.symbol,sig.ca,p.fdv,`Score:${sig.score}/9`,size); fs.writeFileSync(sigFile,JSON.stringify(signals.filter(s=>s.ca!==sig.ca))); }
      RECENTLY_BOUGHT.set(sig.ca,Date.now()); break;
    }
  } catch(e) { console.log(`[${ts()}] Scanner error: ${e.message}`); }
}

async function checkConvergence() {
  try {
    const sigFile = BASE_DIR + '/convergence-signals.json';
    if (!fs.existsSync(sigFile)) return;
    const signals = JSON.parse(fs.readFileSync(sigFile,'utf8')||'[]');
    const fresh = signals.filter(s => Date.now()-s.ts<5*60*1000 && s.kolCount>=2);
    for (const sig of fresh) {
      if (POSITIONS.find(pos=>pos.ca===sig.ca) || POSITIONS.length>=3) continue;
      if (RECENTLY_BOUGHT.has(sig.ca) && Date.now()-RECENTLY_BOUGHT.get(sig.ca)<3600000) continue;
      const p = await checkPrice(sig.ca); if (!p) continue;
      if (!['pumpswap','meteora','raydium'].includes(p.dexId)) continue;
      const liq=p.liquidity?.usd||0; if (liq<20000||p.fdv<50000) continue;
      const size=Math.max(1,Math.min(sig.kolCount>=3?10:7,Math.min(Math.floor(liq*0.05/82),5)));
      console.log(`[${ts()}] 🔥 CONVERGENCE: ${sig.symbol} ${sig.kolCount} KOLs buying ${size} SOL`);
      if (await buy(sig.ca, size)) { POSITIONS.push({name:sig.symbol,ca:sig.ca,entryMC:p.fdv,highMC:p.fdv,sl:null,tp1:p.fdv*1.5,tp2:p.fdv*3,tp1Hit:false}); savePositions(); logTrade('BUY',sig.symbol,sig.ca,size,null,null,`${sig.kolCount} KOL convergence`); fs.writeFileSync(sigFile,JSON.stringify(signals.filter(s=>s.ca!==sig.ca))); }
      RECENTLY_BOUGHT.set(sig.ca,Date.now());
    }
  } catch(e) {}
}

async function scanForTrades() {
  try {
    const r = await fetch('https://api.dexscreener.com/token-boosts/top/v1');
    const tokens = await r.json();
    for (const t of tokens.filter(t=>t.chainId==='solana').slice(0,15)) {
      const p = await checkPrice(t.tokenAddress); if (!p) continue;
      if (!['pumpswap','meteora','raydium'].includes(p.dexId)) continue;
      if (p.fdv<69000||p.fdv>5000000) continue;
      const m5=p.priceChange?.m5||0,h1=p.priceChange?.h1||0,h6=p.priceChange?.h6||0;
      if (m5<3||h1>100||h6>200) continue;
      if ((p.txns?.m5?.buys||0)<50||(p.txns?.m5?.buys||0)/Math.max(p.txns?.m5?.sells||0,1)<2) continue;
      if ((p.volume?.m5||0)<3000||(p.liquidity?.usd||0)<30000) continue;
      if (POSITIONS.find(pos=>pos.ca===t.tokenAddress)||POSITIONS.length>=3) continue;
      if (RECENTLY_BOUGHT.has(t.tokenAddress)&&Date.now()-RECENTLY_BOUGHT.get(t.tokenAddress)<3600000) continue;
      const name=(p.baseToken?.name||'').toLowerCase(); if (TOXIC_WORDS.some(w=>name.includes(w))) continue;
      let score=0;
      if ((p.txns.m5.buys/Math.max(p.txns.m5.sells,1))>=2.5)score++;if(p.txns.m5.buys>100)score++;if(m5>5)score++;if(h1<0&&m5>3)score++;if((p.volume?.h1||0)>50000)score++;if(t.totalAmount>=200)score++;if((p.liquidity?.usd||0)>50000)score++;if((p.txns.h1?.buys||0)>200)score++;if(h6<0&&m5>5)score++;
      if (score<7) continue;
      const liq=p.liquidity?.usd||0; const maxSize=Math.min(Math.floor(liq*0.05/82),5);
      const size=score>=9?Math.min(3,maxSize):score>=8?Math.min(2,maxSize):Math.min(1,maxSize);
      console.log(`[${ts()}] 🎯 BOOST BUY: ${p.baseToken.symbol} score:${score} buying ${size} SOL`);
      if (await buy(t.tokenAddress,size)) { POSITIONS.push({name:p.baseToken.symbol,ca:t.tokenAddress,entryMC:p.fdv,highMC:p.fdv,sl:null,tp1:p.fdv*1.5,tp2:p.fdv*3,tp1Hit:false}); savePositions(); logTrade('BUY',p.baseToken.symbol,t.tokenAddress,size,null,null,`Boost scan ${score}/9`); }
      RECENTLY_BOUGHT.set(t.tokenAddress,Date.now()); break;
    }
  } catch(e) { console.log(`[${ts()}] Scan error: ${e.message}`); }
}

async function healthCheck() {
  const checks = [];
  try { const r=await fetch('https://api.dexscreener.com/token-boosts/top/v1',{signal:AbortSignal.timeout(5000)}); checks.push(r.ok?'✅ DexScreener':'❌ DexScreener '+r.status); } catch(e) { checks.push('❌ DexScreener: '+e.message.slice(0,40)); }
  try { const r=await fetch('https://lite-api.jup.ag/swap/v1/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=8HGer4vRWZMu5MUYU7ACPb4uanKgBewaXJZscLagpump&amount=100000000&slippageBps=500',{signal:AbortSignal.timeout(5000)}); const d=await r.json(); checks.push(d.outAmount?'✅ Jupiter':'❌ Jupiter: '+(d.error||'no quote')); } catch(e) { checks.push('❌ Jupiter: '+e.message.slice(0,40)); }
  try { const r=await fetch('https://solana.publicnode.com',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'getBalance',params:['FXdMNyRo5CqfG3yRWCcNu163FpnSusdZSYecsB76GAkn']}),signal:AbortSignal.timeout(5000)}); const d=await r.json(); const sol=(d.result?.value||0)/1e9; checks.push(sol>0?`✅ Wallet: ${sol.toFixed(2)} SOL`:'⚠️ Wallet: 0 SOL'); } catch(e) { checks.push('❌ Wallet: '+e.message.slice(0,40)); }
  console.log(`[${ts()}] === HEALTH CHECK ===`);
  checks.forEach(c=>console.log(`[${ts()}] ${c}`));
  const fail=checks.filter(c=>c.startsWith('❌'));
  console.log(`[${ts()}] ${fail.length>0?'⚠️ '+fail.length+' failures':'🟢 ALL SYSTEMS GO'}`);
}

await healthCheck();
console.log(`[${ts()}] 🦞 AUTO-MANAGE v3 — persistent positions + sell logging`);
console.log(`[${ts()}] Positions: ${POSITIONS.map(p=>p.name).join(', ')||'none'}`);

let cycle=0;
setInterval(async()=>{
  cycle++;
  try {
    await managePositions();
    await checkConvergence();
    await checkScannerSignals();
    await checkWatchlist();
    if(cycle%2===0) await scanForTrades();
  } catch(e) { console.log(`[${ts()}] Loop error: ${e.message}`); }
},30000);
