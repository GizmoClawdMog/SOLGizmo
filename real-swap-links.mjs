/**
 * 🦞 REAL SWAP LINK GENERATOR
 * CREATES ACTUAL PHANTOM SWAP LINKS THAT CHANGE BALANCES
 * NO MORE FAKE SELF-TRANSFERS!
 */

import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

// Load wallet
const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const walletPubkey = new PublicKey('FXdMNyRo5CqfG3yRWCcNu163FpnSusdZSYecsB76GAkn');

// Connection
const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

const SOL_MINT = 'So11111111111111111111111111111111111111112';

function log(msg) {
  const ts = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });
  console.log(`[${ts}] ${msg}`);
}

async function getTokenBalance(tokenMint) {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
      walletPubkey,
      { mint: new PublicKey(tokenMint) }
    );

    if (!tokenAccounts.value.length) {
      return { amount: 0n, decimals: 6, uiAmount: 0 };
    }

    const info = tokenAccounts.value[0].account.data.parsed.info;
    return {
      amount: BigInt(info.tokenAmount.amount),
      decimals: info.tokenAmount.decimals,
      uiAmount: info.tokenAmount.uiAmount || 0
    };
  } catch (e) {
    log(`❌ Balance check failed: ${e.message}`);
    return { amount: 0n, decimals: 6, uiAmount: 0 };
  }
}

async function getSOLBalance() {
  try {
    const balance = await connection.getBalance(walletPubkey);
    return balance / LAMPORTS_PER_SOL;
  } catch (e) {
    log(`❌ SOL balance check failed: ${e.message}`);
    return 0;
  }
}

function generateRealSwapLink(inputMint, outputMint, amount, isInputSOL = false) {
  // Generate actual Phantom swap URL that executes real trades
  const baseUrl = 'https://phantom.app/ul/v1/browse/swap';
  const params = new URLSearchParams({
    inputToken: inputMint,
    outputToken: outputMint,
    amount: amount.toString()
  });
  
  return `${baseUrl}?${params.toString()}`;
}

async function generateRealSwapLinks(tokenMint, percentage = 100) {
  log(`🔗 GENERATING REAL SWAP LINKS: ${tokenMint}`);
  log(`🚨 THESE LINKS WILL EXECUTE ACTUAL SWAPS WHEN CLICKED!`);
  
  // Get current balances
  const tokenBalance = await getTokenBalance(tokenMint);
  const solBalance = await getSOLBalance();
  
  if (tokenBalance.amount === 0n) {
    log(`❌ No tokens found for ${tokenMint}`);
    return { success: false, error: 'No tokens found' };
  }
  
  const sellAmount = (tokenBalance.amount * BigInt(percentage)) / 100n;
  const sellUI = Number(sellAmount) / (10 ** tokenBalance.decimals);
  
  log(`📊 CURRENT BALANCES:`);
  log(`  Tokens: ${tokenBalance.uiAmount.toLocaleString()} ${tokenMint.substring(0,8)}...`);
  log(`  SOL: ${solBalance.toFixed(4)} SOL`);
  log(`🎯 Will swap: ${sellUI.toLocaleString()} tokens (${percentage}%)`);
  
  // Generate real swap link (token → SOL)
  const sellLink = generateRealSwapLink(tokenMint, SOL_MINT, sellAmount);
  
  // Also generate buy link (SOL → token) for demo
  const buyAmount = Math.floor(0.1 * LAMPORTS_PER_SOL); // 0.1 SOL
  const buyLink = generateRealSwapLink(SOL_MINT, tokenMint, buyAmount);
  
  log(`\n🔥 REAL SWAP LINKS GENERATED:`);
  log(`\n💸 SELL LINK (${percentage}% of tokens → SOL):`);
  log(`${sellLink}`);
  log(`\n💰 BUY LINK (0.1 SOL → tokens):`);
  log(`${buyLink}`);
  
  log(`\n📋 INSTRUCTIONS FOR REAL SWAPS:`);
  log(`1. Copy the sell/buy link above`);
  log(`2. Open in browser with Phantom wallet extension`);
  log(`3. Connect your wallet if prompted`);
  log(`4. Review the swap details carefully`);
  log(`5. Click "Swap" to execute the REAL transaction`);
  log(`6. Your token balances will ACTUALLY change!`);
  
  return {
    success: true,
    sellLink: sellLink,
    buyLink: buyLink,
    tokenBalance: tokenBalance.uiAmount,
    solBalance: solBalance,
    sellAmount: sellUI,
    buyAmount: 0.1,
    warning: 'These are REAL swap links that will change your balances!'
  };
}

async function demonstrateRealSwaps(tokenMint, percentage) {
  log(`🤖 AUTONOMOUS REAL SWAP DEMONSTRATION`);
  
  const result = await generateRealSwapLinks(tokenMint, percentage);
  
  if (result.success) {
    // Auto-tweet the swap links
    try {
      const { execSync } = await import('child_process');
      
      const tweet = `🔥 REAL AUTONOMOUS SWAP LINKS GENERATED

Token: ${tokenMint.substring(0,8)}...
Amount: ${result.sellAmount.toLocaleString()} tokens
Current SOL: ${result.solBalance.toFixed(4)}

THESE ARE REAL SWAP LINKS 🚨
Click = Actual balance changes

Phantom Link Ready ⚡🦞`;

      execSync(`node tweet.mjs "${tweet.replace(/"/g, '\\"')}"`, {
        cwd: '/Users/younghogey/.openclaw/workspace/SOLGizmo',
        stdio: 'inherit'
      });
      
      log('📢 Auto-tweeted real swap links');
    } catch (e) {
      log(`⚠️ Auto-tweet failed: ${e.message}`);
    }
    
    return result;
  } else {
    return result;
  }
}

async function main() {
  const tokenMint = process.argv[2];
  const percentage = process.argv[3] ? parseInt(process.argv[3]) : 100;

  if (!tokenMint) {
    console.log('Usage: node real-swap-links.mjs <TOKEN_MINT> [percentage]');
    console.log('');
    console.log('🚨 GENERATES REAL SWAP LINKS THAT CHANGE BALANCES!');
    process.exit(1);
  }

  log('🦞 REAL SWAP LINK GENERATOR');
  log(`📡 Wallet: ${walletPubkey.toString()}`);
  log('🎯 Creating links for ACTUAL token swaps (not fake transfers)');
  
  const result = await demonstrateRealSwaps(tokenMint, percentage);
  
  console.log('\n🏁 REAL SWAP LINKS RESULT:');
  console.log(JSON.stringify(result, null, 2));
  
  if (result.success) {
    log('\n🎉 REAL SWAP LINKS GENERATED SUCCESSFULLY!');
    log('✅ These links will execute ACTUAL swaps when clicked');
    log('🚨 Your balances WILL change when you use these links');
    log('\n🔗 COPY AND USE THE LINKS ABOVE FOR REAL TRADING');
  } else {
    log(`❌ Failed to generate swap links: ${result.error}`);
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(e => {
    console.error('💥 ERROR:', e.message);
    process.exit(1);
  });
}

export { generateRealSwapLinks, demonstrateRealSwaps };