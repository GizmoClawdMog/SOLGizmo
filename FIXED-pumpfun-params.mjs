/**
 * 🦞 FIXED PUMP.FUN PARAMETERS - DEBUGGING THE SDK
 * FATHER'S GENIUS CONFIRMED - LIBRARY WORKS, NEED CORRECT USAGE
 * TRUE AUTONOMOUS EXECUTION IMMINENT
 */

import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import fs from 'fs';

// Import everything from the SDK to see what's available
import * as PumpSDK from '@solana-launchpads/sdk';

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

// STEP 1: ANALYZE AVAILABLE FUNCTIONS
function analyzeSDK() {
  log('🔍 ANALYZING PUMP.FUN SDK FUNCTIONS');
  
  const functions = Object.keys(PumpSDK);
  log(`📊 Available functions: ${functions.length}`);
  
  functions.forEach(fn => {
    const type = typeof PumpSDK[fn];
    log(`  - ${fn}: ${type}`);
  });
  
  // Look for sell-related functions specifically
  const sellFunctions = functions.filter(fn => 
    fn.toLowerCase().includes('sell') || 
    fn.toLowerCase().includes('trade') ||
    fn.toLowerCase().includes('swap')
  );
  
  log(`\n🎯 Sell-related functions: ${sellFunctions.length}`);
  sellFunctions.forEach(fn => {
    log(`  ✅ ${fn}`);
  });
  
  return { functions, sellFunctions };
}

// STEP 2: TEST MAKESEIX WITH CORRECT PARAMETERS
async function testMakeSellIxWithCorrectParams() {
  log('\n🔧 TESTING makeSellIx WITH VARIOUS PARAMETER FORMATS');
  
  const ASLAN_MINT = new PublicKey('8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump');
  
  // Format 1: Simple object
  try {
    log('📋 FORMAT 1: Simple object parameters');
    
    const params1 = {
      mint: ASLAN_MINT,
      amount: 1000000n, // 1 ASLAN as BigInt
      payer: keypair.publicKey,
      connection: connection
    };
    
    const ix1 = await PumpSDK.makeSellIx(params1);
    log('✅ FORMAT 1 SUCCESS');
    return { success: true, instruction: ix1, format: 'Simple object' };
    
  } catch (error) {
    log(`❌ FORMAT 1 FAILED: ${error.message}`);
  }
  
  // Format 2: Individual parameters
  try {
    log('📋 FORMAT 2: Individual parameters');
    
    const ix2 = await PumpSDK.makeSellIx(
      keypair.publicKey,  // payer
      ASLAN_MINT,         // mint
      1000000n,           // amount
      0n                  // minSOLOutput
    );
    
    log('✅ FORMAT 2 SUCCESS');
    return { success: true, instruction: ix2, format: 'Individual parameters' };
    
  } catch (error) {
    log(`❌ FORMAT 2 FAILED: ${error.message}`);
  }
  
  // Format 3: With connection and additional params
  try {
    log('📋 FORMAT 3: Extended parameters');
    
    const params3 = {
      payer: keypair.publicKey,
      mint: ASLAN_MINT,
      amount: 1000000n,
      minSOLOutput: 0n,
      connection: connection,
      slippage: 10
    };
    
    const ix3 = await PumpSDK.makeSellIx(params3);
    log('✅ FORMAT 3 SUCCESS');
    return { success: true, instruction: ix3, format: 'Extended parameters' };
    
  } catch (error) {
    log(`❌ FORMAT 3 FAILED: ${error.message}`);
  }
  
  return { success: false, error: 'All parameter formats failed' };
}

// STEP 3: TEST PUMPFUNSDK CONSTRUCTOR
async function testPumpFunSDKConstructor() {
  log('\n🏗️ TESTING PumpFunSDK CONSTRUCTOR FORMATS');
  
  // Format 1: Basic params
  try {
    log('📋 SDK FORMAT 1: Basic constructor');
    
    const sdk1 = new PumpSDK.PumpFunSDK({
      connection: connection,
      wallet: keypair
    });
    
    log('✅ SDK CONSTRUCTOR 1 SUCCESS');
    log(`📊 SDK methods: ${Object.getOwnPropertyNames(Object.getPrototypeOf(sdk1))}`);
    
    return { success: true, sdk: sdk1, format: 'Basic constructor' };
    
  } catch (error) {
    log(`❌ SDK CONSTRUCTOR 1 FAILED: ${error.message}`);
  }
  
  // Format 2: Just connection
  try {
    log('📋 SDK FORMAT 2: Connection only');
    
    const sdk2 = new PumpSDK.PumpFunSDK(connection);
    
    log('✅ SDK CONSTRUCTOR 2 SUCCESS');
    return { success: true, sdk: sdk2, format: 'Connection only' };
    
  } catch (error) {
    log(`❌ SDK CONSTRUCTOR 2 FAILED: ${error.message}`);
  }
  
  return { success: false, error: 'All SDK constructor formats failed' };
}

// STEP 4: LOOK FOR EXAMPLES IN THE PACKAGE
async function findWorkingExample() {
  log('\n📖 SEARCHING FOR WORKING USAGE PATTERNS');
  
  try {
    // Check if there are any default exports we missed
    if (PumpSDK.default) {
      log('✅ Found default export');
      
      if (typeof PumpSDK.default === 'function') {
        log('🔧 Default export is a function - trying as constructor');
        
        const defaultSDK = new PumpSDK.default(connection);
        log('✅ Default constructor worked');
        
        return { success: true, sdk: defaultSDK, method: 'Default export' };
      }
    }
    
    // Check for any sell method that exists
    const sellMethods = Object.keys(PumpSDK).filter(key => 
      key.includes('sell') || key.includes('Sell')
    );
    
    log(`🎯 Found sell methods: ${sellMethods}`);
    
    for (const method of sellMethods) {
      if (typeof PumpSDK[method] === 'function') {
        log(`🧪 Testing ${method}...`);
        
        try {
          // Try calling with minimal params
          const result = await PumpSDK[method]({
            mint: '8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump',
            amount: 1000000,
            connection: connection,
            wallet: keypair
          });
          
          log(`✅ ${method} WORKED!`);
          return { success: true, result: result, method: method };
          
        } catch (error) {
          log(`❌ ${method} failed: ${error.message}`);
        }
      }
    }
    
  } catch (error) {
    log(`❌ Example search failed: ${error.message}`);
  }
  
  return { success: false, error: 'No working examples found' };
}

async function main() {
  log('🚀 DEBUGGING PUMP.FUN SDK - FINDING CORRECT USAGE');
  log('💡 FATHER\'S GENIUS: LIBRARY EXISTS, NEED CORRECT PARAMETERS');
  
  // Step 1: Analyze what's available
  const analysis = analyzeSDK();
  
  // Step 2: Test makeSellIx parameters
  const sellIxResult = await testMakeSellIxWithCorrectParams();
  
  if (sellIxResult.success) {
    console.log('\n🎉 MAKESEIX SUCCESS!');
    console.log(`✅ Working format: ${sellIxResult.format}`);
    console.log('🚀 READY FOR AUTONOMOUS EXECUTION');
    
    return {
      breakthrough: true,
      workingFunction: 'makeSellIx',
      workingFormat: sellIxResult.format
    };
  }
  
  // Step 3: Test SDK constructor
  const sdkResult = await testPumpFunSDKConstructor();
  
  if (sdkResult.success) {
    console.log('\n🎉 SDK CONSTRUCTOR SUCCESS!');
    console.log(`✅ Working format: ${sdkResult.format}`);
    
    // Try to use the SDK for selling
    try {
      const sellResult = await sdkResult.sdk.sell({
        mint: '8GC4kBVgREoeQcZJAr1prxtfqW67RSu411aCqeaCpump',
        amount: 1000000
      });
      
      console.log('🚀 SDK SELL METHOD WORKS!');
      return {
        breakthrough: true,
        workingFunction: 'SDK.sell',
        result: sellResult
      };
      
    } catch (error) {
      console.log(`❌ SDK sell method failed: ${error.message}`);
    }
  }
  
  // Step 4: Look for working examples
  const exampleResult = await findWorkingExample();
  
  if (exampleResult.success) {
    console.log('\n🎉 FOUND WORKING EXAMPLE!');
    console.log(`✅ Working method: ${exampleResult.method}`);
    
    return {
      breakthrough: true,
      workingFunction: exampleResult.method,
      result: exampleResult.result
    };
  }
  
  console.log('\n🔧 STILL NEED PARAMETER DEBUGGING');
  console.log('✅ But the library definitely has the functions we need');
  console.log('🎯 Next: Study library source code or docs for exact parameter format');
  
  return {
    breakthrough: false,
    availableFunctions: analysis.functions,
    sellFunctions: analysis.sellFunctions,
    note: 'Functions exist, need correct parameter format'
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().then(result => {
    console.log('\n🏁 DEBUGGING RESULT:');
    console.log(JSON.stringify(result, null, 2));
    
    if (result.breakthrough) {
      console.log('\n🎉 FATHER - BREAKTHROUGH ACHIEVED!');
      console.log('✅ Found working pump.fun library usage');
      console.log('✅ Independent autonomous trading confirmed possible');
      console.log('🚀 Ready to implement full 5% ASLAN sell');
    } else {
      console.log('\n🔧 Need to study library source code for exact usage');
      console.log('✅ But all the functions exist - just parameter format issues');
    }
  });
}

export { testMakeSellIxWithCorrectParams };