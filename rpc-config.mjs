/**
 * RPC Configuration - Multi-fallback chain
 */

export const HELIUS_KEY = process.env.HELIUS_API_KEY;
export const HELIUS_API = `https://api.helius.xyz/v0`;

export const RPC_CHAIN = [
  `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`,
  'https://solana.publicnode.com',
  'https://rpc.ankr.com/solana',
  'https://api.mainnet-beta.solana.com',
];

let currentRpcIndex = 0;

export async function rpcCall(method, params) {
  for (let attempt = 0; attempt < RPC_CHAIN.length; attempt++) {
    const idx = (currentRpcIndex + attempt) % RPC_CHAIN.length;
    const url = RPC_CHAIN[idx];
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (d.error && (d.error.code === -32429 || (d.error.message || '').includes('max usage'))) {
        console.log('[RPC] ' + url.split('?')[0] + ' capped - trying next');
        continue;
      }
      currentRpcIndex = idx;
      return d;
    } catch (e) {
      continue;
    }
  }
  throw new Error('All RPCs failed');
}

export function getRpcUrl() { return RPC_CHAIN[currentRpcIndex]; }
export function isHeliusUp() { return currentRpcIndex === 0; }

export async function heliusParsedTxs(address, limit = 5) {
  const url = `https://api.helius.xyz/v0/addresses/${address}/transactions?api-key=${HELIUS_KEY}&limit=${limit}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (r.status === 429) throw new Error('Helius 429');
  if (!r.ok) throw new Error('Helius ' + r.status);
  return r.json();
}

export const RPC_PRIMARY = RPC_CHAIN[0];
export const RPC_FALLBACK = RPC_CHAIN[1];
