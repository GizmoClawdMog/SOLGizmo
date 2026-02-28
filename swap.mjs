/**
 * Gizmo's First Real Trade 🦞
 * Buy Gizmo token with SOL via Jupiter aggregator
 */
import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

// Load wallet
const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));
console.log('Wallet:', keypair.publicKey.toBase58());

// Config
const GIZMO_TOKEN = '8HGer4vRWZMu5MUYU7ACPb4uanKgBewaXJZscLagpump';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const AMOUNT_SOL = 1; // 1 SOL
const AMOUNT_LAMPORTS = AMOUNT_SOL * LAMPORTS_PER_SOL;
const SLIPPAGE_BPS = 500; // 5% slippage

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

async function main() {
  // 1. Get quote from Jupiter
  console.log(`Getting quote: ${AMOUNT_SOL} SOL → Gizmo...`);
  const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${GIZMO_TOKEN}&amount=${AMOUNT_LAMPORTS}&slippageBps=${SLIPPAGE_BPS}`;
  const quoteResp = await fetch(quoteUrl);
  
  if (!quoteResp.ok) {
    throw new Error(`Quote failed: ${quoteResp.status} ${await quoteResp.text()}`);
  }
  
  const quote = await quoteResp.json();
  console.log('Quote received:');
  console.log(`  Input: ${AMOUNT_SOL} SOL`);
  console.log(`  Output: ${quote.outAmount} Gizmo tokens`);
  console.log(`  Price impact: ${quote.priceImpactPct}%`);
  
  // 2. Get swap transaction from Jupiter
  console.log('Building swap transaction...');
  const swapResp = await fetch('https://quote-api.jup.ag/v6/swap', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      quoteResponse: quote,
      userPublicKey: keypair.publicKey.toBase58(),
      wrapAndUnwrapSol: true,
      dynamicComputeUnitLimit: true,
      prioritizationFeeLamports: 'auto'
    })
  });
  
  if (!swapResp.ok) {
    throw new Error(`Swap build failed: ${swapResp.status} ${await swapResp.text()}`);
  }
  
  const { swapTransaction } = await swapResp.json();
  
  // 3. Deserialize and sign
  const txBuf = Buffer.from(swapTransaction, 'base64');
  const tx = VersionedTransaction.deserialize(txBuf);
  tx.sign([keypair]);
  
  // 4. Send transaction
  console.log('Sending transaction...');
  const txid = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: true,
    maxRetries: 3
  });
  
  console.log(`✅ Transaction sent!`);
  console.log(`TX: https://solscan.io/tx/${txid}`);
  
  // 5. Confirm
  console.log('Confirming...');
  const confirmation = await connection.confirmTransaction(txid, 'confirmed');
  
  if (confirmation.value.err) {
    console.log('❌ Transaction failed:', confirmation.value.err);
  } else {
    console.log('✅ CONFIRMED! Gizmo bought Gizmo. 🦞');
  }
}

main().catch(e => {
  console.error('Error:', e.message);
  process.exit(1);
});
