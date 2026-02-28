/**
 * 🦞 RPC Configuration — Fallback chain
 * Primary: Helius (parsed TX API + fast)
 * Fallback: PublicNode (free, reliable for basic RPC)
 * TX Submission: Jupiter handles its own routing
 */

export const HELIUS_KEY = process.env.HELIUS_API_KEY;
export const RPC_PRIMARY = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_KEY}`;
export const RPC_FALLBACK = 'https://solana.publicnode.com';
export const HELIUS_API = `https://api.helius.xyz/v0`;

// Smart RPC — tries primary, falls back automatically
let primaryDown = false;
let primaryDownSince = 0;
const RETRY_PRIMARY_AFTER = 5 * 60 * 1000; // Try primary again after 5 min

export async function rpcCall(method, params) {
  // Try primary if not known-down (or if enough time passed)
  if (!primaryDown || Date.now() - primaryDownSince > RETRY_PRIMARY_AFTER) {
    try {
      const r = await fetch(RPC_PRIMARY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (d.error?.code === -32429) {
        primaryDown = true;
        primaryDownSince = Date.now();
        console.log('[RPC] Helius 429 — switching to fallback');
      } else {
        primaryDown = false;
        return d;
      }
    } catch (e) {
      primaryDown = true;
      primaryDownSince = Date.now();
    }
  }

  // Fallback
  const r = await fetch(RPC_FALLBACK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
    signal: AbortSignal.timeout(8000)
  });
  return r.json();
}

// Helius parsed TX API — no fallback (unique to Helius)
export async function heliusParsedTxs(address, limit = 5) {
  const url = `${HELIUS_API}/addresses/${address}/transactions?api-key=${HELIUS_KEY}&limit=${limit}`;
  const r = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (r.status === 429) {
    primaryDown = true;
    primaryDownSince = Date.now();
    throw new Error('Helius 429');
  }
  if (!r.ok) throw new Error(`Helius ${r.status}`);
  return r.json();
}

export function isHeliusUp() { return !primaryDown; }
export function getRpcUrl() { return primaryDown ? RPC_FALLBACK : RPC_PRIMARY; }
