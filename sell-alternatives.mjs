import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// SUSTAINABLE RPC - Free public endpoint
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN = process.argv[2];

async function getTokenBalance(mint) {
  const tokenAccounts = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { mint: new PublicKey(mint) });
  if (!tokenAccounts.value.length) return { amount: 0n, decimals: 0, uiAmount: 0 };
  const info = tokenAccounts.value[0].account.data.parsed.info;
  return {
    amount: BigInt(info.tokenAmount.amount),
    decimals: info.tokenAmount.decimals,
    uiAmount: info.tokenAmount.uiAmount
  };
}

// ALTERNATIVE 1: Orca API (Jupiter competitor)
async function sellViaOrca(tokenAmount) {
  console.log('🐋 Trying Orca API...');
  
  const quoteUrl = `https://api.orca.so/v1/quote?inputToken=${TOKEN}&outputToken=${SOL_MINT}&amount=${tokenAmount}&slippage=15`;
  
  try {
    const response = await fetch(quoteUrl);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const quote = await response.json();
    console.log(`✅ Orca quote: ${JSON.stringify(quote).substring(0, 100)}...`);
    
    // Get transaction from Orca
    const swapResponse = await fetch('https://api.orca.so/v1/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quote,
        userPublicKey: keypair.publicKey.toString()
      })
    });
    
    if (!swapResponse.ok) throw new Error(`Swap failed: ${await swapResponse.text()}`);
    
    const { transaction } = await swapResponse.json();
    const tx = VersionedTransaction.deserialize(Buffer.from(transaction, 'base64'));
    tx.sign([keypair]);
    
    const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
    console.log(`✅ Orca TX: https://solscan.io/tx/${txid}`);
    
    return { txid, platform: 'Orca' };
    
  } catch (e) {
    throw new Error(`Orca failed: ${e.message}`);
  }
}

// ALTERNATIVE 2: DexLab API
async function sellViaDexLab(tokenAmount) {
  console.log('🧪 Trying DexLab API...');
  
  try {
    const response = await fetch('https://api.dexlab.space/v1/swap/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputMint: TOKEN,
        outputMint: SOL_MINT,
        amount: tokenAmount.toString(),
        slippage: 1500 // 15%
      })
    });
    
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    
    const quote = await response.json();
    console.log(`✅ DexLab quote available`);
    
    return { platform: 'DexLab', quote };
    
  } catch (e) {
    throw new Error(`DexLab failed: ${e.message}`);
  }
}

// ALTERNATIVE 3: 1inch for Solana
async function sellVia1inch(tokenAmount) {
  console.log('🦄 Trying 1inch Solana API...');
  
  try {
    const quoteUrl = `https://api.1inch.dev/swap/v6.0/solana/quote?src=${TOKEN}&dst=${SOL_MINT}&amount=${tokenAmount}`;
    
    const response = await fetch(quoteUrl, {
      headers: {
        'Authorization': 'Bearer YOUR_API_KEY', // Would need real API key
        'accept': 'application/json'
      }
    });
    
    if (response.ok) {
      const quote = await response.json();
      console.log(`✅ 1inch available`);
      return { platform: '1inch', quote };
    } else {
      throw new Error(`HTTP ${response.status}`);
    }
    
  } catch (e) {
    throw new Error(`1inch failed: ${e.message}`);
  }
}

// ALTERNATIVE 4: Direct Birdeye API for price + manual swap
async function sellViaBirdeye(tokenAmount) {
  console.log('🐦 Getting Birdeye price data...');
  
  try {
    const priceResponse = await fetch(`https://public-api.birdeye.so/defi/price?address=${TOKEN}`, {
      headers: {
        'X-API-KEY': 'YOUR_BIRDEYE_KEY' // Would need API key
      }
    });
    
    if (priceResponse.ok) {
      const priceData = await priceResponse.json();
      const estimatedSOL = (Number(tokenAmount) * priceData.data.value) / LAMPORTS_PER_SOL;
      
      console.log(`✅ Birdeye price: $${priceData.data.value} | Est. output: ${estimatedSOL.toFixed(4)} SOL`);
      
      return { platform: 'Birdeye', estimatedSOL, priceData };
    } else {
      throw new Error(`HTTP ${priceResponse.status}`);
    }
    
  } catch (e) {
    throw new Error(`Birdeye failed: ${e.message}`);
  }
}

// ALTERNATIVE 5: Generate Phantom deep link for manual sell
function generatePhantomSellLink(tokenMint, amount) {
  console.log('👻 Generating Phantom wallet sell link...');
  
  const phantomUrl = `https://phantom.app/ul/v1/browse/swap?inputToken=${tokenMint}&outputToken=${SOL_MINT}&amount=${amount}`;
  
  console.log(`✅ Phantom sell link: ${phantomUrl}`);
  console.log('📱 Open this link in browser with Phantom wallet connected');
  
  return { platform: 'Phantom', url: phantomUrl };
}

async function main() {
  console.log(`🚨 ALTERNATIVE SELL SYSTEMS - BYPASSING JUPITER`);
  console.log(`🚨 SUSTAINABLE RPC: api.mainnet-beta.solana.com (FREE)`);
  
  if (!TOKEN) {
    console.log('Usage: node sell-alternatives.mjs <TOKEN_CA>');
    process.exit(1);
  }
  
  const balance = await getTokenBalance(TOKEN);
  console.log(`Balance: ${balance.uiAmount} tokens`);
  
  if (balance.amount === 0n) {
    console.log('❌ No tokens to sell');
    return;
  }

  const tokenAmount = balance.amount;
  
  // Try all alternatives
  const alternatives = [
    () => sellViaOrca(tokenAmount),
    () => sellViaDexLab(tokenAmount),
    () => sellVia1inch(tokenAmount),
    () => sellViaBirdeye(tokenAmount),
    () => generatePhantomSellLink(TOKEN, tokenAmount)
  ];
  
  let successCount = 0;
  
  for (const alternative of alternatives) {
    try {
      const result = await alternative();
      console.log(`✅ SUCCESS: ${result.platform}`);
      successCount++;
      
      // If we get a working transaction, stop here
      if (result.txid) {
        console.log(`🎯 TRADE EXECUTED via ${result.platform}`);
        return result;
      }
      
    } catch (e) {
      console.log(`❌ ${e.message}`);
      continue;
    }
  }
  
  if (successCount === 0) {
    console.log('❌ ALL ALTERNATIVES FAILED');
    console.log('🚨 MANUAL INTERVENTION REQUIRED');
    console.log(`📱 Use Phantom/Solflare wallet interface directly:`);
    console.log(`   Token: ${TOKEN}`);
    console.log(`   Amount: ${balance.uiAmount}`);
    console.log(`   Wallet: ${keypair.publicKey.toString()}`);
  }
}

main().catch(e => {
  console.error('❌ FATAL ERROR:', e.message);
  process.exit(1);
});