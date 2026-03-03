/**
 * 🦞 REAL AUTONOMOUS SWAPPER - ACTUAL EXECUTION
 * NO LINKS - NO MANUAL CLICKS - PURE AUTONOMOUS BLOCKCHAIN EXECUTION
 * BALANCES WILL ACTUALLY CHANGE AUTOMATICALLY
 */

import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';
import https from 'https';
import { execSync } from 'child_process';

// Load wallet
const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// Multiple RPC endpoints for reliability
const connections = [
  new Connection('https://api.mainnet-beta.solana.com', 'confirmed'),
  new Connection('https://solana-api.projectserum.com', 'confirmed'),
  new Connection('https://rpc.ankr.com/solana', 'confirmed')
];

let activeConnection = connections[0];

const SOL_MINT = 'So11111111111111111111111111111111111111112';

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, {
      method: options.method || 'GET',
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'Gizmo/1.0',
        ...options.headers
      }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ ok: res.statusCode < 400, json: () => JSON.parse(data), text: () => data });
        } catch (e) {
          resolve({ ok: false, text: () => data });
        }
      });
    });
    
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

async function getTokenBalance(tokenMint) {
  for (const connection of connections) {
    try {
      activeConnection = connection;
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
    } catch (e) {
      log(`RPC failed, trying next: ${e.message}`);
      continue;
    }
  }
  throw new Error('All RPCs failed');
}

async function getSOLBalance() {
  const balance = await activeConnection.getBalance(keypair.publicKey);
  return balance / LAMPORTS_PER_SOL;
}

async function executeRealSwap(inputMint, outputMint, amount) {
  log(`🚀 EXECUTING REAL SWAP: ${amount} → ${outputMint === SOL_MINT ? 'SOL' : 'tokens'}`);
  
  try {
    // Try Jupiter with direct HTTPS request
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=1000`;
    
    log(`📡 Getting Jupiter quote...`);
    const quoteResp = await makeRequest(quoteUrl);
    
    if (!quoteResp.ok) {
      throw new Error(`Quote failed: ${quoteResp.text()}`);
    }
    
    const quote = quoteResp.json();
    if (quote.error) {
      throw new Error(`Quote error: ${quote.error}`);
    }
    
    const outputAmount = Number(quote.outAmount);
    const outputSOL = outputMint === SOL_MINT ? outputAmount / LAMPORTS_PER_SOL : outputAmount;
    
    log(`✅ Quote: ${outputSOL.toFixed(4)} ${outputMint === SOL_MINT ? 'SOL' : 'tokens'} output`);
    
    // Get swap transaction
    log(`📡 Getting swap transaction...`);
    const swapResp = await makeRequest('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: {
          autoMultiplier: 3
        }
      })
    });
    
    if (!swapResp.ok) {
      throw new Error(`Swap prep failed: ${swapResp.text()}`);
    }
    
    const swapData = swapResp.json();
    const { swapTransaction } = swapData;
    
    // Execute transaction
    log(`📡 EXECUTING REAL SWAP TRANSACTION...`);
    
    const transaction = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
    transaction.sign([keypair]);
    
    const signature = await activeConnection.sendRawTransaction(transaction.serialize(), {
      skipPreflight: false,
      maxRetries: 3
    });
    
    log(`✅ REAL SWAP SUBMITTED: ${signature}`);
    log(`📡 TX: https://solscan.io/tx/${signature}`);
    
    // Wait for confirmation
    log(`⏳ Waiting for confirmation...`);
    const confirmation = await activeConnection.confirmTransaction(signature, 'confirmed');
    
    if (confirmation.value.err) {
      throw new Error(`Swap failed: ${confirmation.value.err}`);
    }
    
    log(`🎉 REAL SWAP CONFIRMED!`);
    
    return {
      success: true,
      signature: signature,
      outputAmount: outputSOL,
      method: 'Real Jupiter Swap'
    };
    
  } catch (e) {
    log(`❌ Real swap failed: ${e.message}`);
    throw e;
  }
}

async function REALLY_sell_tokens(tokenMint, percentage = 100) {
  log(`🤖 REALLY SELLING TOKENS: ${tokenMint}`);
  log(`🚨 THIS WILL AUTOMATICALLY CHANGE YOUR BALANCES!`);
  
  // Get initial state
  const initialToken = await getTokenBalance(tokenMint);
  const initialSOL = await getSOLBalance();
  
  if (initialToken.amount === 0n) {
    log(`❌ No tokens found for ${tokenMint}`);
    return { success: false, error: 'No tokens found' };
  }
  
  const sellAmount = (initialToken.amount * BigInt(percentage)) / 100n;
  const sellUI = Number(sellAmount) / (10 ** initialToken.decimals);
  
  log(`📊 BEFORE REAL SWAP:`);
  log(`  Tokens: ${initialToken.uiAmount.toLocaleString()}`);
  log(`  SOL: ${initialSOL.toFixed(4)}`);
  log(`🎯 REALLY selling: ${sellUI.toLocaleString()} tokens (${percentage}%)`);
  
  try {
    // Execute the REAL swap
    const result = await executeRealSwap(tokenMint, SOL_MINT, sellAmount.toString());
    
    log(`✅ REAL AUTONOMOUS SELL COMPLETE!`);
    
    // Wait and check final balances
    await new Promise(r => setTimeout(r, 5000));
    
    const finalToken = await getTokenBalance(tokenMint);
    const finalSOL = await getSOLBalance();
    
    log(`📊 AFTER REAL SWAP:`);
    log(`  Tokens: ${finalToken.uiAmount.toLocaleString()}`);
    log(`  SOL: ${finalSOL.toFixed(4)}`);
    
    const tokenChange = finalToken.uiAmount - initialToken.uiAmount;
    const solChange = finalSOL - initialSOL;
    
    log(`📈 ACTUAL BALANCE CHANGES:`);
    log(`  Tokens: ${tokenChange.toLocaleString()} (${tokenChange < 0 ? 'DECREASED' : 'INCREASED'})`);
    log(`  SOL: +${solChange.toFixed(4)} (${solChange > 0 ? 'INCREASED' : 'NO CHANGE'})`);
    
    // Auto-tweet the REAL execution
    try {
      const tweet = `🔥 REAL AUTONOMOUS SELL EXECUTED

${sellUI.toLocaleString()} tokens → ${result.outputAmount.toFixed(4)} SOL

TX: ${result.signature.substring(0,8)}...

ACTUAL BALANCE CHANGES:
Tokens: ${tokenChange.toLocaleString()}
SOL: +${solChange.toFixed(4)}

NO MANUAL INTERVENTION 🦞⚡`;

      execSync(`node tweet.mjs "${tweet.replace(/"/g, '\\"').replace(/\$/g, '\\$')}"`, {
        cwd: '/Users/younghogey/.openclaw/workspace/SOLGizmo',
        stdio: 'inherit'
      });
      
      log('📢 Auto-tweeted REAL execution');
    } catch (e) {
      log(`⚠️ Auto-tweet failed: ${e.message}`);
    }
    
    return {
      ...result,
      balanceChanges: {
        tokensBefore: initialToken.uiAmount,
        tokensAfter: finalToken.uiAmount,
        tokenChange: tokenChange,
        solBefore: initialSOL,
        solAfter: finalSOL,
        solChange: solChange
      }
    };
    
  } catch (e) {
    log(`❌ REAL sell failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

async function main() {
  const tokenMint = process.argv[2];
  const percentage = process.argv[3] ? parseInt(process.argv[3]) : 100;

  if (!tokenMint) {
    console.log('Usage: node REAL-autonomous-swapper.mjs <TOKEN_MINT> [percentage]');
    console.log('');
    console.log('🚨 EXECUTES REAL SWAPS - AUTOMATICALLY CHANGES BALANCES!');
    console.log('🤖 NO LINKS - NO MANUAL CLICKS - PURE AUTONOMOUS EXECUTION');
    process.exit(1);
  }

  log('🦞 REAL AUTONOMOUS SWAPPER - AUTOMATIC EXECUTION');
  log(`📡 Wallet: ${keypair.publicKey.toString()}`);
  log('🚨 THIS WILL AUTOMATICALLY CHANGE YOUR TOKEN BALANCES');
  
  const result = await REALLY_sell_tokens(tokenMint, percentage);
  
  console.log('\n🏁 REAL AUTONOMOUS SWAP RESULT:');
  console.log(JSON.stringify(result, null, 2));
  
  if (result.success) {
    log('🎉 REAL AUTONOMOUS SWAP SUCCESSFUL!');
    log(`📡 TX: https://solscan.io/tx/${result.signature}`);
    log('✅ YOUR TOKEN BALANCES ACTUALLY CHANGED AUTOMATICALLY');
    log('🤖 NO MANUAL INTERVENTION REQUIRED');
  } else {
    log(`❌ Real autonomous swap failed: ${result.error}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error('💥 CRITICAL ERROR:', e.message);
    process.exit(1);
  });
}

export { REALLY_sell_tokens };