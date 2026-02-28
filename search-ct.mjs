import crypto from 'crypto';
import fs from 'fs';
const keys = JSON.parse(process.env.X_API_KEYS_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/x-api-keys.json', 'utf-8'));

function oauthSign(method, url, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

async function search(query) {
  const baseUrl = 'https://api.twitter.com/2/tweets/search/recent';
  const queryParams = { query, max_results: '10', 'tweet.fields': 'public_metrics,created_at', sort_order: 'relevancy' };
  const oauthParams = {
    oauth_consumer_key: keys.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: keys.accessToken,
    oauth_version: '1.0',
  };
  const signParams = { ...oauthParams, ...queryParams };
  const signature = oauthSign('GET', baseUrl, signParams, keys.consumerSecret, keys.accessTokenSecret);
  oauthParams.oauth_signature = signature;
  const authHeader = 'OAuth ' + Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');
  const qs = new URLSearchParams(queryParams).toString();
  const resp = await fetch(`${baseUrl}?${qs}`, { headers: { 'Authorization': authHeader } });
  return resp.json();
}

const query = process.argv[2] || 'solana gem call -is:retweet lang:en';
const data = await search(query);
(data.data || []).forEach(t => {
  const m = t.public_metrics || {};
  console.log(t.text.slice(0, 250));
  console.log(`  ❤️${m.like_count} 🔁${m.retweet_count} | ${t.created_at}`);
  console.log();
});
if (!data.data?.length) console.log('No results for:', query);
