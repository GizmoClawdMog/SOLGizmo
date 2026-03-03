import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const connection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');
const wallet = new PublicKey('FXdMNyRo5CqfG3yRWCcNu163FpnSusdZSYecsB76GAkn');

const ASLAN_MINT = '8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump';
const GREEN_MINT = '41iR3ejFc4zTdn4LJeMhKUTZfQkV4xCahCRYtV1xpump';

async function quickCheck() {
  try {
    console.log('🔍 Quick balance check...');
    
    // SOL balance
    const solBalance = await connection.getBalance(wallet) / LAMPORTS_PER_SOL;
    console.log(`💰 SOL: ${solBalance.toFixed(6)}`);
    
    // ASLAN balance
    try {
      const aslanAccounts = await connection.getParsedTokenAccountsByOwner(
        wallet,
        { mint: new PublicKey(ASLAN_MINT) }
      );
      
      if (aslanAccounts.value.length > 0) {
        const aslanBalance = aslanAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        console.log(`🦁 ASLAN: ${aslanBalance} tokens`);
      } else {
        console.log(`🦁 ASLAN: 0 tokens (no account found)`);
      }
    } catch (e) {
      console.log(`🦁 ASLAN: Error checking balance`);
    }
    
    // GREEN balance  
    try {
      const greenAccounts = await connection.getParsedTokenAccountsByOwner(
        wallet,
        { mint: new PublicKey(GREEN_MINT) }
      );
      
      if (greenAccounts.value.length > 0) {
        const greenBalance = greenAccounts.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        console.log(`🟢 GREEN: ${greenBalance} tokens`);
      } else {
        console.log(`🟢 GREEN: 0 tokens (no account found)`);
      }
    } catch (e) {
      console.log(`🟢 GREEN: Error checking balance`);
    }
    
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
  }
}

quickCheck();