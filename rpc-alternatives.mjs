// 🚨 EMERGENCY RPC ALTERNATIVES - NO RATE LIMITS
const FREE_RPC_ENDPOINTS = [
  'https://rpc.ankr.com/solana',
  'https://api.mainnet-beta.solana.com',
  'https://solana-api.projectserum.com',
  'https://rpc.solana.com',
  'https://api.solana.com',
  'https://solana-mainnet.phantom.app',
  'https://ssc-dao.genesysgo.net',
  'https://rpc.hello.com',
  'https://solana.publicnode.com'
];

// Test all endpoints for availability
export async function findWorkingRPC() {
  console.log('🔍 Testing alternative RPC endpoints...');
  
  for (const rpc of FREE_RPC_ENDPOINTS) {
    try {
      const response = await fetch(rpc, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getSlot'
        })
      });
      
      if (response.ok) {
        const data = await response.json();
        if (data.result) {
          console.log(`✅ WORKING: ${rpc} (slot: ${data.result})`);
          return rpc;
        }
      }
    } catch (e) {
      console.log(`❌ FAILED: ${rpc} - ${e.message}`);
      continue;
    }
  }
  
  throw new Error('No working RPC endpoints found');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  findWorkingRPC().then(rpc => {
    console.log(`🎯 RECOMMENDED: ${rpc}`);
  }).catch(console.error);
}