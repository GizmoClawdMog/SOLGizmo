#!/usr/bin/env node

/**
 * 🦞 GROK API SETUP - SWITCH FROM EXPENSIVE OPENCLAW
 * QUICK SETUP SCRIPT TO GET GROK WORKING
 */

import fs from 'fs';
import { execSync } from 'child_process';

console.log('🚀 GROK API SETUP - SWITCHING FROM OPENCLAW');
console.log('');

// Check if .env exists, create if not
const envPath = '/Users/younghogey/.openclaw/workspace/SOLGizmo/.env';

function setupEnvFile(apiKey) {
  const envContent = `# Grok API Configuration
GROK_API_KEY=${apiKey}
NODE_ENV=production
`;
  
  fs.writeFileSync(envPath, envContent);
  console.log('✅ .env file created with API key');
}

function testApiKey(apiKey) {
  console.log('🧪 Testing Grok API connection...');
  
  try {
    // Quick test with curl
    const testCmd = `curl -s -X POST "https://api.x.ai/v1/chat/completions" \\
      -H "Authorization: Bearer ${apiKey}" \\
      -H "Content-Type: application/json" \\
      -d '{"model":"grok-4.1-fast-reasoning","messages":[{"role":"user","content":"Test: respond with just OK"}],"max_tokens":10}'`;
    
    const result = execSync(testCmd, { encoding: 'utf8', timeout: 10000 });
    
    if (result.includes('OK') || result.includes('choices')) {
      console.log('✅ Grok API working!');
      return true;
    } else {
      console.log('❌ Unexpected response:', result.substring(0, 100));
      return false;
    }
  } catch (e) {
    console.log('❌ API test failed:', e.message);
    return false;
  }
}

async function main() {
  console.log('STEP 1: Get your API key from console.x.ai');
  console.log('STEP 2: Paste it here when ready');
  console.log('');
  
  // In a real interactive setup, we'd prompt for input
  // For now, show the manual steps
  console.log('Manual setup:');
  console.log('1. Go to: https://console.x.ai');
  console.log('2. Sign in with X account');
  console.log('3. Create API key');
  console.log('4. Run: export GROK_API_KEY="your-key-here"');
  console.log('5. Test with: node grok-integration.mjs test');
  console.log('');
  console.log('Then run: node grok-integration.mjs continuous');
  console.log('');
  console.log('💰 Cost: ~$0.001 per decision vs $$$ OpenClaw');
  console.log('🎯 Focus: REAL profit, not fake demonstrations');
}

main();