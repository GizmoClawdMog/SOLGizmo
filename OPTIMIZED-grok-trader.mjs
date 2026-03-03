/**
 * 🦞 OPTIMIZED GROK TRADER - MAX PERFORMANCE, MIN COST
 * APPLYING ALL THE OPTIMIZATION ADVICE FOR REAL PROFIT
 */

import https from 'https';
import fs from 'fs';
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const GROK_API_KEY = 'xai-HXJkJHIuTtQISREC8cep1GkGUIjOYngGe3QatDkXA7LBBGj0LBSb57HYa3MZd0X0oSUrFtNWzsdiYoTz';
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const wallet = new PublicKey('FXdMNyRo5CqfG3yRWCcNu163FpnSusdZSYecsB76GAkn');

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

// OPTIMIZED GROK API CALL - MINIMAL TOKENS, MAX SPEED
async function getOptimizedTradeDecision(marketData, tradeHistory = "") {
  const systemPrompt = `You are Stripe the menace – chaotic profit-maximizing Solana trader.
Priorities: Make money aggressively. Be brutally honest.
Output ONLY valid JSON. No explanations, disclaimers, or extra text outside JSON.`;

  const userPrompt = `Trade history (last few): ${tradeHistory.trim() || "No history yet."}

Current market: ${marketData}

Decide: buy, sell, hold. Output ONLY this JSON structure:
{
  "action": "buy" | "sell" | "hold",
  "amount_percent": 0-100,
  "reason": "short one-sentence reason"
}`;

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'grok-4-1-fast-reasoning',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      max_tokens: 150, // Cap output to save tokens
      top_p: 0.9
    });

    const req = https.request({
      hostname: 'api.x.ai',
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROK_API_KEY}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const response = JSON.parse(data);
          
          if (response.error) {
            reject(new Error(response.error.message));
            return;
          }

          // Log token usage for monitoring
          if (response.usage) {
            log(`💰 Tokens used: ${response.usage.total_tokens} (Input: ${response.usage.prompt_tokens}, Output: ${response.usage.completion_tokens})`);
            if (response.usage.cost_in_usd_ticks) {
              const costUSD = response.usage.cost_in_usd_ticks / 1000000;
              log(`💵 Cost: $${costUSD.toFixed(6)}`);
            }
          }
          
          const content = response.choices[0].message.content.trim();
          const decision = JSON.parse(content);
          resolve(decision);
          
        } catch (e) {
          log(`❌ JSON parse error - holding: ${e.message}`);
          resolve({ action: 'hold', amount_percent: 0, reason: 'parse error' });
        }
      });
    });

    req.on('error', (e) => {
      log(`❌ Grok API error - holding: ${e.message}`);
      resolve({ action: 'hold', amount_percent: 0, reason: `api error: ${e.message}` });
    });
    
    req.on('timeout', () => {
      log(`❌ Grok API timeout - holding`);
      resolve({ action: 'hold', amount_percent: 0, reason: 'api timeout' });
    });
    
    req.write(postData);
    req.end();
  });
}

// OPTIMIZED MARKET DATA - MINIMAL TOKENS, MAX SIGNAL
async function getOptimizedMarketData() {
  try {
    // Get balances efficiently
    const [solBalance, aslanBalance, greenBalance] = await Promise.all([
      connection.getBalance(wallet).then(b => b / LAMPORTS_PER_SOL),
      getTokenBalance('8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump'),
      getTokenBalance('41iR3ejFc4zTdn4LJeMhKUTZfQkV4xCahCRYtV1xpump')
    ]);

    // Compact format to save tokens
    return `SOL: ${solBalance.toFixed(3)} | ASLAN: ${Math.floor(aslanBalance.uiAmount)} | GREEN: ${Math.floor(greenBalance.uiAmount)} | Time: ${new Date().toLocaleTimeString()}`;
    
  } catch (e) {
    return `SOL: unknown | ASLAN: unknown | GREEN: unknown | Error: ${e.message.substring(0,50)}`;
  }
}

async function getTokenBalance(tokenMint) {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      wallet,
      { mint: new PublicKey(tokenMint) }
    );

    if (!tokenAccounts.value.length) {
      return { amount: 0n, decimals: 6, uiAmount: 0 };
    }

    const info = tokenAccounts.value[0].account.data.parsed.info;
    return {
      amount: BigInt(info.tokenAmount.amount),
      decimals: info.tokenAmount.decimals,
      uiAmount: info.tokenAmount.uiAmount || 0
    };
  } catch (e) {
    return { amount: 0n, decimals: 6, uiAmount: 0 };
  }
}

// OPTIMIZED TRADE HISTORY - LAST 5 TRADES ONLY
function getOptimizedTradeHistory() {
  const historyFile = '/Users/younghogey/.openclaw/workspace/SOLGizmo/real-trades.jsonl';
  
  if (!fs.existsSync(historyFile)) {
    return 'No history yet.';
  }

  try {
    const lines = fs.readFileSync(historyFile, 'utf-8')
      .split('\n')
      .filter(line => line.trim())
      .slice(-5); // Last 5 trades only

    if (lines.length === 0) {
      return 'No history yet.';
    }

    // Compact format to save tokens
    const trades = lines.map(line => {
      const trade = JSON.parse(line);
      const time = new Date(trade.timestamp).toLocaleTimeString();
      return `${time}: ${trade.action.toUpperCase()} ${trade.amount} → ${trade.result || 'pending'}`;
    }).join(' | ');

    return trades;
  } catch (e) {
    return 'History error.';
  }
}

// RECORD TRADE - PERSISTENT LEARNING
function recordOptimizedTrade(decision, result = null) {
  const tradeRecord = {
    timestamp: new Date().toISOString(),
    action: decision.action,
    amount_percent: decision.amount_percent,
    reason: decision.reason,
    result: result,
    cost: 'grok-optimized'
  };

  const historyFile = '/Users/younghogey/.openclaw/workspace/SOLGizmo/real-trades.jsonl';
  fs.appendFileSync(historyFile, JSON.stringify(tradeRecord) + '\n');
  log(`📊 Trade logged: ${decision.action.toUpperCase()} ${decision.amount_percent}% (${decision.reason})`);
}

// GENERATE EXECUTION LINK
function generateExecutionLink(decision, currentBalances) {
  if (decision.action === 'hold') return null;
  
  const baseURL = 'https://phantom.app/ul/v1/browse/swap';
  let inputToken, outputToken, amount;
  
  if (decision.action === 'sell' && currentBalances.aslanTokens > 0) {
    // Sell ASLAN for SOL
    inputToken = '8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump'; // ASLAN
    outputToken = 'So11111111111111111111111111111111111111112'; // SOL
    amount = Math.floor(currentBalances.aslanTokens * (decision.amount_percent / 100));
    
  } else if (decision.action === 'buy' && currentBalances.solBalance > 0.1) {
    // Buy ASLAN with SOL
    inputToken = 'So11111111111111111111111111111111111111112'; // SOL
    outputToken = '8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump'; // ASLAN
    amount = Math.floor(currentBalances.solBalance * (decision.amount_percent / 100) * LAMPORTS_PER_SOL);
    
  } else {
    return null;
  }
  
  return `${baseURL}?inputToken=${inputToken}&outputToken=${outputToken}&amount=${amount}`;
}

// OPTIMIZED MAIN LOOP - 45-60S INTERVALS
async function optimizedTradingLoop() {
  log('🚀 STARTING OPTIMIZED GROK TRADING LOOP');
  log('💰 Cost-optimized: ~$0.001 per decision');
  log('⏱️ Interval: 45-60s to maximize free credits');
  
  try {
    // Get market data (optimized for minimal tokens)
    const marketData = await getOptimizedMarketData();
    const tradeHistory = getOptimizedTradeHistory();
    
    log(`📊 Market: ${marketData}`);
    
    // Get Grok decision (optimized call)
    const decision = await getOptimizedTradeDecision(marketData, tradeHistory);
    
    log(`🧠 Grok Decision: ${decision.action.toUpperCase()} ${decision.amount_percent}%`);
    log(`💡 Reason: ${decision.reason}`);
    
    // Record for learning
    recordOptimizedTrade(decision);
    
    // Generate execution if needed
    if (decision.action !== 'hold') {
      const balances = {
        solBalance: parseFloat(marketData.split('SOL: ')[1]?.split(' |')[0] || '0'),
        aslanTokens: parseFloat(marketData.split('ASLAN: ')[1]?.split(' |')[0] || '0')
      };
      
      const executionLink = generateExecutionLink(decision, balances);
      
      if (executionLink) {
        log('');
        log(`🔗 EXECUTION LINK:`);
        log(executionLink);
        log('');
        log(`⚡ Action: ${decision.action.toUpperCase()} ${decision.amount_percent}%`);
        log(`💰 Reason: ${decision.reason}`);
      }
    }
    
    return {
      success: true,
      decision: decision,
      marketData: marketData,
      cost: 'grok-optimized'
    };
    
  } catch (error) {
    log(`❌ Trading loop error: ${error.message}`);
    return {
      success: false,
      error: error.message,
      cost: 'grok-optimized'
    };
  }
}

// CONTINUOUS LOOP WITH OPTIMIZATION
async function runContinuousOptimized() {
  log('🔄 STARTING CONTINUOUS OPTIMIZED TRADING');
  log('💰 Free credits: $25 signup + $150/month recurring');
  log('🎯 Target: 1000-2000 calls/month = thousands of trades covered');
  
  let cycleCount = 0;
  
  while (true) {
    cycleCount++;
    log(`\n🔄 CYCLE ${cycleCount}`);
    
    const result = await optimizedTradingLoop();
    
    if (!result.success) {
      log(`⚠️ Cycle ${cycleCount} failed, continuing...`);
    }
    
    // Optimized interval: 45-90s to maximize credits
    const interval = 45 + Math.random() * 45; // 45-90s random
    log(`💤 Waiting ${Math.floor(interval)}s until next cycle...`);
    
    await new Promise(r => setTimeout(r, interval * 1000));
  }
}

async function main() {
  const action = process.argv[2] || 'single';

  switch (action) {
    case 'single':
      log('🧪 SINGLE OPTIMIZED DECISION TEST');
      const result = await optimizedTradingLoop();
      console.log('\n🏁 OPTIMIZED RESULT:');
      console.log(JSON.stringify(result, null, 2));
      break;

    case 'continuous':
      await runContinuousOptimized();
      break;

    default:
      console.log('Usage:');
      console.log('  node OPTIMIZED-grok-trader.mjs single      # Single decision test');
      console.log('  node OPTIMIZED-grok-trader.mjs continuous  # Continuous trading');
      console.log('');
      console.log('🚀 Optimized for cost and performance with Grok API');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { getOptimizedTradeDecision, optimizedTradingLoop };