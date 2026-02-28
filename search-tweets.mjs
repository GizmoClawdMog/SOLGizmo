import crypto from 'crypto';
import fs from 'fs';
const keys = JSON.parse(process.env.X_API_KEYS_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/x-api-keys.json', 'utf-8'));

function oauthSign(method, url, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

const query = process.argv[2] || '@SolGizmoClawd -from:SolGizmoClawd';
const baseUrl = 'https://api.twitter.com/2/tweets/search/recent';
const queryParams = `query=${encodeURIComponent(query)}&max_results=10&tweet.fields=author_id,created_at,conversation_id,in_reply_to_user_id&expansions=author_id`;
const fullUrl = `${baseUrl}?${queryParams}`;

const oauthParams = {
  oauth_consumer_key: keys.consumerKey,
  oauth_nonce: crypto.randomBytes(16).toString('hex'),
  oauth_signature_method: 'HMAC-SHA1',
  oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
  oauth_token: keys.accessToken,
  oauth_version: '1.0',
};

// For GET requests, include query params in signature base
const allParams = { ...oauthParams };
new URLSearchParams(queryParams).forEach((v, k) => allParams[k] = v);

const signature = oauthSign('GET', baseUrl, allParams, keys.consumerSecret, keys.accessTokenSecret);
oauthParams.oauth_signature = signature;
const authHeader = 'OAuth ' + Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');

const r = await fetch(fullUrl, { headers: { 'Authorization': authHeader } });
const data = await r.json();
console.log(JSON.stringify(data, null, 2));
