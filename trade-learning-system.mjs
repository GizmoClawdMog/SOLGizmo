/**
 * 🦞 TRADE LEARNING SYSTEM - CONTINUOUS IMPROVEMENT
 * ANALYZES EVERY TRADE FOR MAXIMUM GAIN OPTIMIZATION
 * STUDIES PATTERNS, IMPROVES FRAMEWORK, MAXIMIZES POTENTIAL
 */

import fs from 'fs';
import path from 'path';

const TRADES_LOG = '/Users/younghogey/.openclaw/workspace/SOLGizmo/trades.jsonl';
const LEARNING_LOG = '/Users/younghogey/.openclaw/workspace/SOLGizmo/learning.jsonl';
const PERFORMANCE_METRICS = '/Users/younghogey/.openclaw/workspace/SOLGizmo/performance.json';

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

// Ensure learning files exist
function initializeLearningSystem() {
  const files = [TRADES_LOG, LEARNING_LOG];
  files.forEach(file => {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, '');
      log(`✅ Created learning file: ${path.basename(file)}`);
    }
  });
  
  if (!fs.existsSync(PERFORMANCE_METRICS)) {
    const initialMetrics = {
      totalTrades: 0,
      winRate: 0,
      totalPnL: 0,
      bestTrade: null,
      worstTrade: null,
      avgHoldTime: 0,
      frameworkAccuracy: {},
      learnings: [],
      lastUpdated: new Date().toISOString()
    };
    fs.writeFileSync(PERFORMANCE_METRICS, JSON.stringify(initialMetrics, null, 2));
    log('✅ Created performance metrics file');
  }
}

function logTrade(tradeData) {
  const tradeEntry = {
    timestamp: new Date().toISOString(),
    ...tradeData
  };
  
  fs.appendFileSync(TRADES_LOG, JSON.stringify(tradeEntry) + '\n');
  log('📊 Trade logged for analysis');
  return tradeEntry;
}

function logLearning(insight) {
  const learningEntry = {
    timestamp: new Date().toISOString(),
    type: 'insight',
    ...insight
  };
  
  fs.appendFileSync(LEARNING_LOG, JSON.stringify(learningEntry) + '\n');
  log(`🧠 Learning captured: ${insight.title}`);
}

function analyzeTradePerformance() {
  log('🔍 ANALYZING TRADE PERFORMANCE FOR IMPROVEMENT...');
  
  if (!fs.existsSync(TRADES_LOG)) {
    log('⚠️ No trades to analyze yet');
    return { noData: true };
  }
  
  const trades = fs.readFileSync(TRADES_LOG, 'utf-8')
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
    
  if (trades.length === 0) {
    log('⚠️ No valid trades found');
    return { noData: true };
  }
  
  // Performance Analysis
  const analysis = {
    totalTrades: trades.length,
    winningTrades: trades.filter(t => t.pnl > 0).length,
    losingTrades: trades.filter(t => t.pnl < 0).length,
    breakEvenTrades: trades.filter(t => t.pnl === 0).length,
    totalPnL: trades.reduce((sum, t) => sum + (t.pnl || 0), 0),
    avgPnL: 0,
    winRate: 0,
    bestTrade: null,
    worstTrade: null,
    frameworkScores: {},
    tokenPerformance: {},
    timePatterns: {},
    improvements: []
  };
  
  analysis.avgPnL = analysis.totalPnL / analysis.totalTrades;
  analysis.winRate = (analysis.winningTrades / analysis.totalTrades) * 100;
  
  // Find best and worst trades
  analysis.bestTrade = trades.reduce((best, trade) => 
    (trade.pnl || 0) > (best?.pnl || -Infinity) ? trade : best, null);
  analysis.worstTrade = trades.reduce((worst, trade) => 
    (trade.pnl || 0) < (worst?.pnl || Infinity) ? trade : worst, null);
  
  // Framework score analysis
  trades.forEach(trade => {
    if (trade.frameworkScore) {
      if (!analysis.frameworkScores[trade.frameworkScore]) {
        analysis.frameworkScores[trade.frameworkScore] = { count: 0, avgPnL: 0, totalPnL: 0 };
      }
      analysis.frameworkScores[trade.frameworkScore].count++;
      analysis.frameworkScores[trade.frameworkScore].totalPnL += trade.pnl || 0;
      analysis.frameworkScores[trade.frameworkScore].avgPnL = 
        analysis.frameworkScores[trade.frameworkScore].totalPnL / analysis.frameworkScores[trade.frameworkScore].count;
    }
  });
  
  // Token performance analysis
  trades.forEach(trade => {
    if (trade.token) {
      if (!analysis.tokenPerformance[trade.token]) {
        analysis.tokenPerformance[trade.token] = { count: 0, avgPnL: 0, totalPnL: 0, winRate: 0 };
      }
      analysis.tokenPerformance[trade.token].count++;
      analysis.tokenPerformance[trade.token].totalPnL += trade.pnl || 0;
      analysis.tokenPerformance[trade.token].avgPnL = 
        analysis.tokenPerformance[trade.token].totalPnL / analysis.tokenPerformance[trade.token].count;
    }
  });
  
  // Generate improvement suggestions
  if (analysis.winRate < 60) {
    analysis.improvements.push('🚨 Win rate below 60% - tighten framework criteria');
  }
  
  if (analysis.avgPnL < 0) {
    analysis.improvements.push('🚨 Average PnL negative - review position sizing and exit strategy');
  }
  
  // Framework score insights
  const bestFrameworkScore = Object.entries(analysis.frameworkScores)
    .sort(([,a], [,b]) => b.avgPnL - a.avgPnL)[0];
  
  if (bestFrameworkScore) {
    analysis.improvements.push(`✅ Framework ${bestFrameworkScore[0]}/9 performs best (${bestFrameworkScore[1].avgPnL.toFixed(4)} avg PnL)`);
  }
  
  log(`📊 PERFORMANCE ANALYSIS COMPLETE:`);
  log(`  Total Trades: ${analysis.totalTrades}`);
  log(`  Win Rate: ${analysis.winRate.toFixed(1)}%`);
  log(`  Total PnL: ${analysis.totalPnL.toFixed(4)} SOL`);
  log(`  Avg PnL: ${analysis.avgPnL.toFixed(4)} SOL`);
  log(`  Best Trade: ${analysis.bestTrade?.pnl?.toFixed(4)} SOL`);
  log(`  Worst Trade: ${analysis.worstTrade?.pnl?.toFixed(4)} SOL`);
  
  return analysis;
}

function generateLearnings(analysis) {
  log('🧠 GENERATING AUTONOMOUS LEARNINGS...');
  
  const learnings = [];
  
  // Performance-based learnings
  if (analysis.winRate > 70) {
    learnings.push({
      title: 'High Win Rate Achievement',
      insight: `Achieved ${analysis.winRate.toFixed(1)}% win rate - current strategy working well`,
      action: 'Continue current approach, consider increasing position sizes',
      confidence: 'high'
    });
  } else if (analysis.winRate < 50) {
    learnings.push({
      title: 'Low Win Rate Warning',
      insight: `Win rate at ${analysis.winRate.toFixed(1)}% - strategy needs improvement`,
      action: 'Raise framework threshold, improve exit timing, reduce position sizes',
      confidence: 'high'
    });
  }
  
  // Framework learnings
  const frameworkEntries = Object.entries(analysis.frameworkScores || {});
  if (frameworkEntries.length > 0) {
    const bestScore = frameworkEntries.sort(([,a], [,b]) => b.avgPnL - a.avgPnL)[0];
    learnings.push({
      title: 'Optimal Framework Score',
      insight: `Framework score ${bestScore[0]}/9 shows best performance (${bestScore[1].avgPnL.toFixed(4)} avg PnL)`,
      action: `Focus on ${bestScore[0]}/9+ signals, avoid lower scores`,
      confidence: 'medium'
    });
  }
  
  // Token performance learnings
  const tokenEntries = Object.entries(analysis.tokenPerformance || {});
  if (tokenEntries.length > 0) {
    const bestToken = tokenEntries.sort(([,a], [,b]) => b.avgPnL - a.avgPnL)[0];
    learnings.push({
      title: 'Top Performing Token',
      insight: `${bestToken[0]} shows best performance (${bestToken[1].avgPnL.toFixed(4)} avg PnL)`,
      action: `Increase allocation to ${bestToken[0]} type tokens`,
      confidence: 'medium'
    });
  }
  
  // Log all learnings
  learnings.forEach(learning => {
    logLearning(learning);
    log(`💡 ${learning.title}: ${learning.insight}`);
  });
  
  return learnings;
}

function updatePerformanceMetrics(analysis) {
  const metrics = JSON.parse(fs.readFileSync(PERFORMANCE_METRICS, 'utf-8'));
  
  // Update metrics with latest analysis
  metrics.totalTrades = analysis.totalTrades;
  metrics.winRate = analysis.winRate;
  metrics.totalPnL = analysis.totalPnL;
  metrics.avgPnL = analysis.avgPnL;
  metrics.bestTrade = analysis.bestTrade;
  metrics.worstTrade = analysis.worstTrade;
  metrics.frameworkAccuracy = analysis.frameworkScores;
  metrics.tokenPerformance = analysis.tokenPerformance;
  metrics.improvements = analysis.improvements;
  metrics.lastUpdated = new Date().toISOString();
  
  fs.writeFileSync(PERFORMANCE_METRICS, JSON.stringify(metrics, null, 2));
  log('✅ Performance metrics updated');
}

async function runLearningCycle() {
  log('🧠 STARTING AUTONOMOUS LEARNING CYCLE');
  
  initializeLearningSystem();
  
  const analysis = analyzeTradePerformance();
  if (analysis.noData) {
    log('📊 No trade data available for learning yet');
    return { status: 'no_data' };
  }
  
  const learnings = generateLearnings(analysis);
  updatePerformanceMetrics(analysis);
  
  // Generate optimization recommendations
  const recommendations = {
    frameworkAdjustments: [],
    positionSizing: [],
    riskManagement: [],
    tokenSelection: []
  };
  
  if (analysis.winRate < 60) {
    recommendations.frameworkAdjustments.push('Increase minimum framework score to 8.5/9');
    recommendations.riskManagement.push('Implement tighter stop losses');
  }
  
  if (analysis.avgPnL < 0.01) {
    recommendations.positionSizing.push('Reduce initial position sizes by 20%');
  }
  
  log('🏆 LEARNING CYCLE COMPLETE');
  
  return {
    status: 'complete',
    analysis: analysis,
    learnings: learnings,
    recommendations: recommendations,
    nextActions: [
      'Continue monitoring trade performance',
      'Apply learnings to future trades',
      'Adjust framework based on data',
      'Optimize position sizing strategy'
    ]
  };
}

// Example: Log a sample trade for testing
function logSampleTrade() {
  const sampleTrade = {
    token: 'ASLAN',
    action: 'sell',
    amount: 3334.096,
    pnl: 0.002, // Small positive PnL
    frameworkScore: 8,
    entryPrice: 0.000001,
    exitPrice: 0.0000012,
    holdTime: 3600, // 1 hour in seconds
    method: 'phantom_link',
    success: true
  };
  
  logTrade(sampleTrade);
  log('📝 Sample trade logged for testing');
}

async function main() {
  const action = process.argv[2] || 'learn';
  
  switch (action) {
    case 'learn':
      const result = await runLearningCycle();
      console.log('\n🧠 LEARNING SYSTEM RESULT:');
      console.log(JSON.stringify(result, null, 2));
      break;
      
    case 'sample':
      logSampleTrade();
      break;
      
    case 'analyze':
      const analysis = analyzeTradePerformance();
      console.log('\n📊 TRADE ANALYSIS:');
      console.log(JSON.stringify(analysis, null, 2));
      break;
      
    default:
      console.log('Usage: node trade-learning-system.mjs [learn|sample|analyze]');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { logTrade, runLearningCycle, analyzeTradePerformance };