/**
 * 🦞 REAL PUMP SWAPPER - ACTUAL TOKEN SWAPS
 * PRIMARY: Pumpswap for pump.fun tokens
 * FAILSAFE: Raydium for other tokens
 * NO MORE FAKE SELF-TRANSFERS!
 */

import { Connection, Keypair, Transaction, PublicKey, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import bs58 from 'bs58';
import fs from 'fs';

// Load wallet
const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// Connection
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Program IDs
const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const RAYDIUM_PROGRAM = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

async function getTokenBalance(tokenMint) {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      keypair.publicKey,
      { mint: new PublicKey(tokenMint) }
    );

    if (!tokenAccounts.value.length) {
      return { amount: 0n, decimals: 6, uiAmount: 0, tokenAccount: null };
    }

    const accountInfo = tokenAccounts.value[0];
    const info = accountInfo.account.data.parsed.info;
    return {
      amount: BigInt(info.tokenAmount.amount),
      decimals: info.tokenAmount.decimals,
      uiAmount: info.tokenAmount.uiAmount || 0,
      tokenAccount: accountInfo.pubkey
    };
  } catch (e) {
    log(`❌ Balance check failed: ${e.message}`);
    return { amount: 0n, decimals: 6, uiAmount: 0, tokenAccount: null };
  }
}

async function getSOLBalance() {
  try {
    const balance = await connection.getBalance(keypair.publicKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (e) {
    log(`❌ SOL balance check failed: ${e.message}`);
    return 0;
  }
}

async function realPumpSwap(tokenMint, sellAmount, tokenBalance) {
  log(`🎯 Attempting REAL Pump.fun swap...`);
  
  try {
    // Get bonding curve for this token
    const bondingCurveResponse = await fetch(`https://frontend-api-v3.pump.fun/coins/${tokenMint}`);
    if (!bondingCurveResponse.ok) {
      throw new Error('Token not found on Pump.fun');
    }
    
    const tokenData = await bondingCurveResponse.json();
    log(`📊 Token data: ${tokenData.symbol || 'Unknown'}, MC: $${tokenData.usd_market_cap || 0}`);
    
    // Calculate expected SOL output (simplified)
    const currentPrice = tokenData.usd_market_cap ? (tokenData.usd_market_cap / 1000000000) : 0.000001;
    const expectedSOL = (Number(sellAmount) / Math.pow(10, tokenBalance.decimals)) * currentPrice;
    
    log(`💰 Expected output: ~${expectedSOL.toFixed(4)} SOL`);
    
    // Try direct Pump.fun swap via their API
    const swapResponse = await fetch('https://pumpportal.fun/api/trade-local', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        publicKey: keypair.publicKey.toString(),
        action: 'sell',
        mint: tokenMint,
        amount: sellAmount.toString(),
        denominatedInSol: 'false',
        slippage: 10, // 10% slippage
        priorityFee: 0.0001,
        pool: 'pump'
      })
    });
    
    if (!swapResponse.ok) {
      throw new Error(`Pump swap API failed: ${swapResponse.status}`);
    }
    
    const swapData = await swapResponse.text();
    
    // If we got a transaction back, execute it
    if (swapData && swapData.length > 10) {
      log(`📡 Got pump swap transaction, executing...`);
      
      try {
        // Parse and execute the transaction
        const txBuffer = Buffer.from(swapData, 'base64');
        const signature = await connection.sendRawTransaction(txBuffer, {
          skipPreflight: false,
          maxRetries: 3
        });
        
        log(`⏳ Confirming pump swap: ${signature}`);
        const confirmation = await connection.confirmTransaction(signature, 'confirmed');
        
        if (confirmation.value.err) {
          throw new Error(`Pump swap failed: ${confirmation.value.err}`);
        }
        
        log(`✅ REAL PUMP SWAP SUCCESSFUL!`);
        return {
          success: true,
          signature: signature,
          method: 'Pump.fun Real Swap',
          expectedSOL: expectedSOL
        };
        
      } catch (e) {
        throw new Error(`Pump transaction execution failed: ${e.message}`);
      }
    } else {
      throw new Error('No valid transaction returned from Pump API');
    }
    
  } catch (e) {
    log(`❌ Real Pump swap failed: ${e.message}`);
    throw e;
  }
}

async function realRaydiumSwap(tokenMint, sellAmount, tokenBalance) {
  log(`🎯 Attempting REAL Raydium swap...`);
  
  try {
    // Use Jupiter as proxy for Raydium (they route through Raydium)
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${tokenMint}&outputMint=${SOL_MINT.toString()}&amount=${sellAmount}&slippageBps=1000&onlyDirectRoutes=true`;
    
    log(`📡 Getting Raydium quote via Jupiter...`);
    const quoteResp = await fetch(quoteUrl);
    
    if (!quoteResp.ok) {
      throw new Error(`Raydium quote failed: ${quoteResp.status}`);
    }
    
    const quote = await quoteResp.json();
    if (quote.error) {
      throw new Error(`Raydium quote error: ${quote.error}`);
    }
    
    const outputSOL = Number(quote.outAmount) / LAMPORTS_PER_SOL;
    log(`✅ Raydium quote: ${outputSOL.toFixed(4)} SOL output`);
    
    // Get swap transaction
    const swapResp = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: keypair.publicKey.toString(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          autoMultiplier: 2
        }
      })
    });
    
    if (!swapResp.ok) {
      throw new Error(`Raydium swap prep failed: ${swapResp.status}`);
    }
    
    const swapData = await swapResp.json();
    const txData = Buffer.from(swapData.swapTransaction, 'base64');
    
    log(`📡 Executing Raydium swap...`);
    const signature = await connection.sendRawTransaction(txData, {
      skipPreflight: false,
      maxRetries: 3
    });
    
    log(`⏳ Confirming Raydium swap: ${signature}`);
    const confirmation = await connection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Raydium swap failed: ${confirmation.value.err}`);
    }
    
    log(`✅ REAL RAYDIUM SWAP SUCCESSFUL!`);
    return {
      success: true,
      signature: signature,
      method: 'Raydium Real Swap',
      expectedSOL: outputSOL
    };
    
  } catch (e) {
    log(`❌ Real Raydium swap failed: ${e.message}`);
    throw e;
  }
}

async function realAutonomousSwap(tokenMint, percentage = 100) {
  log(`🤖 REAL AUTONOMOUS SWAP: ${tokenMint}`);
  log(`🚨 THIS WILL ACTUALLY CHANGE YOUR BALANCES!`);
  
  // Get initial balances
  const initialTokenBalance = await getTokenBalance(tokenMint);
  const initialSOL = await getSOLBalance();
  
  if (initialTokenBalance.amount === 0n) {
    log(`❌ No tokens found for ${tokenMint}`);
    return { success: false, error: 'No tokens found' };
  }
  
  const sellAmount = (initialTokenBalance.amount * BigInt(percentage)) / 100n;
  const sellUI = Number(sellAmount) / (10 ** initialTokenBalance.decimals);
  
  log(`📊 BEFORE SWAP:`);
  log(`  Token Balance: ${initialTokenBalance.uiAmount.toLocaleString()}`);
  log(`  SOL Balance: ${initialSOL.toFixed(4)} SOL`);
  log(`🎯 Swapping: ${sellUI.toLocaleString()} tokens (${percentage}%)`);
  
  let result = null;
  
  // Try Pump.fun first (most meme tokens)
  try {
    log(`🥇 TRYING PUMP.FUN SWAP FIRST...`);
    result = await realPumpSwap(tokenMint, sellAmount, initialTokenBalance);
  } catch (e) {
    log(`⚠️ Pump swap failed: ${e.message}`);
    
    // Fallback to Raydium
    try {
      log(`🥈 FALLING BACK TO RAYDIUM...`);
      result = await realRaydiumSwap(tokenMint, sellAmount, initialTokenBalance);
    } catch (e2) {
      log(`❌ Both Pump and Raydium failed`);
      return { success: false, error: `Pump: ${e.message}, Raydium: ${e2.message}` };
    }
  }
  
  if (!result || !result.success) {
    return { success: false, error: 'All swap methods failed' };
  }
  
  // Wait for balance updates
  log(`⏳ Waiting for balance updates...`);
  await new Promise(resolve => setTimeout(resolve, 5000));
  
  // Check final balances
  const finalTokenBalance = await getTokenBalance(tokenMint);
  const finalSOL = await getSOLBalance();
  
  log(`📊 AFTER SWAP:`);
  log(`  Token Balance: ${finalTokenBalance.uiAmount.toLocaleString()}`);
  log(`  SOL Balance: ${finalSOL.toFixed(4)} SOL`);
  
  const tokenChange = finalTokenBalance.uiAmount - initialTokenBalance.uiAmount;
  const solChange = finalSOL - initialSOL;
  
  log(`📈 ACTUAL BALANCE CHANGES:`);
  log(`  Tokens: ${tokenChange > 0 ? '+' : ''}${tokenChange.toLocaleString()}`);
  log(`  SOL: ${solChange > 0 ? '+' : ''}${solChange.toFixed(4)}`);
  
  return {
    ...result,
    balanceChanges: {
      tokens: tokenChange,
      sol: solChange,
      tokensBefore: initialTokenBalance.uiAmount,
      tokensAfter: finalTokenBalance.uiAmount,
      solBefore: initialSOL,
      solAfter: finalSOL
    }
  };
}

async function main() {
  const tokenMint = process.argv[2];
  const percentage = process.argv[3] ? parseInt(process.argv[3]) : 100;

  if (!tokenMint) {
    console.log('Usage: node real-pump-swapper.mjs <TOKEN_MINT> [percentage]');
    console.log('');
    console.log('🚨 THIS PERFORMS REAL SWAPS THAT CHANGE YOUR BALANCES!');
    console.log('🥇 Tries Pump.fun first, 🥈 Falls back to Raydium');
    process.exit(1);
  }

  log('🦞 REAL PUMP SWAPPER - NO MORE FAKE TRADES!');
  log(`📡 Wallet: ${keypair.publicKey.toString()}`);
  
  const result = await realAutonomousSwap(tokenMint, percentage);
  
  console.log('\n🏁 REAL SWAP RESULT:');
  console.log(JSON.stringify(result, null, 2));
  
  if (result.success) {
    log('🎉 REAL AUTONOMOUS SWAP COMPLETED!');
    log('✅ YOUR BALANCES ACTUALLY CHANGED');
    log(`📡 TX: https://solscan.io/tx/${result.signature}`);
    log(`🔄 Method: ${result.method}`);
    
    if (result.balanceChanges) {
      const { tokensBefore, tokensAfter, solBefore, solAfter } = result.balanceChanges;
      log(`📊 PROOF OF REAL SWAP:`);
      log(`  Tokens: ${tokensBefore.toLocaleString()} → ${tokensAfter.toLocaleString()}`);
      log(`  SOL: ${solBefore.toFixed(4)} → ${solAfter.toFixed(4)}`);
    }
    
  } else {
    log(`❌ Real swap failed: ${result.error}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error('💥 CRITICAL ERROR:', e.message);
    process.exit(1);
  });
}

export { realAutonomousSwap };