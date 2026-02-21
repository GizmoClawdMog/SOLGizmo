import { Connection, PublicKey } from '@solana/web3.js';
import { DriftClient, Wallet, initialize, PerpMarkets, convertToNumber, PRICE_PRECISION, calculateBidAskPrice } from '@drift-labs/sdk';
import { loadWallet, getConnection } from './src/config.ts';

// Note: using ts-node or direct import won't work for .ts
// Let's just use the SDK directly

const RPC = 'https://mainnet.helius-rpc.com/?api-key=2de73660-14b8-412a-9ff2-8e6989c53266';
const connection = new Connection(RPC, 'confirmed');

const env = 'mainnet-beta';
const sdkConfig = initialize({ env });

// List all perp markets to find BET ones
const allMarkets = PerpMarkets[env] || [];
console.log(`Total perp markets: ${allMarkets.length}`);
console.log('');
for (const m of allMarkets) {
  const isBet = m.symbol?.includes('BET') || m.category?.includes('Prediction');
  if (isBet) {
    console.log(`[${m.marketIndex}] ${m.fullName || m.symbol}`);
    console.log(`  Symbol: ${m.symbol}`);
    console.log(`  Categories: ${m.category?.join(', ') || 'none'}`);
    console.log('');
  }
}

// Also show all symbols
console.log('--- ALL MARKETS ---');
for (const m of allMarkets) {
  console.log(`[${m.marketIndex}] ${m.symbol} - ${m.fullName || ''} (${m.category?.join(',') || ''})`);
}
