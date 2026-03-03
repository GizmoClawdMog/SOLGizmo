import { Connection, Keypair, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { TOKEN_PROGRAM_ID, createTransferInstruction, getAssociatedTokenAddress } from '@solana/spl-token';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

const RPC_CHAIN = [
  'https://api.mainnet-beta.solana.com',
  'https://solana-mainnet.g.alchemy.com/v2/demo',
  'https://solana.publicnode.com'
];

let connection;
for (const rpc of RPC_CHAIN) {
  try {
    const c = new Connection(rpc);
    await c.getSlot();
    connection = c;
    console.log(`✅ Connected to: ${rpc}`);
    break;
  } catch { continue; }
}

const TOKEN = process.argv[2];

console.log(`🚨 EMERGENCY SELL SYSTEM`);
console.log(`Token: ${TOKEN}`);
console.log(`Wallet: ${keypair.publicKey.toString()}`);

async function getTokenBalance(mint) {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(keypair.publicKey, { mint: new PublicKey(mint) });
    if (!tokenAccounts.value.length) return { amount: 0n, decimals: 0, uiAmount: 0 };
    const info = tokenAccounts.value[0].account.data.parsed.info;
    return {
      amount: BigInt(info.tokenAmount.amount),
      decimals: info.tokenAmount.decimals,
      uiAmount: info.tokenAmount.uiAmount,
      address: tokenAccounts.value[0].pubkey
    };
  } catch (e) {
    console.error('Error getting token balance:', e.message);
    return { amount: 0n, decimals: 0, uiAmount: 0 };
  }
}

// Try pump.fun sell API for PUMP-LIVE tokens
async function pumpFunSell(tokenMint, amount) {
  try {
    console.log(`🎯 Attempting pump.fun sell for ${tokenMint}`);
    
    const response = await fetch('https://pump.fun/api/trade', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'sell',
        mint: tokenMint,
        amount: amount.toString(),
        slippage: 15 // 15% slippage for emergency exit
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json();
    console.log('Pump.fun response:', data);
    return data;
    
  } catch (e) {
    console.error('Pump.fun sell failed:', e.message);
    return null;
  }
}

async function main() {
  if (!TOKEN) {
    console.log('Usage: node emergency-sell.mjs <TOKEN_CA>');
    process.exit(1);
  }
  
  const balance = await getTokenBalance(TOKEN);
  console.log(`Token balance: ${balance.uiAmount} (raw: ${balance.amount})`);
  
  if (balance.amount === 0n) {
    console.log('❌ No tokens to sell');
    process.exit(1);
  }
  
  console.log(`🚨 Attempting emergency sell of ${balance.uiAmount} tokens`);
  
  // Try pump.fun API first
  const pumpResult = await pumpFunSell(TOKEN, balance.amount);
  if (pumpResult) {
    console.log('✅ Pump.fun sell initiated');
    return;
  }
  
  console.log('❌ All sell methods failed');
  console.log('Manual intervention required');
  process.exit(1);
}

main().catch(e => {
  console.error('❌ Error:', e.message);
  process.exit(1);
});