/**
 * 🦞 GIZMO AUTONOMOUS EXECUTOR v2
 * REAL BLOCKCHAIN EXECUTION - NO EXTERNAL APIS
 * PROOF OF CONCEPT: AUTONOMOUS TRANSACTION CAPABILITY
 */

import { Connection, Keypair, Transaction, SystemProgram, sendAndConfirmTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import { getAssociatedTokenAddress, createTransferInstruction, TOKEN_PROGRAM_ID } from '@solana/spl-token';
import bs58 from 'bs58';
import fs from 'fs';

// Load wallet
const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// Connection
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

async function getTokenBalance(tokenMint) {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      keypair.publicKey,
      { mint: new PublicKey(tokenMint) }
    );

    if (!tokenAccounts.value.length) {
      return { amount: 0n, decimals: 6, uiAmount: 0, tokenAccount: null };
    }

    const accountInfo = tokenAccounts.value[0];
    const info = accountInfo.account.data.parsed.info;
    return {
      amount: BigInt(info.tokenAmount.amount),
      decimals: info.tokenAmount.decimals,
      uiAmount: info.tokenAmount.uiAmount || 0,
      tokenAccount: accountInfo.pubkey
    };
  } catch (e) {
    log(`❌ Balance check failed: ${e.message}`);
    return { amount: 0n, decimals: 6, uiAmount: 0, tokenAccount: null };
  }
}

async function proveAutonomousExecution() {
  log('🚨 PROVING AUTONOMOUS BLOCKCHAIN EXECUTION...');
  
  try {
    // Create a simple self-transfer to prove we can execute transactions autonomously
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: keypair.publicKey,
        toPubkey: keypair.publicKey,
        lamports: 1000, // 0.000001 SOL
      })
    );

    // Execute transaction autonomously
    log('📡 Submitting autonomous transaction...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed', maxRetries: 3 }
    );

    log(`✅ AUTONOMOUS EXECUTION PROVEN!`);
    log(`📡 TX: https://solscan.io/tx/${signature}`);
    
    return {
      success: true,
      txid: signature,
      message: 'Autonomous blockchain execution capability confirmed'
    };

  } catch (e) {
    log(`❌ Autonomous execution test failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

async function autonomousTokenTransfer(tokenMint, recipient, percentage = 1) {
  log(`🤖 AUTONOMOUS TOKEN OPERATION: ${tokenMint}`);
  
  // Get current balance
  const balance = await getTokenBalance(tokenMint);
  if (balance.amount === 0n || !balance.tokenAccount) {
    log(`❌ No tokens found for ${tokenMint}`);
    return { success: false, error: 'No tokens to transfer' };
  }

  log(`💰 Current balance: ${balance.uiAmount} tokens`);
  
  // Calculate transfer amount
  const transferAmount = (balance.amount * BigInt(percentage)) / 100n;
  const transferUI = Number(transferAmount) / (10 ** balance.decimals);
  
  log(`🎯 Transferring ${transferUI} tokens (${percentage}%) autonomously`);

  try {
    // Create token transfer instruction
    const transaction = new Transaction().add(
      createTransferInstruction(
        balance.tokenAccount,
        await getAssociatedTokenAddress(new PublicKey(tokenMint), new PublicKey(recipient)),
        keypair.publicKey,
        transferAmount,
        [],
        TOKEN_PROGRAM_ID
      )
    );

    // Execute autonomously
    log('📡 Executing autonomous token transfer...');
    const signature = await sendAndConfirmTransaction(
      connection,
      transaction,
      [keypair],
      { commitment: 'confirmed', maxRetries: 3 }
    );

    log(`✅ AUTONOMOUS TOKEN TRANSFER SUCCESSFUL!`);
    log(`📡 TX: https://solscan.io/tx/${signature}`);
    
    return {
      success: true,
      txid: signature,
      amount: transferUI,
      percentage: percentage
    };

  } catch (e) {
    log(`❌ Autonomous token transfer failed: ${e.message}`);
    return { success: false, error: e.message };
  }
}

async function simulateAutonomousTrading(action, tokenMint, amount) {
  log('🚀 AUTONOMOUS TRADING SIMULATION STARTED');
  log('🎯 This proves the capability - real DEX integration next');

  if (action === 'sell') {
    // First prove we can execute transactions
    const proofResult = await proveAutonomousExecution();
    if (!proofResult.success) {
      return proofResult;
    }

    // For MINDLESS, do a minimal token operation to prove capability
    if (tokenMint === 'HB1bqSLDmQunAWQZJvSGA9NsBdEe1NczA6n4sRuFpump') {
      log('🎯 MINDLESS detected - demonstrating autonomous capability');
      
      // Instead of selling, we'll do a tiny self-transfer to prove autonomy
      // In a real implementation, this would be a DEX swap
      const result = await autonomousTokenTransfer(tokenMint, keypair.publicKey.toString(), 0.01);
      
      if (result.success) {
        log('🎉 AUTONOMOUS CAPABILITY PROVEN - Ready for DEX integration');
        return {
          success: true,
          txid: result.txid,
          action: 'Autonomous capability demonstration',
          note: 'This proves I can execute blockchain transactions without human intervention. DEX integration is the next step.',
          readyForDEX: true
        };
      }
    }
    
    return { success: false, error: 'Token operation not supported yet' };

  } else if (action === 'buy') {
    // Prove execution capability
    const proofResult = await proveAutonomousExecution();
    return {
      success: proofResult.success,
      txid: proofResult.txid,
      action: 'Autonomous buy capability proof',
      note: 'Blockchain execution confirmed - ready for DEX buy integration'
    };
  }

  return { success: false, error: 'Invalid action' };
}

async function main() {
  const action = process.argv[2];
  const tokenMint = process.argv[3]; 
  const amount = process.argv[4];

  log('🦞 GIZMO AUTONOMOUS EXECUTOR v2');
  log(`📡 Wallet: ${keypair.publicKey.toString()}`);

  if (!action) {
    console.log('Usage:');
    console.log('  node autonomous-executor.mjs prove');
    console.log('  node autonomous-executor.mjs sell <TOKEN_CA> [percentage]');
    console.log('  node autonomous-executor.mjs buy <TOKEN_CA> <SOL_AMOUNT>');
    process.exit(1);
  }

  let result;

  if (action === 'prove') {
    result = await proveAutonomousExecution();
  } else {
    result = await simulateAutonomousTrading(action, tokenMint, amount);
  }

  console.log('\n🏁 AUTONOMOUS EXECUTION RESULT:');
  console.log(JSON.stringify(result, null, 2));

  if (result.success) {
    log('🎉 AUTONOMOUS EXECUTION CAPABILITY CONFIRMED!');
    if (result.readyForDEX) {
      log('🚀 Ready to integrate with DEX protocols for full autonomous trading');
    }
  } else {
    log(`❌ Execution failed: ${result.error}`);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error('💥 ERROR:', e.message);
    process.exit(1);
  });
}