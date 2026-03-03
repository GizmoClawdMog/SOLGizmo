import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// 🚀 LOCAL RPC - ZERO COSTS, ZERO RATE LIMITS
const connection = new Connection('http://localhost:8899', 'confirmed');
const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN = process.argv[2];
const AMOUNT_ARG = process.argv[3] || '100%';

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
  console.log(`🦞 GIZMO LOCAL RPC SELLING - ZERO API COSTS`);
  
  if (!TOKEN) {
    console.log('Usage: node sell-local.mjs <TOKEN_CA> [amount|100%]');
    process.exit(1);
  }
  
  // Test local RPC connection first
  try {
    const slot = await connection.getSlot();
    console.log(`✅ Local RPC connected - slot: ${slot}`);
  } catch (e) {
    console.error(`❌ Local RPC not running: ${e.message}`);
    console.error(`💡 Start it with: node start-rpc-simple.mjs`);
    process.exit(1);
  }
  
  const balance = await getTokenBalance(TOKEN);
  console.log(`Token balance: ${balance.uiAmount} (raw: ${balance.amount})`);
  
  if (balance.amount === 0n) {
    console.log('❌ No tokens to sell');
    process.exit(1);
  }

  let sellAmount;
  if (AMOUNT_ARG.endsWith('%')) {
    const pct = parseFloat(AMOUNT_ARG) / 100;
    sellAmount = BigInt(Math.floor(Number(balance.amount) * pct));
  } else {
    sellAmount = BigInt(Math.floor(parseFloat(AMOUNT_ARG) * (10 ** balance.decimals)));
  }

  console.log(`Selling ${sellAmount} tokens (${Number(sellAmount) / (10 ** balance.decimals)} units) → SOL...`);

  // Get Jupiter quote (this part still uses external API)
  const quoteResp = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${TOKEN}&outputMint=${SOL_MINT}&amount=${sellAmount}&slippageBps=1500`);
  
  if (!quoteResp.ok) {
    console.log(`❌ Jupiter quote failed: ${quoteResp.status} - falling back to manual sell link`);
    const phantomUrl = `https://phantom.app/ul/v1/browse/swap?inputToken=${TOKEN}&outputToken=${SOL_MINT}&amount=${sellAmount}`;
    console.log(`🔗 Manual sell: ${phantomUrl}`);
    return;
  }
  
  const quote = await quoteResp.json();
  if (quote.error) throw new Error(quote.error);
  
  const outSol = Number(quote.outAmount) / LAMPORTS_PER_SOL;
  console.log(`Output: ~${outSol.toFixed(4)} SOL | Impact: ${quote.priceImpactPct || '0'}%`);

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
  console.log(`📡 Broadcasting sell via localhost:8899...`);
  const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  console.log(`TX: https://solscan.io/tx/${txid}`);

  console.log(`⏳ Confirming via LOCAL RPC...`);
  const conf = await connection.confirmTransaction(txid, 'confirmed');
  if (conf.value.err) {
    console.log('❌ FAILED:', conf.value.err);
  } else {
    console.log(`✅ CONFIRMED — sold for ~${outSol.toFixed(4)} SOL via LOCAL RPC`);
  }
}

main().catch(e => console.error('Error:', e.message));