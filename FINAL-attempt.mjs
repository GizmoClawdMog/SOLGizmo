/**
 * 🦞 FINAL ATTEMPT - REAL ASLAN TRANSACTION RESEARCH
 * GET ACTUAL RECENT ASLAN TRANSACTIONS AND ANALYZE THEM
 * NO MORE FAKE SIGNATURES - REAL RESEARCH
 */

import { Connection, PublicKey } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const ASLAN_MINT = new PublicKey('8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump');

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

async function getActualAslanTransactions() {
  log('🔍 Getting REAL ASLAN transactions from blockchain...');
  
  try {
    // Get recent transactions for ASLAN token
    const signatures = await connection.getSignaturesForAddress(ASLAN_MINT, {
      limit: 10
    });
    
    log(`📡 Found ${signatures.length} recent ASLAN transactions`);
    
    if (signatures.length === 0) {
      log('❌ No recent ASLAN transactions found');
      return [];
    }
    
    const validTransactions = [];
    
    for (const [index, sig] of signatures.entries()) {
      try {
        log(`📊 Analyzing transaction ${index + 1}: ${sig.signature}`);
        
        const tx = await connection.getTransaction(sig.signature, {
          commitment: 'confirmed',
          maxSupportedTransactionVersion: 0
        });
        
        if (tx && !tx.meta?.err) {
          log(`✅ Transaction ${index + 1} was successful`);
          log(`   Instructions: ${tx.transaction.message.instructions.length}`);
          log(`   Block time: ${new Date(tx.blockTime * 1000).toLocaleString()}`);
          
          validTransactions.push({
            signature: sig.signature,
            transaction: tx
          });
        } else {
          log(`❌ Transaction ${index + 1} failed or not found`);
        }
        
        // Add delay to avoid rate limiting
        await new Promise(r => setTimeout(r, 1000));
        
      } catch (e) {
        log(`❌ Error analyzing transaction ${index + 1}: ${e.message}`);
        // Continue with next transaction
      }
    }
    
    return validTransactions;
    
  } catch (error) {
    log(`❌ Failed to get ASLAN transactions: ${error.message}`);
    return [];
  }
}

async function analyzeTransactionInstructions(validTxs) {
  log('🔧 Analyzing instruction formats from successful transactions...');
  
  for (const [index, txData] of validTxs.entries()) {
    const tx = txData.transaction;
    
    log(`\n📋 TRANSACTION ${index + 1}: ${txData.signature}`);
    
    tx.transaction.message.instructions.forEach((ix, ixIndex) => {
      const programId = tx.transaction.message.accountKeys[ix.programIdIndex];
      
      log(`  Instruction ${ixIndex + 1}:`);
      log(`    Program: ${programId.toBase58()}`);
      log(`    Data: ${Buffer.from(ix.data).toString('hex')}`);
      log(`    Data length: ${ix.data.length} bytes`);
      log(`    Accounts: ${ix.accounts.length}`);
      
      // Check if this looks like a swap instruction
      if (ix.data.length > 8) {
        const first4Bytes = Buffer.from(ix.data).readUInt32LE(0);
        log(`    First 4 bytes (discriminator): 0x${first4Bytes.toString(16)}`);
      }
    });
  }
}

async function main() {
  log('🚨 FINAL ATTEMPT - REAL ASLAN RESEARCH');
  log('🎯 Getting actual blockchain data for instruction format analysis');
  
  try {
    // Step 1: Get real ASLAN transactions
    const validTransactions = await getActualAslanTransactions();
    
    if (validTransactions.length === 0) {
      console.log('\n💀 NO VALID ASLAN TRANSACTIONS FOUND');
      console.log('❌ Cannot analyze instruction formats');
      console.log('🎯 CONCLUSION: Need Jupiter API or manual execution');
      return;
    }
    
    console.log(`\n✅ Found ${validTransactions.length} valid ASLAN transactions`);
    
    // Step 2: Analyze their instruction formats
    await analyzeTransactionInstructions(validTransactions);
    
    console.log('\n🎯 ANALYSIS COMPLETE');
    console.log('📊 If any transactions show swap patterns, we can copy their format');
    console.log('🔧 Look for programs like pump.fun or raydium with consistent data patterns');
    
  } catch (error) {
    console.log(`\n💀 FINAL ATTEMPT FAILED: ${error.message}`);
    console.log('❌ Cannot complete real transaction analysis');
  }
  
  console.log('\n🚨 FATHER - HONEST STATUS:');
  console.log('✅ Can analyze real blockchain transactions');
  console.log('❌ Still need working instruction format to execute swaps');
  console.log('🎯 This research might reveal the correct format');
}

main();