/**
 * 🦞 PUMP BONDING CURVE SELL - DIRECT PUMP.FUN INTEGRATION
 * SELL ASLAN/GREEN ON ACTUAL PUMP.FUN BONDING CURVE
 * NO EXTERNAL DEXES - DIRECT BONDING CURVE INTERACTION
 */

import { 
  Connection, 
  Keypair, 
  Transaction, 
  TransactionInstruction,
  PublicKey, 
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction,
  SystemProgram,
  ComputeBudgetProgram
} from '@solana/web3.js';
import { 
  TOKEN_PROGRAM_ID, 
  getAssociatedTokenAddress,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import bs58 from 'bs58';
import fs from 'fs';
import https from 'https';

// Load wallet
const walletData = JSON.parse(fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

// Pump.fun Program and Constants
const PUMP_PROGRAM = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const PUMP_GLOBAL = new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf');
const PUMP_FEE_RECIPIENT = new PublicKey('CebN5WGQ4jvEPvsVU4EoHEpgzq1VV4TqYGXRn5YSX3K');
const PUMP_EVENT_AUTHORITY = new PublicKey('Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1');

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

// Calculate bonding curve PDA
function getBondingCurvePDA(mint) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('bonding-curve'), mint.toBuffer()],
    PUMP_PROGRAM
  )[0];
}

// Calculate associated bonding curve PDA
function getAssociatedBondingCurvePDA(mint) {
  const bondingCurve = getBondingCurvePDA(mint);
  return PublicKey.findProgramAddressSync(
    [
      bondingCurve.toBuffer(),
      TOKEN_PROGRAM_ID.toBuffer(),
      mint.toBuffer()
    ],
    ASSOCIATED_TOKEN_PROGRAM_ID
  )[0];
}

async function getTokenBalance(tokenMint) {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      keypair.publicKey,
      { mint: new PublicKey(tokenMint) }
    );

    if (!tokenAccounts.value.length) {
      return { amount: 0n, decimals: 6, uiAmount: 0, account: null };
    }

    const info = tokenAccounts.value[0].account.data.parsed.info;
    return {
      amount: BigInt(info.tokenAmount.amount),
      decimals: info.tokenAmount.decimals,
      uiAmount: info.tokenAmount.uiAmount || 0,
      account: tokenAccounts.value[0].pubkey
    };
  } catch (e) {
    return { amount: 0n, decimals: 6, uiAmount: 0, account: null };
  }
}

async function getSOLBalance() {
  const balance = await connection.getBalance(keypair.publicKey);
  return balance / LAMPORTS_PER_SOL;
}

// Get pump.fun price from API
async function getPumpPrice(tokenMint) {
  return new Promise((resolve, reject) => {
    const url = `https://frontend-api.pump.fun/coins/${tokenMint}`;
    
    const req = https.request(url, {
      timeout: 10000,
      headers: { 'User-Agent': 'Mozilla/5.0' }
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({
            price: result.usd_market_cap ? result.usd_market_cap / (result.total_supply || 1000000000) : 0,
            marketCap: result.usd_market_cap || 0,
            complete: result.complete || false
          });
        } catch (e) {
          resolve({ price: 0, marketCap: 0, complete: false });
        }
      });
    });
    
    req.on('error', () => resolve({ price: 0, marketCap: 0, complete: false }));
    req.on('timeout', () => resolve({ price: 0, marketCap: 0, complete: false }));
    req.end();
  });
}

// Build pump.fun sell transaction
async function buildPumpSellTx(tokenMint, tokenAmount, minSolOutput = 0n) {
  log(`🔧 Building pump.fun sell transaction...`);
  
  const mint = new PublicKey(tokenMint);
  const bondingCurve = getBondingCurvePDA(mint);
  const associatedBondingCurve = getAssociatedBondingCurvePDA(mint);
  const userTokenAccount = await getAssociatedTokenAddress(mint, keypair.publicKey);
  
  log(`📡 Bonding Curve: ${bondingCurve.toString()}`);
  log(`📡 User Token Account: ${userTokenAccount.toString()}`);
  
  // Pump.fun sell instruction data (researched format)
  const instructionData = Buffer.alloc(24);
  
  // Sell instruction discriminator (hex: 33e685a4017f83ad)
  instructionData.writeUInt32LE(0x017f83ad, 0);
  instructionData.writeUInt32LE(0x33e685a4, 4);
  
  // Token amount to sell (8 bytes, little endian)
  instructionData.writeBigUInt64LE(tokenAmount, 8);
  
  // Minimum SOL output (8 bytes, little endian) 
  instructionData.writeBigUInt64LE(minSolOutput, 16);
  
  const transaction = new Transaction();
  
  // Add compute budget for pump operations
  transaction.add(
    ComputeBudgetProgram.setComputeUnitPrice({ microLamports: 200000 })
  );
  
  transaction.add(
    ComputeBudgetProgram.setComputeUnitLimit({ units: 400000 })
  );
  
  // Add the pump sell instruction
  const sellInstruction = new TransactionInstruction({
    programId: PUMP_PROGRAM,
    keys: [
      { pubkey: PUMP_GLOBAL, isSigner: false, isWritable: false },
      { pubkey: PUMP_FEE_RECIPIENT, isSigner: false, isWritable: true },
      { pubkey: mint, isSigner: false, isWritable: false },
      { pubkey: bondingCurve, isSigner: false, isWritable: true },
      { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
      { pubkey: userTokenAccount, isSigner: false, isWritable: true },
      { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
      { pubkey: SystemProgram.programId, isSigner: false, isWritable: false },
      { pubkey: ASSOCIATED_TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
      { pubkey: PUMP_EVENT_AUTHORITY, isSigner: false, isWritable: false },
      { pubkey: PUMP_PROGRAM, isSigner: false, isWritable: false }
    ],
    data: instructionData
  });
  
  transaction.add(sellInstruction);
  
  return transaction;
}

async function PUMP_autonomous_sell(tokenMint, percentage = 3) {
  log(`🦞 PUMP.FUN AUTONOMOUS SELL`);
  log(`🚨 DIRECT BONDING CURVE INTERACTION`);
  
  // Get initial balances and price info
  const initialToken = await getTokenBalance(tokenMint);
  const initialSOL = await getSOLBalance();
  const priceInfo = await getPumpPrice(tokenMint);
  
  if (initialToken.amount === 0n) {
    throw new Error('No tokens to sell');
  }
  
  const sellAmount = (initialToken.amount * BigInt(percentage)) / 100n;
  const sellUI = Number(sellAmount) / (10 ** initialToken.decimals);
  const estimatedSOL = sellUI * priceInfo.price / 100; // rough estimate
  
  log(`📊 BEFORE PUMP SELL:`);
  log(`  Tokens: ${initialToken.uiAmount.toLocaleString()}`);
  log(`  SOL: ${initialSOL.toFixed(6)}`);
  log(`  Token Price: $${priceInfo.price.toFixed(8)}`);
  log(`🎯 Selling: ${sellUI.toLocaleString()} tokens`);
  log(`💰 Estimated SOL: ${estimatedSOL.toFixed(4)}`);
  
  try {
    // Build and send pump sell transaction
    const transaction = await buildPumpSellTx(tokenMint, sellAmount);
    
    log(`🚀 Executing pump.fun sell...`);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      {
        commitment: 'confirmed',
        skipPreflight: false,
        maxRetries: 3
      }
    );
    
    log(`✅ PUMP SELL EXECUTED: ${signature}`);
    log(`📡 TX: https://solscan.io/tx/${signature}`);
    
    // Wait for balance updates
    log(`⏳ Waiting for balance updates...`);
    await new Promise(r => setTimeout(r, 12000));
    
    // Check final balances
    const finalToken = await getTokenBalance(tokenMint);
    const finalSOL = await getSOLBalance();
    
    const tokenChange = finalToken.uiAmount - initialToken.uiAmount;
    const solChange = finalSOL - initialSOL;
    
    log(`📊 AFTER PUMP SELL:`);
    log(`  Tokens: ${finalToken.uiAmount.toLocaleString()}`);
    log(`  SOL: ${finalSOL.toFixed(6)}`);
    log(`📈 CHANGES:`);
    log(`  Tokens: ${tokenChange.toFixed(2)} (${tokenChange < -0.1 ? 'DECREASED' : 'UNCHANGED'})`);
    log(`  SOL: ${solChange > 0 ? '+' : ''}${solChange.toFixed(6)} (${solChange > 0.001 ? 'INCREASED' : 'FEES ONLY'})`);
    
    const actuallyWorked = tokenChange < -0.1 && solChange > 0.001;
    
    if (actuallyWorked) {
      log(`🎉 PUMP SELL SUCCESSFUL - REAL BALANCE CHANGES!`);
      log(`✅ TOKENS SOLD: ${(-tokenChange).toFixed(2)}`);
      log(`✅ SOL RECEIVED: ${solChange.toFixed(6)}`);
      log(`🏆 AUTONOMOUS PUMP TRADING ACHIEVED!`);
    } else {
      log(`⚠️ Transaction executed but checking balance effects...`);
    }
    
    return {
      success: true,
      signature: signature,
      method: 'Pump.fun Bonding Curve Sell',
      estimatedSOL: estimatedSOL,
      balanceChanges: {
        tokensBefore: initialToken.uiAmount,
        tokensAfter: finalToken.uiAmount,
        tokenChange: tokenChange,
        solBefore: initialSOL,
        solAfter: finalSOL,
        solChange: solChange,
        actuallyWorked: actuallyWorked
      }
    };
    
  } catch (error) {
    throw new Error(`Pump sell failed: ${error.message}`);
  }
}

async function main() {
  const tokenMint = process.argv[2] || '8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump'; // ASLAN
  const percentage = process.argv[3] ? parseInt(process.argv[3]) : 3;

  log('🦞 PUMP.FUN BONDING CURVE SELLER');
  log(`📡 Wallet: ${keypair.publicKey.toString()}`);
  log('🚨 DIRECT PUMP.FUN INTEGRATION');
  
  try {
    const result = await PUMP_autonomous_sell(tokenMint, percentage);
    
    console.log('\n🏁 PUMP AUTONOMOUS SELL RESULT:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.success && result.balanceChanges.actuallyWorked) {
      log('🎉 AUTONOMOUS PUMP SELL SUCCESSFUL!');
      log(`📡 TX: https://solscan.io/tx/${result.signature}`);
      log('✅ REAL TOKEN→SOL CONVERSION ON PUMP.FUN');
      log('🏆 PUMP TRADING AUTONOMY ACHIEVED!');
    } else if (result.success) {
      log('⚠️ Transaction executed - verifying effects');
      log(`📡 TX: https://solscan.io/tx/${result.signature}`);
    } else {
      log('❌ Pump sell failed');
    }
    
  } catch (e) {
    log(`💥 Pump bonding curve sell failed: ${e.message}`);
    console.log('❌ PUMP INTEGRATION FAILED');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}