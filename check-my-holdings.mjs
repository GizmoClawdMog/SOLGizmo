/**
 * 🦞 Check Gizmo's current token holdings
 */
import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

// Load wallet
const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const walletPubkey = new PublicKey('FXdMNyRo5CqfG3yRWCcNu163FpnSusdZSYecsB76GAkn');

// Connection
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Known token addresses to filter
const KEEP_TOKENS = [
  '8HGer4vRWZMu5MUYU7ACPb4uanKgBewaXJZscLagpump', // $GIZMO
  'HB1bqSLDmQunAWQZJvSGA9NsBdEe1NczA6n4sRuFpump', // MINDLESS
  // Add FALCON and GOOSE CAs when we identify them
];

async function checkHoldings() {
  console.log('🦞 Checking Gizmo wallet holdings...');
  console.log(`📡 Wallet: ${walletPubkey.toString()}`);
  
  try {
    // Get all token accounts
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') }
    );
    
    console.log(`\n📊 Found ${tokenAccounts.value.length} token accounts:\n`);
    
    const holdings = [];
    
    for (const account of tokenAccounts.value) {
      const info = account.account.data.parsed.info;
      const mint = info.mint;
      const balance = parseFloat(info.tokenAmount.uiAmountString || '0');
      
      if (balance > 0) {
        // Try to get token info
        let symbol = 'Unknown';
        try {
          // This is a simplified symbol lookup - in real implementation would use metadata
          if (mint === '8HGer4vRWZMu5MUYU7ACPb4uanKgBewaXJZscLagpump') symbol = 'GIZMO';
          if (mint === 'HB1bqSLDmQunAWQZJvSGA9NsBdEe1NczA6n4sRuFpump') symbol = 'MINDLESS';
        } catch (e) {
          // Ignore lookup failures
        }
        
        const shouldKeep = KEEP_TOKENS.includes(mint);
        const action = shouldKeep ? '🟢 KEEP' : '🔴 SELL';
        
        holdings.push({
          symbol,
          mint,
          balance,
          decimals: info.tokenAmount.decimals,
          shouldKeep,
          account: account.pubkey
        });
        
        console.log(`${action} ${symbol}`);
        console.log(`  Balance: ${balance.toLocaleString()} tokens`);
        console.log(`  Mint: ${mint}`);
        console.log(`  Account: ${account.pubkey.toString()}`);
        console.log('');
      }
    }
    
    // Summary
    const toKeep = holdings.filter(h => h.shouldKeep);
    const toSell = holdings.filter(h => !h.shouldKeep);
    
    console.log(`\n📊 SUMMARY:`);
    console.log(`🟢 Keeping: ${toKeep.length} tokens`);
    console.log(`🔴 Selling: ${toSell.length} tokens`);
    
    if (toSell.length > 0) {
      console.log(`\n🎯 TOKENS TO SELL AUTONOMOUSLY:`);
      for (const token of toSell) {
        console.log(`  • ${token.symbol} (${token.balance.toLocaleString()}) - ${token.mint}`);
      }
    }
    
    return { toKeep, toSell };
    
  } catch (e) {
    console.error('❌ Failed to check holdings:', e.message);
    return { toKeep: [], toSell: [] };
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  checkHoldings().then(result => {
    console.log('\n✅ Holdings check complete');
    process.exit(0);
  }).catch(e => {
    console.error('💥 Error:', e.message);
    process.exit(1);
  });
}

export { checkHoldings };