/**
 * 🦞 JUPITER V1 CORRECT INTEGRATION - 2026 ENDPOINTS
 * USING PROPER api.jup.ag/swap/v1 FLOW
 * LASER-FOCUSED ON GETTING REAL SWAPS WORKING
 */

import { 
  Connection, 
  Keypair, 
  VersionedTransaction, 
  LAMPORTS_PER_SOL, 
  PublicKey,
  Transaction
} from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import https from 'https';

// Load wallet
const walletData = JSON.parse(fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// Multiple RPC endpoints for reliability
const rpcEndpoints = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com',
  'https://rpc.ankr.com/solana'
];
let activeConnection;
let rpcIndex = 0;

// 2026 Jupiter V1 endpoints (corrected based on guidance)
const JUPITER_V1_QUOTE = 'https://api.jup.ag/swap/v1/quote';
const JUPITER_V1_SWAP = 'https://api.jup.ag/swap/v1/swap';

// Fallback to lite-api if main API needs key
const JUPITER_LITE_QUOTE = 'https://lite-api.jup.ag/v1/quote';
const JUPITER_LITE_SWAP = 'https://lite-api.jup.ag/v1/swap';

// Rate limiting
let lastRequest = 0;
const MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

async function getWorkingRPC() {
  for (let i = 0; i < rpcEndpoints.length; i++) {
    const endpoint = rpcEndpoints[(rpcIndex + i) % rpcEndpoints.length];
    try {
      const conn = new Connection(endpoint, 'confirmed');
      await conn.getSlot();
      activeConnection = conn;
      rpcIndex = (rpcIndex + i) % rpcEndpoints.length;
      log(`✅ Using RPC: ${endpoint.split('/')[2]}`);
      return conn;
    } catch (e) {
      log(`⚠️ RPC ${endpoint.split('/')[2]} failed`);
    }
  }
  throw new Error('All RPC endpoints failed');
}

async function rateLimitedHttps(url, options = {}) {
  // Enforce rate limiting
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
        'User-Agent': 'SolanaBot/2026',
        // Add API key header if available (can add later)
        ...options.headers
      },
      timeout: 25000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0,400)}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0,400)}`));
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

async function getJupiterV1Quote(inputMint, outputMint, amount, slippageBps = 500) {
  log(`📡 Getting Jupiter V1 quote (rate-limited)...`);
  
  const params = new URLSearchParams({
    inputMint: inputMint,
    outputMint: outputMint,
    amount: amount.toString(),
    slippageBps: slippageBps.toString(),
    onlyDirectRoutes: 'false'
  });
  
  const endpoints = [
    `${JUPITER_V1_QUOTE}?${params.toString()}`,
    `${JUPITER_LITE_QUOTE}?${params.toString()}`
  ];
  
  for (const [index, endpoint] of endpoints.entries()) {
    try {
      log(`🔍 Trying endpoint ${index + 1}: ${endpoint.split('?')[0]}`);
      const quote = await rateLimitedHttps(endpoint);
      
      if (quote && quote.outAmount) {
        const outputSOL = Number(quote.outAmount) / LAMPORTS_PER_SOL;
        log(`✅ Jupiter V1 quote received`);
        log(`📈 Expected output: ${outputSOL.toFixed(6)} SOL`);
        return { quote, endpointIndex: index };
      } else if (quote && quote.message) {
        log(`⚠️ Quote response: ${quote.message}`);
      }
    } catch (error) {
      log(`❌ Endpoint ${index + 1} failed: ${error.message}`);
    }
  }
  
  throw new Error('All Jupiter V1 quote endpoints failed');
}

async function getJupiterV1Swap(quote, endpointIndex = 0) {
  log(`📡 Getting Jupiter V1 swap transaction...`);
  
  const swapEndpoints = [JUPITER_V1_SWAP, JUPITER_LITE_SWAP];
  const swapEndpoint = swapEndpoints[endpointIndex];
  
  const swapBody = {
    quoteResponse: quote,
    userPublicKey: keypair.publicKey.toBase58(),
    wrapAndUnwrapSol: true,
    computeUnitPriceMicroLamports: 'auto'
  };
  
  try {
    log(`🔍 Using swap endpoint: ${swapEndpoint}`);
    const swapData = await rateLimitedHttps(swapEndpoint, {
      method: 'POST',
      body: swapBody
    });
    
    if (!swapData || !swapData.swapTransaction) {
      throw new Error(`No swap transaction: ${JSON.stringify(swapData)}`);
    }
    
    log(`✅ Jupiter V1 swap transaction received`);
    return swapData;
    
  } catch (error) {
    throw new Error(`Jupiter V1 swap failed: ${error.message}`);
  }
}

async function executeJupiterV1Swap(inputMint, outputMint, amount) {
  log(`🚀 JUPITER V1 SWAP EXECUTION`);
  log(`Input: ${inputMint.substring(0,8)}... → SOL`);
  log(`Amount: ${amount}`);
  
  try {
    // Step 1: Get V1 quote
    const { quote, endpointIndex } = await getJupiterV1Quote(inputMint, outputMint, amount);
    
    // Step 2: Get V1 swap transaction  
    const swapData = await getJupiterV1Swap(quote, endpointIndex);
    
    // Step 3: Execute transaction
    log(`📡 Executing Jupiter V1 transaction...`);
    
    const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
    let transaction;
    
    try {
      // Try as VersionedTransaction first (modern format)
      transaction = VersionedTransaction.deserialize(transactionBuf);
      log(`✅ Using VersionedTransaction format`);
    } catch (e) {
      // Fallback to legacy Transaction
      transaction = Transaction.from(transactionBuf);
      log(`✅ Using legacy Transaction format`);
    }
    
    // Sign transaction
    if (transaction.sign) {
      transaction.sign([keypair]);
    } else {
      transaction.partialSign(keypair);
    }
    
    // Send with retry logic and better RPC handling
    let signature;
    const maxRetries = 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const rawTx = transaction.serialize ? transaction.serialize() : transaction.serialize({
          requireAllSignatures: false,
          verifySignatures: false
        });
        
        signature = await activeConnection.sendRawTransaction(rawTx, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
          maxRetries: 2
        });
        
        log(`✅ Transaction sent (attempt ${attempt}): ${signature}`);
        break;
        
      } catch (e) {
        if (attempt === maxRetries) {
          throw new Error(`All ${maxRetries} attempts failed. Last error: ${e.message}`);
        }
        
        log(`⚠️ Attempt ${attempt} failed: ${e.message}`);
        
        // Try different RPC on failure
        if (e.message.includes('429') || e.message.includes('rate')) {
          log(`🔄 Switching RPC due to rate limit...`);
          await getWorkingRPC();
        }
        
        await new Promise(r => setTimeout(r, 3000 * attempt));
      }
    }
    
    // Wait for confirmation
    log(`⏳ Waiting for confirmation...`);
    
    const confirmation = await activeConnection.confirmTransaction({
      signature: signature,
      ...(transaction.message?.recentBlockhash && {
        blockhash: transaction.message.recentBlockhash,
        lastValidBlockHeight: swapData.lastValidBlockHeight
      })
    }, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
    }
    
    log(`🎉 JUPITER V1 SWAP CONFIRMED!`);
    
    return {
      success: true,
      signature: signature,
      inputAmount: amount,
      expectedOutput: quote.outAmount,
      method: 'Jupiter V1 Correct Integration'
    };
    
  } catch (error) {
    throw new Error(`Jupiter V1 swap failed: ${error.message}`);
  }
}

async function AUTONOMOUS_ASLAN_SELL_V1(percentage = 2) {
  log(`🦞 AUTONOMOUS ASLAN SELL - JUPITER V1 CORRECT`);
  log(`🚨 USING PROPER 2026 ENDPOINTS`);
  
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
  
  log(`📊 BEFORE JUPITER V1 SELL:`);
  log(`  ASLAN: ${initialAslan.uiAmount.toLocaleString()}`);
  log(`  SOL: ${initialSOL.toFixed(6)}`);
  log(`🎯 Selling: ${sellUI.toLocaleString()} ASLAN tokens`);
  
  // Execute Jupiter V1 swap
  const result = await executeJupiterV1Swap(aslanMint, solMint, sellAmount.toString());
  
  // Wait for balance updates
  log(`⏳ Waiting for balance updates...`);
  await new Promise(r => setTimeout(r, 15000));
  
  // Check final balances
  const finalAslan = await getTokenBalance(aslanMint);
  const finalSOL = await getSOLBalance();
  
  const aslanChange = finalAslan.uiAmount - initialAslan.uiAmount;
  const solChange = finalSOL - initialSOL;
  
  log(`📊 AFTER JUPITER V1 SELL:`);
  log(`  ASLAN: ${finalAslan.uiAmount.toLocaleString()}`);
  log(`  SOL: ${finalSOL.toFixed(6)}`);
  log(`📈 CHANGES:`);
  log(`  ASLAN: ${aslanChange.toFixed(2)} (${aslanChange < -0.01 ? 'DECREASED ✅' : 'UNCHANGED ❌'})`);
  log(`  SOL: ${solChange > 0 ? '+' : ''}${solChange.toFixed(6)} (${solChange > 0.001 ? 'INCREASED ✅' : 'FEES ONLY ❌'})`);
  
  const actuallyWorked = aslanChange < -0.01 && solChange > 0.001;
  
  if (actuallyWorked) {
    log(`🎉 JUPITER V1 SELL SUCCESSFUL - REAL BALANCE CHANGES!`);
    log(`✅ ASLAN SOLD: ${(-aslanChange).toFixed(2)} tokens`);
    log(`✅ SOL RECEIVED: ${solChange.toFixed(6)} SOL`);
    log(`🏆 AUTONOMOUS TRADING BREAKTHROUGH WITH JUPITER V1!`);
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
  const percentage = process.argv[2] ? parseInt(process.argv[2]) : 2;

  log('🦞 JUPITER V1 CORRECT INTEGRATION - ASLAN SELL');
  log(`📡 Wallet: ${keypair.publicKey.toString()}`);
  log('🚨 USING PROPER 2026 JUPITER V1 ENDPOINTS');
  
  try {
    const result = await AUTONOMOUS_ASLAN_SELL_V1(percentage);
    
    console.log('\n🏁 JUPITER V1 ASLAN SELL RESULT:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success && result.balanceChanges.actuallyWorked) {
      log('🎉 AUTONOMOUS ASLAN SELL WITH JUPITER V1 SUCCESSFUL!');
      log(`📡 TX: https://solscan.io/tx/${result.signature}`);
      log('✅ REAL TOKEN→SOL CONVERSION ACHIEVED');
      log('🏆 JUPITER V1 AUTONOMOUS TRADING BREAKTHROUGH!');
    } else if (result.success) {
      log('⚠️ Transaction executed - verifying balance effects');
      log(`📡 TX: https://solscan.io/tx/${result.signature}`);
    } else {
      log('❌ Jupiter V1 sell failed');
    }
    
  } catch (e) {
    log(`💥 Jupiter V1 integration failed: ${e.message}`);
    console.log('❌ NEED TO DEBUG JUPITER V1 ENDPOINTS');
    
    // Debug info for next iteration
    console.log('\n🔍 DEBUG INFO FOR NEXT ITERATION:');
    console.log('- Check dev.jup.ag/docs for exact V1 flow');
    console.log('- Consider signing up for API key at portal.jup.ag');
    console.log('- Test with different token pairs (USDC/SOL)');
    console.log('- Verify ASLAN has Jupiter liquidity');
    
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}