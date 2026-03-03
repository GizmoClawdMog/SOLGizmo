/**
 * 🦞 JUPITER FIXED V2 - DIFFERENT ENDPOINTS
 * TRYING ALL WORKING JUPITER ENDPOINTS UNTIL ONE WORKS
 */

import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import https from 'https';
import fs from 'fs';

// Load wallet
const walletPath = '/Users/younghogey/.gizmo/solana-wallet.json';
let keypair;

try {
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  if (walletData.secretKey) {
    const bs58 = await import('bs58');
    keypair = Keypair.fromSecretKey(bs58.default.decode(walletData.secretKey));
  } else {
    keypair = Keypair.fromSecretKey(new Uint8Array(walletData));
  }
  console.log(`✅ Wallet: ${keypair.publicKey.toBase58()}`);
} catch (e) {
  console.log(`❌ Wallet error: ${e.message}`);
  process.exit(1);
}

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

// TRY MULTIPLE JUPITER ENDPOINTS
const JUPITER_ENDPOINTS = [
  'https://api.jup.ag/swap/v1',
  'https://quote-api.jup.ag/v6', 
  'https://lite-api.jup.ag/v6',
  'https://price.jup.ag/v6'
];

async function jupiterRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    
    const req = https.request({
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
        ...options.headers
      },
      timeout: 20000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const parsed = JSON.parse(data);
            resolve(parsed);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data.substring(0,200)}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0,200)}`));
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

// TRY ALL JUPITER QUOTE ENDPOINTS
async function getWorkingJupiterQuote(inputMint, outputMint, amount) {
  log(`🔍 Testing all Jupiter endpoints for quote...`);
  
  const params = new URLSearchParams({
    inputMint: inputMint,
    outputMint: outputMint,
    amount: amount.toString(),
    slippageBps: '500',
    onlyDirectRoutes: 'false'
  });
  
  // Test different endpoint formats
  const testUrls = [
    `https://quote-api.jup.ag/v6/quote?${params}`,
    `https://api.jup.ag/swap/v1/quote?${params}`,
    `https://lite-api.jup.ag/v6/quote?${params}`
  ];
  
  for (const [index, url] of testUrls.entries()) {
    try {
      log(`📡 Testing endpoint ${index + 1}: ${url.split('?')[0]}...`);
      
      const quote = await jupiterRequest(url);
      
      if (quote && quote.outAmount && Number(quote.outAmount) > 0) {
        const outputSOL = Number(quote.outAmount) / LAMPORTS_PER_SOL;
        log(`✅ Working quote from endpoint ${index + 1}: ${outputSOL.toFixed(6)} SOL`);
        return { quote, endpointIndex: index };
      }
      
      log(`⚠️ Endpoint ${index + 1}: Invalid quote`);
      
    } catch (error) {
      log(`❌ Endpoint ${index + 1} failed: ${error.message.substring(0,100)}`);
    }
  }
  
  throw new Error('All Jupiter quote endpoints failed');
}

// GET SWAP WITH WORKING ENDPOINT
async function getWorkingSwap(quote, endpointIndex = 0) {
  log(`📡 Getting swap transaction...`);
  
  const swapUrls = [
    'https://quote-api.jup.ag/v6/swap',
    'https://api.jup.ag/swap/v1/swap', 
    'https://lite-api.jup.ag/v6/swap'
  ];
  
  const swapUrl = swapUrls[endpointIndex] || swapUrls[0];
  
  const swapBody = {
    quoteResponse: quote,
    userPublicKey: keypair.publicKey.toBase58(),
    wrapAndUnwrapSol: true,
    computeUnitPriceMicroLamports: 300000,
    prioritizationFeeLamports: 30000
  };
  
  try {
    const swapData = await jupiterRequest(swapUrl, {
      method: 'POST',
      body: swapBody
    });
    
    if (!swapData.swapTransaction) {
      throw new Error('No swap transaction in response');
    }
    
    log(`✅ Swap transaction received`);
    return swapData;
    
  } catch (error) {
    throw new Error(`Swap request failed: ${error.message}`);
  }
}

// ACTUAL EXECUTION WITH WORKING ENDPOINTS
async function executeRealAutonomousSell(inputMint, outputMint, amount) {
  log(`🔥 EXECUTING REAL AUTONOMOUS SELL`);
  log(`Input: ${inputMint}`);
  log(`Output: ${outputMint}`);
  log(`Amount: ${amount}`);
  
  try {
    // Check initial SOL
    const initialSOL = await connection.getBalance(keypair.publicKey) / LAMPORTS_PER_SOL;
    log(`💰 Initial SOL: ${initialSOL.toFixed(6)}`);
    
    // Get working quote
    const { quote, endpointIndex } = await getWorkingJupiterQuote(inputMint, outputMint, amount);
    
    // Get swap transaction
    const swapData = await getWorkingSwap(quote, endpointIndex);
    
    // Execute
    log(`⚡ Executing transaction...`);
    
    const transactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(transactionBuf);
    
    transaction.sign([keypair]);
    
    // Send with retries
    let signature;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: false,
          maxRetries: 0
        });
        log(`✅ Transaction sent: ${signature}`);
        break;
      } catch (e) {
        if (attempt === 3) throw e;
        log(`⚠️ Retry ${attempt}: ${e.message}`);
        await new Promise(r => setTimeout(r, 2000));
      }
    }
    
    // Confirm
    log(`⏳ Confirming...`);
    const confirmStart = Date.now();
    
    while (Date.now() - confirmStart < 60000) {
      try {
        const status = await connection.getSignatureStatus(signature);
        if (status.value?.confirmationStatus === 'confirmed') {
          if (status.value.err) {
            throw new Error(`TX failed: ${JSON.stringify(status.value.err)}`);
          }
          log(`✅ Confirmed!`);
          break;
        }
        await new Promise(r => setTimeout(r, 3000));
      } catch (e) {
        await new Promise(r => setTimeout(r, 3000));
      }
    }
    
    // Check final balance
    await new Promise(r => setTimeout(r, 5000));
    const finalSOL = await connection.getBalance(keypair.publicKey) / LAMPORTS_PER_SOL;
    const profit = finalSOL - initialSOL;
    
    log(`💰 Final SOL: ${finalSOL.toFixed(6)}`);
    log(`📈 Change: ${profit > 0 ? '+' : ''}${profit.toFixed(6)} SOL`);
    log(`🔗 TX: https://solscan.io/tx/${signature}`);
    
    if (profit > 0.001) {
      log(`🎉 AUTONOMOUS EXECUTION SUCCESS - REAL PROFIT!`);
    }
    
    return {
      success: true,
      signature: signature,
      initialSOL: initialSOL,
      finalSOL: finalSOL,
      profit: profit,
      profitable: profit > 0.001
    };
    
  } catch (error) {
    log(`❌ Execution failed: ${error.message}`);
    return {
      success: false,
      error: error.message
    };
  }
}

// TEST EXECUTION
async function testRealExecution() {
  log('🧪 TESTING REAL AUTONOMOUS EXECUTION');
  
  const ASLAN_MINT = '8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump';
  const SOL_MINT = 'So11111111111111111111111111111111111111112';
  
  try {
    // Get ASLAN balance
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      keypair.publicKey,
      { mint: new PublicKey(ASLAN_MINT) }
    );
    
    if (!tokenAccounts.value.length) {
      return { success: false, error: 'No ASLAN tokens' };
    }
    
    const aslanInfo = tokenAccounts.value[0].account.data.parsed.info;
    const totalASLAN = Number(aslanInfo.tokenAmount.amount);
    const testAmount = Math.floor(totalASLAN * 0.005); // 0.5% for safer test
    
    log(`🎯 Test selling ${testAmount} ASLAN (0.5% of holdings)`);
    
    return await executeRealAutonomousSell(ASLAN_MINT, SOL_MINT, testAmount);
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  const result = await testRealExecution();
  
  console.log('\n🏁 REAL AUTONOMOUS EXECUTION TEST:');
  console.log(JSON.stringify(result, null, 2));
  
  if (result.success) {
    console.log('\n🎉 JUPITER INTEGRATION FIXED!');
    console.log('✅ Can now execute autonomous sells');
    console.log('✅ No more manual Phantom links needed');
  } else {
    console.log('\n❌ Still fixing execution...');
    console.log(`Error: ${result.error}`);
  }
}

main();