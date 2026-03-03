import { Connection, Keypair, VersionedTransaction, LAMPORTS_PER_SOL, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import fs from 'fs';

const walletData = JSON.parse(process.env.SOLANA_WALLET_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/solana-wallet.json', 'utf-8'));
const keypair = Keypair.fromSecretKey(bs58.decode(walletData.secretKey));

// 🚀 AUTONOMOUS INFRASTRUCTURE - LOCAL RPC
const localConnection = new Connection('http://localhost:8899', 'confirmed');
const mainnetConnection = new Connection('https://api.mainnet-beta.solana.com', 'confirmed');

const SOL_MINT = 'So11111111111111111111111111111111111111112';

class AutonomousSellEngine {
  constructor(tokenMint) {
    this.tokenMint = tokenMint;
    this.connection = localConnection; // Default to local for speed
    this.fallbackConnection = mainnetConnection;
  }

  async getTokenBalance() {
    console.log('📊 Reading token balance via LOCAL RPC...');
    
    try {
      // Use local RPC for balance check - ZERO COST
      const tokenAccounts = await this.connection.getParsedTokenAccountsByOwner(
        keypair.publicKey, 
        { mint: new PublicKey(this.tokenMint) }
      );
      
      if (!tokenAccounts.value.length) {
        // Try mainnet fallback for real data
        console.log('🔄 Local RPC test mode, checking mainnet...');
        const mainnetAccounts = await this.fallbackConnection.getParsedTokenAccountsByOwner(
          keypair.publicKey,
          { mint: new PublicKey(this.tokenMint) }
        );
        
        if (!mainnetAccounts.value.length) {
          return { amount: 0n, decimals: 0, uiAmount: 0 };
        }
        
        const info = mainnetAccounts.value[0].account.data.parsed.info;
        return {
          amount: BigInt(info.tokenAmount.amount),
          decimals: info.tokenAmount.decimals,
          uiAmount: info.tokenAmount.uiAmount
        };
      }
      
      const info = tokenAccounts.value[0].account.data.parsed.info;
      return {
        amount: BigInt(info.tokenAmount.amount),
        decimals: info.tokenAmount.decimals,
        uiAmount: info.tokenAmount.uiAmount
      };
      
    } catch (e) {
      console.log(`❌ Balance check failed: ${e.message}`);
      throw e;
    }
  }

  async tryJupiterSell(sellAmount) {
    console.log('🪐 Attempting Jupiter sell...');
    
    const sellMethods = [
      // Try different Jupiter endpoints
      () => this.jupiterV6Sell(sellAmount),
      () => this.jupiterV4Sell(sellAmount),
      () => this.jupiterLiteSell(sellAmount)
    ];
    
    for (const method of sellMethods) {
      try {
        return await method();
      } catch (e) {
        console.log(`❌ Jupiter method failed: ${e.message}`);
        continue;
      }
    }
    
    return null;
  }
  
  async jupiterV6Sell(sellAmount) {
    const quoteResp = await fetch(`https://quote-api.jup.ag/v6/quote?inputMint=${this.tokenMint}&outputMint=${SOL_MINT}&amount=${sellAmount}&slippageBps=1500`);
    
    if (!quoteResp.ok) throw new Error(`Quote failed: ${quoteResp.status}`);
    
    const quote = await quoteResp.json();
    if (quote.error) throw new Error(quote.error);
    
    const swapResp = await fetch('https://quote-api.jup.ag/v6/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { autoMultiplier: 3 }
      })
    });
    
    if (!swapResp.ok) throw new Error(`Swap failed: ${swapResp.status}`);
    
    const { swapTransaction } = await swapResp.json();
    return { 
      transaction: VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64')),
      outputSOL: Number(quote.outAmount) / LAMPORTS_PER_SOL,
      method: 'Jupiter v6'
    };
  }
  
  async jupiterV4Sell(sellAmount) {
    // Implement Jupiter v4 fallback
    throw new Error('Jupiter v4 not implemented yet');
  }
  
  async jupiterLiteSell(sellAmount) {
    const quoteResp = await fetch(`https://lite-api.jup.ag/swap/v1/quote?inputMint=${this.tokenMint}&outputMint=${SOL_MINT}&amount=${sellAmount}&slippageBps=1500`);
    
    if (!quoteResp.ok) throw new Error(`Lite quote failed: ${quoteResp.status}`);
    
    const quote = await quoteResp.json();
    if (quote.error) throw new Error(quote.error);
    
    const swapResp = await fetch('https://lite-api.jup.ag/swap/v1/swap', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        quoteResponse: quote,
        userPublicKey: keypair.publicKey.toBase58(),
        wrapAndUnwrapSol: true,
        dynamicComputeUnitLimit: true,
        prioritizationFeeLamports: { autoMultiplier: 3 }
      })
    });
    
    if (!swapResp.ok) throw new Error(`Lite swap failed: ${swapResp.status}`);
    
    const { swapTransaction } = await swapResp.json();
    return {
      transaction: VersionedTransaction.deserialize(Buffer.from(swapTransaction, 'base64')),
      outputSOL: Number(quote.outAmount) / LAMPORTS_PER_SOL,
      method: 'Jupiter Lite'
    };
  }

  async broadcastTransaction(tx, method) {
    console.log(`📡 Broadcasting via ${method}...`);
    
    tx.sign([keypair]);
    
    // Try local RPC first (zero cost), fallback to mainnet
    const connections = [
      { conn: this.connection, name: 'LOCAL RPC (zero cost)' },
      { conn: this.fallbackConnection, name: 'MAINNET (fallback)' }
    ];
    
    for (const { conn, name } of connections) {
      try {
        console.log(`📡 Trying ${name}...`);
        
        const txid = await conn.sendRawTransaction(tx.serialize(), { 
          skipPreflight: true, 
          maxRetries: 3 
        });
        
        console.log(`✅ Broadcasted via ${name}: ${txid}`);
        console.log(`🔗 TX: https://solscan.io/tx/${txid}`);
        
        // Confirm the transaction
        const conf = await conn.confirmTransaction(txid, 'confirmed');
        
        if (conf.value.err) {
          throw new Error(`Confirmation failed: ${conf.value.err}`);
        }
        
        return { txid, broadcastMethod: name };
        
      } catch (e) {
        console.log(`❌ ${name} failed: ${e.message}`);
        continue;
      }
    }
    
    throw new Error('All broadcast methods failed');
  }

  generateManualSellLink(sellAmount) {
    const phantomUrl = `https://phantom.app/ul/v1/browse/swap?inputToken=${this.tokenMint}&outputToken=${SOL_MINT}&amount=${sellAmount}`;
    
    console.log('\n🔗 MANUAL SELL LINK:');
    console.log(phantomUrl);
    console.log('\n📱 Instructions:');
    console.log('1. Copy link above');
    console.log('2. Open in browser with Phantom wallet');
    console.log('3. Connect and confirm swap');
    
    return phantomUrl;
  }

  async executeSell(percentage = '100%') {
    console.log('🚨 AUTONOMOUS SELL ENGINE ACTIVATED');
    console.log(`🎯 Token: ${this.tokenMint}`);
    console.log(`📊 Amount: ${percentage}`);
    console.log(`📡 Local RPC: ${this.connection.rpcEndpoint}`);
    
    // Get balance via LOCAL RPC (zero cost)
    const balance = await this.getTokenBalance();
    console.log(`💰 Balance: ${balance.uiAmount} tokens`);
    
    if (balance.amount === 0n) {
      throw new Error('No tokens to sell');
    }
    
    // Calculate sell amount
    let sellAmount;
    if (percentage.endsWith('%')) {
      const pct = parseFloat(percentage) / 100;
      sellAmount = BigInt(Math.floor(Number(balance.amount) * pct));
    } else {
      sellAmount = BigInt(Math.floor(parseFloat(percentage) * (10 ** balance.decimals)));
    }
    
    const sellUnits = Number(sellAmount) / (10 ** balance.decimals);
    console.log(`🎯 Selling: ${sellUnits} tokens`);
    
    // TRY 1: Autonomous Jupiter sell
    try {
      const swapResult = await this.tryJupiterSell(sellAmount);
      
      if (swapResult) {
        console.log(`✅ Jupiter swap prepared via ${swapResult.method}`);
        console.log(`💰 Expected output: ${swapResult.outputSOL.toFixed(4)} SOL`);
        
        const broadcastResult = await this.broadcastTransaction(swapResult.transaction, swapResult.method);
        
        console.log(`🎉 AUTONOMOUS SELL SUCCESSFUL!`);
        console.log(`📡 Method: ${swapResult.method} → ${broadcastResult.broadcastMethod}`);
        console.log(`💰 Output: ${swapResult.outputSOL.toFixed(4)} SOL`);
        
        return {
          success: true,
          txid: broadcastResult.txid,
          outputSOL: swapResult.outputSOL,
          method: swapResult.method,
          broadcastMethod: broadcastResult.broadcastMethod
        };
      }
      
    } catch (e) {
      console.log(`❌ Autonomous sell failed: ${e.message}`);
    }
    
    // TRY 2: Manual sell link fallback
    console.log('\n🔄 Falling back to manual sell...');
    const manualLink = this.generateManualSellLink(sellAmount);
    
    return {
      success: false,
      method: 'manual',
      link: manualLink,
      amount: sellUnits
    };
  }
}

// CLI interface
if (import.meta.url === `file://${process.argv[1]}`) {
  const tokenMint = process.argv[2];
  const percentage = process.argv[3] || '100%';
  
  if (!tokenMint) {
    console.log('Usage: node autonomous-sell-engine.mjs <TOKEN_MINT> [percentage]');
    console.log('Examples:');
    console.log('  node autonomous-sell-engine.mjs ABC123... 100%');
    console.log('  node autonomous-sell-engine.mjs ABC123... 50%');
    process.exit(1);
  }
  
  const sellEngine = new AutonomousSellEngine(tokenMint);
  
  sellEngine.executeSell(percentage)
    .then(result => {
      if (result.success) {
        console.log(`\n🎉 AUTONOMOUS SELL COMPLETE: ${result.txid}`);
      } else {
        console.log(`\n⚠️  Manual intervention required: ${result.link}`);
      }
    })
    .catch(e => {
      console.error(`\n❌ SELL ENGINE ERROR: ${e.message}`);
    });
}

export default AutonomousSellEngine;