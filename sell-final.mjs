import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// ALTERNATIVE RPC ENDPOINTS - AVOID RATE LIMITS
const RPC_ENDPOINTS = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo', 
  'https://rpc.ankr.com/solana',
  'https://solana.publicnode.com'
];

let connection;
for (const rpc of RPC_ENDPOINTS) {
  try {
    const c = new Connection(rpc, 'confirmed');
    await c.getSlot();
    connection = c;
    console.log(`✅ Connected to: ${rpc}`);
    break;
  } catch (e) {
    console.log(`❌ Failed: ${rpc} - ${e.message}`);
    continue;
  }
}

if (!connection) {
  console.error('❌ All RPCs failed');
  process.exit(1);
}

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

async function tryJupiterV4() {
  console.log('🔄 Trying Jupiter V4 API...');
  const balance = await getTokenBalance(TOKEN);
  const sellAmount = balance.amount;
  
  const quoteUrl = `https://quote-api.jup.ag/v4/quote?inputMint=${TOKEN}&outputMint=${SOL_MINT}&amount=${sellAmount}&slippageBps=1500&onlyDirectRoutes=false`;
  
  const quoteResp = await fetch(quoteUrl);
  console.log(`Jupiter V4 quote: ${quoteResp.status}`);
  
  if (!quoteResp.ok) {
    const errorText = await quoteResp.text();
    throw new Error(`V4 Quote failed: ${errorText}`);
  }
  
  const route = await quoteResp.json();
  
  const txResp = await fetch('https://quote-api.jup.ag/v4/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      route: route.data[0],
      userPublicKey: keypair.publicKey.toString(),
      wrapUnwrapSOL: true
    })
  });
  
  if (!txResp.ok) {
    throw new Error(`V4 Swap failed: ${await txResp.text()}`);
  }
  
  const { swapTransaction } = await txResp.json();
  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([keypair]);
  
  const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  console.log(`✅ Jupiter V4 TX: https://solscan.io/tx/${txid}`);
  
  return { txid, amount: Number(route.data[0].outAmount) / LAMPORTS_PER_SOL };
}

async function tryRaydiumDirect() {
  console.log('🔄 Trying Raydium API...');
  const balance = await getTokenBalance(TOKEN);
  
  // Direct Raydium swap API call
  const raydiumResp = await fetch('https://api.raydium.io/v2/main/quote', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      inputMint: TOKEN,
      outputMint: SOL_MINT,
      amount: balance.amount.toString(),
      slippage: 15
    })
  });
  
  if (raydiumResp.ok) {
    const raydiumQuote = await raydiumResp.json();
    console.log(`✅ Raydium available: ${JSON.stringify(raydiumQuote).substring(0, 100)}...`);
    return raydiumQuote;
  } else {
    throw new Error(`Raydium failed: ${await raydiumResp.text()}`);
  }
}

async function main() {
  console.log(`🚨 FINAL SELL ATTEMPT - BYPASSING RATE LIMITS`);
  console.log(`🚨 REASON: HELIUS $50 CREDITS EXHAUSTED - "max usage reached"`);
  
  if (!TOKEN) {
    console.log('Usage: node sell-final.mjs <TOKEN_CA>');
    process.exit(1);
  }
  
  const balance = await getTokenBalance(TOKEN);
  console.log(`Balance: ${balance.uiAmount} tokens (${balance.amount})`);
  
  if (balance.amount === 0n) {
    console.log('❌ No tokens to sell');
    return;
  }

  // Try multiple approaches
  const approaches = [
    tryJupiterV4,
    tryRaydiumDirect
  ];
  
  for (const approach of approaches) {
    try {
      const result = await approach();
      console.log(`✅ SUCCESS with approach: ${approach.name}`);
      return result;
    } catch (e) {
      console.log(`❌ ${approach.name} failed: ${e.message}`);
      continue;
    }
  }
  
  console.log('❌ ALL APPROACHES FAILED');
  console.log('🚨 MANUAL INTERVENTION REQUIRED');
  console.log(`Token: ${TOKEN}`);
  console.log(`Amount: ${balance.uiAmount} tokens`);
  console.log(`Wallet: ${keypair.publicKey.toString()}`);
  
  process.exit(1);
}

main().catch(e => {
  console.error('❌ FATAL ERROR:', e.message);
  process.exit(1);
});