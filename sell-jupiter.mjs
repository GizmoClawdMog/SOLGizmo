import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// Use EXACT same RPC chain as working trade.mjs
const RPC_CHAIN = [
  process.env.RPC_URL,
  `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`,
  'https://solana.publicnode.com'
].filter(Boolean);

let connection;
for (const rpc of RPC_CHAIN) {
  try {
    const c = new Connection(rpc);
    await c.getSlot();
    connection = c;
    console.log(`✅ Connected to: ${rpc.substring(0, 50)}...`);
    break;
  } catch { continue; }
}
if (!connection) { console.error('All RPCs failed'); process.exit(1); }

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

async function main() {
  console.log(`🚨 JUPITER SELL - EXACT SAME API AS WORKING BUY`);
  
  const balance = await getTokenBalance(TOKEN);
  console.log(`Token balance: ${balance.uiAmount} tokens`);
  
  if (balance.amount === 0n) {
    console.log('❌ No tokens to sell');
    return;
  }

  // Sell 100% of tokens - USING EXACT SAME ENDPOINT AS WORKING BUY
  const sellAmount = balance.amount;
  console.log(`Selling ${sellAmount} tokens → SOL...`);

  console.log(`📡 Calling: https://lite-api.jup.ag/swap/v1/quote?inputMint=${TOKEN}&outputMint=${SOL_MINT}&amount=${sellAmount}&slippageBps=1500`);
  
  const quoteResp = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${TOKEN}&outputMint=${SOL_MINT}&amount=${sellAmount}&slippageBps=1500`);
  
  console.log(`📡 Quote response status: ${quoteResp.status}`);
  
  const quoteText = await quoteResp.text();
  console.log(`📡 Quote response: ${quoteText.substring(0, 300)}`);
  
  const quote = JSON.parse(quoteText);
  if (quote.error) throw new Error(quote.error);
  
  const outSol = Number(quote.outAmount) / LAMPORTS_PER_SOL;
  console.log(`✅ Output: ~${outSol.toFixed(4)} SOL | Impact: ${quote.priceImpactPct || '0'}%`);

  const swapResp = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
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
  
  console.log(`📡 Swap response status: ${swapResp.status}`);
  
  if (!swapResp.ok) {
    const errorText = await swapResp.text();
    console.log(`❌ Swap error: ${errorText}`);
    throw new Error('Swap failed: ' + errorText);
  }
  
  const { swapTransaction } = await swapResp.json();

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([keypair]);

  const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  console.log(`TX: https://solscan.io/tx/${txid}`);

  const conf = await connection.confirmTransaction(txid, 'confirmed');
  if (conf.value.err) console.log('❌ FAILED:', conf.value.err);
  else console.log(`✅ CONFIRMED — sold for ~${outSol.toFixed(4)} SOL`);
}

main().catch(e => console.error('❌ Error:', e.message));