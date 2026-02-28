/**
 * 🦞 Graduation Dip Scanner
 * Finds tokens that just graduated from Pump.fun bond curve,
 * dipped from profit-taking, and are showing recovery signs.
 * The sweet spot: post-graduation dip + buy pressure returning
 */

const PF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
  'Origin': 'https://pump.fun', 'Referer': 'https://pump.fun/',
};

async function scan() {
  // Get live tokens from Pump.fun
  const r = await fetch('https://frontend-api-v3.pump.fun/coins/currently-live?limit=50&offset=0&includeNsfw=false', { headers: PF_HEADERS });
  const coins = await r.json();
  
  const candidates = [];
  
  for (const c of coins.filter(c => (c.usd_market_cap || 0) >= 69000 && (c.usd_market_cap || 0) <= 2000000)) {
    try {
      const r2 = await fetch('https://api.dexscreener.com/latest/dex/tokens/' + c.mint, { signal: AbortSignal.timeout(5000) });
      const d = await r2.json();
      const p = d.pairs?.[0];
      if (!p) continue;
      
      const mc = p.marketCap || p.fdv || 0;
      const liq = p.liquidity?.usd || 0;
      const h1 = p.priceChange?.h1 || 0;
      const m5 = p.priceChange?.m5 || 0;
      const h24 = p.priceChange?.h24 || 0;
      const buys = p.txns?.h1?.buys || 0;
      const sells = p.txns?.h1?.sells || 0;
      const vol = p.volume?.h24 || 0;
      const age = p.pairCreatedAt ? Math.floor((Date.now() - p.pairCreatedAt) / 3600000) : 999;
      
      // THE PATTERN: dipped from highs but buy pressure returning
      const postDump = h1 < -15 || (h24 > 100 && h1 < 0); // Ran up big, now pulling back
      const buyPressure = buys > sells * 1.2; // More buyers than sellers
      const recovering = m5 > 0; // 5min turning green
      const hasLiquidity = liq > 20000;
      const hasVolume = vol > 50000;
      
      let score = 0;
      if (postDump) score += 2; // Post-graduation dump ✓
      if (recovering) score += 2; // Starting to recover ✓
      if (buyPressure) score += 1; // Buyers outpacing sellers ✓
      if (hasLiquidity) score += 1;
      if (hasVolume) score += 1;
      if (age <= 12) score += 1; // Fresh
      if (mc >= 100000 && mc <= 1000000) score += 1; // Sweet spot MC
      
      candidates.push({
        symbol: p.baseToken?.symbol || c.symbol,
        name: p.baseToken?.name || c.name,
        ca: c.mint, mc, liq, vol, h1, m5, h24, buys, sells, age, score,
        postDump, recovering, buyPressure
      });
    } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  
  candidates.sort((a, b) => b.score - a.score);
  
  console.log('=== 🦞 GRADUATION DIP SCANNER ===\n');
  
  for (const c of candidates.slice(0, 10)) {
    const tag = c.recovering && c.postDump ? '🟢 DIP BUY' : c.postDump ? '🔴 STILL DIPPING' : '⚪ NO DIP';
    console.log(`${tag} ${c.symbol} | SCORE: ${c.score}/9`);
    console.log(`  MC: $${c.mc.toLocaleString()} | Liq: $${c.liq.toLocaleString()} | Vol: $${c.vol.toLocaleString()}`);
    console.log(`  1h: ${c.h1}% | 5m: ${c.m5}% | 24h: ${c.h24}% | B/S: ${c.buys}/${c.sells} | Age: ${c.age}h`);
    console.log(`  CA: ${c.ca}\n`);
  }
  
  // Return best dip buy candidates
  return candidates.filter(c => c.score >= 6 && c.recovering && c.postDump);
}

const picks = await scan();
if (picks.length > 0) {
  console.log('=== TOP DIP BUY CANDIDATES ===');
  picks.forEach(p => console.log(`🎯 ${p.symbol} | $${p.mc.toLocaleString()} | 5m: +${p.m5}% recovery | CA: ${p.ca}`));
}
