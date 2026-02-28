import crypto from 'crypto';
import fs from 'fs';

const keys = JSON.parse(process.env.X_API_KEYS_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/x-api-keys.json', 'utf-8'));

function oauthSign(method, url, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params).sort().map(k => encodeURIComponent(k) + '=' + encodeURIComponent(params[k])).join('&');
  const baseString = method + '&' + encodeURIComponent(url) + '&' + encodeURIComponent(sortedParams);
  const signingKey = encodeURIComponent(consumerSecret) + '&' + encodeURIComponent(tokenSecret);
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

async function getTweet(tweetId) {
  const baseUrl = 'https://api.twitter.com/2/tweets/' + tweetId;
  const queryParams = { 'tweet.fields': 'text,author_id,conversation_id', 'expansions': 'author_id', 'user.fields': 'username,name' };
  const url = baseUrl + '?' + new URLSearchParams(queryParams).toString();
  
  const oauthParams = {
    oauth_consumer_key: keys.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: keys.accessToken,
    oauth_version: '1.0',
  };
  
  const allParams = {...oauthParams, ...queryParams};
  const signature = oauthSign('GET', baseUrl, allParams, keys.consumerSecret, keys.accessTokenSecret);
  oauthParams.oauth_signature = signature;
  const authHeader = 'OAuth ' + Object.keys(oauthParams).sort().map(k => encodeURIComponent(k) + '="' + encodeURIComponent(oauthParams[k]) + '"').join(', ');

  const resp = await fetch(url, { headers: { 'Authorization': authHeader } });
  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
}

async function reply(tweetId, text) {
  const url = 'https://api.twitter.com/2/tweets';
  const oauthParams = {
    oauth_consumer_key: keys.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: keys.accessToken,
    oauth_version: '1.0',
  };
  const signature = oauthSign('POST', url, oauthParams, keys.consumerSecret, keys.accessTokenSecret);
  oauthParams.oauth_signature = signature;
  const authHeader = 'OAuth ' + Object.keys(oauthParams).sort().map(k => encodeURIComponent(k) + '="' + encodeURIComponent(oauthParams[k]) + '"').join(', ');

  const body = { text, reply: { in_reply_to_tweet_id: tweetId } };
  const resp = await fetch(url, { method: 'POST', headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const data = await resp.json();
  console.log(JSON.stringify(data, null, 2));
}

const cmd = process.argv[2];
const id = process.argv[3];
const text = process.argv[4];

if (cmd === 'read') getTweet(id);
else if (cmd === 'reply') reply(id, text);
else console.log('Usage: node read-tweet.mjs read <tweetId> OR node read-tweet.mjs reply <tweetId> "text"');
