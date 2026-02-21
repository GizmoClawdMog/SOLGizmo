/**
 * 🦞 Gizmo's Drift Protocol USDC Deposit Script
 * 
 * Deposits 1000 USDC into the Drift account.
 * Run: node deposit.mjs
 */

import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress } from '@solana/spl-token';
import {
  DriftClient,
  Wallet,
  initialize,
  BN,
  QUOTE_PRECISION,
  convertToNumber,
} from '@drift-labs/sdk';
import fs from 'fs';
import path from 'path';
import bs58 from 'bs58';

// ---- Config ----
const RPC_URL = process.env.SOLANA_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=2de73660-14b8-412a-9ff2-8e6989c53266';
const USDC_MINT = new PublicKey('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
const USDC_SPOT_MARKET_INDEX = 0;
const DEPOSIT_AMOUNT_USDC = 1000;

// ---- Load Wallet ----
function loadWallet() {
  const walletPath = process.env.WALLET_PATH || path.join(
    process.env.HOME || '~',
    '.gizmo',
    'solana-wallet.json'
  );
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));

  if (walletData.secretKey && typeof walletData.secretKey === 'string') {
    return Keypair.fromSecretKey(bs58.decode(walletData.secretKey));
  }
  if (walletData.secretKey && Array.isArray(walletData.secretKey)) {
    return Keypair.fromSecretKey(Uint8Array.from(walletData.secretKey));
  }
  if (Array.isArray(walletData)) {
    return Keypair.fromSecretKey(Uint8Array.from(walletData));
  }
  throw new Error('Unsupported wallet format');
}

// ---- Main ----
async function main() {
  const keypair = loadWallet();
  const wallet = new Wallet(keypair);
  const connection = new Connection(RPC_URL, { commitment: 'confirmed' });

  console.log(`🦞 Drift USDC Deposit Script`);
  console.log(`   Wallet: ${wallet.publicKey.toString()}`);
  console.log(`   RPC: ${RPC_URL}`);
  console.log(`   Deposit: ${DEPOSIT_AMOUNT_USDC} USDC`);

  // Check SOL balance
  const solBalance = await connection.getBalance(wallet.publicKey);
  console.log(`\n💰 SOL Balance: ${(solBalance / 1e9).toFixed(4)} SOL`);
  if (solBalance < 0.01 * 1e9) {
    console.error('❌ Insufficient SOL for transaction fees');
    process.exit(1);
  }

  // Get USDC token account and balance
  const usdcAta = await getAssociatedTokenAddress(USDC_MINT, wallet.publicKey);
  console.log(`   USDC ATA: ${usdcAta.toString()}`);

  const tokenAccountInfo = await connection.getTokenAccountBalance(usdcAta);
  const usdcBalance = parseFloat(tokenAccountInfo.value.uiAmountString);
  console.log(`   USDC Balance: ${usdcBalance} USDC`);

  if (usdcBalance < DEPOSIT_AMOUNT_USDC) {
    console.error(`❌ Insufficient USDC. Have ${usdcBalance}, need ${DEPOSIT_AMOUNT_USDC}`);
    process.exit(1);
  }

  // Initialize Drift client
  console.log('\n🔌 Connecting to Drift Protocol...');
  const sdkConfig = initialize({ env: 'mainnet-beta' });

  const driftClient = new DriftClient({
    connection,
    wallet,
    programID: new PublicKey(sdkConfig.DRIFT_PROGRAM_ID),
    accountSubscription: {
      type: 'websocket',
    },
  });

  await driftClient.subscribe();
  console.log('✅ Connected to Drift Protocol');

  // Check if user account exists
  let userAccountExists = false;
  try {
    const userAccountPubkey = await driftClient.getUserAccountPublicKey();
    const accountInfo = await connection.getAccountInfo(userAccountPubkey);
    userAccountExists = accountInfo !== null;
  } catch {
    userAccountExists = false;
  }

  if (!userAccountExists) {
    console.log('\n📝 No Drift account found. Initializing user account...');
    try {
      const [txSig, pubkey] = await driftClient.initializeUserAccount();
      console.log(`✅ User account initialized!`);
      console.log(`   Account: ${pubkey.toString()}`);
      console.log(`   Tx: ${txSig}`);
    } catch (e) {
      console.error(`❌ Failed to initialize user account: ${e.message}`);
      await driftClient.unsubscribe();
      process.exit(1);
    }
  } else {
    console.log('\n✅ Drift user account exists');
  }

  // Deposit USDC
  const depositAmount = new BN(DEPOSIT_AMOUNT_USDC).mul(QUOTE_PRECISION); // 1000 * 1e6
  console.log(`\n💸 Depositing ${DEPOSIT_AMOUNT_USDC} USDC into Drift...`);

  try {
    const txSig = await driftClient.deposit(
      depositAmount,
      USDC_SPOT_MARKET_INDEX,
      usdcAta
    );
    console.log(`✅ Deposit successful!`);
    console.log(`   Tx: ${txSig}`);
    console.log(`   Explorer: https://solscan.io/tx/${txSig}`);
  } catch (e) {
    console.error(`❌ Deposit failed: ${e.message}`);
    await driftClient.unsubscribe();
    process.exit(1);
  }

  // Check new balances
  const newTokenInfo = await connection.getTokenAccountBalance(usdcAta);
  console.log(`\n📊 Post-Deposit Balances:`);
  console.log(`   Wallet USDC: ${newTokenInfo.value.uiAmountString} USDC`);
  console.log(`   Deposited to Drift: ${DEPOSIT_AMOUNT_USDC} USDC`);

  await driftClient.unsubscribe();
  console.log('\n🦞 Done!');
}

main().catch((e) => {
  console.error(`❌ Fatal error: ${e.message}`);
  if (process.env.DEBUG) console.error(e);
  process.exit(1);
});
