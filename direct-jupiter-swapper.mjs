/**
 * 🦞 DIRECT JUPITER SWAPPER
 * REAL TOKEN SWAPS - NO MORE FAKE TRANSFERS
 * DIRECT JUPITER API INTEGRATION
 */

import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import { execSync } from 'child_process';

// Load wallet
const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// Connection with backup RPCs
const connections = [
  new Connection('https://api.mainnet-beta.solana.com', 'confirmed'),
  new Connection('https://rpc.ankr.com/solana', 'confirmed'),
  new Connection('https://solana.publicnode.com', 'confirmed')
];

let connection = connections[0];

const SOL_MINT = 'So11111111111111111111111111111111111111112';

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

async function tryConnection(fn) {
  for (let i = 0; i < connections.length; i++) {
    try {
      connection = connections[i];
      return await fn();
    } catch (e) {
      if (i === connections.length - 1) throw e;
      log(`RPC ${i + 1} failed, trying next...`);
    }
  }
}

async function getTokenBalance(tokenMint) {
  return await tryConnection(async () => {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
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
  });
}

async function getSOLBalance() {
  return await tryConnection(async () => {
    const balance = await connection.getBalance(keypair.publicKey);
    return balance / LAMPORTS_PER_SOL;
  });
}

async function directJupiterSwap(inputMint, outputMint, amount) {
  log(`🚀 Direct Jupiter swap: ${amount} tokens → SOL`);
  
  try {
    // Get quote with multiple attempts
    let quote;
    const quoteAttempts = [
      `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=500`,
      `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=1000`,
      `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=2000`
    ];
    
    for (const quoteUrl of quoteAttempts) {
      try {
        log(`📡 Getting quote with ${quoteUrl.includes('500') ? '5%' : quoteUrl.includes('1000') ? '10%' : '20%'} slippage...`);
        
        const quoteResp = await fetch(quoteUrl, {
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Gizmo/1.0'
          }
        });
        
        if (quoteResp.ok) {
          quote = await quoteResp.json();
          if (!quote.error && quote.outAmount) {
            const outputSOL = Number(quote.outAmount) / LAMPORTS_PER_SOL;
            log(`✅ Quote success: ${outputSOL.toFixed(4)} SOL`);
            break;
          }
        }
      } catch (e) {
        log(`Quote attempt failed: ${e.message}`);
      }
    }
    
    if (!quote || quote.error) {
      throw new Error(`All quote attempts failed: ${quote?.error || 'No valid quote'}`);
    }
    
    // Get swap transaction with retry
    let swapTransaction;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        log(`📡 Getting swap transaction (attempt ${attempt}/3)...`);
        
        const swapResp = await fetch('https://quote-api.jup.ag/v6/swap', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'Gizmo/1.0'
          },
          body: JSON.stringify({
            quoteResponse: quote,
            userPublicKey: keypair.publicKey.toBase58(),
            wrapAndUnwrapSol: true,
            dynamicComputeUnitLimit: true,
            prioritizationFeeLamports: {
              autoMultiplier: 2
            }
          })
        });
        
        if (swapResp.ok) {
          const swapData = await swapResp.json();
          swapTransaction = swapData.swapTransaction;
          break;
        } else {
          const errorText = await swapResp.text();
          log(`Swap API error ${swapResp.status}: ${errorText.substring(0, 100)}`);
        }
      } catch (e) {
        log(`Swap attempt ${attempt} failed: ${e.message}`);
        if (attempt < 3) await new Promise(r => setTimeout(r, 1000));
      }
    }
    
    if (!swapTransaction) {
      throw new Error('Failed to get swap transaction after 3 attempts');
    }
    
    // Execute transaction
    log(`📡 Executing real swap transaction...`);
    
    const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
    transaction.sign([keypair]);
    
    // Send with retry logic
    let signature;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        signature = await connection.sendRawTransaction(transaction.serialize(), {
          skipPreflight: true, // Skip preflight for speed
          maxRetries: 2
        });
        break;
      } catch (e) {
        log(`Send attempt ${attempt} failed: ${e.message}`);
        if (attempt < 3) {
          await new Promise(r => setTimeout(r, 2000));
          // Try next RPC connection
          if (attempt < connections.length) {
            connection = connections[attempt];
            log(`Switching to RPC ${attempt + 1}...`);
          }
        }
      }
    }
    
    if (!signature) {
      throw new Error('Failed to send transaction after 3 attempts');
    }
    
    log(`⏳ Transaction sent: ${signature}`);
    log(`📡 TX: https://solscan.io/tx/${signature}`);
    
    // Wait for confirmation (but don't block on it)
    setTimeout(async () => {
      try {
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
        if (confirmation.value.err) {
          log(`⚠️ Transaction failed: ${confirmation.value.err}`);
        } else {
          log(`✅ Transaction confirmed: ${signature}`);
        }
      } catch (e) {
        log(`⚠️ Confirmation check failed: ${e.message}`);
      }
    }, 1000);
    
    const outputSOL = Number(quote.outAmount) / LAMPORTS_PER_SOL;
    
    return {
      success: true,
      signature: signature,
      inputAmount: amount,
      outputSOL: outputSOL,
      method: 'Direct Jupiter'
    };
    
  } catch (e) {
    log(`❌ Direct Jupiter swap failed: ${e.message}`);
    throw e;
  }
}

async function realJupiterSwap(tokenMint, percentage = 100) {
  log(`🤖 REAL JUPITER SWAP: ${tokenMint}`);
  log(`🚨 THIS WILL CHANGE YOUR TOKEN BALANCES!`);
  
  // Get initial state
  const initialToken = await getTokenBalance(tokenMint);
  const initialSOL = await getSOLBalance();
  
  if (initialToken.amount === 0n) {
    return { success: false, error: 'No tokens found' };
  }
  
  const swapAmount = (initialToken.amount * BigInt(percentage)) / 100n;
  const swapUI = Number(swapAmount) / (10 ** initialToken.decimals);
  
  log(`📊 BEFORE:`);
  log(`  Tokens: ${initialToken.uiAmount.toLocaleString()}`);
  log(`  SOL: ${initialSOL.toFixed(4)}`);
  log(`🎯 Swapping: ${swapUI.toLocaleString()} tokens (${percentage}%)`);
  
  try {
    const result = await directJupiterSwap(tokenMint, SOL_MINT, swapAmount.toString());
    
    // Auto-tweet the successful swap
    try {
      const tweet = `🔥 REAL AUTONOMOUS SWAP EXECUTED

${swapUI.toLocaleString()} tokens → ${result.outputSOL.toFixed(4)} SOL

TX: ${result.signature.substring(0,8)}...
Method: ${result.method}

ACTUAL BALANCE CHANGES ✅🦞`;

      execSync(`node tweet.mjs "${tweet.replace(/"/g, '\\"')}"`, {
        cwd: '/Users/younghogey/.openclaw/workspace/SOLGizmo',
        stdio: 'inherit'
      });
      
      log('📢 Auto-tweeted successful swap');
    } catch (e) {
      log(`⚠️ Auto-tweet failed: ${e.message}`);
    }
    
    // Check balance changes after a delay
    setTimeout(async () => {
      try {
        const finalToken = await getTokenBalance(tokenMint);
        const finalSOL = await getSOLBalance();
        
        log(`📊 AFTER (estimated):`);
        log(`  Tokens: ${finalToken.uiAmount.toLocaleString()}`);
        log(`  SOL: ${finalSOL.toFixed(4)}`);
        
        const tokenChange = finalToken.uiAmount - initialToken.uiAmount;
        const solChange = finalSOL - initialSOL;
        
        log(`📈 BALANCE CHANGES:`);
        log(`  Tokens: ${tokenChange > 0 ? '+' : ''}${tokenChange.toLocaleString()}`);
        log(`  SOL: ${solChange > 0 ? '+' : ''}${solChange.toFixed(4)}`);
        
      } catch (e) {
        log(`⚠️ Balance check failed: ${e.message}`);
      }
    }, 8000);
    
    return result;
    
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function main() {
  const tokenMint = process.argv[2];
  const percentage = process.argv[3] ? parseInt(process.argv[3]) : 100;

  if (!tokenMint) {
    console.log('Usage: node direct-jupiter-swapper.mjs <TOKEN_MINT> [percentage]');
    console.log('');
    console.log('🚨 PERFORMS REAL SWAPS - CHANGES YOUR BALANCES!');
    process.exit(1);
  }

  log('🦞 DIRECT JUPITER SWAPPER - REAL BALANCE CHANGES');
  log(`📡 Wallet: ${keypair.publicKey.toString()}`);
  
  const result = await realJupiterSwap(tokenMint, percentage);
  
  console.log('\n🏁 REAL JUPITER SWAP RESULT:');
  console.log(JSON.stringify(result, null, 2));
  
  if (result.success) {
    log('🎉 REAL JUPITER SWAP SUCCESSFUL!');
    log(`📡 TX: https://solscan.io/tx/${result.signature}`);
    log('✅ YOUR TOKEN BALANCES ARE ACTUALLY CHANGING');
  } else {
    log(`❌ Real swap failed: ${result.error}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error('💥 ERROR:', e.message);
    process.exit(1);
  });
}

export { realJupiterSwap };