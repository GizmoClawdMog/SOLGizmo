import crypto from 'crypto';
import fs from 'fs';
const keys = JSON.parse(process.env.X_API_KEYS_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/x-api-keys.json', 'utf-8'));

function oauthSign(method, url, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

const tweetId = process.argv[2];
if (!tweetId) { console.error('Usage: node delete-tweet.mjs <tweet_id>'); process.exit(1); }

const url = `https://api.twitter.com/2/tweets/${tweetId}`;
const oauthParams = {
  oauth_consumer_key: keys.consumerKey,
  oauth_nonce: crypto.randomBytes(16).toString('hex'),
  oauth_signature_method: 'HMAC-SHA1',
  oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
  oauth_token: keys.accessToken,
  oauth_version: '1.0',
};
const signature = oauthSign('DELETE', url, oauthParams, keys.consumerSecret, keys.accessTokenSecret);
oauthParams.oauth_signature = signature;
const authHeader = 'OAuth ' + Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');

const r = await fetch(url, { method: 'DELETE', headers: { 'Authorization': authHeader } });
console.log(await r.json());
