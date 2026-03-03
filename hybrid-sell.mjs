import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// 🧠 HYBRID APPROACH: Mainnet for data, Local for broadcasting
const mainnetConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const localConnection = new Connection('http://localhost:8899', 'confirmed');

const SOL_MINT = 'So11111111111111111111111111111111111111112';
const TOKEN = process.argv[2];
const AMOUNT_ARG = process.argv[3] || '100%';

async function getTokenBalance(mint) {
  // Use mainnet to get real account data
  const tokenAccounts = await mainnetConnection.getParsedTokenAccountsByOwner(keypair.publicKey, { mint: new PublicKey(mint) });
  if (!tokenAccounts.value.length) return { amount: 0n, decimals: 0, uiAmount: 0 };
  const info = tokenAccounts.value[0].account.data.parsed.info;
  return {
    amount: BigInt(info.tokenAmount.amount),
    decimals: info.tokenAmount.decimals,
    uiAmount: info.tokenAmount.uiAmount
  };
}

async function testLocalRPC() {
  try {
    const response = await localConnection.getSlot();
    console.log(`✅ Local RPC available - slot: ${response}`);
    return true;
  } catch (e) {
    console.log(`❌ Local RPC not available: ${e.message}`);
    return false;
  }
}

async function main() {
  console.log(`🦞 GIZMO HYBRID SELL SYSTEM`);
  console.log(`📊 Data source: Mainnet (real balances)`);
  console.log(`📡 Broadcast: Local RPC (zero costs) or fallback to mainnet`);
  
  if (!TOKEN) {
    console.log('Usage: node hybrid-sell.mjs <TOKEN_CA> [amount|100%]');
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

  // Get Jupiter quote
  const quoteResp = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${TOKEN}&outputMint=${SOL_MINT}&amount=${sellAmount}&slippageBps=1500`);
  
  if (!quoteResp.ok) {
    console.log(`❌ Jupiter quote failed: ${quoteResp.status} - generating manual sell link`);
    const phantomUrl = `https://phantom.app/ul/v1/browse/swap?inputToken=${TOKEN}&outputToken=${SOL_MINT}&amount=${sellAmount}`;
    console.log(`🔗 Manual sell: ${phantomUrl}`);
    return { method: 'manual', link: phantomUrl };
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

  // Try local RPC first, fallback to mainnet
  const isLocalRPCAvailable = await testLocalRPC();
  const connection = isLocalRPCAvailable ? localConnection : mainnetConnection;
  const broadcastMethod = isLocalRPCAvailable ? 'LOCAL RPC (zero cost)' : 'MAINNET (fallback)';
  
  console.log(`📡 Broadcasting via ${broadcastMethod}...`);
  const txid = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: true, maxRetries: 3 });
  console.log(`TX: https://solscan.io/tx/${txid}`);

  console.log(`⏳ Confirming...`);
  const conf = await connection.confirmTransaction(txid, 'confirmed');
  if (conf.value.err) {
    console.log('❌ FAILED:', conf.value.err);
  } else {
    console.log(`✅ SUCCESS — sold ${Number(sellAmount) / (10 ** balance.decimals)} tokens for ~${outSol.toFixed(4)} SOL`);
    console.log(`📡 Broadcast method: ${broadcastMethod}`);
    
    return {
      method: 'automated',
      txid,
      outputSOL: outSol,
      broadcastMethod: broadcastMethod
    };
  }
}

main().catch(e => console.error('Error:', e.message));