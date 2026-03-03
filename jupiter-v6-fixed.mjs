/**
 * 🦞 JUPITER V6 FIXED - CORRECT ENDPOINTS & RATE LIMITING
 * USING ACTUAL 2026 JUPITER API STRUCTURE
 * TARGETED FIX FOR ASLAN→SOL SWAP EXECUTION
 */

import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import https from 'https';

// Load wallet
const walletData = JSON.parse(fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// Use multiple RPC endpoints to avoid rate limits
const rpcEndpoints = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com',
  'https://rpc.ankr.com/solana'
];

let activeConnection;
let rpcIndex = 0;

// WORKING 2026 Jupiter endpoints (lite-api for free tier)
const JUPITER_QUOTE_API = 'https://lite-api.jup.ag/v6/quote';
const JUPITER_SWAP_API = 'https://lite-api.jup.ag/v6/swap';

// Rate limiting
let lastRequest = 0;
const MIN_REQUEST_INTERVAL = 1500; // 1.5 seconds between requests

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

async function getWorkingRPC() {
  for (let i = 0; i < rpcEndpoints.length; i++) {
    const endpoint = rpcEndpoints[(rpcIndex + i) % rpcEndpoints.length];
    try {
      const conn = new Connection(endpoint, 'confirmed');
      await conn.getSlot(); // Test connection
      activeConnection = conn;
      rpcIndex = (rpcIndex + i) % rpcEndpoints.length;
      log(`✅ Using RPC: ${endpoint}`);
      return conn;
    } catch (e) {
      log(`⚠️ RPC ${endpoint} failed, trying next...`);
    }
  }
  throw new Error('All RPC endpoints failed');
}

async function rateLimitedRequest(url, options = {}) {
  // Rate limiting
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequest;
  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    const delay = MIN_REQUEST_INTERVAL - timeSinceLastRequest;
    log(`⏳ Rate limit delay: ${delay}ms`);
    await new Promise(r => setTimeout(r, delay));
  }
  lastRequest = Date.now();

  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'SolanaBot/1.0',
        ...options.headers
      },
      timeout: 20000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0,300)}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0,300)}`));
        }
      });
    });
    
    req.on('error', reject);
    req.on('timeout', () => reject(new Error('Request timeout')));
    
    if (options.body) {
      req.write(JSON.stringify(options.body));
    }
    req.end();
  });
}

async function getTokenBalance(tokenMint) {
  const tokenAccounts = await activeConnection.getParsedTokenAccountsByOwner(
    keypair.publicKey,
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
  const balance = await activeConnection.getBalance(keypair.publicKey);
  return balance / LAMPORTS_PER_SOL;
}

async function FIXED_jupiter_quote(inputMint, outputMint, amount, slippageBps = 500) {
  log(`📡 Getting Jupiter quote (rate-limited)...`);
  
  // Build correct V6 quote URL
  const params = new URLSearchParams({
    inputMint: inputMint,
    outputMint: outputMint,
    amount: amount.toString(),
    slippageBps: slippageBps.toString(),
    onlyDirectRoutes: 'false',
    asLegacyTransaction: 'false'
  });
  
  const quoteUrl = `${JUPITER_QUOTE_API}?${params.toString()}`;
  log(`🔍 Quote URL: ${quoteUrl.substring(0,100)}...`);
  
  try {
    const quote = await rateLimitedRequest(quoteUrl);
    
    if (!quote.outAmount) {
      throw new Error('Invalid quote response: ' + JSON.stringify(quote));
    }
    
    log(`✅ Jupiter quote received`);
    log(`📈 Expected output: ${quote.outAmount} (${(Number(quote.outAmount) / LAMPORTS_PER_SOL).toFixed(4)} SOL)`);
    
    return quote;
    
  } catch (error) {
    throw new Error(`Jupiter quote failed: ${error.message}`);
  }
}

async function FIXED_jupiter_swap(quote) {
  log(`📡 Getting Jupiter swap transaction (rate-limited)...`);
  
  const swapBody = {
    quoteResponse: quote,
    userPublicKey: keypair.publicKey.toBase58(),
    wrapAndUnwrapSol: true,
    useSharedAccounts: true,
    feeAccount: undefined,
    computeUnitPriceMicroLamports: 'auto',
    asLegacyTransaction: false
  };
  
  try {
    const swapData = await rateLimitedRequest(JUPITER_SWAP_API, {
      method: 'POST',
      body: swapBody
    });
    
    if (!swapData.swapTransaction) {
      throw new Error('No swap transaction returned: ' + JSON.stringify(swapData));
    }
    
    log(`✅ Jupiter swap transaction received`);
    return swapData;
    
  } catch (error) {
    throw new Error(`Jupiter swap failed: ${error.message}`);
  }
}

async function FIXED_execute_jupiter_swap(inputMint, outputMint, amount) {
  log(`🚀 FIXED JUPITER SWAP EXECUTION`);
  log(`Input: ${inputMint.substring(0,8)}... → Output: SOL`);
  log(`Amount: ${amount}`);
  
  try {
    // Step 1: Get quote with correct endpoints
    const quote = await FIXED_jupiter_quote(inputMint, outputMint, amount);
    
    // Step 2: Get swap transaction  
    const swapData = await FIXED_jupiter_swap(quote);
    
    // Step 3: Execute transaction
    log(`📡 Executing swap transaction...`);
    
    const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuf);
    
    // Sign transaction
    transaction.sign([keypair]);
    
    // Send with retry logic
    let signature;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        signature = await activeConnection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 2
        });
        
        log(`✅ Transaction sent (attempt ${attempt}): ${signature}`);
        break;
        
      } catch (e) {
        if (attempt === 3) throw e;
        log(`⚠️ Attempt ${attempt} failed, retrying...`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    // Wait for confirmation
    log(`⏳ Waiting for confirmation...`);
    
    const confirmation = await activeConnection.confirmTransaction({
      signature: signature,
      blockhash: transaction.message.recentBlockhash,
      lastValidBlockHeight: swapData.lastValidBlockHeight || undefined
    }, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    log(`🎉 JUPITER SWAP CONFIRMED!`);
    
    return {
      success: true,
      signature: signature,
      inputAmount: amount,
      expectedOutput: quote.outAmount,
      method: 'Jupiter V6 Fixed'
    };
    
  } catch (error) {
    throw new Error(`Fixed Jupiter swap failed: ${error.message}`);
  }
}

async function SELL_ASLAN_AUTONOMOUS(percentage = 5) {
  log(`🦞 AUTONOMOUS ASLAN SELL - FIXED JUPITER V6`);
  log(`🚨 USING CORRECT 2026 ENDPOINTS`);
  
  await getWorkingRPC();
  
  // Get initial balances
  const aslanMint = '8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump';
  const solMint = 'So11111111111111111111111111111111111111112';
  
  const initialAslan = await getTokenBalance(aslanMint);
  const initialSOL = await getSOLBalance();
  
  if (initialAslan.amount === 0n) {
    throw new Error('No ASLAN tokens to sell');
  }
  
  const sellAmount = (initialAslan.amount * BigInt(percentage)) / 100n;
  const sellUI = Number(sellAmount) / (10 ** initialAslan.decimals);
  
  log(`📊 BEFORE ASLAN SELL:`);
  log(`  ASLAN: ${initialAslan.uiAmount.toLocaleString()}`);
  log(`  SOL: ${initialSOL.toFixed(6)}`);
  log(`🎯 Selling: ${sellUI.toLocaleString()} ASLAN tokens`);
  
  // Execute fixed Jupiter swap
  const result = await FIXED_execute_jupiter_swap(aslanMint, solMint, sellAmount.toString());
  
  // Wait for balance updates
  log(`⏳ Waiting for balance updates...`);
  await new Promise(r => setTimeout(r, 12000));
  
  // Check final balances
  const finalAslan = await getTokenBalance(aslanMint);
  const finalSOL = await getSOLBalance();
  
  const aslanChange = finalAslan.uiAmount - initialAslan.uiAmount;
  const solChange = finalSOL - initialSOL;
  
  log(`📊 AFTER ASLAN SELL:`);
  log(`  ASLAN: ${finalAslan.uiAmount.toLocaleString()}`);
  log(`  SOL: ${finalSOL.toFixed(6)}`);
  log(`📈 CHANGES:`);
  log(`  ASLAN: ${aslanChange.toFixed(2)} (${aslanChange < -0.01 ? 'DECREASED' : 'UNCHANGED'})`);
  log(`  SOL: ${solChange > 0 ? '+' : ''}${solChange.toFixed(6)} (${solChange > 0.001 ? 'INCREASED' : 'FEES ONLY'})`);
  
  const actuallyWorked = aslanChange < -0.01 && solChange > 0.001;
  
  if (actuallyWorked) {
    log(`🎉 ASLAN SELL SUCCESSFUL - REAL BALANCE CHANGES!`);
    log(`✅ ASLAN DECREASED: ${(-aslanChange).toFixed(2)}`);
    log(`✅ SOL INCREASED: ${solChange.toFixed(6)}`);
    log(`🏆 AUTONOMOUS TOKEN SELLING ACHIEVED!`);
  } else {
    log(`⚠️ Transaction confirmed but balance changes unclear`);
  }
  
  return {
    ...result,
    balanceChanges: {
      aslanBefore: initialAslan.uiAmount,
      aslanAfter: finalAslan.uiAmount,
      aslanChange: aslanChange,
      solBefore: initialSOL,
      solAfter: finalSOL,
      solChange: solChange,
      actuallyWorked: actuallyWorked
    }
  };
}

async function main() {
  const percentage = process.argv[2] ? parseInt(process.argv[2]) : 5;

  log('🦞 JUPITER V6 FIXED - ASLAN AUTONOMOUS SELL');
  log(`📡 Wallet: ${keypair.publicKey.toString()}`);
  log('🚨 USING CORRECT 2026 JUPITER ENDPOINTS');
  
  try {
    const result = await SELL_ASLAN_AUTONOMOUS(percentage);
    
    console.log('\n🏁 ASLAN AUTONOMOUS SELL RESULT:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success && result.balanceChanges.actuallyWorked) {
      log('🎉 AUTONOMOUS ASLAN SELL SUCCESSFUL!');
      log(`📡 TX: https://solscan.io/tx/${result.signature}`);
      log('✅ REAL TOKEN→SOL CONVERSION ACHIEVED');
      log('🏆 AUTONOMOUS TRADING BREAKTHROUGH!');
    } else if (result.success) {
      log('⚠️ Transaction executed - checking for balance effects');
      log(`📡 TX: https://solscan.io/tx/${result.signature}`);
    } else {
      log('❌ ASLAN sell failed');
    }
    
  } catch (e) {
    log(`💥 Fixed Jupiter swap failed: ${e.message}`);
    console.log('❌ STILL WORKING ON SOLUTION');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}