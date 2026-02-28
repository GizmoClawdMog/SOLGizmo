import crypto from 'crypto';
import fs from 'fs';
const keys = JSON.parse(process.env.X_API_KEYS_JSON || fs.readFileSync(process.env.HOME + '/.gizmo/x-api-keys.json', 'utf-8'));
function oauthSign(method, url, params, cs, ts) {
  const sp = Object.keys(params).sort().map(k => encodeURIComponent(k)+'='+encodeURIComponent(params[k])).join('&');
  const bs = method+'&'+encodeURIComponent(url)+'&'+encodeURIComponent(sp);
  return crypto.createHmac('sha1', encodeURIComponent(cs)+'&'+encodeURIComponent(ts)).update(bs).digest('base64');
}
const convoId = process.argv[2] || '2024712240633360727';
const baseUrl = 'https://api.twitter.com/2/tweets/search/recent';
const qp = {'query':'conversation_id:'+convoId,'tweet.fields':'text,author_id,created_at,in_reply_to_user_id','expansions':'author_id','user.fields':'username','max_results':'30'};
const url = baseUrl+'?'+new URLSearchParams(qp).toString();
const op = {oauth_consumer_key:keys.consumerKey,oauth_nonce:crypto.randomBytes(16).toString('hex'),oauth_signature_method:'HMAC-SHA1',oauth_timestamp:Math.floor(Date.now()/1000).toString(),oauth_token:keys.accessToken,oauth_version:'1.0'};
op.oauth_signature = oauthSign('GET',baseUrl,{...op,...qp},keys.consumerSecret,keys.accessTokenSecret);
const auth = 'OAuth '+Object.keys(op).sort().map(k=>encodeURIComponent(k)+'="'+encodeURIComponent(op[k])+'"').join(', ');
const r = await fetch(url,{headers:{'Authorization':auth}});
const d = await r.json();
const users = {};
if(d.includes?.users) d.includes.users.forEach(u=>users[u.id]=u.username);
if(d.data) d.data.reverse().forEach(t=>console.log('@'+users[t.author_id]+' ('+t.created_at+'): '+t.text+'\nID: '+t.id+'\n'));
else console.log(JSON.stringify(d,null,2));
