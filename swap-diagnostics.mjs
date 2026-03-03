/**
 * 🦞 SWAP DIAGNOSTICS - FIND THE ROOT CAUSE
 * ANALYZE EXACTLY WHY SWAPS ARE FAILING
 * SYSTEMATIC APPROACH TO REAL SOLUTIONS
 */

import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import https from 'https';

// Load wallet
const walletData = JSON.parse(fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const wallet = new PublicKey('FXdMNyRo5CqfG3yRWCcNu163FpnSusdZSYecsB76GAkn');

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

async function httpsRequest(url) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Timeout')));
    req.end();
  });
}

async function diagnoseAPIs() {
  log('🔍 DIAGNOSING API CONNECTIVITY');
  
  const apis = [
    'https://quote-api.jup.ag/v6/quote?inputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&outputMint=So11111111111111111111111111111111111111112&amount=1000000',
    'https://api-v3.raydium.io/pools/info/mint?mint1=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&poolType=all&pageSize=1',
    'https://api.dexscreener.com/latest/dex/solana/EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'
  ];
  
  const results = [];
  
  for (const url of apis) {
    try {
      const start = Date.now();
      const result = await httpsRequest(url);
      const time = Date.now() - start;
      
      log(`✅ ${url.split('.')[0]}.* - ${time}ms - ${typeof result === 'object' ? 'JSON' : 'String'}`);
      results.push({ url, success: true, time, type: typeof result });
    } catch (e) {
      log(`❌ ${url.split('.')[0]}.* - FAILED: ${e.message}`);
      results.push({ url, success: false, error: e.message });
    }
  }
  
  return results;
}

async function diagnoseTokenAccounts() {
  log('🔍 DIAGNOSING TOKEN ACCOUNT STRUCTURE');
  
  const tokens = [
    '41iR3ejFc4zTdn4LJeMhKUTZfQkV4xCahCRYtV1xpump', // GREEN
    '8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump', // ASLAN
    'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'  // USDC (known working)
  ];
  
  for (const mint of tokens) {
    try {
      const mintPubkey = new PublicKey(mint);
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        wallet,
        { mint: mintPubkey }
      );
      
      if (tokenAccounts.value.length > 0) {
        const info = tokenAccounts.value[0].account.data.parsed.info;
        log(`✅ ${mint.substring(0,8)}: ${info.tokenAmount.uiAmount?.toLocaleString() || 0} tokens`);
        
        // Check mint info
        const mintInfo = await connection.getParsedAccountInfo(mintPubkey);
        if (mintInfo.value) {
          const decimals = mintInfo.value.data.parsed.info.decimals;
          const supply = mintInfo.value.data.parsed.info.supply;
          log(`   Decimals: ${decimals}, Supply: ${supply}`);
        }
      } else {
        log(`❌ ${mint.substring(0,8)}: No token account`);
      }
    } catch (e) {
      log(`❌ ${mint.substring(0,8)}: Error - ${e.message}`);
    }
  }
}

async function diagnoseProgramAccess() {
  log('🔍 DIAGNOSING PROGRAM ACCESS');
  
  const programs = [
    { name: 'Jupiter v6', id: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4' },
    { name: 'Raydium AMM', id: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8' },
    { name: 'Pump.fun', id: '6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P' },
    { name: 'Orca', id: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP' }
  ];
  
  for (const program of programs) {
    try {
      const programId = new PublicKey(program.id);
      const accountInfo = await connection.getAccountInfo(programId);
      
      if (accountInfo) {
        log(`✅ ${program.name}: Program exists, executable: ${accountInfo.executable}`);
      } else {
        log(`❌ ${program.name}: Program not found`);
      }
    } catch (e) {
      log(`❌ ${program.name}: Error - ${e.message}`);
    }
  }
}

async function diagnoseRecentSwaps() {
  log('🔍 DIAGNOSING RECENT SUCCESSFUL SWAPS');
  
  try {
    // Look for recent transactions from our wallet
    const signatures = await connection.getSignaturesForAddress(wallet, { limit: 10 });
    
    log(`📊 Found ${signatures.length} recent transactions`);
    
    for (const sig of signatures.slice(0, 3)) {
      try {
        const tx = await connection.getParsedTransaction(sig.signature, 'confirmed');
        
        if (tx && tx.meta) {
          const instructions = tx.transaction.message.instructions;
          log(`📡 ${sig.signature.substring(0,8)}: ${instructions.length} instructions`);
          
          // Check for token balance changes
          const preBalances = tx.meta.preTokenBalances || [];
          const postBalances = tx.meta.postTokenBalances || [];
          
          if (preBalances.length || postBalances.length) {
            log(`   Token balance changes detected`);
          }
          
          // Check program IDs used
          const programIds = instructions.map(ix => ix.programId.toBase58()).filter((id, index, arr) => arr.indexOf(id) === index);
          log(`   Programs: ${programIds.map(id => id.substring(0,8)).join(', ')}`);
        }
      } catch (e) {
        log(`⚠️ ${sig.signature.substring(0,8)}: Parse error`);
      }
    }
  } catch (e) {
    log(`❌ Recent transaction analysis failed: ${e.message}`);
  }
}

async function diagnoseSwapRequirements() {
  log('🔍 DIAGNOSING WHAT MAKES SWAPS WORK');
  
  // Check a known working token pair
  try {
    const usdcMint = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    const solMint = new PublicKey('So11111111111111111111111111111111111111112');
    
    log('📊 Analyzing USDC/SOL (known working pair):');
    
    // Check if these have associated token accounts
    const usdcAccount = await connection.getParsedTokenAccountsByOwner(wallet, { mint: usdcMint });
    log(`   USDC account: ${usdcAccount.value.length > 0 ? 'EXISTS' : 'NONE'}`);
    
    const solAccounts = await connection.getParsedTokenAccountsByOwner(wallet, { mint: solMint });
    log(`   WSOL account: ${solAccounts.value.length > 0 ? 'EXISTS' : 'NONE'}`);
    
  } catch (e) {
    log(`❌ Known pair analysis failed: ${e.message}`);
  }
  
  log('');
  log('🎯 LIKELY ROOT CAUSES:');
  log('1. Token accounts may need to be created first');
  log('2. Pump tokens may only work with specific DEXes');
  log('3. Need wrapped SOL account for SOL swaps');
  log('4. Missing proper instruction data formats');
  log('5. Need to approve token spending first');
}

async function main() {
  log('🦞 SWAP DIAGNOSTICS - FINDING THE ROOT CAUSE');
  log('🚨 SYSTEMATIC ANALYSIS OF SWAP FAILURES');
  log('');
  
  await diagnoseAPIs();
  log('');
  await diagnoseTokenAccounts();
  log('');
  await diagnoseProgramAccess();
  log('');
  await diagnoseRecentSwaps();
  log('');
  await diagnoseSwapRequirements();
  
  log('');
  log('🏁 DIAGNOSTIC COMPLETE');
  log('🔧 Next: Build solutions based on findings');
}

main().catch(console.error);