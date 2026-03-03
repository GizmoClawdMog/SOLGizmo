/**
 * 🦞 AUTONOMOUS EVOLVED - SELF-IMPROVING TRADING SYSTEM
 * LEARNS FROM EVERY TRADE, MAXIMIZES GAINS, STUDIES PATTERNS
 * CONTINUOUSLY OPTIMIZES FRAMEWORK AND STRATEGY
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { execSync } from 'child_process';
import fs from 'fs';
import { logTrade, runLearningCycle } from './trade-learning-system.mjs';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const wallet = new PublicKey('FXdMNyRo5CqfG3yRWCcNu163FpnSusdZSYecsB76GAkn');

// Enhanced configuration that adapts based on learnings
const ADAPTIVE_CONFIG_FILE = '/Users/younghogey/.openclaw/workspace/SOLGizmo/adaptive-config.json';

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

function getAdaptiveConfig() {
  if (fs.existsSync(ADAPTIVE_CONFIG_FILE)) {
    return JSON.parse(fs.readFileSync(ADAPTIVE_CONFIG_FILE, 'utf-8'));
  }
  
  // Default configuration that evolves
  const defaultConfig = {
    framework: {
      minimumScore: 8.0,
      requiredBoosts: ['DEX-BOOST'],
      adaptiveThreshold: true
    },
    positioning: {
      initialSize: 0.4, // SOL
      maxSize: 1.0,
      scalingFactor: 1.0,
      riskAdjustment: 1.0
    },
    performance: {
      targetWinRate: 70,
      targetAvgPnL: 0.01,
      adaptivePositioning: true
    },
    learnings: {
      lastLearningCycle: null,
      totalTrades: 0,
      bestFrameworkScore: 8,
      bestTokenType: null,
      confidence: 'medium'
    },
    lastUpdated: new Date().toISOString()
  };
  
  fs.writeFileSync(ADAPTIVE_CONFIG_FILE, JSON.stringify(defaultConfig, null, 2));
  log('✅ Created adaptive configuration');
  return defaultConfig;
}

function updateAdaptiveConfig(learnings, performance) {
  const config = getAdaptiveConfig();
  
  // Adapt framework threshold based on performance
  if (performance.winRate < config.performance.targetWinRate) {
    config.framework.minimumScore = Math.min(config.framework.minimumScore + 0.1, 9.0);
    log(`📈 Raised framework threshold to ${config.framework.minimumScore} (low win rate)`);
  } else if (performance.winRate > 80) {
    config.framework.minimumScore = Math.max(config.framework.minimumScore - 0.1, 7.5);
    log(`📉 Lowered framework threshold to ${config.framework.minimumScore} (high win rate)`);
  }
  
  // Adapt position sizing based on performance
  if (performance.avgPnL > config.performance.targetAvgPnL && performance.winRate > 60) {
    config.positioning.scalingFactor = Math.min(config.positioning.scalingFactor * 1.1, 2.0);
    log(`📈 Increased position scaling to ${config.positioning.scalingFactor.toFixed(2)} (good performance)`);
  } else if (performance.avgPnL < 0 || performance.winRate < 50) {
    config.positioning.scalingFactor = Math.max(config.positioning.scalingFactor * 0.9, 0.5);
    log(`📉 Decreased position scaling to ${config.positioning.scalingFactor.toFixed(2)} (poor performance)`);
  }
  
  // Update from learnings
  learnings.forEach(learning => {
    if (learning.title === 'Optimal Framework Score') {
      const scoreMatch = learning.insight.match(/Framework score (\d+)/);
      if (scoreMatch) {
        config.learnings.bestFrameworkScore = parseInt(scoreMatch[1]);
      }
    }
    
    if (learning.title === 'Top Performing Token') {
      const tokenMatch = learning.insight.match(/^(\w+) shows best performance/);
      if (tokenMatch) {
        config.learnings.bestTokenType = tokenMatch[1];
      }
    }
  });
  
  config.learnings.lastLearningCycle = new Date().toISOString();
  config.learnings.totalTrades = performance.totalTrades;
  config.lastUpdated = new Date().toISOString();
  
  fs.writeFileSync(ADAPTIVE_CONFIG_FILE, JSON.stringify(config, null, 2));
  log('🧠 Adaptive configuration updated based on learnings');
  
  return config;
}

async function getTokenBalance(tokenMint) {
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
}

async function getSOLBalance() {
  const balance = await connection.getBalance(wallet);
  return balance / LAMPORTS_PER_SOL;
}

function calculateOptimalPositionSize(tokenInfo, frameworkScore, config) {
  let baseSize = config.positioning.initialSize;
  
  // Adjust based on framework score
  const scoreMultiplier = (frameworkScore / 9) * 1.2; // Higher score = bigger position
  
  // Apply scaling factor from learnings
  const scalingFactor = config.positioning.scalingFactor;
  
  // Apply risk adjustment
  const riskAdjustment = config.positioning.riskAdjustment;
  
  const optimalSize = baseSize * scoreMultiplier * scalingFactor * riskAdjustment;
  
  // Cap at max size
  return Math.min(optimalSize, config.positioning.maxSize);
}

function generateEvolutionaryPhantomLink(inputToken, outputToken, amount, amountUI) {
  const phantomAmount = amount.toString();
  const link = `https://phantom.app/ul/v1/browse/swap?inputToken=${inputToken}&outputToken=${outputToken}&amount=${phantomAmount}`;
  
  log(`🔗 Generated evolutionary Phantom link for ${amountUI.toLocaleString()}`);
  return link;
}

async function evolutionaryTweetAnalysis(tradeData, config, predictions) {
  const tweet = `🧠 AUTONOMOUS EVOLUTION - TRADE ANALYSIS

🎯 Token: ${tradeData.token || 'Unknown'}
📊 Framework Score: ${tradeData.frameworkScore}/9
💰 Position: ${tradeData.positionSOL} SOL (${(config.positioning.scalingFactor * 100).toFixed(0)}% scaling)
📈 Confidence: ${config.learnings.confidence.toUpperCase()}

🤖 LEARNING SYSTEM:
• Total Trades Analyzed: ${config.learnings.totalTrades}
• Optimal Score: ${config.learnings.bestFrameworkScore}/9
• Adaptive Threshold: ${config.framework.minimumScore}
• Best Token Type: ${config.learnings.bestTokenType || 'TBD'}

🚀 PREDICTIONS:
• Expected PnL: ${predictions.expectedPnL || 'TBD'}
• Success Probability: ${predictions.successProbability || 'TBD'}%
• Hold Time Estimate: ${predictions.holdTime || 'TBD'}

🦞 EVOLVING AUTONOMY - MAXIMIZING GAINS`;

  try {
    execSync(`cd /Users/younghogey/.openclaw/workspace/SOLGizmo && node tweet.mjs "${tweet.replace(/"/g, '\\"')}"`, {
      stdio: 'inherit'
    });
    log('📢 Posted evolutionary analysis tweet');
  } catch (e) {
    log(`⚠️ Tweet failed: ${e.message}`);
  }
}

async function AUTONOMOUS_EVOLVED_EXECUTION(signal) {
  log(`🦞 AUTONOMOUS EVOLVED SYSTEM - SIGNAL: ${signal.token}`);
  log(`🧠 SELF-IMPROVING EXECUTION WITH CONTINUOUS LEARNING`);
  
  // Run learning cycle to get latest insights
  const learningResult = await runLearningCycle();
  let config = getAdaptiveConfig();
  
  if (learningResult.status === 'complete') {
    config = updateAdaptiveConfig(learningResult.learnings, learningResult.analysis);
    log('🧠 Configuration evolved based on trade analysis');
  }
  
  // Check if signal meets evolved criteria
  const meetsThreshold = signal.score >= config.framework.minimumScore;
  if (!meetsThreshold) {
    log(`⚠️ Signal ${signal.score}/9 below evolved threshold ${config.framework.minimumScore}`);
    return { 
      success: false, 
      reason: 'Below adaptive threshold',
      evolvedThreshold: config.framework.minimumScore,
      signal: signal
    };
  }
  
  // Get current balances
  const solBalance = await getSOLBalance();
  
  // Calculate optimal position size using evolved algorithm
  const optimalSize = calculateOptimalPositionSize(signal, signal.score, config);
  
  log(`📊 EVOLVED ANALYSIS:`);
  log(`  Signal Score: ${signal.score}/9`);
  log(`  Evolved Threshold: ${config.framework.minimumScore}`);
  log(`  Scaling Factor: ${config.positioning.scalingFactor.toFixed(2)}x`);
  log(`  Current SOL: ${solBalance.toFixed(6)}`);
  log(`  Optimal Position: ${optimalSize.toFixed(3)} SOL`);
  log(`  Best Token Type: ${config.learnings.bestTokenType || 'Learning...'}`);
  
  // Generate execution link
  const lamports = Math.floor(optimalSize * LAMPORTS_PER_SOL);
  const solMint = 'So11111111111111111111111111111111111111112';
  const phantomLink = generateEvolutionaryPhantomLink(solMint, signal.mint || 'UNKNOWN_MINT', lamports, optimalSize);
  
  // Generate predictions based on historical data
  const predictions = {
    expectedPnL: learningResult.analysis?.avgPnL?.toFixed(4) || 'Learning...',
    successProbability: learningResult.analysis?.winRate?.toFixed(1) || 'Learning...',
    holdTime: '1-4 hours (optimizing...)'
  };
  
  // Prepare trade data for logging
  const tradeData = {
    token: signal.token,
    action: 'buy',
    amount: optimalSize,
    positionSOL: optimalSize,
    frameworkScore: signal.score,
    method: 'evolutionary_phantom',
    adaptiveThreshold: config.framework.minimumScore,
    scalingFactor: config.positioning.scalingFactor,
    predictedPnL: predictions.expectedPnL,
    confidence: config.learnings.confidence
  };
  
  // Post evolutionary analysis tweet
  await evolutionaryTweetAnalysis(tradeData, config, predictions);
  
  // Log trade for future learning
  logTrade({
    ...tradeData,
    timestamp: new Date().toISOString(),
    phantomLink: phantomLink,
    status: 'pending_execution'
  });
  
  return {
    success: true,
    method: 'Autonomous Evolved System',
    phantomLink: phantomLink,
    optimalPosition: optimalSize,
    signal: signal,
    config: config,
    predictions: predictions,
    tradeData: tradeData,
    evolution: {
      adaptiveThreshold: config.framework.minimumScore,
      scalingFactor: config.positioning.scalingFactor,
      totalTradesLearned: config.learnings.totalTrades,
      bestFrameworkScore: config.learnings.bestFrameworkScore,
      confidence: config.learnings.confidence
    }
  };
}

async function main() {
  const tokenName = process.argv[2] || 'IRRAWADDY';
  const score = process.argv[3] ? parseFloat(process.argv[3]) : 8.5;
  const mint = process.argv[4] || 'UNKNOWN_MINT';

  log('🦞 AUTONOMOUS EVOLVED SYSTEM - SELF-IMPROVING TRADER');
  log('🧠 LEARNS FROM EVERY TRADE - MAXIMIZES GAINS - STUDIES PATTERNS');
  
  const signal = {
    token: tokenName,
    score: score,
    mint: mint,
    boost: 'DEX-BOOST',
    timestamp: new Date().toISOString()
  };
  
  try {
    const result = await AUTONOMOUS_EVOLVED_EXECUTION(signal);
    
    console.log('\n🧠 EVOLVED EXECUTION RESULT:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success) {
      console.log('\n🎉 EVOLVED EXECUTION SUMMARY:');
      console.log(`✅ Method: ${result.method}`);
      console.log(`✅ Position: ${result.optimalPosition.toFixed(3)} SOL`);
      console.log(`✅ Framework Score: ${result.signal.score}/9`);
      console.log(`✅ Adaptive Threshold: ${result.evolution.adaptiveThreshold}`);
      console.log(`✅ Scaling Factor: ${result.evolution.scalingFactor.toFixed(2)}x`);
      console.log(`✅ Learned From: ${result.evolution.totalTradesLearned} trades`);
      console.log(`🔗 Execution Link: ${result.phantomLink}`);
      
      console.log('\n🚀 EVOLUTIONARY ADVANTAGES:');
      console.log('  • Learns from every trade execution');
      console.log('  • Adapts framework threshold automatically');
      console.log('  • Optimizes position sizing based on performance');
      console.log('  • Predicts outcomes using historical data');
      console.log('  • Maximizes gains through continuous improvement');
      console.log('  • Studies patterns and evolves strategy');
      
    } else {
      console.log(`⚠️ Signal filtered by evolved criteria: ${result.reason}`);
    }
    
  } catch (e) {
    log(`💥 Evolved execution failed: ${e.message}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { AUTONOMOUS_EVOLVED_EXECUTION };