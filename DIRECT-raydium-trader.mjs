/**
 * 🦞 DIRECT RAYDIUM INTEGRATION - NO JUPITER DEPENDENCIES
 * CALLS RAYDIUM PROGRAMS DIRECTLY FOR AUTONOMOUS EXECUTION
 * PATH 2: SKIP APIs, GO DIRECT TO BLOCKCHAIN
 */

import {
  Connection,
  Keypair,
  Transaction,
  PublicKey,
  SystemProgram,
  LAMPORTS_PER_SOL,
  sendAndConfirmTransaction
} from '@solana/web3.js';
import {
  getOrCreateAssociatedTokenAccount,
  createTransferInstruction,
  TOKEN_PROGRAM_ID,
  ASSOCIATED_TOKEN_PROGRAM_ID
} from '@solana/spl-token';
import fs from 'fs';
import https from 'https';

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

// RAYDIUM PROGRAM IDS - DIRECT INTERACTION
const RAYDIUM_AMM_PROGRAM = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
const RAYDIUM_LIQUIDITY_POOL_V4 = new PublicKey('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
const SERUM_PROGRAM_ID = new PublicKey('9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin');

// TOKEN MINTS
const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  ASLAN: '8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump',
  GREEN: '41iR3ejFc4zTdn4LJeMhKUTZfQkV4xCahCRYtV1xpump',
  WSOL: 'So11111111111111111111111111111111111111112'
};

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

// STEP 1: FIND RAYDIUM POOLS DIRECTLY
async function findRaydiumPool(baseMint, quoteMint = TOKENS.SOL) {
  log(`🔍 Finding Raydium pool for ${baseMint.substring(0,8)}... → SOL`);
  
  try {
    // Get all Raydium AMM accounts
    const ammAccounts = await connection.getProgramAccounts(RAYDIUM_AMM_PROGRAM, {
      commitment: 'confirmed',
      filters: [
        {
          memcmp: {
            offset: 400, // Base mint offset in AMM account
            bytes: baseMint
          }
        }
      ]
    });
    
    if (ammAccounts.length === 0) {
      throw new Error(`No Raydium pool found for token ${baseMint.substring(0,8)}...`);
    }
    
    log(`✅ Found ${ammAccounts.length} potential pools`);
    
    // Use the first pool found
    const poolAccount = ammAccounts[0];
    const poolInfo = await parseRaydiumPoolAccount(poolAccount.account.data);
    
    log(`✅ Pool found: ${poolAccount.pubkey.toBase58()}`);
    log(`📊 Base reserve: ${poolInfo.baseReserve}`);
    log(`📊 Quote reserve: ${poolInfo.quoteReserve}`);
    
    return {
      poolId: poolAccount.pubkey,
      poolInfo: poolInfo
    };
    
  } catch (error) {
    throw new Error(`Pool search failed: ${error.message}`);
  }
}

// PARSE RAYDIUM POOL DATA
function parseRaydiumPoolAccount(data) {
  // Basic pool info parsing (simplified)
  // In a full implementation, we'd need proper borsh deserialization
  
  return {
    status: data.readUInt8(0),
    nonce: data.readUInt8(1),
    orderNum: data.readBigUInt64LE(8),
    depth: data.readBigUInt64LE(16),
    baseDecimal: data.readUInt8(24),
    quoteDecimal: data.readUInt8(25),
    baseReserve: data.readBigUInt64LE(32),
    quoteReserve: data.readBigUInt64LE(40),
    baseVault: new PublicKey(data.slice(48, 80)),
    quoteVault: new PublicKey(data.slice(80, 112)),
    baseMint: new PublicKey(data.slice(112, 144)),
    quoteMint: new PublicKey(data.slice(144, 176)),
    marketId: new PublicKey(data.slice(176, 208))
  };
}

// STEP 2: CALCULATE SWAP AMOUNTS
function calculateSwapAmount(amountIn, reserveIn, reserveOut) {
  // Raydium AMM formula: constant product with 0.25% fee
  const fee = 25n; // 0.25%
  const feeDenominator = 10000n;
  
  const amountInWithFee = BigInt(amountIn) * (feeDenominator - fee);
  const numerator = amountInWithFee * BigInt(reserveOut);
  const denominator = (BigInt(reserveIn) * feeDenominator) + amountInWithFee;
  
  return numerator / denominator;
}

// STEP 3: BUILD RAYDIUM SWAP INSTRUCTION
async function buildRaydiumSwapInstruction(
  poolInfo,
  tokenAccountIn,
  tokenAccountOut,
  amountIn,
  minAmountOut
) {
  log(`🔧 Building Raydium swap instruction...`);
  
  // Raydium swap instruction layout
  const instructionData = Buffer.alloc(16);
  instructionData.writeUInt8(9, 0); // Swap instruction discriminator
  instructionData.writeBigUInt64LE(BigInt(amountIn), 1);
  instructionData.writeBigUInt64LE(BigInt(minAmountOut), 9);
  
  const keys = [
    // AMM
    { pubkey: poolInfo.poolId, isSigner: false, isWritable: true },
    { pubkey: poolInfo.poolInfo.marketId, isSigner: false, isWritable: false },
    { pubkey: poolInfo.poolInfo.baseVault, isSigner: false, isWritable: true },
    { pubkey: poolInfo.poolInfo.quoteVault, isSigner: false, isWritable: true },
    { pubkey: poolInfo.poolInfo.baseMint, isSigner: false, isWritable: false },
    { pubkey: poolInfo.poolInfo.quoteMint, isSigner: false, isWritable: false },
    
    // User accounts
    { pubkey: tokenAccountIn, isSigner: false, isWritable: true },
    { pubkey: tokenAccountOut, isSigner: false, isWritable: true },
    { pubkey: keypair.publicKey, isSigner: true, isWritable: false },
    
    // Programs
    { pubkey: TOKEN_PROGRAM_ID, isSigner: false, isWritable: false },
  ];
  
  return {
    programId: RAYDIUM_AMM_PROGRAM,
    keys: keys,
    data: instructionData
  };
}

// STEP 4: EXECUTE DIRECT RAYDIUM SWAP
async function executeDirectRaydiumSwap(inputMint, outputMint, amountIn) {
  log(`🔥 EXECUTING DIRECT RAYDIUM SWAP`);
  log(`Input: ${inputMint.substring(0,8)}... Amount: ${amountIn}`);
  log(`Output: ${outputMint.substring(0,8)}...`);
  
  try {
    // Get initial balance
    const initialSOL = await connection.getBalance(keypair.publicKey) / LAMPORTS_PER_SOL;
    log(`💰 Initial SOL: ${initialSOL.toFixed(6)}`);
    
    // Step 1: Find the pool
    const pool = await findRaydiumPool(inputMint, outputMint);
    
    // Step 2: Calculate output amount
    const amountOut = calculateSwapAmount(
      amountIn,
      pool.poolInfo.baseReserve,
      pool.poolInfo.quoteReserve
    );
    
    const minAmountOut = (amountOut * 95n) / 100n; // 5% slippage tolerance
    
    log(`📊 Expected output: ${amountOut.toString()}`);
    log(`📊 Min output (5% slippage): ${minAmountOut.toString()}`);
    
    // Step 3: Get or create token accounts
    const inputTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      new PublicKey(inputMint),
      keypair.publicKey
    );
    
    const outputTokenAccount = await getOrCreateAssociatedTokenAccount(
      connection,
      keypair,
      new PublicKey(outputMint),
      keypair.publicKey
    );
    
    log(`✅ Input token account: ${inputTokenAccount.address.toBase58()}`);
    log(`✅ Output token account: ${outputTokenAccount.address.toBase58()}`);
    
    // Step 4: Build and execute transaction
    const transaction = new Transaction();
    
    const swapInstruction = await buildRaydiumSwapInstruction(
      pool,
      inputTokenAccount.address,
      outputTokenAccount.address,
      amountIn,
      minAmountOut
    );
    
    transaction.add(swapInstruction);
    
    // Step 5: Send transaction
    log(`⚡ Sending transaction...`);
    
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      {
        commitment: 'confirmed',
        preflightCommitment: 'confirmed'
      }
    );
    
    log(`✅ Transaction confirmed: ${signature}`);
    
    // Step 6: Check final balance
    await new Promise(r => setTimeout(r, 3000)); // Wait for balance update
    const finalSOL = await connection.getBalance(keypair.publicKey) / LAMPORTS_PER_SOL;
    const profit = finalSOL - initialSOL;
    
    log(`💰 Final SOL: ${finalSOL.toFixed(6)}`);
    log(`📈 Change: ${profit > 0 ? '+' : ''}${profit.toFixed(6)} SOL`);
    log(`🔗 TX: https://solscan.io/tx/${signature}`);
    
    if (profit > 0.001) {
      log(`🎉 DIRECT RAYDIUM SWAP SUCCESS - REAL PROFIT!`);
    }
    
    return {
      success: true,
      signature: signature,
      initialSOL: initialSOL,
      finalSOL: finalSOL,
      profit: profit,
      profitable: profit > 0.001,
      method: 'Direct Raydium Swap'
    };
    
  } catch (error) {
    log(`❌ Direct Raydium swap failed: ${error.message}`);
    return {
      success: false,
      error: error.message,
      method: 'Direct Raydium Swap'
    };
  }
}

// TEST DIRECT RAYDIUM EXECUTION
async function testDirectRaydiumExecution() {
  log('🧪 TESTING DIRECT RAYDIUM EXECUTION');
  log('🚨 NO JUPITER DEPENDENCIES - PURE RAYDIUM');
  
  try {
    // Get current ASLAN balance
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      keypair.publicKey,
      { mint: new PublicKey(TOKENS.ASLAN) }
    );
    
    if (!tokenAccounts.value.length) {
      return { success: false, error: 'No ASLAN tokens to test' };
    }
    
    const aslanInfo = tokenAccounts.value[0].account.data.parsed.info;
    const totalASLAN = Number(aslanInfo.tokenAmount.amount);
    const testAmount = Math.floor(totalASLAN * 0.005); // 0.5% test
    
    log(`🎯 Test: Selling ${testAmount} ASLAN via direct Raydium`);
    
    return await executeDirectRaydiumSwap(TOKENS.ASLAN, TOKENS.SOL, testAmount);
    
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  const action = process.argv[2] || 'test';
  
  switch (action) {
    case 'test':
      log('🔥 TESTING DIRECT RAYDIUM INTEGRATION');
      const result = await testDirectRaydiumExecution();
      
      console.log('\n🏁 DIRECT RAYDIUM TEST RESULT:');
      console.log(JSON.stringify(result, null, 2));
      
      if (result.success) {
        console.log('\n🎉 DIRECT RAYDIUM INTEGRATION WORKING!');
        console.log('✅ No Jupiter API dependencies');
        console.log('✅ Pure on-chain program calls');
        console.log('✅ Autonomous execution achieved');
      } else {
        console.log('\n❌ Need to fix Raydium integration');
        console.log(`Error: ${result.error}`);
      }
      break;
      
    case 'pool':
      const token = process.argv[3] || TOKENS.ASLAN;
      log(`🔍 Finding pool for ${token.substring(0,8)}...`);
      
      try {
        const pool = await findRaydiumPool(token);
        console.log('\n📊 POOL INFO:');
        console.log(`Pool ID: ${pool.poolId.toBase58()}`);
        console.log(`Base Reserve: ${pool.poolInfo.baseReserve.toString()}`);
        console.log(`Quote Reserve: ${pool.poolInfo.quoteReserve.toString()}`);
      } catch (e) {
        console.log(`❌ Pool search failed: ${e.message}`);
      }
      break;
      
    default:
      console.log('Usage:');
      console.log('  node DIRECT-raydium-trader.mjs test    # Test direct swap');
      console.log('  node DIRECT-raydium-trader.mjs pool    # Find pool info');
      console.log('');
      console.log('🔥 Direct Raydium integration - no Jupiter dependencies');
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { executeDirectRaydiumSwap, findRaydiumPool };