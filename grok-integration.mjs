/**
 * 🦞 GROK API INTEGRATION - ACTUALLY CHEAP TRADING AI
 * REPLACES EXPENSIVE OPENCLAW CALLS WITH AFFORDABLE GROK
 * FOCUSES ON REAL TRADING NOT FAKE DEMONSTRATIONS
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import https from 'https';
import fs from 'fs';

// REPLACE EXPENSIVE OPENCLAW CALLS WITH GROK API
const GROK_API_KEY = process.env.GROK_API_KEY || 'xai-HXJkJHIuTtQISREC8cep1GkGUIjOYngGe3QatDkXA7LBBGj0LBSb57HYa3MZd0X0oSUrFtNWzsdiYoTz';
const GROK_BASE_URL = 'https://api.x.ai/v1';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const wallet = new PublicKey('FXdMNyRo5CqfG3yRWCcNu163FpnSusdZSYecsB76GAkn');

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

// CHEAP GROK API CALL - REPLACES EXPENSIVE OPENCLAW
async function askGrokForTradingDecision(marketData, tradeHistory = '') {
  const prompt = `${tradeHistory}

CURRENT MARKET DATA:
${marketData}

You are Stripe's ruthless profit-maximizing trading AI. 

RULES:
- Only trade if you can make REAL profit
- No fake trades or demonstrations  
- Framework 8+ ONLY for execution
- Output ONLY valid JSON

Required format:
{"action": "buy|sell|hold", "confidence": 1-10, "amount": 0.5, "reason": "brief explanation"}

NO MARKDOWN, NO EXTRA TEXT.`;

  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      model: 'grok-4-1-fast-reasoning',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 200,
      response_format: { type: 'json_object' }
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
          
          const decision = JSON.parse(response.choices[0].message.content);
          resolve(decision);
        } catch (e) {
          reject(new Error(`Parse error: ${data}`));
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    req.write(postData);
    req.end();
  });
}

// GET REAL MARKET DATA - NO FAKE NUMBERS
async function getRealMarketData() {
  try {
    // Get actual token balances
    const aslanBalance = await getTokenBalance('8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump');
    const greenBalance = await getTokenBalance('41iR3ejFc4zTdn4LJeMhKUTZfQkV4xCahCRYtV1xpump');
    const solBalance = await connection.getBalance(wallet) / LAMPORTS_PER_SOL;

    return {
      timestamp: new Date().toISOString(),
      solBalance: solBalance,
      aslanTokens: aslanBalance.uiAmount,
      greenTokens: greenBalance.uiAmount,
      totalValue: solBalance // TODO: Add token values when we can get prices
    };
  } catch (e) {
    throw new Error(`Market data failed: ${e.message}`);
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

// LOAD REAL TRADE HISTORY - NO FAKE RESULTS
function loadTradeHistory() {
  const historyFile = '/Users/younghogey/.openclaw/workspace/SOLGizmo/real-trades.jsonl';
  
  if (!fs.existsSync(historyFile)) {
    return 'TRADE HISTORY: No previous trades recorded.';
  }

  try {
    const lines = fs.readFileSync(historyFile, 'utf-8')
      .split('\n')
      .filter(line => line.trim())
      .slice(-5); // Last 5 trades only

    if (lines.length === 0) {
      return 'TRADE HISTORY: No previous trades recorded.';
    }

    const trades = lines.map(line => {
      const trade = JSON.parse(line);
      return `${trade.action.toUpperCase()}: ${trade.amount} ${trade.token} -> ${trade.result || 'pending'}`;
    }).join('\n');

    return `RECENT TRADES:\n${trades}`;
  } catch (e) {
    return 'TRADE HISTORY: Error loading history.';
  }
}

// RECORD REAL TRADE - NO FAKE RESULTS
function recordTrade(decision, result = null) {
  const tradeRecord = {
    timestamp: new Date().toISOString(),
    action: decision.action,
    amount: decision.amount,
    token: decision.token || 'unknown',
    confidence: decision.confidence,
    reason: decision.reason,
    result: result,
    cost: 'grok-api' // Track that this used cheap Grok instead of expensive OpenClaw
  };

  const historyFile = '/Users/younghogey/.openclaw/workspace/SOLGizmo/real-trades.jsonl';
  fs.appendFileSync(historyFile, JSON.stringify(tradeRecord) + '\n');
  log(`📊 Trade recorded: ${decision.action} ${decision.amount} (${decision.confidence}/10 confidence)`);
}

// MAIN TRADING LOOP - CHEAP GROK API CALLS
async function cheapAutonomousTradingLoop() {
  log('🦞 STARTING CHEAP AUTONOMOUS TRADING WITH GROK API');
  log('🚨 NO MORE EXPENSIVE OPENCLAW - ACTUALLY AFFORDABLE');

  try {
    // Get real market data
    const marketData = await getRealMarketData();
    const tradeHistory = loadTradeHistory();

    log(`📊 Current Holdings: ${marketData.solBalance.toFixed(4)} SOL, ${marketData.aslanTokens} ASLAN, ${marketData.greenTokens} GREEN`);

    // Ask Grok for decision (CHEAP - ~$0.001 cost)
    const decision = await askGrokForTradingDecision(
      JSON.stringify(marketData, null, 2),
      tradeHistory
    );

    log(`🧠 Grok Decision: ${decision.action.toUpperCase()} (confidence: ${decision.confidence}/10)`);
    log(`💡 Reason: ${decision.reason}`);

    // Record the decision
    recordTrade(decision);

    // TODO: Actually execute the trade here
    // For now, just show what would happen
    if (decision.action !== 'hold' && decision.confidence >= 8) {
      log(`⚡ Would execute: ${decision.action} ${decision.amount} SOL`);
      log(`🔗 This is where we need to add REAL Jupiter/DEX execution`);
    } else {
      log(`⏳ Holding - confidence too low or hold signal`);
    }

    return {
      success: true,
      decision: decision,
      marketData: marketData,
      cost: 'cheap-grok-api'
    };

  } catch (error) {
    log(`❌ Trading loop failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      cost: 'cheap-grok-api'
    };
  }
}

// TEST GROK API CONNECTION
async function testGrokAPI() {
  log('🔍 Testing Grok API connection...');
  
  try {
    const testDecision = await askGrokForTradingDecision(
      'TEST: SOL balance 5.5, no tokens',
      'TEST HISTORY: No previous trades'
    );
    
    log(`✅ Grok API working: ${JSON.stringify(testDecision)}`);
    return true;
  } catch (e) {
    log(`❌ Grok API test failed: ${e.message}`);
    log(`🔑 Check your GROK_API_KEY environment variable`);
    return false;
  }
}

async function main() {
  const action = process.argv[2] || 'test';

  switch (action) {
    case 'test':
      await testGrokAPI();
      break;

    case 'loop':
      const result = await cheapAutonomousTradingLoop();
      console.log('\n🏁 TRADING LOOP RESULT:');
      console.log(JSON.stringify(result, null, 2));
      break;

    case 'continuous':
      log('🔄 Starting continuous trading (Ctrl+C to stop)');
      while (true) {
        await cheapAutonomousTradingLoop();
        log('💤 Waiting 60 seconds before next decision...');
        await new Promise(r => setTimeout(r, 60000)); // 1 minute
      }
      break;

    default:
      console.log('Usage:');
      console.log('  node grok-integration.mjs test        # Test API connection');
      console.log('  node grok-integration.mjs loop        # Single trading decision');
      console.log('  node grok-integration.mjs continuous  # Run continuously');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { askGrokForTradingDecision, cheapAutonomousTradingLoop };