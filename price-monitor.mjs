#!/usr/bin/env node
/**
 * Gizmo Price Monitor — ZERO LLM CREDITS
 * Fetches prices, checks SL/TP, outputs alerts only when needed.
 * Run every 5-15 min via cron. Only triggers LLM if action required.
 */

const POSITIONS = [
  { symbol: 'JAWZ', ca: 'GJmF68t5HXM1U1j2nE4Trvh7vH5XeXys7MW4UN5Bpump', slMC: 100000, tpMC: 500000 },
  { symbol: 'BLOODNUT', ca: 'HBJUeugfgJ3zWYMMP4cULbZ9bjnZbb6WG9cBcWNxpump', slPrice: 0.00006, tpPrice: 0.00064 },
  { symbol: 'PUNCH', ca: 'NV2RYH954cTJ3ckFUpvfqaQXU4ARqqDH3562nFSpump', slPrice: 0.018, tpPrice: 0.070 },
  { symbol: 'TRENCH', ca: 'BzyKa1FGjs2EUpu3GGDibY4xdygn5evAiRboKmETpump' },
  { symbol: 'GIZMO', ca: '8HGer4vRWZMu5MUYU7ACPb4uanKgBewaXJZscLagpump', slPrice: 0.0001, tpPrice: 0.001 },
];

async function fetchJSON(url) {
  const r = await fetch(url);
  if (!r.ok) return null;
  return r.json();
}

async function main() {
  const alerts = [];
  const summary = [];

  // 1. SOL/BTC/ETH prices
  const cg = await fetchJSON('https://api.coingecko.com/api/v3/simple/price?ids=solana,bitcoin,ethereum&vs_currencies=usd');
  if (cg) {
    summary.push(`SOL:$${cg.solana?.usd} BTC:$${cg.bitcoin?.usd} ETH:$${cg.ethereum?.usd}`);
  }

  // 2. Check each position
  for (const pos of POSITIONS) {
    await new Promise(r => setTimeout(r, 300)); // rate limit
    const d = await fetchJSON(`https://api.dexscreener.com/latest/dex/tokens/${pos.ca}`);
    const p = d?.pairs?.[0];
    if (!p) { summary.push(`${pos.symbol}: NO DATA`); continue; }

    const mc = p.marketCap || 0;
    const price = parseFloat(p.priceUsd || 0);
    const h1 = p.priceChange?.h1 || 0;
    const buys = p.txns?.h1?.buys || 0;
    const sells = p.txns?.h1?.sells || 0;

    summary.push(`${pos.symbol}: MC:$${mc} price:$${price} h1:${h1}% b/s:${buys}/${sells}`);

    // SL/TP checks
    if (pos.slMC && mc < pos.slMC) alerts.push(`🚨 ${pos.symbol} HIT SL — MC $${mc} < $${pos.slMC}`);
    if (pos.tpMC && mc > pos.tpMC) alerts.push(`🎯 ${pos.symbol} HIT TP — MC $${mc} > $${pos.tpMC}`);
    if (pos.slPrice && price < pos.slPrice) alerts.push(`🚨 ${pos.symbol} HIT SL — $${price} < $${pos.slPrice}`);
    if (pos.tpPrice && price > pos.tpPrice) alerts.push(`🎯 ${pos.symbol} HIT TP — $${price} > $${pos.tpPrice}`);
  }

  // 3. Check DexScreener boosted for new opportunities
  let newOpps = [];
  try {
    const boosts = await fetchJSON('https://api.dexscreener.com/token-boosts/top/v1');
    if (boosts) {
      const solTokens = boosts.filter(t => t.chainId === 'solana').slice(0, 10);
      for (const tok of solTokens.slice(0, 5)) {
        await new Promise(r => setTimeout(r, 300));
        const d = await fetchJSON(`https://api.dexscreener.com/latest/dex/tokens/${tok.tokenAddress}`);
        const p = d?.pairs?.[0];
        if (!p) continue;
        const mc = p.marketCap || 0;
        const h1 = p.priceChange?.h1 || 0;
        const buys = p.txns?.h1?.buys || 0;
        const sells = p.txns?.h1?.sells || 0;
        if (mc >= 1000000 && mc <= 50000000 && h1 > 5 && buys > sells) {
          newOpps.push(`💡 ${p.baseToken.symbol} MC:$${mc} h1:+${h1}% b/s:${buys}/${sells} CA:${tok.tokenAddress}`);
        }
      }
    }
  } catch(e) {}

  // 4. Output
  const hasAlerts = alerts.length > 0 || newOpps.length > 0;

  if (hasAlerts) {
    console.log('ACTION_REQUIRED');
    console.log('---ALERTS---');
    alerts.forEach(a => console.log(a));
    newOpps.forEach(a => console.log(a));
    console.log('---SUMMARY---');
    summary.forEach(s => console.log(s));
  } else {
    console.log('ALL_CLEAR');
    summary.forEach(s => console.log(s));
  }
}

main().catch(e => { console.error('MONITOR ERROR:', e.message); process.exit(1); });
