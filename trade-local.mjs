import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// 🚀 LOCAL RPC - ZERO COSTS, ZERO RATE LIMITS
const connection = new Connection('http://localhost:8899', 'confirmed');
const SOL_MINT = 'So11111111111111111111111111111111111111112';

const TOKEN = process.argv[2];
const AMOUNT_SOL = parseFloat(process.argv[3]);
const AMOUNT = Math.floor(AMOUNT_SOL * LAMPORTS_PER_SOL);

async function main() {
  console.log(`🦞 GIZMO LOCAL RPC TRADING - ZERO API COSTS`);
  console.log(`Swapping ${AMOUNT_SOL} SOL → ${TOKEN}...`);
  
  // Test local RPC connection first
  try {
    const slot = await connection.getSlot();
    console.log(`✅ Local RPC connected - slot: ${slot}`);
  } catch (e) {
    console.error(`❌ Local RPC failed: ${e.message}`);
    console.error(`💡 Make sure local RPC is running: node start-rpc-simple.mjs`);
    process.exit(1);
  }
  
  // Use Jupiter but with our local RPC for broadcasting
  const quoteResp = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${SOL_MINT}&outputMint=${TOKEN}&amount=${AMOUNT}&slippageBps=500`);
  const quote = await quoteResp.json();
  if (quote.error) throw new Error(quote.error);
  console.log(`Output: ${quote.outAmount} tokens | Impact: ${quote.priceImpactPct || '0'}%`);

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
  if (!swapResp.ok) throw new Error('Swap failed: ' + await swapResp.text());
  const { swapTransaction } = await swapResp.json();

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([keypair]);

  // 🚀 BROADCAST VIA LOCAL RPC - ZERO COSTS
  console.log(`📡 Broadcasting via localhost:8899...`);
  const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  console.log(`TX: https://solscan.io/tx/${txid}`);

  const conf = await connection.confirmTransaction(txid, 'confirmed');
  if (conf.value.err) console.log('❌ FAILED:', conf.value.err);
  else console.log('✅ CONFIRMED via LOCAL RPC');
}

main().catch(e => console.error('Error:', e.message));