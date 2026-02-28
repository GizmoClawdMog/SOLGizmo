import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

const GIZMO_TOKEN = '8HGer4vRWZMu5MUYU7ACPb4uanKgBewaXJZscLagpump';
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const AMOUNT = 5 * LAMPORTS_PER_SOL;
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

console.log('Getting quote: 5 SOL → Gizmo...');
const quoteResp = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${SOL_MINT}&outputMint=${GIZMO_TOKEN}&amount=${AMOUNT}&slippageBps=500`);
const quote = await quoteResp.json();
console.log(`Output: ~${(Number(quote.outAmount) / 1e6).toFixed(0)} Gizmo tokens`);

console.log('Building swap...');
const swapResp = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
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

if (!swapResp.ok) throw new Error('Swap failed: ' + await swapResp.text());
const { swapTransaction } = await swapResp.json();

const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
tx.sign([keypair]);

console.log('Sending...');
const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
console.log(`TX: https://solscan.io/tx/${txid}`);

console.log('Confirming...');
const conf = await connection.confirmTransaction(txid, 'confirmed');
if (conf.value.err) console.log('FAILED:', conf.value.err);
else console.log('✅ CONFIRMED! 5 SOL → Gizmo! 🦞');
