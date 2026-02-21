/**
 * 🦞 Gizmo's Drift REST API Trading Bot
 * Bypasses SDK batch RPC requirement by using Drift's REST endpoints
 * for reading markets and the SDK only for signing/sending transactions
 */

import { Connection, Keypair, PublicKey, Transaction, TransactionInstruction } from '@solana/web3.js';
import { DriftClient, Wallet, initialize, PerpMarkets, BulkAccountLoader, 
         PositionDirection, getMarketOrderParams, OrderType, MarketType,
         convertToNumber, PRICE_PRECISION, QUOTE_PRECISION, BASE_PRECISION, BN } from '@drift-labs/sdk';
import fs from 'fs';
import bs58 from 'bs58';

const RPC = 'https://mainnet.helius-rpc.com/?api-key=2de73660-14b8-412a-9ff2-8e6989c53266';
const DLOB_API = 'https://dlob.drift.trade';
const env = 'mainnet-beta';

// Load wallet
const walletData = JSON.parse(fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf8'));
const secretKey = bs58.decode(walletData.secretKey);
const keypair = Keypair.fromSecretKey(secretKey);
const wallet = new Wallet(keypair);
console.log('Wallet:', keypair.publicKey.toBase58());

// ============================================================
// REST API helpers (no batch RPC needed)
// ============================================================

async function getMarketOdds(marketIndex) {
  const res = await fetch(`${DLOB_API}/l2?marketIndex=${marketIndex}&marketType=perp`);
  const data = await res.json();
  const markPrice = data.markPrice / 1e6; // PRICE_PRECISION = 1e6
  const oracle = data.oracle / 1e6;
  return {
    name: data.marketName,
    markPrice,
    oracle,
    yesProb: markPrice,
    noProb: 1 - markPrice,
    bids: data.bids,
    asks: data.asks,
  };
}

async function listBetMarkets() {
  const markets = PerpMarkets[env] || [];
  const betMarkets = markets.filter(m => m.symbol?.includes('BET'));
  
  console.log('\n🎯 DRIFT PREDICTION MARKETS\n');
  for (const m of betMarkets) {
    try {
      const odds = await getMarketOdds(m.marketIndex);
      const yesPercent = (odds.yesProb * 100).toFixed(1);
      console.log(`[${m.marketIndex}] ${odds.name}`);
      console.log(`  YES: ${yesPercent}% | NO: ${(100 - parseFloat(yesPercent)).toFixed(1)}%`);
      console.log(`  Bids: ${odds.bids.length} | Asks: ${odds.asks.length}`);
      console.log('');
    } catch(e) {
      console.log(`[${m.marketIndex}] ${m.symbol} — error fetching: ${e.message}`);
    }
  }
}

async function placeBet(marketIndex, direction, usdcAmount) {
  console.log(`\nPlacing ${direction} bet on market ${marketIndex} for $${usdcAmount} USDC...`);
  
  const connection = new Connection(RPC, 'confirmed');
  initialize({ env });
  
  // Use websocket subscription instead of polling to avoid batch RPC
  const driftClient = new DriftClient({
    connection,
    wallet,
    env,
    accountSubscription: { 
      type: 'websocket',
    },
  });

  try {
    await driftClient.subscribe();
    console.log('Connected to Drift ✅');
    
    // Get user account info
    const user = driftClient.getUser();
    const freeCollateral = convertToNumber(user.getFreeCollateral(), QUOTE_PRECISION);
    console.log(`Free collateral: $${freeCollateral.toFixed(2)} USDC`);
    
    if (usdcAmount > freeCollateral) {
      console.log('❌ Not enough collateral!');
      return;
    }

    // Get current price
    const odds = await getMarketOdds(marketIndex);
    console.log(`Market: ${odds.name} | YES: ${(odds.yesProb * 100).toFixed(1)}%`);
    
    // Calculate base amount (USDC / price = shares)
    const price = direction === 'YES' ? odds.yesProb : odds.noProb;
    const baseAmount = usdcAmount / price;
    
    const orderParams = getMarketOrderParams({
      marketIndex,
      direction: direction === 'YES' ? PositionDirection.LONG : PositionDirection.SHORT,
      baseAssetAmount: new BN(Math.floor(baseAmount * 1e9)), // BASE_PRECISION = 1e9
      marketType: MarketType.PERP,
    });

    const tx = await driftClient.placePerpOrder(orderParams);
    console.log(`✅ Order placed! TX: ${tx}`);
    console.log(`  ${direction} ${odds.name} | $${usdcAmount} USDC | ~${baseAmount.toFixed(2)} shares`);
    
    return tx;
  } catch(e) {
    console.error('Error:', e.message);
  } finally {
    await driftClient.unsubscribe();
  }
}

// ============================================================
// CLI
// ============================================================

const args = process.argv.slice(2);
const command = args[0];

if (command === 'list') {
  initialize({ env });
  await listBetMarkets();
  process.exit(0);
} else if (command === 'bet') {
  const marketIndex = parseInt(args[1]);
  const direction = args[2]?.toUpperCase(); // YES or NO
  const amount = parseFloat(args[3]);
  
  if (!marketIndex || !direction || !amount) {
    console.log('Usage: node drift-rest-trade.mjs bet <marketIndex> <YES|NO> <usdcAmount>');
    console.log('Example: node drift-rest-trade.mjs bet 67 YES 100');
    process.exit(1);
  }
  
  await placeBet(marketIndex, direction, amount);
  process.exit(0);
} else if (command === 'odds') {
  initialize({ env });
  const marketIndex = parseInt(args[1]);
  const odds = await getMarketOdds(marketIndex);
  console.log(JSON.stringify(odds, null, 2));
  process.exit(0);
} else {
  console.log('🦞 Gizmo Drift Prediction Bot');
  console.log('Commands:');
  console.log('  list              — List all BET markets with odds');
  console.log('  odds <index>      — Get odds for a specific market');
  console.log('  bet <index> <YES|NO> <amount> — Place a bet');
  process.exit(0);
}
