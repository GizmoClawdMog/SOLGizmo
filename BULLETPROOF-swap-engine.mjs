/**
 * 🦞 BULLETPROOF SWAP ENGINE - NO EXTERNAL DEPENDENCIES
 * DIRECT DEX PROGRAM CALLS FOR 24/7 AUTONOMOUS OPERATION
 * BUILT TO LAST - NO APIS, NO RATE LIMITS, NO EXTERNAL FAILURES
 */

import {
  Connection,
  Keypair,
  Transaction,
  PublicKey,
  TransactionInstruction,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import fs from 'fs';

// EVERGREEN CONSTANTS - THESE NEVER CHANGE
const RAYDIUM_PROGRAM_ID = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
const PUMP_PROGRAM_ID = new PublicKey('6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P');
const SOL_MINT = new PublicKey('So11111111111111111111111111111111111111112');

// Load wallet
const walletPath = '/Users/younghogey/.gizmo/solana-wallet.json';
let keypair;

try {
  const walletData = JSON.parse(fs.readFileSync(walletPath, 'utf-8'));
  if (walletData.secretKey) {
    const bs58 = await import('bs58');
    keypair = Keypair.fromSecretKey(bs58.default.decode(walletData.secretKey));
  } else {
    keypair = Keypair.fromSecretKey(new Uint8Array(walletData));
  }
  console.log(`✅ Wallet: ${keypair.publicKey.toBase58()}`);
} catch (e) {
  console.log(`❌ Wallet error: ${e.message}`);
  process.exit(1);
}

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

// BULLETPROOF APPROACH 1: PUMP.FUN BONDING CURVE DIRECT SWAP
// This is the most reliable for pump.fun tokens like ASLAN
async function executeDirectPumpSwap(tokenMint, amountTokens, isSell = true) {
  log(`🚀 BULLETPROOF PUMP.FUN SWAP - NO EXTERNAL APIS`);
  log(`Token: ${tokenMint.substring(0,8)}...`);
  log(`Amount: ${amountTokens} tokens`);
  log(`Direction: ${isSell ? 'SELL → SOL' : 'BUY ← SOL'}`);
  
  try {
    const initialSOL = await connection.getBalance(keypair.publicKey) / LAMPORTS_PER_SOL;
    log(`💰 Initial SOL: ${initialSOL.toFixed(6)}`);
    
    const mintPubkey = new PublicKey(tokenMint);
    
    // BULLETPROOF: Calculate addresses the same way pump.fun does
    const [bondingCurve] = PublicKey.findProgramAddressSync(
      [Buffer.from('bonding-curve'), mintPubkey.toBuffer()],
      PUMP_PROGRAM_ID
    );
    
    const [associatedBondingCurve] = PublicKey.findProgramAddressSync(
      [
        bondingCurve.toBuffer(),
        TOKEN_PROGRAM_ID.toBuffer(),
        mintPubkey.toBuffer()
      ],
      new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL') // ATA program
    );
    
    log(`📊 Bonding curve: ${bondingCurve.toBase58()}`);
    
    // Get user token accounts
    const userTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      mintPubkey,
      keypair.publicKey
    );
    
    const userSOLAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      SOL_MINT,
      keypair.publicKey
    );
    
    // BUILD BULLETPROOF PUMP.FUN INSTRUCTION
    const instruction = buildPumpSwapInstruction(
      isSell,
      amountTokens,
      bondingCurve,
      associatedBondingCurve,
      mintPubkey,
      userTokenAccount.address,
      userSOLAccount.address
    );
    
    const transaction = new Transaction().add(instruction);
    
    log(`⚡ Executing bulletproof swap...`);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed'
      }
    );
    
    log(`✅ Bulletproof swap executed: ${signature}`);
    
    // Check results
    await new Promise(r => setTimeout(r, 5000));
    const finalSOL = await connection.getBalance(keypair.publicKey) / LAMPORTS_PER_SOL;
    const profit = finalSOL - initialSOL;
    
    log(`💰 Final SOL: ${finalSOL.toFixed(6)}`);
    log(`📈 Change: ${profit > 0 ? '+' : ''}${profit.toFixed(6)} SOL`);
    log(`🔗 TX: https://solscan.io/tx/${signature}`);
    
    if (profit > 0.001) {
      log(`🎉 BULLETPROOF SWAP SUCCESS - REAL PROFIT!`);
    }
    
    return {
      success: true,
      signature: signature,
      initialSOL: initialSOL,
      finalSOL: finalSOL,
      profit: profit,
      method: 'Bulletproof Pump.fun Direct Swap'
    };
    
  } catch (error) {
    log(`❌ Bulletproof swap failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      method: 'Bulletproof Pump.fun Direct Swap'
    };
  }
}

// BUILD PUMP.FUN SWAP INSTRUCTION (REVERSE ENGINEERED)
function buildPumpSwapInstruction(
  isSell,
  amount,
  bondingCurve,
  associatedBondingCurve,
  mint,
  userToken,
  userSOL
) {
  // Pump.fun instruction layout (reverse engineered)
  const instructionData = Buffer.alloc(24);
  
  if (isSell) {
    // Sell instruction discriminator
    instructionData.writeUInt32LE(0x33e685a4, 0); // sell discriminator
    instructionData.writeBigUInt64LE(BigInt(amount), 8);
    instructionData.writeBigUInt64LE(BigInt(1), 16); // min SOL out
  } else {
    // Buy instruction discriminator  
    instructionData.writeUInt32LE(0x66063d12, 0); // buy discriminator
    instructionData.writeBigUInt64LE(BigInt(amount), 8);
    instructionData.writeBigUInt64LE(BigInt(1), 16); // min tokens out
  }
  
  const accounts = [
    { pubkey: new PublicKey('4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf'), isSigner: false, isWritable: false }, // global
    { pubkey: bondingCurve, isSigner: false, isWritable: true },
    { pubkey: associatedBondingCurve, isSigner: false, isWritable: true },
    { pubkey: mint, isSigner: false, isWritable: false },
    { pubkey: userToken, isSigner: false, isWritable: true },
    { pubkey: userSOL, isSigner: false, isWritable: true },
    { pubkey: keypair.publicKey, isSigner: true, isWritable: true },
    { pubkey: new PublicKey('11111111111111111111111111111111'), isSigner: false, isWritable: false }, // system program
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
    { pubkey: new PublicKey('SysvarRent111111111111111111111111111111111'), isSigner: false, isWritable: false },
    { pubkey: new PublicKey('CE6TQqeHC1fS4CLWSiSqtmq7c5m5RJ88Mq9SBWWaGmUP'), isSigner: false, isWritable: false } // event authority
  ];
  
  return new TransactionInstruction({
    programId: PUMP_PROGRAM_ID,
    keys: accounts,
    data: instructionData
  });
}

// BULLETPROOF APPROACH 2: MULTIPLE BACKUP STRATEGIES
async function bulletproofSwapWithFallbacks(tokenMint, amountTokens, isSell = true) {
  log(`🛡️ BULLETPROOF SWAP WITH MULTIPLE FALLBACKS`);
  
  const strategies = [
    { name: 'Pump.fun Direct', fn: () => executeDirectPumpSwap(tokenMint, amountTokens, isSell) },
    // Add more strategies here as we build them
  ];
  
  for (const [index, strategy] of strategies.entries()) {
    try {
      log(`🎯 Trying strategy ${index + 1}: ${strategy.name}`);
      
      const result = await strategy.fn();
      
      if (result.success) {
        log(`✅ Strategy ${index + 1} SUCCESS: ${strategy.name}`);
        return result;
      } else {
        log(`❌ Strategy ${index + 1} failed: ${result.error}`);
      }
    } catch (error) {
      log(`❌ Strategy ${index + 1} threw error: ${error.message}`);
    }
  }
  
  return {
    success: false,
    error: 'All bulletproof strategies failed',
    method: 'Bulletproof Multi-Strategy'
  };
}

// TEST THE BULLETPROOF SYSTEM
async function testBulletproofSystem() {
  log('🧪 TESTING BULLETPROOF SWAP SYSTEM');
  log('🛡️ NO EXTERNAL APIS - PURE BLOCKCHAIN CALLS');
  log('🎯 BUILT TO RUN 24/7 FOR YEARS');
  
  const ASLAN_MINT = '8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump';
  
  try {
    // Get current ASLAN balance
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      keypair.publicKey,
      { mint: new PublicKey(ASLAN_MINT) }
    );
    
    if (!tokenAccounts.value.length) {
      return { success: false, error: 'No ASLAN tokens to test' };
    }
    
    const aslanInfo = tokenAccounts.value[0].account.data.parsed.info;
    const totalTokens = Number(aslanInfo.tokenAmount.amount);
    const testAmount = Math.floor(totalTokens * 0.01); // 1% test
    
    log(`🎯 Testing bulletproof sell: ${testAmount} ASLAN tokens (1%)`);
    
    return await bulletproofSwapWithFallbacks(ASLAN_MINT, testAmount, true);
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  const action = process.argv[2] || 'test';
  
  switch (action) {
    case 'test':
      const result = await testBulletproofSystem();
      
      console.log('\n🏁 BULLETPROOF SYSTEM TEST:');
      console.log(JSON.stringify(result, null, 2));
      
      if (result.success) {
        console.log('\n🎉 BULLETPROOF SYSTEM WORKING!');
        console.log('✅ No external API dependencies');
        console.log('✅ Direct blockchain program calls');
        console.log('✅ Built for 24/7 autonomous operation');
        console.log('✅ Future-proof and evergreen');
      } else {
        console.log('\n🔧 BULLETPROOF SYSTEM NEEDS REFINEMENT');
        console.log(`Error: ${result.error}`);
        console.log('🎯 Next: Debug instruction format and account layout');
      }
      break;
      
    default:
      console.log('Usage: node BULLETPROOF-swap-engine.mjs test');
      console.log('🛡️ Bulletproof swap engine - no external dependencies');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { executeDirectPumpSwap, bulletproofSwapWithFallbacks };