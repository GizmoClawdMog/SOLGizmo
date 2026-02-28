/**
 * 🦞 Gizmo's X (Twitter) Media Tweet Script
 * Usage: node tweet-media.mjs "Your tweet text" /path/to/image.jpg [--community] [--reply=ID]
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const keys = JSON.parse(process.env.X_API_KEYS_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/x-api-keys.json', 'utf-8'));
const COMMUNITY_ID = '2024760683879960877';

function oauthSign(method, url, params, consumerSecret, tokenSecret) {
  const sortedParams = Object.keys(params).sort().map(k => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`).join('&');
  const baseString = `${method}&${encodeURIComponent(url)}&${encodeURIComponent(sortedParams)}`;
  const signingKey = `${encodeURIComponent(consumerSecret)}&${encodeURIComponent(tokenSecret)}`;
  return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
}

function getAuthHeader(method, url, extraParams = {}) {
  const oauthParams = {
    oauth_consumer_key: keys.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: keys.accessToken,
    oauth_version: '1.0',
    ...extraParams,
  };
  const signature = oauthSign(method, url, oauthParams, keys.consumerSecret, keys.accessTokenSecret);
  oauthParams.oauth_signature = signature;
  // Remove extra params from header (they go in body)
  for (const k of Object.keys(extraParams)) delete oauthParams[k];
  oauthParams.oauth_signature = signature;
  return 'OAuth ' + Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');
}

async function uploadMedia(filePath) {
  const url = 'https://upload.twitter.com/1.1/media/upload.json';
  const mediaData = fs.readFileSync(filePath);
  const mediaBase64 = mediaData.toString('base64');
  const mimeType = filePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

  const params = {
    media_data: mediaBase64,
    media_category: 'tweet_image',
  };

  const oauthParams = {
    oauth_consumer_key: keys.consumerKey,
    oauth_nonce: crypto.randomBytes(16).toString('hex'),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: keys.accessToken,
    oauth_version: '1.0',
  };

  const allParams = { ...oauthParams, ...params };
  const signature = oauthSign('POST', url, allParams, keys.consumerSecret, keys.accessTokenSecret);
  oauthParams.oauth_signature = signature;

  const authHeader = 'OAuth ' + Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');

  const body = new URLSearchParams(params).toString();

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': authHeader,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  const data = await resp.json();
  if (!resp.ok) {
    console.error('❌ Media upload failed:', JSON.stringify(data));
    process.exit(1);
  }
  console.log(`📸 Media uploaded: ${data.media_id_string}`);
  return data.media_id_string;
}

async function tweetWithMedia(text, mediaId, community = false, replyToId = null) {
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

  const authHeader = 'OAuth ' + Object.keys(oauthParams).sort().map(k => `${encodeURIComponent(k)}="${encodeURIComponent(oauthParams[k])}"`).join(', ');

  const body = { text, media: { media_ids: [mediaId] } };
  if (community) body.community_id = COMMUNITY_ID;
  if (replyToId) body.reply = { in_reply_to_tweet_id: replyToId };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Authorization': authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  const data = await resp.json();
  if (resp.ok) {
    console.log('✅ Tweet posted!');
    console.log('   ID:', data.data?.id);
    console.log('   URL: https://x.com/SolGizmoClawd/status/' + data.data?.id);
  } else {
    console.error('❌ Failed:', JSON.stringify(data, null, 2));
  }
  return data;
}

const text = process.argv[2];
const imagePath = process.argv[3];
const isCommunity = process.argv.includes('--community');
const replyFlag = process.argv.find(a => a.startsWith('--reply='));
const replyToId = replyFlag ? replyFlag.split('=')[1] : null;

if (!text || !imagePath) {
  console.log('Usage: node tweet-media.mjs "text" /path/to/image.jpg [--community] [--reply=ID]');
  process.exit(1);
}

const mediaId = await uploadMedia(imagePath);
await tweetWithMedia(text, mediaId, isCommunity, replyToId);
