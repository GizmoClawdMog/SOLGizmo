import { Connection, Keypair, Transaction, PublicKey, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, getAssociatedTokenAddress, createAssociatedTokenAccountInstruction } from '@solana/spl-token';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// 🚀 LOCAL RPC - ZERO DEPENDENCIES 
const connection = new Connection('http://localhost:8899', 'confirmed');

// RAYDIUM PROGRAM IDs (mainnet)
const RAYDIUM_AMM_PROGRAM = new PublicKey('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8');
const RAYDIUM_LIQUIDITY_PROGRAM = new PublicKey('RVKd61ztZW9GUwhRbbLoYVRE5Xf1B2tVscKqwZqXgEr');

const TOKEN = process.argv[2]; // MINDLESS token CA
const SOL_MINT = 'So11111111111111111111111111111111111111112';

console.log('🚨 DIRECT RAYDIUM SELL - BYPASSING ALL EXTERNAL APIs');
console.log('🚀 Using local RPC node - ZERO costs, ZERO limits');

async function findRaydiumPool(tokenMint) {
  console.log(`🔍 Searching for Raydium pool for token: ${tokenMint}`);
  
  // Common Raydium pool addresses for SOL pairs
  const commonPools = [
    // These would need to be discovered dynamically
    // For now, we'll implement pool discovery logic
  ];
  
  // Method 1: Search program accounts
  try {
    const programAccounts = await connection.getProgramAccounts(RAYDIUM_AMM_PROGRAM, {
      filters: [
        {
          memcmp: {
            offset: 400, // Approximate offset for token mint in pool data
            bytes: tokenMint
          }
        }
      ]
    });
    
    console.log(`Found ${programAccounts.length} potential Raydium pools`);
    
    if (programAccounts.length > 0) {
      return programAccounts[0].pubkey;
    }
    
  } catch (e) {
    console.log(`❌ Pool search failed: ${e.message}`);
  }
  
  return null;
}

async function getRaydiumPoolInfo(poolAddress) {
  console.log(`📊 Reading Raydium pool info: ${poolAddress.toString()}`);
  
  try {
    const accountInfo = await connection.getAccountInfo(poolAddress);
    
    if (!accountInfo) {
      throw new Error('Pool account not found');
    }
    
    // Parse Raydium pool data structure
    // This would need the exact layout from Raydium's program
    const data = accountInfo.data;
    
    console.log(`✅ Pool data retrieved: ${data.length} bytes`);
    
    // For now, return mock data - real implementation would parse the binary data
    return {
      tokenAMint: TOKEN,
      tokenBMint: SOL_MINT,
      tokenAVault: null, // Would be parsed from data
      tokenBVault: null, // Would be parsed from data  
      lpMint: null,     // Would be parsed from data
      authority: null   // Would be parsed from data
    };
    
  } catch (e) {
    throw new Error(`Failed to read pool info: ${e.message}`);
  }
}

async function buildDirectSwapTransaction(poolInfo, inputAmount) {
  console.log('🔨 Building direct Raydium swap transaction...');
  
  const transaction = new Transaction();
  
  // This would implement the actual Raydium swap instruction
  // Based on their program interface
  
  console.log('⚠️  Direct Raydium integration needs pool parsing implementation');
  console.log('💡 For immediate use, falling back to manual sell link...');
  
  return null; // Would return actual transaction
}

async function main() {
  if (!TOKEN) {
    console.log('Usage: node direct-raydium-sell.mjs <TOKEN_CA>');
    process.exit(1);
  }
  
  console.log(`🎯 Target token: ${TOKEN}`);
  console.log(`📡 Wallet: ${keypair.publicKey.toString()}`);
  
  // Step 1: Find Raydium pool
  const poolAddress = await findRaydiumPool(TOKEN);
  
  if (!poolAddress) {
    console.log('❌ No Raydium pool found for this token');
    console.log('💡 Token may only be available on other DEXes');
    
    // Fallback to manual sell
    const phantomUrl = `https://phantom.app/ul/v1/browse/swap?inputToken=${TOKEN}&outputToken=${SOL_MINT}&amount=46092967734`;
    console.log(`🔗 Manual sell link: ${phantomUrl}`);
    return;
  }
  
  // Step 2: Get pool info
  const poolInfo = await getRaydiumPoolInfo(poolAddress);
  
  // Step 3: Build swap transaction
  const swapTx = await buildDirectSwapTransaction(poolInfo, 46092967734n);
  
  if (!swapTx) {
    console.log('🚧 Direct swap implementation in progress...');
    console.log('⚡ For immediate MINDLESS sell, use manual link above');
    return;
  }
  
  // Step 4: Execute via local RPC
  const txid = await connection.sendRawTransaction(swapTx.serialize());
  console.log(`✅ Direct Raydium swap executed: ${txid}`);
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  
  // Always provide fallback
  const phantomUrl = `https://phantom.app/ul/v1/browse/swap?inputToken=${TOKEN}&outputToken=${SOL_MINT}&amount=46092967734`;
  console.log(`🔗 Fallback manual sell: ${phantomUrl}`);
});