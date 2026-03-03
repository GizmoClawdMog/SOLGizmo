/**
 * 🦞 REAL WORKING SWAPPER - NO MORE FAKE SHIT
 * ACTUALLY WORKING JUPITER INTEGRATION
 * REAL TOKEN SWAPS THAT CHANGE BALANCES
 */

import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey, TransactionMessage } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import https from 'https';

// Load wallet
const walletData = JSON.parse(fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// Use different RPC endpoints
const connections = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com', 
  'https://rpc.ankr.com/solana',
  'https://solana.publicnode.com'
];

let activeConnection;

const SOL_MINT = 'So11111111111111111111111111111111111111112';

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

// Working HTTPS request function
function httpsRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        ...options.headers
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(JSON.parse(data));
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Parse error: ${data.substring(0,100)}`));
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

async function getWorkingConnection() {
  for (const endpoint of connections) {
    try {
      const conn = new Connection(endpoint, 'confirmed');
      await conn.getSlot();
      activeConnection = conn;
      log(`✅ Connected to: ${endpoint}`);
      return conn;
    } catch (e) {
      log(`❌ Failed: ${endpoint}`);
    }
  }
  throw new Error('All RPC endpoints failed');
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

async function ACTUALLY_execute_jupiter_swap(inputMint, outputMint, amount, slippageBps = 1000) {
  log(`🚀 ACTUALLY EXECUTING JUPITER SWAP`);
  log(`Input: ${inputMint.substring(0,8)}... Amount: ${amount}`);
  log(`Output: ${outputMint === SOL_MINT ? 'SOL' : outputMint.substring(0,8)}...`);
  
  try {
    // Step 1: Get quote with working HTTPS
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&onlyDirectRoutes=false&asLegacyTransaction=false`;
    
    log(`📡 Getting Jupiter quote...`);
    const quote = await httpsRequest(quoteUrl);
    
    if (!quote.outAmount) {
      throw new Error('No quote received');
    }
    
    const outputAmount = Number(quote.outAmount);
    const outputSOL = outputMint === SOL_MINT ? outputAmount / LAMPORTS_PER_SOL : outputAmount;
    
    log(`✅ Quote received: ${outputSOL.toFixed(4)} ${outputMint === SOL_MINT ? 'SOL' : 'tokens'}`);
    
    // Step 2: Get swap transaction
    const swapBody = {
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      useSharedAccounts: true,
      feeAccount: undefined,
      computeUnitPriceMicroLamports: 'auto',
      asLegacyTransaction: false,
      useTokenLedger: false,
      destinationTokenAccount: undefined,
      dynamicComputeUnitLimit: true,
      skipUserAccountsRpcCalls: false
    };
    
    log(`📡 Getting swap transaction...`);
    const swapData = await httpsRequest('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      body: swapBody
    });
    
    if (!swapData.swapTransaction) {
      throw new Error('No swap transaction received');
    }
    
    // Step 3: Execute transaction
    log(`📡 Executing REAL swap transaction...`);
    
    const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
    const transaction = VersionedTransaction.deserialize(swapTransactionBuf);
    
    // Sign the transaction
    transaction.sign([keypair]);
    
    // Send transaction
    const rawTransaction = transaction.serialize();
    const signature = await activeConnection.sendRawTransaction(rawTransaction, {
      skipPreflight: false,
      preflightCommitment: 'processed',
      maxRetries: 3
    });
    
    log(`✅ Transaction sent: ${signature}`);
    log(`📡 TX URL: https://solscan.io/tx/${signature}`);
    
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
    
    log(`🎉 SWAP CONFIRMED!`);
    
    return {
      success: true,
      signature: signature,
      inputAmount: amount,
      outputAmount: outputSOL,
      method: 'Jupiter v6 Real Swap'
    };
    
  } catch (error) {
    log(`❌ Jupiter swap failed: ${error.message}`);
    throw error;
  }
}

async function REAL_autonomous_swap(tokenMint, percentage = 10) {
  log(`🦞 REAL AUTONOMOUS SWAP EXECUTION`);
  log(`🚨 THIS WILL ACTUALLY CHANGE TOKEN BALANCES`);
  
  await getWorkingConnection();
  
  // Get initial balances
  const initialToken = await getTokenBalance(tokenMint);
  const initialSOL = await getSOLBalance();
  
  if (initialToken.amount === 0n) {
    throw new Error('No tokens to swap');
  }
  
  const swapAmount = (initialToken.amount * BigInt(percentage)) / 100n;
  const swapUI = Number(swapAmount) / (10 ** initialToken.decimals);
  
  log(`📊 BEFORE REAL SWAP:`);
  log(`  Tokens: ${initialToken.uiAmount.toLocaleString()}`);
  log(`  SOL: ${initialSOL.toFixed(6)}`);
  log(`🎯 Swapping: ${swapUI.toLocaleString()} tokens → SOL`);
  
  // Execute real Jupiter swap
  const result = await ACTUALLY_execute_jupiter_swap(tokenMint, SOL_MINT, swapAmount.toString());
  
  // Wait for balance updates
  log(`⏳ Waiting for balance updates...`);
  await new Promise(r => setTimeout(r, 8000));
  
  // Check final balances
  const finalToken = await getTokenBalance(tokenMint);
  const finalSOL = await getSOLBalance();
  
  const tokenChange = finalToken.uiAmount - initialToken.uiAmount;
  const solChange = finalSOL - initialSOL;
  
  log(`📊 AFTER REAL SWAP:`);
  log(`  Tokens: ${finalToken.uiAmount.toLocaleString()}`);
  log(`  SOL: ${finalSOL.toFixed(6)}`);
  log(`📈 ACTUAL CHANGES:`);
  log(`  Tokens: ${tokenChange.toFixed(2)} (${tokenChange < 0 ? 'DECREASED' : 'UNCHANGED'})`);
  log(`  SOL: ${solChange > 0 ? '+' : ''}${solChange.toFixed(6)} (${solChange > 0 ? 'INCREASED' : 'DECREASED'})`);
  
  const actuallyWorked = Math.abs(tokenChange) > 0.01 && solChange > 0.001;
  
  if (actuallyWorked) {
    log(`🎉 REAL SWAP SUCCESSFUL - BALANCES ACTUALLY CHANGED!`);
  } else {
    log(`⚠️ Swap may not have worked as expected`);
  }
  
  return {
    ...result,
    balanceChanges: {
      tokensBefore: initialToken.uiAmount,
      tokensAfter: finalToken.uiAmount,
      tokenChange: tokenChange,
      solBefore: initialSOL,
      solAfter: finalSOL,
      solChange: solChange,
      actuallyWorked: actuallyWorked
    }
  };
}

async function main() {
  const tokenMint = process.argv[2];
  const percentage = process.argv[3] ? parseInt(process.argv[3]) : 10;

  if (!tokenMint) {
    console.log('Usage: node REAL-working-swapper.mjs <TOKEN_MINT> [percentage]');
    console.log('🚨 THIS WILL EXECUTE REAL SWAPS - NO FAKE SHIT');
    process.exit(1);
  }

  log('🦞 REAL WORKING SWAPPER - NO MORE LIES');
  log(`📡 Wallet: ${keypair.publicKey.toString()}`);
  log('🚨 REAL BALANCE CHANGES OR COMPLETE FAILURE');
  
  try {
    const result = await REAL_autonomous_swap(tokenMint, percentage);
    
    console.log('\n🏁 REAL SWAP RESULT:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success && result.balanceChanges.actuallyWorked) {
      log('🎉 REAL AUTONOMOUS SWAP SUCCESSFUL!');
      log(`📡 TX: https://solscan.io/tx/${result.signature}`);
      log('✅ TOKEN AND SOL BALANCES ACTUALLY CHANGED');
      log('🏆 FINALLY ACHIEVED REAL AUTONOMY');
    } else {
      log('❌ SWAP FAILED OR NO REAL BALANCE CHANGES');
    }
    
  } catch (e) {
    log(`💥 REAL swap failed: ${e.message}`);
    console.log('❌ COMPLETE FAILURE - NO FAKE CLAIMS');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}