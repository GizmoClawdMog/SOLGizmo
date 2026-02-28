/**
 * 🦞 WALLET MONITOR — Never lose track of holdings again
 * Checks wallet every 2 min using mainnet-beta (not PublicNode which lies)
 * Logs all holdings, alerts on changes, tracks PnL
 */
import fs from 'fs';

const WALLET = 'FXdMNyRo5CqfG3yRWCcNu163FpnSusdZSYecsB76GAkn';
const RPC = 'https://api.mainnet-beta.solana.com';
const CHECK_INTERVAL = 120_000; // 2 minutes
const STATE_FILE = '/tmp/gizmo-trade/wallet-state.json';
const LOG_FILE = '/tmp/gizmo-trade/wallet-monitor.log';

// Known tokens to ignore (dust/airdrops)
const DUST_THRESHOLD = 0.50; // USD

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(LOG_FILE, line + '\n');
}

async function rpcCall(method, params) {
  const r = await fetch(RPC, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(10000)
  });
  const d = await r.json();
  if (d.error) throw new Error(d.error.message);
  return d.result;
}

async function getSOL() {
  const result = await rpcCall('getBalance', [WALLET]);
  return (result?.value || 0) / 1e9;
}

async function getTokens() {
  const result = await rpcCall('getTokenAccountsByOwner', [
    WALLET,
    { programId: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA' },
    { encoding: 'jsonParsed' }
  ]);
  const accounts = result?.value || [];
  return accounts
    .map(a => {
      const info = a.account.data.parsed.info;
      return {
        mint: info.mint,
        balance: parseFloat(info.tokenAmount.uiAmountString || '0'),
        decimals: info.tokenAmount.decimals
      };
    })
    .filter(t => t.balance > 0);
}

async function getTokenInfo(mint) {
  try {
    const r = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mint}`);
    const d = await r.json();
    const p = d.pairs?.[0];
    if (!p) return { symbol: mint.slice(0, 8), priceUsd: 0, mc: 0 };
    return {
      symbol: p.baseToken.symbol,
      priceUsd: parseFloat(p.priceUsd || 0),
      mc: p.marketCap || 0
    };
  } catch {
    return { symbol: mint.slice(0, 8), priceUsd: 0, mc: 0 };
  }
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { holdings: {}, sol: 0, lastCheck: 0 };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

async function check() {
  try {
    const sol = await getSOL();
    const tokens = await getTokens();
    const prev = loadState();
    
    // SOL change detection
    if (prev.sol > 0) {
      const diff = sol - prev.sol;
      if (Math.abs(diff) > 0.01) {
        log(`💰 SOL: ${sol.toFixed(4)} (${diff > 0 ? '+' : ''}${diff.toFixed(4)} change)`);
      }
    } else {
      log(`💰 SOL: ${sol.toFixed(4)}`);
    }
    
    // Token change detection
    const currentHoldings = {};
    let totalUsd = 0;
    
    for (const token of tokens) {
      const info = await getTokenInfo(token.mint);
      const valueUsd = token.balance * info.priceUsd;
      totalUsd += valueUsd;
      
      currentHoldings[token.mint] = {
        symbol: info.symbol,
        balance: token.balance,
        valueUsd,
        mc: info.mc
      };
      
      // New token detected
      if (!prev.holdings[token.mint]) {
        if (valueUsd >= DUST_THRESHOLD) {
          log(`🆕 NEW HOLDING: ${info.symbol} | ${token.balance.toFixed(2)} tokens | $${valueUsd.toFixed(2)} | MC: ${info.mc}`);
        }
      }
      // Balance changed significantly
      else if (prev.holdings[token.mint]) {
        const prevBal = prev.holdings[token.mint].balance;
        const change = ((token.balance - prevBal) / prevBal * 100);
        if (Math.abs(change) > 5) {
          log(`📊 ${info.symbol}: ${prevBal.toFixed(2)} → ${token.balance.toFixed(2)} (${change > 0 ? '+' : ''}${change.toFixed(1)}%) | $${valueUsd.toFixed(2)}`);
        }
      }
      
      await new Promise(r => setTimeout(r, 250)); // Rate limit DexScreener
    }
    
    // Token disappeared (sold or rugged)
    for (const mint of Object.keys(prev.holdings)) {
      if (!currentHoldings[mint] && prev.holdings[mint].valueUsd >= DUST_THRESHOLD) {
        log(`🚨 SOLD/GONE: ${prev.holdings[mint].symbol} | was $${prev.holdings[mint].valueUsd.toFixed(2)}`);
      }
    }
    
    // Save state
    saveState({ holdings: currentHoldings, sol, lastCheck: Date.now(), totalUsd });
    
    // Periodic full report (every 10 checks = ~20 min)
    const checkCount = (prev.checkCount || 0) + 1;
    if (checkCount % 10 === 0) {
      log(`📋 FULL REPORT: SOL: ${sol.toFixed(4)} | Tokens: $${totalUsd.toFixed(2)} | Holdings: ${Object.keys(currentHoldings).length}`);
      for (const [mint, h] of Object.entries(currentHoldings)) {
        if (h.valueUsd >= DUST_THRESHOLD) {
          log(`   ${h.symbol}: $${h.valueUsd.toFixed(2)} | MC: ${h.mc}`);
        }
      }
    }
    saveState({ holdings: currentHoldings, sol, lastCheck: Date.now(), totalUsd, checkCount });
    
  } catch (e) {
    log(`❌ ERROR: ${e.message}`);
  }
}

log('🦞 WALLET MONITOR STARTED — checking every 2min via mainnet-beta RPC');
log('⚠️ NEVER trusts PublicNode. ALWAYS uses mainnet-beta.');
check();
setInterval(check, CHECK_INTERVAL);
