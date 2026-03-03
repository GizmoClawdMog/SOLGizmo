import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// FORCE HELIUS RPC - $50 PAID CREDITS
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=2de73660-14b8-412a-9ff2-8e6989c53266';
const connection = new Connection(HELIUS_RPC, 'confirmed');

console.log(`🚨 USING PAID HELIUS RPC: ${HELIUS_RPC.substring(0, 60)}...`);

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
  console.log(`🚨 EMERGENCY SELL WITH $50 HELIUS CREDITS`);
  
  // Test connection first
  try {
    const slot = await connection.getSlot();
    console.log(`✅ Helius connected - current slot: ${slot}`);
  } catch (e) {
    console.error(`❌ Helius connection failed: ${e.message}`);
    process.exit(1);
  }
  
  const balance = await getTokenBalance(TOKEN);
  console.log(`Token balance: ${balance.uiAmount} tokens`);
  
  if (balance.amount === 0n) {
    console.log('❌ No tokens to sell');
    return;
  }

  const sellAmount = balance.amount;
  console.log(`Selling ALL ${sellAmount} tokens → SOL...`);

  // Try Jupiter with different user agent and headers
  const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${TOKEN}&outputMint=${SOL_MINT}&amount=${sellAmount}&slippageBps=1500`;
  console.log(`📡 Quote URL: ${quoteUrl}`);
  
  const quoteResp = await fetch(quoteUrl, {
    headers: {
      'User-Agent': 'Gizmo-Trading-Bot/1.0',
      'Accept': 'application/json',
      'Content-Type': 'application/json'
    }
  });
  
  console.log(`📡 Quote response: ${quoteResp.status} ${quoteResp.statusText}`);
  
  if (!quoteResp.ok) {
    const errorText = await quoteResp.text();
    console.log(`❌ Quote failed: ${errorText}`);
    
    // TRY ALTERNATIVE: 1inch API for Solana
    console.log(`🔄 Trying alternative: 1inch API...`);
    const oneInchUrl = `https://api.1inch.dev/swap/v5.2/solana/quote?src=${TOKEN}&dst=${SOL_MINT}&amount=${sellAmount}`;
    
    try {
      const oneInchResp = await fetch(oneInchUrl);
      if (oneInchResp.ok) {
        console.log(`✅ 1inch API available - status: ${oneInchResp.status}`);
        const oneInchData = await oneInchResp.json();
        console.log(`1inch quote: ${JSON.stringify(oneInchData).substring(0, 200)}...`);
      }
    } catch (e) {
      console.log(`❌ 1inch also failed: ${e.message}`);
    }
    
    throw new Error(`All APIs failed - Jupiter: ${errorText}`);
  }
  
  const quote = await quoteResp.json();
  if (quote.error) throw new Error(quote.error);
  
  const outSol = Number(quote.outAmount) / LAMPORTS_PER_SOL;
  console.log(`✅ Quote: ~${outSol.toFixed(4)} SOL | Impact: ${quote.priceImpactPct || '0'}%`);

  const swapResp = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'User-Agent': 'Gizmo-Trading-Bot/1.0',
      'Accept': 'application/json'
    },
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
    console.log(`❌ Swap failed: ${errorText}`);
    throw new Error('Swap failed: ' + errorText);
  }
  
  const { swapTransaction } = await swapResp.json();

  const tx = VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64'));
  tx.sign([keypair]);

  console.log(`📡 Broadcasting via HELIUS...`);
  const txid = await connection.sendRawTransaction(tx.serialize(), { 
    skipPreflight: true, 
    maxRetries: 5,
    preflightCommitment: 'processed'
  });
  console.log(`TX: https://solscan.io/tx/${txid}`);

  console.log(`⏳ Confirming via HELIUS...`);
  const conf = await connection.confirmTransaction(txid, 'confirmed');
  if (conf.value.err) {
    console.log('❌ FAILED:', conf.value.err);
  } else {
    console.log(`✅ SUCCESS — sold for ~${outSol.toFixed(4)} SOL`);
    
    // Tweet the successful sell
    console.log(`📱 Posting sell tweet...`);
  }
}

main().catch(e => {
  console.error('❌ FINAL ERROR:', e.message);
  console.error(e.stack);
  process.exit(1);
});