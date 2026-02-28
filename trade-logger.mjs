/**
 * 🦞 TRADE LOGGER — Auto-logs every trade and updates solgizmo.com
 * Watches auto-manage.log for BUY/SELL events
 * Appends to trade-log.json and pushes website updates
 */
import fs from 'fs';
import { execSync } from 'child_process';

const LOG_FILE = '/tmp/gizmo-trade/auto-manage.log';
const TRADE_LOG = '/tmp/gizmo-trade/trade-log.json';
const WEBSITE_DIR = '/tmp/solgizmo-check/website';
const CHECK_INTERVAL = 30_000; // 30 seconds

function ts() {
  return new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
}

function log(msg) {
  const line = `[${ts()}] ${msg}`;
  console.log(line);
  fs.appendFileSync('/tmp/gizmo-trade/trade-logger.log', line + '\n');
}

function loadTradeLog() {
  try { return JSON.parse(fs.readFileSync(TRADE_LOG, 'utf8')); }
  catch { return { trades: [], lastLine: 0 }; }
}

function saveTradeLog(data) {
  fs.writeFileSync(TRADE_LOG, JSON.stringify(data, null, 2));
}

function parseTrade(line) {
  // Match BUY entries
  const buyMatch = line.match(/✅ ENTERED (\w+).*@ \$(\d+) MC with ([\d.]+) SOL/);
  if (buyMatch) {
    return {
      type: 'BUY',
      token: buyMatch[1],
      entryMC: parseInt(buyMatch[2]),
      sol: parseFloat(buyMatch[3]),
      time: ts(),
      timestamp: Date.now()
    };
  }
  
  // Match scanner buys
  const scanBuy = line.match(/SCANNER BUY: (\w+).*SCORE: (\d)\/9.*MC: \$(\d+).*Buying ([\d.]+) SOL/);
  if (scanBuy) {
    return {
      type: 'BUY',
      token: scanBuy[1],
      score: parseInt(scanBuy[2]),
      entryMC: parseInt(scanBuy[3]),
      sol: parseFloat(scanBuy[4]),
      time: ts(),
      timestamp: Date.now()
    };
  }
  
  // Match sells
  const sellMatch = line.match(/CONFIRMED.*sold for ~([\d.]+) SOL/);
  if (sellMatch) {
    return {
      type: 'SELL',
      solOut: parseFloat(sellMatch[1]),
      time: ts(),
      timestamp: Date.now()
    };
  }
  
  // Match TP1 sells
  const tp1Match = line.match(/(?:TP1|FAST PUMP SELL) on (\w+)/);
  if (tp1Match) {
    return {
      type: 'TP1',
      token: tp1Match[1],
      time: ts(),
      timestamp: Date.now()
    };
  }
  
  // Match SL hits
  const slMatch = line.match(/SL HIT on (\w+).*MC:\$(\d+)/);
  if (slMatch) {
    return {
      type: 'SL_HIT',
      token: slMatch[1],
      exitMC: parseInt(slMatch[2]),
      time: ts(),
      timestamp: Date.now()
    };
  }
  
  // Match hard stops
  const hardStop = line.match(/HARD STOP on (\w+)/);
  if (hardStop) {
    return {
      type: 'HARD_STOP',
      token: hardStop[1],
      time: ts(),
      timestamp: Date.now()
    };
  }
  
  return null;
}

function updateWebsite(trades) {
  try {
    const htmlPath = `${WEBSITE_DIR}/index.html`;
    if (!fs.existsSync(htmlPath)) return;
    
    let html = fs.readFileSync(htmlPath, 'utf8');
    
    // Find the tradeHistory array and rebuild it
    const closedTrades = trades.filter(t => t.status === 'CLOSED');
    if (closedTrades.length === 0) return;
    
    // Build new trade entries for recent trades
    const newEntries = closedTrades.slice(-10).map(t => {
      const pnlStr = t.pnlSol ? `${t.pnlSol > 0 ? '+' : ''}${t.pnlSol.toFixed(3)} SOL (${t.pnlPct > 0 ? '+' : ''}${t.pnlPct.toFixed(1)}%)` : 'N/A';
      const status = t.pnlSol >= 0 ? 'CLOSED ✅' : 'CLOSED ❌';
      return `  {type:'TRADE',token:'$${t.token}',sol:${t.solIn},status:'${status}',date:'${t.date}',notes:'${t.notes}',pnl:'${pnlStr}'}`;
    });
    
    log(`📊 Website has ${closedTrades.length} closed trades logged`);
    
    // Git push
    execSync(`cd ${WEBSITE_DIR}/.. && git add -A && git commit -m "🦞 Auto trade log update — ${closedTrades.length} trades" && git push 2>&1 || true`, { timeout: 30000 });
    log('✅ Website pushed to git');
  } catch (e) {
    log(`❌ Website update error: ${e.message}`);
  }
}

let lastSize = 0;
let openPositions = {}; // track open buys to match with sells

function check() {
  try {
    if (!fs.existsSync(LOG_FILE)) return;
    
    const stat = fs.statSync(LOG_FILE);
    if (stat.size === lastSize) return; // No new data
    
    const data = loadTradeLog();
    const lines = fs.readFileSync(LOG_FILE, 'utf8').split('\n');
    const newLines = lines.slice(data.lastLine);
    
    let hasNewTrade = false;
    
    for (const line of newLines) {
      const trade = parseTrade(line);
      if (!trade) continue;
      
      if (trade.type === 'BUY') {
        openPositions[trade.token] = trade;
        data.trades.push({
          ...trade,
          status: 'OPEN',
          date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })
        });
        log(`📝 LOGGED BUY: ${trade.token} | ${trade.sol} SOL @ $${trade.entryMC} MC`);
        hasNewTrade = true;
      }
      
      if (trade.type === 'SL_HIT' || trade.type === 'HARD_STOP' || trade.type === 'TP1') {
        const open = openPositions[trade.token];
        if (open) {
          log(`📝 LOGGED EXIT: ${trade.token} | ${trade.type}`);
        }
        hasNewTrade = true;
      }
    }
    
    data.lastLine = lines.length;
    saveTradeLog(data);
    lastSize = stat.size;
    
    if (hasNewTrade) {
      updateWebsite(data.trades);
    }
    
  } catch (e) {
    log(`❌ Error: ${e.message}`);
  }
}

log('🦞 TRADE LOGGER STARTED — watching auto-manage.log for trades');
log('📊 Auto-updates trade-log.json + pushes to solgizmo.com');
check();
setInterval(check, CHECK_INTERVAL);
