import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// 🧠 HYBRID AUTONOMOUS APPROACH
// Mainnet for real data, Local for broadcasting when possible
const mainnetConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const localConnection = new Connection('http://localhost:8899', 'confirmed');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN = process.argv[2];

async function checkLocalRPC() {
  try {
    await localConnection.getSlot();
    console.log('✅ Local RPC available for zero-cost operations');
    return true;
  } catch (e) {
    console.log('❌ Local RPC not available, using mainnet only');
    return false;
  }
}

async function getTokenBalance(mint) {
  console.log('📊 Reading token balance from mainnet...');
  
  try {
    const tokenAccounts = await mainnetConnection.getParsedTokenAccountsByOwner(
      keypair.publicKey, 
      { mint: new PublicKey(mint) }
    );
    
    if (!tokenAccounts.value.length) {
      return { amount: 0n, decimals: 0, uiAmount: 0 };
    }
    
    const info = tokenAccounts.value[0].account.data.parsed.info;
    return {
      amount: BigInt(info.tokenAmount.amount),
      decimals: info.tokenAmount.decimals,
      uiAmount: info.tokenAmount.uiAmount
    };
    
  } catch (e) {
    throw new Error(`Balance check failed: ${e.message}`);
  }
}

async function tryJupiterSell(sellAmount) {
  console.log('🪐 Attempting Jupiter v6 sell...');
  
  try {
    const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${TOKEN}&outputMint=${SOL_MINT}&amount=${sellAmount}&slippageBps=1500`;
    console.log(`📡 Quote request: ${quoteUrl.substring(0, 100)}...`);
    
    const quoteResp = await fetch(quoteUrl);
    console.log(`📡 Quote response: ${quoteResp.status} ${quoteResp.statusText}`);
    
    if (!quoteResp.ok) {
      const errorText = await quoteResp.text();
      throw new Error(`Quote failed: ${quoteResp.status} - ${errorText.substring(0, 100)}`);
    }
    
    const quote = await quoteResp.json();
    if (quote.error) throw new Error(`Quote error: ${quote.error}`);
    
    const outSol = Number(quote.outAmount) / LAMPORTS_PER_SOL;
    console.log(`✅ Jupiter quote: ${outSol.toFixed(4)} SOL output`);
    
    const swapResp = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { autoMultiplier: 3 }
      })
    });
    
    console.log(`📡 Swap response: ${swapResp.status} ${swapResp.statusText}`);
    
    if (!swapResp.ok) {
      const errorText = await swapResp.text();
      throw new Error(`Swap failed: ${swapResp.status} - ${errorText.substring(0, 100)}`);
    }
    
    const swapData = await swapResp.json();
    const { swapTransaction } = swapData;
    
    return {
      transaction: VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64')),
      outputSOL: outSol
    };
    
  } catch (e) {
    throw new Error(`Jupiter v6 failed: ${e.message}`);
  }
}

async function broadcastTransaction(tx) {
  console.log('📡 Preparing transaction broadcast...');
  
  tx.sign([keypair]);
  
  const isLocalAvailable = await checkLocalRPC();
  
  if (isLocalAvailable) {
    try {
      console.log('🚀 Attempting broadcast via LOCAL RPC (zero cost)...');
      const txid = await localConnection.sendRawTransaction(tx.serialize(), { 
        skipPreflight: true, 
        maxRetries: 3 
      });
      
      console.log(`✅ LOCAL RPC broadcast successful: ${txid}`);
      return { txid, method: 'LOCAL RPC (zero cost)' };
      
    } catch (e) {
      console.log(`❌ Local RPC broadcast failed: ${e.message}`);
    }
  }
  
  // Fallback to mainnet
  console.log('🔄 Falling back to mainnet broadcast...');
  const txid = await mainnetConnection.sendRawTransaction(tx.serialize(), { 
    skipPreflight: true, 
    maxRetries: 3 
  });
  
  console.log(`✅ MAINNET broadcast successful: ${txid}`);
  return { txid, method: 'MAINNET (fallback)' };
}

async function generateManualSellLink(sellAmount) {
  const phantomUrl = `https://phantom.app/ul/v1/browse/swap?inputToken=${TOKEN}&outputToken=${SOL_MINT}&amount=${sellAmount}`;
  
  console.log('\n🔗 MANUAL SELL LINK (if needed):');
  console.log(phantomUrl);
  console.log('\n📱 Instructions:');
  console.log('1. Copy link above');
  console.log('2. Open in browser with Phantom wallet');
  console.log('3. Connect wallet and confirm transaction');
  
  return phantomUrl;
}

async function main() {
  console.log('🚨 HYBRID AUTONOMOUS SELL SYSTEM');
  console.log('🧠 Data: Mainnet | Broadcasting: Local→Mainnet fallback');
  
  if (!TOKEN) {
    console.log('Usage: node hybrid-autonomous-sell.mjs <TOKEN_CA>');
    process.exit(1);
  }
  
  console.log(`🎯 Token: ${TOKEN}`);
  console.log(`📡 Wallet: ${keypair.publicKey.toString()}`);
  
  // Step 1: Get balance from mainnet (real data)
  const balance = await getTokenBalance(TOKEN);
  console.log(`💰 Balance: ${balance.uiAmount} tokens (${balance.amount})`);
  
  if (balance.amount === 0n) {
    console.log('❌ No tokens to sell');
    return;
  }
  
  const sellAmount = balance.amount; // Sell 100%
  const sellUnits = Number(sellAmount) / (10 ** balance.decimals);
  console.log(`🎯 Selling: ${sellUnits} tokens (100%)`);
  
  // Step 2: Try autonomous Jupiter sell
  try {
    console.log('\n🤖 ATTEMPTING AUTONOMOUS SELL...');
    const swapResult = await tryJupiterSell(sellAmount);
    
    console.log(`✅ Jupiter transaction prepared`);
    console.log(`💰 Expected output: ${swapResult.outputSOL.toFixed(4)} SOL`);
    
    // Step 3: Broadcast via best available method
    const broadcastResult = await broadcastTransaction(swapResult.transaction);
    
    console.log(`\n🎉 AUTONOMOUS SELL SUCCESSFUL!`);
    console.log(`📡 TX: https://solscan.io/tx/${broadcastResult.txid}`);
    console.log(`💰 Output: ~${swapResult.outputSOL.toFixed(4)} SOL`);
    console.log(`📡 Broadcast: ${broadcastResult.method}`);
    
    // Wait for confirmation
    console.log('\n⏳ Confirming transaction...');
    const connection = broadcastResult.method.includes('LOCAL') ? localConnection : mainnetConnection;
    
    const conf = await connection.confirmTransaction(broadcastResult.txid, 'confirmed');
    
    if (conf.value.err) {
      console.log(`❌ Transaction failed: ${conf.value.err}`);
    } else {
      console.log(`✅ TRANSACTION CONFIRMED!`);
      console.log(`🎯 Successfully sold ${sellUnits} tokens for ${swapResult.outputSOL.toFixed(4)} SOL`);
      
      return {
        success: true,
        txid: broadcastResult.txid,
        outputSOL: swapResult.outputSOL,
        method: broadcastResult.method
      };
    }
    
  } catch (e) {
    console.log(`\n❌ Autonomous sell failed: ${e.message}`);
    console.log('🔄 Generating manual sell option...');
    
    const manualLink = await generateManualSellLink(sellAmount);
    
    return {
      success: false,
      method: 'manual',
      link: manualLink,
      amount: sellUnits
    };
  }
}

main().catch(e => {
  console.error(`\n💥 CRITICAL ERROR: ${e.message}`);
  console.error(e.stack);
  process.exit(1);
});