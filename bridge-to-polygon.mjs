/**
 * 🦞 Bridge USDC from Solana to Polygon via deBridge (DLN)
 * Usage: node bridge-to-polygon.mjs <amount_usdc>
 */
import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

const RPC = `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`;
const WALLET_PATH = process.env.SOLANA_WALLET_JSON ? null : process.env.HOME + '/.gizmo/solana-wallet.json';
const EVM_DEST = '0xee4a54b72aA1fad59f83308c7Aa65BeA1C5d81E5';

// USDC addresses
const SOL_USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const POLYGON_USDC = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';

async function main() {
  const amount = parseFloat(process.argv[2] || '500');
  const amountRaw = Math.floor(amount * 1e6); // USDC has 6 decimals
  
  console.log(`🦞 Bridging ${amount} USDC from Solana → Polygon`);
  console.log(`Destination: ${EVM_DEST}`);
  
  // Load wallet
  const keyData = JSON.parse(fs.readFileSync(WALLET_PATH, 'utf-8'));
  let secretBytes;
  if (typeof keyData.secretKey === 'string') {
    secretBytes = bs58.decode(keyData.secretKey);
  } else if (Array.isArray(keyData.secretKey)) {
    secretBytes = Uint8Array.from(keyData.secretKey);
  } else if (Array.isArray(keyData)) {
    secretBytes = Uint8Array.from(keyData);
  }
  const keypair = Keypair.fromSecretKey(secretBytes);
  console.log(`Source wallet: ${keypair.publicKey.toBase58()}`);
  
  // Get quote from deBridge
  console.log('\nGetting quote from deBridge...');
  const quoteUrl = `https://api.dln.trade/v1.0/dln/order/quote?srcChainId=7565164&srcChainTokenIn=${SOL_USDC}&srcChainTokenInAmount=${amountRaw}&dstChainId=137&dstChainTokenOut=${POLYGON_USDC}&prependOperatingExpenses=true`;
  
  const quoteRes = await fetch(quoteUrl);
  const quote = await quoteRes.json();
  
  if (quote.error) {
    console.error('Quote error:', quote.error);
    return;
  }
  
  const estOut = quote.estimation?.dstChainTokenOut;
  console.log(`Estimated output: ${(parseInt(estOut?.amount || 0) / 1e6).toFixed(2)} USDC on Polygon`);
  console.log(`Recommended: ${(parseInt(estOut?.recommendedAmount || 0) / 1e6).toFixed(2)} USDC`);
  
  // Get create-tx from deBridge
  console.log('\nCreating bridge transaction...');
  const txUrl = `https://api.dln.trade/v1.0/dln/order/create-tx?srcChainId=7565164&srcChainTokenIn=${SOL_USDC}&srcChainTokenInAmount=${amountRaw}&dstChainId=137&dstChainTokenOut=${POLYGON_USDC}&dstChainTokenOutRecipient=${EVM_DEST}&srcChainOrderAuthorityAddress=${keypair.publicKey.toBase58()}&dstChainOrderAuthorityAddress=${EVM_DEST}&prependOperatingExpenses=true`;
  
  const txRes = await fetch(txUrl);
  const txData = await txRes.json();
  
  if (txData.error) {
    console.error('TX error:', txData.error);
    return;
  }
  
  if (!txData.tx?.data) {
    console.error('No transaction data received');
    console.log(JSON.stringify(txData, null, 2).slice(0, 500));
    return;
  }
  
  // Sign and send
  console.log('Signing and sending transaction...');
  const connection = new Connection(RPC, 'confirmed');
  
  const txBuf = Buffer.from(txData.tx.data, 'base64');
  const transaction = VersionedTransaction.deserialize(txBuf);
  transaction.sign([keypair]);
  
  const sig = await connection.sendRawTransaction(transaction.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  
  console.log(`\n✅ Bridge TX sent!`);
  console.log(`TX: https://solscan.io/tx/${sig}`);
  console.log(`\nUSDC should arrive on Polygon within 1-5 minutes.`);
  console.log(`Check: https://polygonscan.com/address/${EVM_DEST}`);
  
  // Wait for confirmation
  const confirmation = await connection.confirmTransaction(sig, 'confirmed');
  if (confirmation.value.err) {
    console.error('TX failed:', confirmation.value.err);
  } else {
    console.log('✅ Transaction confirmed on Solana!');
    console.log('Waiting for deBridge to relay to Polygon...');
  }
}

main().catch(console.error);
